"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { MediaBrowser } from "@/components/admin/media-browser";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { AdminProductVideo } from "@/types/store-merch";

const MAX = 4;

type Row = {
  /** A client-side key, so a removed row does not hand its state to the next. */
  key: number;
  kind: "youtube" | "file";
  youtube: string;
  path: string;
  name: string;
  title: string;
  posterPath: string;
  posterUrl: string;
};

/**
 * A store product's videos (2026-09-26): up to four, shown after the
 * pictures in the product page's gallery.
 *
 * Each is a **YouTube link** — pasted as it comes, a watch, share or embed
 * address; the API keeps only the video's id, and refuses a link whose host
 * is not YouTube's — or an **MP4 or WebM from the media library**. A poster
 * is optional for both, and worth giving: without one a YouTube video shows
 * a panel this site draws rather than a frame of it, because YouTube's own
 * thumbnail is never fetched, and the product's structured data names a
 * YouTube video only when a poster is set.
 *
 * Posted as one hidden JSON list, `videos`, replaced wholesale.
 */
export function VideoField({ defaultValue, error }: { defaultValue: AdminProductVideo[]; error?: string }) {
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map((v, i) => ({
    key: i,
    kind: v.kind === "file" ? "file" : "youtube",
    youtube: v.youtube_id ? `https://www.youtube.com/watch?v=${v.youtube_id}` : "",
    path: v.path ?? "",
    name: v.path ? v.path.split("/").pop() ?? v.path : "",
    title: v.title ?? "",
    posterPath: v.poster_path ?? "",
    posterUrl: v.poster_url ?? "",
  })));
  const [browsing, setBrowsing] = useState<{ row: number; what: "file" | "poster" } | null>(null);
  // Keys for rows added here, after the stored ones' 0..n-1; bumped in the
  // click handler, never during render.
  const seq = useRef(defaultValue.length);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const move = (i: number, by: -1 | 1) =>
    setRows((list) => {
      const to = i + by;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  const payload = rows.map((r) => r.kind === "youtube"
    ? { kind: "youtube", youtube_id: r.youtube.trim(), title: r.title.trim() || null, poster_path: r.posterPath || null }
    : { kind: "file", path: r.path, title: r.title.trim() || null, poster_path: r.posterPath || null });

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-13-5 font-semibold">Videos</span>
      <p className="measure mb-3 text-12-5 text-muted">
        Up to four, shown after the pictures on the product page. A YouTube link plays from YouTube only when
        somebody presses play; a file is an MP4 or WebM from the media library. A poster is the frame shown before
        play — without one a YouTube video shows a plain panel, since YouTube&apos;s own thumbnail is never loaded.
      </p>

      <input type="hidden" name="videos" value={JSON.stringify(payload)} />

      {rows.length > 0 && (
        <ol className="mb-3 grid gap-3">
          {rows.map((row, i) => (
            <li key={row.key} className="grid gap-3 rounded-lg border border-line-strong bg-card p-3 md:grid-cols-[minmax(0,1fr)_9rem]">
              <div className="grid min-w-0 gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`video-kind-${row.key}`}>Video {i + 1} source</label>
                  <Select
                    id={`video-kind-${row.key}`}
                    value={row.kind}
                    onChange={(e) => update(row.key, { kind: e.target.value === "file" ? "file" : "youtube" })}
                    className="w-auto min-w-[11rem]"
                  >
                    <option value="youtube">YouTube link</option>
                    <option value="file">File from the library</option>
                  </Select>
                  <ReorderButtons
                    className="ml-auto"
                    index={i}
                    count={rows.length}
                    subject={`video ${i + 1}`}
                    onMove={(d) => move(i, d)}
                    onRemove={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                    dense
                  />
                </div>

                {row.kind === "youtube" ? (
                  <Input
                    aria-label={`Video ${i + 1} YouTube link`}
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={row.youtube}
                    onChange={(e) => update(row.key, { youtube: e.target.value })}
                    inputMode="url"
                  />
                ) : (
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-12-5 text-muted">{row.name || "No file chosen."}</span>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setBrowsing({ row: row.key, what: "file" })}>
                      {row.path ? "Change file" : "Choose a video"}
                    </Button>
                  </div>
                )}

                <Input
                  aria-label={`Video ${i + 1} title`}
                  placeholder="Title (optional) — e.g. Unboxing and first set-up"
                  value={row.title}
                  maxLength={120}
                  onChange={(e) => update(row.key, { title: e.target.value })}
                />
              </div>

              <div className="grid content-start gap-2">
                <span className="text-12 font-semibold text-muted">Poster</span>
                <div className="relative aspect-video w-full overflow-hidden rounded-md border border-line bg-surface-2">
                  {row.posterUrl && <Image src={row.posterUrl} alt="" fill sizes="144px" className="object-cover" unoptimized />}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setBrowsing({ row: row.key, what: "poster" })}>
                    {row.posterPath ? "Change" : "Choose"}
                    <span className="sr-only"> the poster for video {i + 1}</span>
                  </Button>
                  {row.posterPath && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => update(row.key, { posterPath: "", posterUrl: "" })}>
                      Remove<span className="sr-only"> the poster for video {i + 1}</span>
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {rows.length < MAX && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => { const key = seq.current++; setRows((list) => [...list, { key, kind: "youtube", youtube: "", path: "", name: "", title: "", posterPath: "", posterUrl: "" }]); }}
        >
          Add a video
        </Button>
      )}

      {error && <p className="mt-2 text-12 text-err">{error}</p>}

      <MediaBrowser
        open={browsing !== null}
        kind={browsing?.what === "poster" ? "image" : "file"}
        title={browsing?.what === "poster" ? "Choose a poster" : "Choose a video"}
        accept={browsing?.what === "poster" ? "image/jpeg,image/png,image/webp,image/gif" : "video/mp4,video/webm"}
        onClose={() => setBrowsing(null)}
        onPick={(file) => {
          if (browsing?.what === "poster") update(browsing.row, { posterPath: file.path, posterUrl: file.url });
          else if (browsing) update(browsing.row, { path: file.path, name: file.name });
          setBrowsing(null);
        }}
      />
    </div>
  );
}
