"use client";

import { createElement, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motionFileUrl } from "@/lib/motion-file";
import { useMotionOk } from "@/lib/hooks/use-carousel";

/**
 * A 3D model from the media library (0.172.0, docs/page-builder.md
 * "Animation and 3D model").
 *
 * The server draws the poster — or a soft ground — at the reserved height;
 * `@google/model-viewer` (Apache-2.0, three.js inside) is imported only when
 * the stage comes within 200px of the screen, and the `<model-viewer>`
 * element is created only then, so the server never renders a custom element
 * it cannot upgrade. The upload refused any model that needs a decoder
 * (Draco, meshopt, KTX2) or points at another site, so model-viewer fetches
 * the one file and nothing from Google's CDN.
 *
 * It turns slowly by itself when the editor left Rotate on and motion is
 * allowed; a visitor can always drag it. No AR attributes: "view in your
 * room" is out of this release.
 */
export function ModelStage({ file, alt, poster, posterAlt, rotate, className }: {
  file: string;
  alt: string;
  poster?: string | null;
  posterAlt?: string | null;
  rotate: boolean;
  className?: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const motionOk = useMotionOk();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let cancelled = false;
    const near = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      near.disconnect();
      import("@google/model-viewer").then(() => { if (!cancelled) setLoaded(true); }, () => {});
    }, { rootMargin: "200px" });
    near.observe(el);
    return () => { cancelled = true; near.disconnect(); };
  }, []);

  return (
    <div ref={stage} className={cn("relative h-full w-full overflow-hidden rounded-lg bg-surface-2", className)} data-model-stage="">
      {poster && !loaded && (
        <Image src={poster} alt={posterAlt ?? ""} fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-contain" />
      )}
      {loaded && createElement("model-viewer", {
        src: motionFileUrl(file),
        alt,
        poster: poster ?? undefined,
        "camera-controls": "",
        "touch-action": "pan-y",
        "interaction-prompt": "none",
        "shadow-intensity": "1",
        loading: "eager",
        ...(rotate && motionOk ? { "auto-rotate": "", "rotation-per-second": "18deg" } : {}),
        style: { width: "100%", height: "100%", background: "transparent" },
      })}
    </div>
  );
}
