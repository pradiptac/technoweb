"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { motionFileUrl } from "@/lib/motion-file";
import { useMotionOk } from "@/lib/hooks/use-carousel";

/**
 * A Lottie animation from the media library (0.172.0, docs/page-builder.md
 * "Animation and 3D model").
 *
 * The box is reserved by the caller from the animation's own width and
 * height, so nothing moves when it arrives. `lottie-web`'s light build (SVG
 * renderer, no `eval`, so the security policy holds) and `fflate` are
 * imported only when the box comes within 200px of the screen. A `.lottie`
 * is a zip: its manifest's first animation is played and its pictures are
 * inlined as data URIs, so nothing but the file itself is fetched — the
 * upload refused any animation that points at another site.
 *
 * It plays while at least half of it is on screen and the tab is visible;
 * a looping one carries a Pause button (WCAG 2.2.2). Under reduced motion it
 * shows its first frame, still. A file that fails to load leaves the empty
 * reserved box and logs nothing.
 */
type Anim = {
  play: () => void;
  pause: () => void;
  goToAndStop: (value: number, isFrame?: boolean) => void;
  destroy: () => void;
  isPaused: boolean;
};

type LottieModule = {
  loadAnimation: (o: {
    container: Element;
    renderer: "svg";
    loop: boolean;
    autoplay: boolean;
    animationData: unknown;
    rendererSettings?: Record<string, unknown>;
  }) => Anim;
};

async function readAnimation(file: string, format: "json" | "lottie"): Promise<unknown> {
  const res = await fetch(motionFileUrl(file));
  if (!res.ok) throw new Error(String(res.status));
  if (format === "json") return res.json();

  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as { animations?: { id: string }[] };
  const id = manifest.animations?.[0]?.id;
  const raw = id ? files[`animations/${id}.json`] : undefined;
  if (!raw) throw new Error("no animation");
  const data = JSON.parse(strFromU8(raw)) as { assets?: { p?: string; u?: string; e?: number }[] };

  // Pictures inside the zip become data URIs, so the player fetches nothing.
  for (const asset of data.assets ?? []) {
    if (!asset.p || asset.e === 1 || asset.p.startsWith("data:")) continue;
    const name = asset.p.split("/").pop()!;
    const bytes = files[`images/${name}`];
    if (!bytes) continue;
    const ext = name.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "svg" ? "image/svg+xml" : "image/jpeg";
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    asset.u = "";
    asset.p = `data:${mime};base64,${btoa(bin)}`;
    asset.e = 1;
  }
  return data;
}

export function LottiePlayer({ file, format, loop, alt, className }: {
  file: string;
  format: "json" | "lottie";
  loop: boolean;
  alt?: string | null;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const anim = useRef<Anim | null>(null);
  const motionOk = useMotionOk();
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);

  // Load when near the screen.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    const near = new IntersectionObserver(async ([e]) => {
      if (!e?.isIntersecting) return;
      near.disconnect();
      try {
        const [lottie, data] = await Promise.all([
          import("lottie-web/build/player/lottie_light") as unknown as Promise<{ default: LottieModule }>,
          readAnimation(file, format),
        ]);
        if (cancelled || !box.current) return;
        anim.current = lottie.default.loadAnimation({
          container: box.current, renderer: "svg", loop, autoplay: false, animationData: data,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        anim.current.goToAndStop(0, true);
        setReady(true);
      } catch {
        // A file that will not load leaves the reserved box empty.
      }
    }, { rootMargin: "200px" });
    near.observe(el);
    return () => { cancelled = true; near.disconnect(); anim.current?.destroy(); anim.current = null; };
  }, [file, format, loop]);

  // Play while half on screen, the tab is visible, motion is allowed and nobody pressed Pause.
  useEffect(() => {
    const el = box.current;
    const a = anim.current;
    if (!ready || !el || !a) return;
    if (!motionOk) { a.goToAndStop(0, true); return; }
    let seen = false;
    const sync = () => { if (seen && playing && !document.hidden) a.play(); else a.pause(); };
    const view = new IntersectionObserver(([e]) => { seen = !!e?.isIntersecting; sync(); }, { threshold: 0.5 });
    view.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => { view.disconnect(); document.removeEventListener("visibilitychange", sync); a.pause(); };
  }, [ready, motionOk, playing]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div
        ref={box}
        className="h-full w-full [&>svg]:block"
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        data-lottie=""
        data-lottie-ready={ready ? "" : undefined}
      />
      {loop && ready && motionOk && (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause the animation" : "Play the animation"}
          aria-pressed={!playing}
          className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-full border border-line-strong bg-card/90 text-ink shadow-1"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
          )}
        </button>
      )}
    </div>
  );
}
