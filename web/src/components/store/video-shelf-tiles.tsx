"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { CompactAdd } from "@/components/store/compact-add";
import { PlayDisc, YOUTUBE_ID, YouTubeFrame } from "@/components/product/product-video";
import { IconBox } from "@/components/icons-ui";
import { useMotionOk } from "@/lib/hooks/use-carousel";
import { useConsent } from "@/lib/consent";
import { focalStyle } from "@/lib/focal";
import { formatPaise } from "@/lib/money";
import type { VideoShape, VideoShelfRow } from "@/types/store-merch";

/**
 * The tiles of "shop the videos" (0.140.0): a scroll-snap row, each tile a
 * video well with the product under it.
 *
 * **Click mode, the default, requests nothing from YouTube before a press.**
 * The well is a poster — the video's uploaded one, else the product's first
 * picture, else a panel this site draws — with `PlayDisc`; a press mounts the
 * `youtube-nocookie` iframe (or a `<video>`) in place. **Never `i.ytimg.com`**:
 * YouTube's thumbnail would be the very request the facade exists to avoid.
 *
 * **One plays at a time.** "Which tile has the full player" is a module-level
 * store read through `useSyncExternalStore` — the `tickets/bulk.tsx` shape —
 * so starting another puts the first back to its poster, and so does a second
 * shelf on the same page.
 *
 * **Autoplay mode** (a setting, off by default) mounts a muted, looping,
 * control-less player in a tile at least 60% on screen, at most four at once,
 * and unmounts it when it leaves. It is not offered under reduced motion or
 * Save-Data, and where the cookie banner is in use it waits for the visitor
 * to accept — it contacts YouTube without a press, which is exactly what the
 * banner is a promise not to do. A visible **Pause videos** button unmounts
 * every autoplaying player; pressing a tile gives that tile the full player
 * with sound. No YouTube script API: iframes only.
 */

/* ---------------------------------------------------- the one-at-a-time store */

let activeId: string | null = null;
const listeners = new Set<() => void>();

function setActive(id: string | null) {
  if (activeId === id) return;
  activeId = id;
  listeners.forEach((l) => l());
}

