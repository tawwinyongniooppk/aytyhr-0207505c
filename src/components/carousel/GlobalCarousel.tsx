import { useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useCarouselSettings, useCarouselSlides, type CarouselSlide } from "@/hooks/useCarousel";
import { cn } from "@/lib/utils";

function isVisibleToday(s: CarouselSlide): boolean {
  if (!s.active) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (s.start_date) {
    const d = new Date(s.start_date);
    if (today < d) return false;
  }
  if (s.end_date) {
    const d = new Date(s.end_date);
    if (today > d) return false;
  }
  return true;
}

interface Props {
  position: "top" | "middle" | "bottom";
}

export function GlobalCarousel({ position }: Props) {
  const { data: settings } = useCarouselSettings();
  const { data: slides } = useCarouselSlides();

  const visible = useMemo(() => (slides ?? []).filter(isVisibleToday), [slides]);

  if (!settings?.enabled) return null;
  if (settings.position !== position) return null;
  if (visible.length === 0) return null;

  const speed = Math.max(1, Number(settings.animation_speed_seconds) || 5);
  const style = settings.animation_style;

  return (
    <div className="w-full bg-card border-y border-border overflow-hidden" aria-label="Promotional banner">
      <div className="mx-auto max-w-7xl">
        {style === "continuous" ? (
          <Marquee slides={visible} speed={speed} />
        ) : style === "fade" ? (
          <Fader slides={visible} speed={speed} />
        ) : style === "pop" ? (
          <Popper slides={visible} speed={speed} />
        ) : (
          <SlideSnap slides={visible} speed={speed} />
        )}
      </div>
    </div>
  );
}

function SlideContent({ slide, className }: { slide: CarouselSlide; className?: string }) {
  const img = (
    <div className={cn("aspect-[21/9] w-full overflow-hidden", className)}>
      <img src={slide.image_url} alt="" className="aspect-[21/9] w-full h-full object-cover" loading="lazy" />
    </div>
  );
  if (slide.link_enabled && slide.link_url) {
    return (
      <a href={slide.link_url} target="_blank" rel="noopener noreferrer" className="block w-full">
        {img}
      </a>
    );
  }
  return img;
}

// Slim banner outer wrap — caps height so it doesn't push content significantly.
function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="max-h-[120px] md:max-h-[140px] overflow-hidden">{children}</div>;
}

function Marquee({ slides, speed }: { slides: CarouselSlide[]; speed: number }) {
  const [paused, setPaused] = useState(false);
  const duplicated = [...slides, ...slides];
  // higher speed value = slower scroll; treat speed seconds as per-slide
  const duration = `${Math.max(8, speed * slides.length * 2)}s`;
  return (
    <Wrap>
      <div
        className="relative w-full overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className="flex"
          style={{
            animation: `carousel-marquee ${duration} linear infinite`,
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {duplicated.map((s, i) => (
            <div key={`${s.id}-${i}`} className="shrink-0 w-1/2 md:w-1/3 lg:w-1/4 px-1">
              <SlideContent slide={s} />
            </div>
          ))}
        </div>
      </div>
    </Wrap>
  );
}

function Fader({ slides, speed }: { slides: CarouselSlide[]; speed: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setInterval(() => setI((p) => (p + 1) % slides.length), speed * 1000);
    return () => clearInterval(t);
  }, [paused, slides.length, speed]);
  return (
    <Wrap>
      <div
        className="relative w-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {slides.map((s, idx) => (
          <div
            key={s.id}
            className={cn(
              "transition-opacity duration-700",
              idx === i ? "opacity-100 relative" : "opacity-0 absolute inset-0 pointer-events-none",
            )}
          >
            <SlideContent slide={s} />
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function Popper({ slides, speed }: { slides: CarouselSlide[]; speed: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setInterval(() => setI((p) => (p + 1) % slides.length), speed * 1000);
    return () => clearInterval(t);
  }, [paused, slides.length, speed]);
  return (
    <Wrap>
      <div
        className="relative w-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {slides.map((s, idx) => (
          <div
            key={s.id}
            className={cn(
              "transition-all duration-500 ease-out",
              idx === i
                ? "opacity-100 scale-100 relative"
                : "opacity-0 scale-90 absolute inset-0 pointer-events-none",
            )}
          >
            <SlideContent slide={s} />
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function SlideSnap({ slides, speed }: { slides: CarouselSlide[]; speed: number }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!emblaApi || slides.length <= 1) return;
    const t = setInterval(() => {
      if (!pausedRef.current) emblaApi.scrollNext();
    }, speed * 1000);
    return () => clearInterval(t);
  }, [emblaApi, speed, slides.length]);

  return (
    <Wrap>
      <div
        className="overflow-hidden"
        ref={emblaRef}
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
      >
        <div className="flex">
          {slides.map((s) => (
            <div key={s.id} className="shrink-0 grow-0 basis-full md:basis-1/2 lg:basis-1/3 px-1">
              <SlideContent slide={s} />
            </div>
          ))}
        </div>
      </div>
    </Wrap>
  );
}
