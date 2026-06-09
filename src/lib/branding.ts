// Loads the IT-Manager-uploaded company logo from app_settings and rewrites
// the favicon, apple-touch-icon, and PWA manifest to point at it. This runs
// before React mounts so the browser sees the branded icons at install time.
import { supabase } from "@/integrations/supabase/client";

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

export async function applyBranding() {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "company_logo_url")
      .maybeSingle();
    const logo = (data as any)?.value as string | undefined;
    if (!logo) return;

    // Infer mime type from URL (fall back to png).
    const lower = logo.split("?")[0].toLowerCase();
    const mime = lower.endsWith(".svg")
      ? "image/svg+xml"
      : lower.endsWith(".webp")
        ? "image/webp"
        : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
          ? "image/jpeg"
          : "image/png";

    // Favicon + iOS home-screen icon
    setIconLink("icon", logo);
    setIconLink("shortcut icon", logo);
    setIconLink("apple-touch-icon", logo);

    // Dynamic PWA manifest (Blob URL so browser fetches the branded version).
    // Use purpose "any" with sizes "any" so the FULL logo renders on every
    // device (Android/iOS/desktop) without maskable cropping the edges.
    const manifest = {
      name: "AYTY Smart HR",
      short_name: "AYTY HR",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#F8FAFC",
      theme_color: "#1E293B",
      icons: [
        { src: logo, sizes: "any", type: mime, purpose: "any" },
        { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
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
