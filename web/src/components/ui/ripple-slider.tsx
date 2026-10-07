"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";
import { cn } from "@/lib/utils";
import { useAutoplay, useDocumentHidden, useMotionOk, wrapIndex } from "@/lib/hooks/use-carousel";
import type { Slider as SliderData } from "@/types/api";
import { Slider } from "@/components/ui/slider";
import { Chevron, PlayPause } from "@/components/ui/slider-controls";
import { SlideCaption, captionAnimationFor } from "@/components/ui/slide-caption";

/**
 * The ripple slider — `SliderLayout::Ripple` (the client, 2026-09-24, after
 * Vengeance UI's ripple displacement slider, MIT; re-drawn, not vendored).
 *
 * A full-bleed banner like `full`, with the words over the picture through
 * the same `SlideCaption`, and one difference: the change between two slides
 * is a ripple spreading from the centre, the old picture bending under the
 * wave front as the new one takes its place.
 *
 * ## How, and what it costs
 *
 * The reference is three.js with gsap tweening a shader uniform. This is the
 * same idea in raw WebGL — one quad, two textures, a `uProgress` uniform
 * tweened by requestAnimationFrame — because three.js alone would outweigh
 * every other slider here put together. The canvas only paints *during* a
 * change; the rest of the time it is transparent and the real `<img>` of the
 * current slide is what the visitor sees, so alt text, LCP and no-JS are
 * exactly the banner's.
 *
 * **Textures come from the same-origin `/_next/image` URL**, not the API's
 * storage URL: an image from another origin taints a WebGL canvas unless
 * that origin sends CORS headers, which `/storage` does not. An SVG slide
 * (the optimiser passes those through by their own URL), a failed load, no
 * WebGL, a lost context or reduced motion all fall back to the crossfade
 * every other slider uses — the ripple is decoration, never the only way
 * the slide can change.
 */

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Cover-fit both pictures to the canvas, then mix them across a ring that
// grows from the centre; inside the ring's band the coordinates are pushed
// outward by a damped sine — the ripple.
const FRAGMENT = `
precision mediump float;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
uniform vec2 uRes;
uniform vec2 uFromRes;
uniform vec2 uToRes;
varying vec2 vUv;
vec2 cover(vec2 uv, vec2 img) {
  float s = max(uRes.x / img.x, uRes.y / img.y);
  vec2 size = img * s;
  vec2 off = (uRes - size) * 0.5;
  return (uv * uRes - off) / size;
}
void main() {
  vec2 p = vUv - 0.5;
  p.x *= uRes.x / uRes.y;
  float d = length(p);
  float front = uProgress * 1.25;
  float band = 0.16;
  float ring = smoothstep(front - band, front, d) - smoothstep(front, front + band, d);
  float wave = sin((d - front) * 46.0) * ring * 0.035 * (1.0 - uProgress);
  vec2 disp = normalize(p + 0.00001) * wave;
  disp.x /= uRes.x / uRes.y;
  vec4 a = texture2D(uFrom, cover(vUv + disp, uFromRes));
  vec4 b = texture2D(uTo, cover(vUv + disp, uToRes));
  float m = 1.0 - smoothstep(front - band * 1.4, front, d);
  gl_FragColor = mix(a, b, m);
}
`;

type Tex = { tex: WebGLTexture; w: number; h: number };

/** A slide's still: the picture itself, or a video's poster. */
function pictureOf(s: { kind: string; url: string | null; poster_url: string | null } | undefined): string | null {
  return s ? (s.kind === "image" ? s.url : s.poster_url) : null;
}

/** A same-origin URL for a slide's picture, or null when only its own URL would do. */
function textureUrl(src: string | null): string | null {
  if (!src) return null;
  const path = src.split("?")[0];
  if (path.endsWith(".svg")) return null;
  return `/_next/image?url=${encodeURIComponent(src)}&w=1920&q=75`;
}