function subscribeActive(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function useActiveId(): string | null {
  return useSyncExternalStore(subscribeActive, () => activeId, () => null);
}

/** Save-Data, read as an external value: unknown on the server, so nothing autoplays before the check. */
const subscribeNone = () => () => {};
function useSaveData(): boolean {
  return useSyncExternalStore(
    subscribeNone,
    () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true,
    () => true,
  );
}

/* --------------------------------------------------------------------- sizes */

/**
 * Tiles per row at each width of the row's own container, set as `--per` on
 * the tile (a fractional number so the next one peeks out: that is what says
 * the row scrolls). Literal class names — Tailwind reads the source.
 */
const PER: Record<"large" | "small", Record<VideoShape, string>> = {
  large: {
    // The two widest steps exist because a portrait tile grows in both
    // directions: at 5.4 a row on a 1920 screen each was 310px wide and 722px
    // tall — one row filling the window. Measured 0.140.0.
    portrait: "[--per:2.33] @min-[36rem]:[--per:3.4] @min-[56rem]:[--per:4.4] @min-[70rem]:[--per:5.4] @min-[84rem]:[--per:6.4] @min-[100rem]:[--per:7.4]",
    square: "[--per:1.6] @min-[36rem]:[--per:2.4] @min-[56rem]:[--per:3.4] @min-[70rem]:[--per:4.4] @min-[100rem]:[--per:5.4]",
    landscape: "[--per:1.25] @min-[36rem]:[--per:2.2] @min-[56rem]:[--per:2.8] @min-[70rem]:[--per:3.4] @min-[100rem]:[--per:4.4]",
  },
  // The product page's row is asked to be small: at 2.4 a row a tile beside
  // the buy panel was 223px by 575px, taller than the panel's own price block.
  small: {
    portrait: "[--per:2.6] @min-[26rem]:[--per:3.4] @min-[34rem]:[--per:4.3]",
    square: "[--per:2.2] @min-[26rem]:[--per:2.8] @min-[34rem]:[--per:3.4]",
    landscape: "[--per:1.5] @min-[26rem]:[--per:2.2] @min-[34rem]:[--per:2.6]",
  },
};

const WELL: Record<VideoShape, string> = {
  portrait: "aspect-[9/16]",
  square: "aspect-square",
  landscape: "aspect-video",
};

/** How many silent players may be mounted at once. */
const MAX_PLAYING = 4;

/* --------------------------------------------------------------------- shelf */

export function VideoShelfTiles({
  rows, shape, autoplay, showSku, consentGated, size = "large", titleAs = "h3", header,
}: {
  /** The shelf's heading, drawn on the controls' own row. */
  header?: React.ReactNode;
  rows: VideoShelfRow[];
  shape: VideoShape;
  autoplay: boolean;
  showSku: boolean;
  consentGated: boolean;
  size?: "large" | "small";
  /** A tile's name is an `h3` under the shelf's `h2`, or a `p` when the shelf has no heading. */
  titleAs?: "h3" | "p";
}) {
  const motionOk = useMotionOk();
  const saveData = useSaveData();
  const consent = useConsent();
  const active = useActiveId();

  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set());
  const [edges, setEdges] = useState({ start: true, end: false });

  const scroller = useRef<HTMLUListElement>(null);
  const tiles = useRef(new Map<string, HTMLLIElement>());

  /*
    Whether a tile may start by itself. Reduced motion, Save-Data and a
    declined — or not yet answered — banner each turn it off.
  */
  const mayAutoplay = autoplay && motionOk && !saveData && (!consentGated || consent === "granted");

  /* Which tiles are at least 60% on screen. Only watched while autoplay is on. */
  useEffect(() => {
    if (!mayAutoplay) return;

    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.tileId;
          if (!id) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) seen.add(id);
          else seen.delete(id);
        }
        setVisible(new Set(seen));
      },
      { threshold: [0, 0.6, 1] },
    );
    tiles.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [mayAutoplay, rows]);

  /* Arrow state: whether there is more to scroll to in each direction. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const sync = () => setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    const resize = new ResizeObserver(sync);
    resize.observe(el);
    el.addEventListener("scroll", sync, { passive: true });

    return () => { resize.disconnect(); el.removeEventListener("scroll", sync); };
  }, [rows]);

  const move = useCallback((direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: motionOk ? "smooth" : "auto" });
  }, [motionOk]);

  /* The first few visible tiles, in row order, that play silently — never more than four. */
  const playing = useMemo(() => {
    if (!mayAutoplay || paused) return new Set<string>();
    return new Set(rows.filter((r) => visible.has(r.id) && r.id !== active).slice(0, MAX_PLAYING).map((r) => r.id));
  }, [mayAutoplay, paused, rows, visible, active]);

  return (
    <div className="@container relative">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        {header}
        <div className="ml-auto flex items-center gap-2">
        {mayAutoplay && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="inline-flex min-h-8 items-center rounded-full border border-line-strong bg-card px-3.5 text-12-5 font-semibold text-ink-2 transition-colors duration-(--duration-base) hover:bg-surface-2"
          >
            {paused ? "Resume videos" : "Pause videos"}
          </button>
        )}
        {/* Previous and next from `md`; below it the row is swiped. */}
        <div className="hidden gap-2 md:flex">
          <ArrowButton label="Previous videos" onClick={() => move(-1)} disabled={edges.start} flip />
          <ArrowButton label="Next videos" onClick={() => move(1)} disabled={edges.end} />
        </div>
        </div>
      </div>

      {/* `w-0 min-w-full`: a scroll container inside a grid item would otherwise widen its column. */}
      <ul
        ref={scroller}
        className="flex w-0 min-w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
      >
        {rows.map((row) => (
          <Tile
            key={row.id}
            row={row}
            shape={shape}
            size={size}
            showSku={showSku}
            titleAs={titleAs}
            mode={row.id === active ? "full" : playing.has(row.id) ? "quiet" : "poster"}
            register={(el) => { if (el) tiles.current.set(row.id, el); else tiles.current.delete(row.id); }}
          />
        ))}
      </ul>
    </div>
  );
}

