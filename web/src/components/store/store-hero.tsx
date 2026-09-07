"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Slider } from "@/components/ui/slider";
import { IconArrowRight } from "@/components/icons";
import type { Slider as SliderRecord } from "@/types/api";

/**
 * The shop's own hero: copy on the left, the picture on the right.
 *
 * A separate component rather than a `variant` on `Slider`, and the reason is
 * the same one `CompactProductCard` exists for: these are two different
 * shapes, not two skins. `Slider` paints one media layer edge to edge and lays
 * the caption over it — right for a homepage hero and for a slider dropped
 * into a CMS body, and wrong here, where the words have to be readable at
 * display size and the picture is a companion to them rather than the ground
 * beneath them. Reaching into `Slider` for this would mean branching its
 * layout, its caption, its arrows and its dots — four conditionals in a
 * component the homepage also renders.
 *
 * **A non-image slide falls back to `Slider` wholesale.** Video needs the
 * player, the poster handling and the click-to-play facade that component
 * already owns, and reimplementing a fraction of that here to cover a slide
 * type this hero is unlikely to ever be given would be the worse trade. So the
 * split layout is for the case it is built for, and anything else keeps
 * working.
 *
 * There is no kicker line above the heading, which the reference design has:
 * `slides` carries a heading, a caption, a link and a picture, and nothing
 * else. Inventing one from another field would put words on the page that no
 * editor typed, and adding a column is a schema change this did not need.
 */
export function StoreHero({ slider }: { slider: SliderRecord }) {
  const slides = slider.slides ?? [];
  const [index, setIndex] = useState(0);
  const [motionOk, setMotionOk] = useState(false);
  // Paused once somebody drives it: an automatic advance while a reader is
  // part-way through the sentence takes it away from them. The same call
  // `Gallery`'s lightbox makes when Next is pressed.
  const [taken, setTaken] = useState(false);
  const region = useRef<HTMLDivElement>(null);

  // Read on mount, not at render: the server has no matchMedia, and assuming
  // motion is fine until proven otherwise autoplays one frame before the
  // check lands.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setMotionOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const count = slides.length;
  const goTo = useCallback((next: number) => {
    if (count === 0) return;
    setIndex(((next % count) + count) % count); // wrap both directions
  }, [count]);

  const autoplay = slider.autoplay && motionOk && !taken && count > 1;
  useEffect(() => {
    if (!autoplay) return;
    const ms = Math.max(2000, slider.interval_ms || 6000);
    const t = setInterval(() => setIndex((i) => (i + 1) % count), ms);
    return () => clearInterval(t);
  }, [autoplay, slider.interval_ms, count]);

  if (count === 0) return null;
  if (slides.some((s) => s.kind !== "image")) {
    return <Slider slider={slider} aspect="aspect-[16/9] lg:aspect-[21/7]" priority />;
  }

  const slide = slides[index];
  const drive = (next: number) => { setTaken(true); goTo(next); };

  return (
    <section
      ref={region}
      aria-roledescription="carousel"
      aria-label={slider.name}
      className="relative overflow-hidden bg-surface-2"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") drive(index - 1);
        if (e.key === "ArrowRight") drive(index + 1);
      }}
    >
      <Container>
        <div className="grid items-center gap-8 py-10 lg:grid-cols-2 lg:gap-12 lg:py-16">
          {/*
            Only the current slide's words are in the DOM, keyed on the index so
            the block remounts and the entrance animation restarts on every
            move — the same mechanism `Slider`'s fade mode uses, and the reason
            re-pointing one element at new text would not replay it.
          */}
          <div key={index} className="motion-safe:animate-[gallery-fade_.4s_ease-out]">
            {slide.heading && (
              <h2 className="display-2 max-w-[16ch] text-balance">{slide.heading}</h2>
            )}
            {slide.caption && (
              <p className="lede measure mt-4">{slide.caption}</p>
            )}
            {slide.link_url && slide.link_label && (
              <ButtonLink href={slide.link_url} className="mt-6 rounded-full">
                {slide.link_label}
                <IconArrowRight className="size-4" />
              </ButtonLink>
            )}

            {count > 1 && (
              /*
                Under the copy rather than over the picture: these are the
                control for the words, and on a phone the picture sits above
                them anyway. A button, not a dot with a click handler — it has
                to be reachable by keyboard and countable as a tap target.
              */
              <div className="mt-8 flex gap-2" role="tablist" aria-label="Slides">
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Slide ${i + 1}${s.heading ? `: ${s.heading}` : ""}`}
                    onClick={() => drive(i)}
                    className="grid size-6 place-items-center"
                  >
                    <span
                      className={`block h-2 rounded-full transition-all duration-300 ${
                        i === index ? "w-6 bg-brand-600" : "w-2 bg-line-strong"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            {/*
              A fixed ratio, so a portrait upload and a landscape one cannot
              change the height of the hero between slides — which would move
              everything below it as the carousel ran.
            */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface shadow-2 sm:aspect-[16/10]">
              {/*
                Every slide is mounted and stacked; only the current one is
                opaque. Rendering just the active slide and keying it on its id
                looked equivalent and was not: each advance mounted a fresh
                `<img>`, so the panel went blank while the browser fetched a
                picture it had never seen — a flash of empty on the first pass
                through the carousel. Stacked, they are all loaded before
                anything moves, and the swap is a real cross-fade rather than a
                gap between two images.

                `aria-hidden` and `inert` on the ones behind, or a screen
                reader reads all three headings' pictures and a keyboard finds
                nothing to focus.
              */}
              {slides.map((s, i) => s.url && (
                <Image
                  key={s.id}
                  src={s.url}
                  alt={i === index ? (s.alt ?? "") : ""}
                  aria-hidden={i === index ? undefined : true}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className={`object-cover transition-opacity duration-500 ${
                    i === index ? "opacity-100" : "opacity-0"
                  }`}
                  priority={i === 0}
                  unoptimized
                />
              ))}
            </div>

            {count > 1 && (
              <>
                {/*
                  Always visible, unlike `Slider`'s hover-revealed pair. There
                  the arrows sit *on* the photograph and fading them in keeps
                  them off the picture until wanted; here they sit beside a
                  panel on a plain ground, where a control that appears only on
                  hover is one a touch user never discovers.
                */}
                <button
                  type="button"
                  onClick={() => drive(index - 1)}
                  aria-label="Previous slide"
                  className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-card text-ink shadow-1 transition-colors hover:bg-surface-2"
                >
                  <IconArrowRight className="size-4 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => drive(index + 1)}
                  aria-label="Next slide"
                  className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-card text-ink shadow-1 transition-colors hover:bg-surface-2"
                >
                  <IconArrowRight className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
