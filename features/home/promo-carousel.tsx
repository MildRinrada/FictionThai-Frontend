"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { pingSlideClick } from "@/lib/promo-client";
import type { PromoSlide } from "@/types/promo";

/**
 * The hero carousel (docs/HOME-PROMO.md).
 *
 * A queue of 3-4 staff-scheduled slides, each with its own banner art and
 * copy. The rules that live HERE rather than in the API:
 *
 *   - auto-advance every 6.5s, pausing on hover, on focus within, and
 *     entirely when the visitor prefers reduced motion - a carousel that
 *     ignores that setting is an accessibility bug, not a feature;
 *   - ONE slide renders as a static card: no dots, no arrows, no timer -
 *     a single dot is chrome advertising an absence;
 *   - a paid slide always carries its "โปรโมท" chip. Small, but readable -
 *     finding out later costs more trust than the label ever will;
 *   - clicks ping the counter through sendBeacon and never delay navigation.
 */

const ADVANCE_MS = 6500;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/* The visitor's motion preference as an external store - the same pattern the
   theme toggle uses, so the first client render already knows the answer and
   no effect has to correct it. The server snapshot says "animate", which only
   ever errs for one frame before hydration completes. */
function subscribeMotion(onChange: () => void): () => void {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function PromoCarousel({ slides }: { slides: PromoSlide[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
  const timer = useRef<number | null>(null);

  const advance = useCallback(
    (step: number) => {
      setIndex((current) => (current + step + slides.length) % slides.length);
    },
    [slides.length],
  );

  useEffect(() => {
    if (slides.length < 2 || paused || reducedMotion) return;
    timer.current = window.setInterval(() => advance(1), ADVANCE_MS);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [slides.length, paused, reducedMotion, advance]);

  if (slides.length === 0) return null;
  const single = slides.length === 1;
  const slide = slides[Math.min(index, slides.length - 1)];

  return (
    <section
      aria-label="เรื่องแนะนำ"
      aria-roledescription={single ? undefined : "carousel"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative flex min-h-58 flex-col overflow-hidden rounded-xl border border-border"
    >
      <Slide
        slide={slide}
        onNavigate={() => {
          pingSlideClick(slide.id);
          router.push(slide.link_url);
        }}
      />

      {!single ? (
        <>
          <button
            type="button"
            aria-label="สไลด์ก่อนหน้า"
            onClick={() => advance(-1)}
            className="absolute start-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#292731]/45 text-white hover:bg-[#292731]/70"
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <button
            type="button"
            aria-label="สไลด์ถัดไป"
            onClick={() => advance(1)}
            className="absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#292731]/45 text-white hover:bg-[#292731]/70"
          >
            <Icon name="chevron-right" size={16} />
          </button>

          <div
            role="tablist"
            aria-label="ตำแหน่งสไลด์"
            className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5"
          >
            {slides.map((entry, i) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`สไลด์ที่ ${i + 1}: ${entry.headline}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/75"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

/**
 * One slide's face. A real banner image when the queue manager uploaded one,
 * the slide's own solid colour when not - never a stretched book cover, which
 * is exactly what the review threw out.
 */
function Slide({
  slide,
  onNavigate,
}: {
  slide: PromoSlide;
  onNavigate: () => void;
}) {
  const textEnd = slide.text_side === "end";

  return (
    <Link
      href={slide.link_url}
      onClick={(event) => {
        // Let modified clicks (new tab) behave; count and route plain ones.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNavigate();
      }}
      className={`group relative flex min-h-58 flex-1 flex-col justify-end p-6 ${
        textEnd ? "items-end text-end" : "items-start"
      }`}
      style={{ backgroundColor: slide.bg_color ?? "#292731" }}
    >
      {slide.image_url ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${slide.image_url})` }}
        />
      ) : null}
      {/* The gradient keeps the copy readable over any art, tilted toward the
          side the copy sits on. */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 bg-linear-to-t from-[#292731]/75 via-[#292731]/25 to-transparent ${
          textEnd ? "bg-linear-to-tl" : "bg-linear-to-tr"
        }`}
      />

      <span className="relative max-w-lg">
        <span className="flex flex-wrap items-center gap-2">
          {slide.kicker ? (
            <span className="mono-label text-white/75">{slide.kicker}</span>
          ) : null}
          {slide.source === "paid" ? (
            <span className="inline-flex min-h-5 items-center rounded-sm border border-white/40 px-1.5 font-mono text-[10px] text-white/85">
              โปรโมท
            </span>
          ) : null}
        </span>
        <span className="mt-2 block font-serif text-2xl leading-snug font-semibold text-white">
          <span className="line-clamp-2">{slide.headline}</span>
        </span>
        {slide.tagline ? (
          <span className="mt-1.5 block text-sm text-white/80">
            <span className="line-clamp-1">{slide.tagline}</span>
          </span>
        ) : null}
        <span className="mt-4 inline-flex min-h-9 items-center rounded-md bg-white px-4 text-sm font-medium text-[#292731] group-hover:bg-white/90">
          {slide.cta_label || "อ่านเลย"}
        </span>
      </span>
    </Link>
  );
}