function ArrowButton({ label, onClick, disabled, flip = false }: { label: string; onClick: () => void; disabled: boolean; flip?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-9 place-items-center rounded-full border border-line-strong bg-card text-ink-2 transition-colors duration-(--duration-base) hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className={`size-4 ${flip ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/* ---------------------------------------------------------------------- tile */

type Mode = "poster" | "quiet" | "full";

function Tile({
  row, shape, size, showSku, titleAs, mode, register,
}: {
  row: VideoShelfRow;
  shape: VideoShape;
  size: "large" | "small";
  showSku: boolean;
  titleAs: "h3" | "p";
  mode: Mode;
  register: (el: HTMLLIElement | null) => void;
}) {
  const { video, product } = row;
  const Title = titleAs;
  const discounted = Boolean(product.compare_at_paise && product.compare_at_paise > product.price_paise);
  const playable = video.kind === "file" ? Boolean(video.url) : Boolean(video.youtube_id && YOUTUBE_ID.test(video.youtube_id));
  const label = video.title ? `${video.title} — ${product.name}` : `${product.name} — video`;

  return (
    <li
      ref={register}
      data-tile-id={row.id}
      className={`w-[calc((100cqw-(var(--per)-1)*0.75rem)/var(--per))] min-w-0 shrink-0 snap-start ${PER[size][shape]}`}
    >
      <article data-card data-video-tile className="flex h-full flex-col overflow-hidden rounded-lg border border-line-strong bg-card">
        <div className={`relative ${WELL[shape]} overflow-hidden bg-dark`}>
          {mode === "poster" || !playable ? (
            <Poster row={row} label={label} playable={playable} size={size} />
          ) : (
            <Player row={row} label={label} mode={mode} />
          )}
        </div>

        <div className={`flex min-w-0 flex-1 flex-col gap-2 ${size === "small" ? "p-2.5" : "p-3"}`}>
          {/*
            Two lines of name are reserved whether or not the name needs them,
            so the price sits on one line across the row; the caption is
            pinned to the foot for the same reason. Without both, a tile with
            a short name or no caption put its price a line above its
            neighbours'.
          */}
          <div className="flex items-start gap-2.5">
            {/* The thumbnail only where there is room for the name beside it:
                in a 130px tile it left the name 55px, three letters a line. */}
            <Link
              href={`/store/products/${product.slug}`}
              aria-hidden
              tabIndex={-1}
              className={`relative size-12 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface ${size === "small" ? "hidden" : "hidden sm:grid"}`}
            >
              {product.images?.[0] ? (
                <Image
                  src={product.images[0]}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                  style={focalStyle(product.image_focuses?.[0])}
                />
              ) : (
                <span className="text-faint"><IconBox /></span>
              )}
            </Link>

            <div className="min-w-0 flex-1">
              <Title className="line-clamp-2 min-h-[2.75em] text-13 font-semibold leading-snug">
                {/* `py-1`: an inline link's box is its line, 17px here; the padding makes the target 25px without moving the text. */}
                <Link href={`/store/products/${product.slug}`} className="py-1 hover:underline">{product.name}</Link>
              </Title>
              {showSku && product.sku && (
                <p className="mt-0.5 truncate font-mono text-11-5 text-faint">{product.sku}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className={`font-semibold tabular-nums ${size === "small" ? "text-14" : "text-15"}`}>{formatPaise(product.price_paise)}</span>
              {discounted && (
                <span className="text-12 tabular-nums text-faint line-through">{formatPaise(product.compare_at_paise!)}</span>
              )}
            </div>
            <CompactAdd product={product} inline />
          </div>

          {video.title && (
            <p className="mt-auto line-clamp-2 border-t border-line pt-2 text-12-5 text-muted">{video.title}</p>
          )}
        </div>
      </article>
    </li>
  );
}

/* ----------------------------------------------------------- the video well */

/** The resting state: a picture and the play mark. A button — pressing it starts this tile and stops any other. */
function Poster({ row, label, playable, size }: { row: VideoShelfRow; label: string; playable: boolean; size: "large" | "small" }) {
  const { video, product } = row;
  const src = video.poster_url ?? product.images?.[0] ?? null;
  const alt = video.poster_url ? (video.poster_alt ?? "") : "";
  const focus = video.poster_url ? undefined : product.image_focuses?.[0];

  const picture = src ? (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={size === "small" ? "(min-width: 1024px) 18vw, 40vw" : "(min-width: 1280px) 16vw, (min-width: 640px) 30vw, 45vw"}
      className="object-cover"
      style={focalStyle(focus)}
    />
  ) : (
    /* No poster and no product picture: a panel this site draws, never an empty box. */
    <span aria-hidden className="absolute inset-0 bg-linear-135 from-dark to-brand-900" />
  );

  if (!playable) return <>{picture}</>;

  return (
    <button
      type="button"
      onClick={() => setActive(row.id)}
      className="group absolute inset-0 grid size-full place-items-center focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
    >
      {picture}
      <PlayDisc className="relative size-14" />
      <span className="sr-only">
        Play the video: {label}.{video.kind === "file" ? "" : " It loads from YouTube, which sets its own cookies."}
      </span>
    </button>
  );
}

/**
 * A mounted player. `full` is the visitor's own press — sound and controls; `quiet`
 * is autoplay — muted, looping and covered by a button, so pressing the tile
 * still means "play this one properly".
 */
function Player({ row, label, mode }: { row: VideoShelfRow; label: string; mode: Exclude<Mode, "poster"> }) {
  const { video } = row;
  const quiet = mode === "quiet";

  return (
    <>
      {video.kind === "file" && video.url ? (
        <video
          key={mode}
          src={video.url}
          poster={video.poster_url}
          controls={!quiet}
          autoPlay
          muted={quiet}
          loop={quiet}
          playsInline
          preload="none"
          aria-label={label}
          tabIndex={quiet ? -1 : undefined}
          className={`absolute inset-0 size-full bg-dark object-contain ${quiet ? "pointer-events-none" : ""}`}
        />
      ) : (
        <YouTubeFrame key={mode} id={video.youtube_id ?? ""} title={label} quiet={quiet} />
      )}
      {quiet && (
        <button
          type="button"
          onClick={() => setActive(row.id)}
          className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
        >
          <span className="sr-only">Play the video with sound: {label}</span>
        </button>
      )}
    </>
  );
}