export function RippleSlider({
  slider, className, aspect = "aspect-[16/9]", priority = false, sizes = "100vw",
}: {
  slider: SliderData;
  className?: string;
  aspect?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const slides = useMemo(() => slider.slides ?? [], [slider.slides]);
  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [rippling, setRippling] = useState(false);
  const motionOk = useMotionOk();
  const hidden = useDocumentHidden();
  const [override, setOverride] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gl = useRef<{ ctx: WebGLRenderingContext; prog: WebGLProgram; cache: Map<string, Promise<Tex | null>> } | null>(null);
  const busy = useRef(false);

  // WebGL once, lazily; any failure leaves `gl.current` null and the crossfade in charge.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !motionOk) return;
    const ctx = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true });
    if (!ctx) return;
    const shader = (type: number, src: string) => {
      const s = ctx.createShader(type)!;
      ctx.shaderSource(s, src);
      ctx.compileShader(s);
      return ctx.getShaderParameter(s, ctx.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(ctx.VERTEX_SHADER, VERTEX), fs = shader(ctx.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return;
    const prog = ctx.createProgram()!;
    ctx.attachShader(prog, vs); ctx.attachShader(prog, fs); ctx.linkProgram(prog);
    if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) return;
    ctx.useProgram(prog);
    const buf = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), ctx.STATIC_DRAW);
    const loc = ctx.getAttribLocation(prog, "aPos");
    ctx.enableVertexAttribArray(loc);
    ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
    ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, true);
    gl.current = { ctx, prog, cache: new Map() };
    const lost = (e: Event) => { e.preventDefault(); gl.current = null; };
    canvas.addEventListener("webglcontextlost", lost);
    return () => { canvas.removeEventListener("webglcontextlost", lost); gl.current = null; };
  }, [motionOk]);

  const loadTexture = useCallback((url: string): Promise<Tex | null> => {
    const g = gl.current;
    if (!g) return Promise.resolve(null);
    const hit = g.cache.get(url);
    if (hit) return hit;
    const p = new Promise<Tex | null>((resolve) => {
      const img = new window.Image();
      img.decoding = "async";
      img.onload = () => {
        try {
          const tex = g.ctx.createTexture()!;
          g.ctx.bindTexture(g.ctx.TEXTURE_2D, tex);
          g.ctx.texParameteri(g.ctx.TEXTURE_2D, g.ctx.TEXTURE_MIN_FILTER, g.ctx.LINEAR);
          g.ctx.texParameteri(g.ctx.TEXTURE_2D, g.ctx.TEXTURE_WRAP_S, g.ctx.CLAMP_TO_EDGE);
          g.ctx.texParameteri(g.ctx.TEXTURE_2D, g.ctx.TEXTURE_WRAP_T, g.ctx.CLAMP_TO_EDGE);
          g.ctx.texImage2D(g.ctx.TEXTURE_2D, 0, g.ctx.RGBA, g.ctx.RGBA, g.ctx.UNSIGNED_BYTE, img);
          resolve({ tex, w: img.naturalWidth, h: img.naturalHeight });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    g.cache.set(url, p);
    return p;
  }, []);

  const goTo = useCallback(async (raw: number) => {
    const next = wrapIndex(raw, count);
    if (next === index || busy.current) return;
    const g = gl.current;
    const canvas = canvasRef.current;
    const fromUrl = textureUrl(pictureOf(slides[index]));
    const toUrl = textureUrl(pictureOf(slides[next]));
    if (!g || !canvas || !fromUrl || !toUrl || !motionOk) { setIndex(next); return; }

    busy.current = true;
    const [from, to] = await Promise.all([loadTexture(fromUrl), loadTexture(toUrl)]);
    if (!from || !to || !gl.current) { busy.current = false; setIndex(next); return; }

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const { ctx, prog } = g;
    ctx.viewport(0, 0, canvas.width, canvas.height);
    const u = (name: string) => ctx.getUniformLocation(prog, name);
    ctx.activeTexture(ctx.TEXTURE0); ctx.bindTexture(ctx.TEXTURE_2D, from.tex); ctx.uniform1i(u("uFrom"), 0);
    ctx.activeTexture(ctx.TEXTURE1); ctx.bindTexture(ctx.TEXTURE_2D, to.tex); ctx.uniform1i(u("uTo"), 1);
    ctx.uniform2f(u("uRes"), canvas.width, canvas.height);
    ctx.uniform2f(u("uFromRes"), from.w, from.h);
    ctx.uniform2f(u("uToRes"), to.w, to.h);

    const paint = (k: number) => { ctx.uniform1f(u("uProgress"), k); ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, 4); };
    paint(0);
    setRippling(true);
    const duration = 1100;
    const start = performance.now();
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / duration);
        paint(ease(k));
        if (k < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    setIndex(next);
    // One frame for the new <img> to be the one on top before the canvas goes.
    requestAnimationFrame(() => { setRippling(false); busy.current = false; });
  }, [count, index, loadTexture, motionOk, slides]);

  const wantsPlay = override ?? slider.autoplay;
  const autoplay = wantsPlay && motionOk && !paused && !hidden && count > 1;
  const advance = useCallback(() => { void goTo(index + 1); }, [goTo, index]);
  useAutoplay(autoplay, slider.interval_ms, advance);

  if (count === 0) return null;
  if (count < 2) return <Slider slider={slider} className={className} aspect={aspect} priority={priority} sizes={sizes} />;

  const current = slides[index];
  const src = pictureOf(current);
  const captionAnimation = captionAnimationFor(slider);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={slider.name}
      className={cn("group relative w-full min-w-0 overflow-clip rounded-xl bg-scrim", aspect, className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
    >
      {/* The current picture, crossfaded in when the ripple is not drawing the change. */}
      <div key={current.id} className={cn("absolute inset-0", !rippling && "gallery-fade")}>
        {src && (
          <Image
            src={src}
            alt={current.alt ?? ""}
            fill
            sizes={sizes}
            priority={priority && index === 0}
            className="object-cover"
            style={focalStyle(current.focus)} {...blurProps(current.blur)}
          />
        )}
      </div>

      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 size-full", rippling ? "opacity-100" : "opacity-0")}
      />

      <SlideCaption key={`caption-${index}`} slide={current} animation={captionAnimation} />

      <button type="button" onClick={() => void goTo(index - 1)} aria-label="Previous slide"
        className="absolute top-1/2 left-3 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-card/85 text-ink shadow-2 backdrop-blur-sm transition-colors duration-(--duration-fast) hover:bg-card">
        <Chevron className="size-4 rotate-180" />
      </button>
      <button type="button" onClick={() => void goTo(index + 1)} aria-label="Next slide"
        className="absolute top-1/2 right-3 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-card/85 text-ink shadow-2 backdrop-blur-sm transition-colors duration-(--duration-fast) hover:bg-card">
        <Chevron className="size-4" />
      </button>

      <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center">
        <div className="flex items-center gap-0.5 rounded-full bg-card/85 px-1 backdrop-blur-sm">
          {slides.map((s, i) => (
            <button key={s.id} type="button" aria-label={`Go to slide ${i + 1}`} aria-current={i === index} onClick={() => void goTo(i)} className="grid size-6 place-items-center">
              <span aria-hidden className={cn("block h-1.5 rounded-full transition-[width,background-color] duration-(--duration-base)", i === index ? "w-5 bg-ink" : "w-1.5 bg-line-strong")} />
            </button>
          ))}
        </div>
      </div>

      {slider.autoplay && (
        <PlayPause playing={wantsPlay} onToggle={() => setOverride(!wantsPlay)} className="top-2 right-2" />
      )}

      <p className="sr-only" aria-live="polite">Slide {index + 1} of {count}</p>
    </section>
  );
}
