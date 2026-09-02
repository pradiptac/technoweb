"use client";

import { useState } from "react";

/**
 * A YouTube video that contacts YouTube only once somebody asks for it.
 *
 * A plain `<iframe>` loads roughly a megabyte of script and sets third-party
 * cookies on page load, for a video most readers will never play. This site
 * takes the other position everywhere else — `Analytics` renders *nothing*
 * until consent is given, because a banner that shows while the tags load
 * anyway claims a consent it never obtained — and a video widget that quietly
 * did the opposite would make that claim false on every blog page.
 *
 * So: a poster this application draws itself, and the iframe is mounted on the
 * first click. Nothing leaves the browser until then.
 *
 * **The poster is not YouTube's thumbnail**, deliberately. That would be a
 * request to `i.ytimg.com` on load — the very thing this avoids — and it is not
 * in `img-src`, so the CSP would block it and `npm run audit` would fail on the
 * violation. Widening the policy for a decorative image is the wrong trade.
 */
export function YouTubeEmbed({ url, title = "Watch on YouTube" }: { url: string; title?: string }) {
  const [playing, setPlaying] = useState(false);
  const id = videoId(url);

  // An unparseable setting renders nothing rather than an empty black box.
  if (!id) return null;

  if (playing) {
    return (
      <div className="aspect-video overflow-hidden rounded bg-ink">
        <iframe
          // `youtube-nocookie`, and `autoplay` because the click *was* the
          // request to play — mounting a paused player would make somebody
          // press it twice.
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="size-full border-0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative grid aspect-video w-full place-items-center overflow-hidden rounded bg-linear-135 from-ink to-brand-900 transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <span className="grid size-14 place-items-center rounded-full bg-white/95 shadow-lg transition-transform motion-safe:group-hover:scale-105">
        {/* The play triangle, drawn rather than fetched. */}
        <svg viewBox="0 0 24 24" className="ml-1 size-6 fill-ink" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>

      <span className="absolute inset-x-0 bottom-0 p-3 text-left text-[12.5px] font-semibold text-white/85">
        {title}
      </span>

      <span className="sr-only">
        Play the video. It loads from YouTube, which sets its own cookies.
      </span>
    </button>
  );
}

/**
 * The eleven-character id, or null.
 *
 * Parsed rather than trusted: whatever is in the setting becomes an iframe
 * `src`, and an unchecked one is somebody else's page rendered inside this
 * origin — the same reasoning the contact page's map embed and the slider's
 * video field already follow. The host is compared **exactly**, because
 * `str_contains`-style matching accepts `youtube.com.attacker.test`.
 *
 * The id shape is checked too, so nothing but `[A-Za-z0-9_-]{11}` is ever
 * interpolated into the URL.
 */
function videoId(raw: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(raw.trim());
  } catch {
    // Not a URL at all — but an id on its own is a reasonable thing for
    // somebody to paste into a settings box, so it is accepted on its shape.
    return /^[A-Za-z0-9_-]{11}$/.test(raw.trim()) ? raw.trim() : null;
  }

  const host = parsed.hostname.replace(/^www\./, "");

  const candidate =
    host === "youtu.be" ? parsed.pathname.slice(1)
      : host === "youtube.com" || host === "youtube-nocookie.com"
        ? parsed.searchParams.get("v")
          ?? parsed.pathname.replace(/^\/(embed|shorts|v)\//, "")
        : null;

  return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}
