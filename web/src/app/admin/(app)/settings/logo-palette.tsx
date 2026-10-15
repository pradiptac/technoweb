"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paletteFromLogoAction } from "./logo-palette-actions";
import type { LogoPalette as Palette, LogoReading } from "@/types/api";

/**
 * "Take our colours from the logo" (0.173.0, `docs/theming.md` "Brand from a
 * logo").
 *
 * The API reads the logo — a browser cannot, since the file is on the API's
 * origin, where a canvas is tainted and a `fetch` is refused — and answers up
 * to three readings of it. Pressing one fills the Custom colours fields;
 * **Save is what applies them**, the AI assistant's rule.
 *
 * A tile is the four colours and what the reading is called, and nothing
 * more: the picker's own live preview sits below these and redraws for
 * whichever reading was picked, so a preview inside each tile would be a
 * second answer to the same question in a smaller box.
 *
 * `initialPath` is the media path `?palette=` named — how the media library
 * hands a picture over without carrying colours between screens.
 *
 * The thumbnail comes from the answer rather than a prop: `logo_path` is in
 * the General group and these rows are Appearance's, so the API — which read
 * the file — is the one place that knows which picture this was.
 */
export function LogoPalette({ initialPath, onPick }: {
  initialPath?: string;
  onPick: (reading: LogoReading) => void;
}) {
  const [from, setFrom] = useState<Palette["from"] | null>(null);
  const [readings, setReadings] = useState<LogoReading[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const read = (path?: string) => {
    startTransition(async () => {
      const res = await paletteFromLogoAction(path);
      setError(res.error ?? null);
      setReadings(res.palette?.readings ?? null);
      setFrom(res.palette?.from ?? null);
      setPicked(null);
    });
  };

  // A picture handed over from the media library is read on arrival, so the
  // editor lands on the tiles rather than on a button they have to find.
  const asked = useRef(false);
  useEffect(() => {
    if (initialPath && !asked.current) {
      asked.current = true;
      read(initialPath);
    }
  }, [initialPath]);

  return (
    <div className="mb-4 rounded-lg border border-line bg-card p-3" data-logo-palette="">
      <div className="flex flex-wrap items-center gap-3">
        {from && (
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded border border-line-strong bg-surface p-1">
            <Image src={from.url} alt="" width={40} height={40} className="h-full w-full object-contain" unoptimized />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-13-5 font-semibold text-ink">Take our colours from the logo</p>
          <p className="text-12-5 text-muted">
            The colours in your logo, offered as palettes. Nothing changes until you save.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          pending={pending}
          disabled={pending}
          onClick={() => read(initialPath)}
          data-logo-palette-read=""
        >
          {readings ? "Read it again" : "Read the logo"}
        </Button>
      </div>

      {error && <p role="alert" className="mt-2 text-12-5 text-err" data-logo-palette-error="">{error}</p>}

      {readings && readings.length > 0 && (
        <>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {readings.map((reading) => (
              <li key={reading.key}>
                <button
                  type="button"
                  onClick={() => { setPicked(reading.key); onPick(reading); }}
                  aria-pressed={picked === reading.key}
                  data-logo-reading={reading.key}
                  className={cn(
                    "w-full rounded-lg border p-2 text-left transition-colors",
                    picked === reading.key ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong bg-surface hover:border-faint",
                  )}
                >
                  <span className="flex gap-1">
                    {[reading.primary, reading.secondary, reading.accent, reading.topbar].filter(Boolean).map((hex, i) => (
                      <span
                        key={i}
                        className="h-6 flex-1 rounded border border-line"
                        style={{ background: hex }}
                        title={hex}
                      />
                    ))}
                  </span>
                  <span className="mt-1.5 block text-12-5 font-semibold text-ink">{reading.label}</span>
                  <span className="block font-mono text-11 text-muted">{reading.primary}</span>
                </button>
              </li>
            ))}
          </ul>
          {readings.some((r) => r.derived) && (
            <p className="mt-2 text-12 text-muted">
              Your logo has fewer than three colours, so Secondary and Accent are derived from the one it has.
            </p>
          )}
          <p className="mt-1 text-12 text-muted">
            Pressing one fills the colours below. The site does not change until you save.
          </p>
        </>
      )}
    </div>
  );
}
