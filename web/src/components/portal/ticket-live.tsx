"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Lightbox } from "@/components/ui/gallery";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { GalleryItem, TicketAttachment } from "@/types/api";

/**
 * The SLA clock a customer is paying for, shown rather than implied.
 *
 * The API has always sent `due_at`; the portal rendered only "Overdue" once
 * it had passed. This says "Reply expected by Thu, 3:30 pm" while the clock
 * is ahead, counting down in whole hours or minutes (re-read every minute,
 * never every second — a ticking figure is anxiety, not information), and
 * says plainly that it is behind once it is. Nothing for a ticket that is
 * closed or resolved: the clock has stopped mattering.
 *
 * The countdown is computed on the client only — the server renders the
 * date alone — so the HTML never carries "in 2 hours" from a moment that
 * has since moved on and mismatches on hydration.
 */
export function DueClock({ dueAt, open }: { dueAt: string | null; open: boolean }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!dueAt || !open) return <span className="text-muted">No clock on this ticket</span>;

  const due = new Date(dueAt).getTime();
  const remaining = now === null ? null : due - now;
  const behind = remaining !== null && remaining < 0;
  const label = remaining === null ? null : describe(Math.abs(remaining));

  return (
    <span className={cn(behind && "font-semibold text-err")}>
      {behind ? "Was expected by " : "Reply expected by "}
      <time dateTime={dueAt}>{formatDate(dueAt, "dateTime")}</time>
      {label && <span className={cn("ml-1.5 font-mono text-12", behind ? "text-err" : "text-muted")}>({behind ? `${label} ago` : `in ${label}`})</span>}
    </span>
  );
}

function describe(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * Notices a reply while the page is open.
 *
 * The thread is server-rendered and never refreshed, so a customer waiting
 * on an engineer had to reload to find out. While the tab is visible this
 * asks the router to refresh every sixty seconds — the page re-renders with
 * whatever is new, nothing else changes — and when the message count grows
 * it shows a pill that scrolls to the newest message rather than jumping the
 * page from under the reader. Not real time, and it need not be: a support
 * thread moves in minutes. Web Push is the later, larger step.
 */
export function ThreadRefresh({ count, open }: { count: number; open: boolean }) {
  const router = useRouter();
  const seen = useRef(count);
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 60_000);
    return () => clearInterval(id);
  }, [open, router]);

  // A grown count is a new reply; the pill's number is how many since the
  // reader last pressed it (or opened the page).
  useEffect(() => {
    if (count > seen.current) {
      const grew = count - seen.current;
      seen.current = count;
      // Set from an effect on a prop change, which is the one shape the
      // lint rule allows: it synchronises with a value that came from outside.
      queueMicrotask(() => setFresh((n) => n + grew));
    }
  }, [count]);

  if (fresh === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center">
      <button
        type="button"
        onClick={() => {
          setFresh(0);
          document.querySelector("#thread li:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        className="pointer-events-auto rounded-full bg-brand-600 px-4 py-2 text-13-5 font-semibold text-brand-on shadow-3 transition-colors hover:bg-brand-700"
      >
        {fresh === 1 ? "New reply from Technoware" : `${fresh} new replies`} ↓
      </button>
    </div>
  );
}

/**
 * Image attachments as pictures, in the thread.
 *
 * An attachment was a filename. A picture of a blinking switch is most of
 * what a customer can tell an engineer, so images render as thumbnails and
 * open in the gallery's lightbox — through the same authorised stream every
 * attachment already uses. A raw `<img>` rather than `next/image`, because
 * the stream is a signed-in route the optimiser cannot fetch; `loading=lazy`
 * so no preload hint rides in any other page's payload.
 */
export function ImageAttachments({ attachments, base }: { attachments: TicketAttachment[]; base: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const images = attachments.filter((a) => a.mime.startsWith("image/"));
  if (images.length === 0) return null;

  const items: GalleryItem[] = images.map((a) => ({
    id: a.id, url: `${base}/${a.id}`, alt: a.filename, title: a.filename, subtitle: null, link_url: null, group: null,
  }));

  return (
    <>
      <ul className="mt-3 flex flex-wrap gap-2">
        {images.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`Open ${a.filename}`}
              className="block h-24 w-32 overflow-hidden rounded-lg border border-line-strong bg-surface transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed-in stream the optimiser cannot reach */}
              <img src={`${base}/${a.id}`} alt={a.filename} loading="lazy" className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Lightbox items={items} start={open} autoplay={false} intervalMs={0} transition="fade" onClose={() => setOpen(null)} />
      )}
    </>
  );
}
