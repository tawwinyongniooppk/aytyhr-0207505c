// Loads the IT-Manager-uploaded company logo from app_settings and rewrites
// the favicon, apple-touch-icon, PWA manifest icons, and iOS splash screens
// so the branded logo appears on install AND on launch across every device
// (Phone / Tablet / Desktop).
import { supabase } from "@/integrations/supabase/client";

const SPLASH_BG = "#F8FAFC"; // matches manifest background_color
const THEME_COLOR = "#1E293B";

function setIconLink(rel: string, href: string, sizes?: string) {
  let link = document.querySelector<HTMLLinkElement>(
    sizes ? `link[rel="${rel}"][sizes="${sizes}"]` : `link[rel="${rel}"]`,
  );
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    if (sizes) link.setAttribute("sizes", sizes);
    document.head.appendChild(link);
  }
  link.href = href;
}

// Draw the logo centered on a solid background at the requested canvas size.
// Returns a Blob URL (PNG). Logo is contained with safe padding so it never
// gets cropped on Android adaptive icons or iOS splash screens.
async function renderPaddedLogo(
  img: HTMLImageElement,
  width: number,
  height: number,
  padRatio = 0.18,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = SPLASH_BG;
  ctx.fillRect(0, 0, width, height);

  const pad = Math.min(width, height) * padRatio;
  const maxW = width - pad * 2;
  const maxH = height - pad * 2;
  const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const drawW = img.naturalWidth * ratio;
  const drawH = img.naturalHeight * ratio;
  const dx = (width - drawW) / 2;
  const dy = (height - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/png"),
  );
  return URL.createObjectURL(blob);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Common iOS device splash sizes (portrait). Covers iPhone SE → Pro Max & iPad.
const IOS_SPLASH_SIZES: { w: number; h: number; media: string }[] = [
  { w: 1290, h: 2796, media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" }, // 15 Pro Max / 14 Pro Max
  { w: 1179, h: 2556, media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" }, // 15 / 14 Pro
  { w: 1170, h: 2532, media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" }, // 13/14
  { w: 1284, h: 2778, media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" }, // 12/13 Pro Max
  { w: 1125, h: 2436, media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" }, // X / 11 Pro
  { w: 828, h: 1792, media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" }, // XR / 11
  { w: 750, h: 1334, media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" }, // SE / 6-8
  { w: 1640, h: 2360, media: "(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2)" }, // iPad Air
  { w: 1620, h: 2160, media: "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2)" }, // iPad 10.2
  { w: 2048, h: 2732, media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" }, // iPad Pro 12.9
];

function setSplashLink(href: string, media: string) {
  const link = document.createElement("link");
  link.rel = "apple-touch-startup-image";
  link.setAttribute("media", media);
  link.href = href;
  document.head.appendChild(link);
}

export async function applyBranding() {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "company_logo_url")
      .maybeSingle();
    const logo = (data as any)?.value as string | undefined;
    if (!logo) return;

    // Favicon + iOS home-screen icon (raw logo for crisp small sizes).
    setIconLink("icon", logo);
    setIconLink("shortcut icon", logo);
    setIconLink("apple-touch-icon", logo);

    // Try to render padded splash/icon variants. If image load fails
    // (e.g. CORS), fall back to the raw logo URL.
    let icon192 = logo;
    let icon512 = logo;
    let maskable512 = logo;
    let appleTouch = logo;
    let splashByMedia: { href: string; media: string }[] = [];

    try {
      const img = await loadImage(logo);
      icon192 = await renderPaddedLogo(img, 192, 192, 0.1);
      icon512 = await renderPaddedLogo(img, 512, 512, 0.1);
      // Maskable needs ~20% safe area on all sides so Android adaptive
      // shape masks (circle/squircle) never clip the logo.
      maskable512 = await renderPaddedLogo(img, 512, 512, 0.22);
      appleTouch = await renderPaddedLogo(img, 180, 180, 0.1);
      setIconLink("apple-touch-icon", appleTouch);

      // Pre-render iOS splash screens with centered logo on background.
      splashByMedia = await Promise.all(
        IOS_SPLASH_SIZES.map(async ({ w, h, media }) => ({
          href: await renderPaddedLogo(img, w, h, 0.35),
          media,
        })),
      );
      // Remove any existing splash links before injecting fresh ones.
      document
        .querySelectorAll('link[rel="apple-touch-startup-image"]')
        .forEach((n) => n.remove());
      splashByMedia.forEach(({ href, media }) => setSplashLink(href, media));
    } catch {
      /* keep fallbacks */
    }

    // Dynamic PWA manifest. Provide both "any" (full logo) and "maskable"
    // (safe-area padded) so Android adaptive icons and the launch splash
    // both render the full logo on every device.
    const manifest = {
      name: "AYTY Smart HR",
      short_name: "AYTY HR",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: SPLASH_BG,
      theme_color: THEME_COLOR,
      icons: [
        { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    const blobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }),
    );
    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = blobUrl;
  } catch {
    /* ignore — keep default branding */
  }
}
