"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconClose } from "@/components/icons-ui";
import { usePresence } from "@/lib/hooks/use-presence";

/**
 * "Install this site" — a small card, offered politely (2026-10-05).
 *
 * The rules, each because the alternative is a nag:
 *
 * - **Not on the first page.** From the second page a visitor opens in a
 *   session, or after 45 seconds on the first — somebody who bounced has not
 *   decided they want the site on their home screen.
 * - **Never over the cookie banner or the compare tray**, which own the
 *   bottom edge while they are up; the card waits and looks again.
 * - **Once dismissed, a month of silence** (`tw_pwa_dismissed`), and never
 *   inside the installed app itself.
 * - **Only when the browser can do it**: Chrome and Edge fire
 *   `beforeinstallprompt`, which is held and replayed by the Install button;
 *   iPhone and iPad Safari never fire it, so there the card says where the
 *   Share menu is instead of offering a button that cannot work.
 *
 * ## Where it sits, at every width
 *
 * Bottom-left from `sm`, 22rem wide. Below `sm` it spans the screen but keeps
 * a 4.5rem gutter on the right, which is the column the assistant's launcher
 * and the back-to-top button live in — the card and the launcher never
 * cover each other at 320px. The buttons sit on their own row under the
 * text, because beside it they squeezed the words to three per line.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISSED = "tw_pwa_dismissed";
const VIEWS = "tw_pwa_views";
const LAST = "tw_pwa_last";
const QUIET_MS = 30 * 24 * 3600 * 1000;

function store(kind: "local" | "session"): Storage | null {
  try { return kind === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
}

function standalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function iosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
}

/** Apple's Share glyph, drawn so the instruction points at the real button. */
function ShareGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="inline size-4 -translate-y-px align-middle" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

export function InstallPrompt({ name }: { name: string }) {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const held = (e: Event) => { e.preventDefault(); setDeferred(e as InstallEvent); };
    const installed = () => setClosed(true);
    window.addEventListener("beforeinstallprompt", held);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", held);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  // A page view each time the path changes, and a look at whether to offer.
  useEffect(() => {
    // Counted per distinct page, so an effect that runs twice for one page
    // (React's development double-run, or a re-render) is still one view.
    const session = store("session");
    let views = Number(session?.getItem(VIEWS) ?? 0);
    if (session?.getItem(LAST) !== pathname) {
      views += 1;
      session?.setItem(VIEWS, String(views));
      session?.setItem(LAST, pathname);
    }

    let timer = 0;
    const check = () => {
      const dismissed = Number(store("local")?.getItem(DISMISSED) ?? 0);
      if (standalone() || Date.now() - dismissed < QUIET_MS) return;
      // Something else owns the bottom edge: look again shortly.
      if (document.querySelector("[data-cookie-banner], [data-compare-tray] > *")) {
        timer = window.setTimeout(check, 5000);
        return;
      }
      setIos(iosSafari());
      setEligible(true);
    };
    timer = window.setTimeout(check, views >= 2 ? 1500 : 45000);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const show = eligible && !closed && (deferred !== null || ios);
  const { mounted, leaving } = usePresence(show);
  if (!mounted) return null;

  const dismiss = () => {
    store("local")?.setItem(DISMISSED, String(Date.now()));
    setClosed(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    setDeferred(null);
    if (choice.outcome === "dismissed") dismiss();
    else setClosed(true);
  };

  return (
    <div
      role="region"
      aria-label={`Install ${name}`}
      data-install-prompt
      data-leaving={leaving || undefined}
      className="rise-in fixed bottom-[calc(.75rem+env(safe-area-inset-bottom))] left-3 right-[4.5rem] z-40 rounded-xl border border-line-strong bg-card p-3.5 shadow-float sm:right-auto sm:bottom-4 sm:left-4 sm:w-[22rem]"
    >
      <div className="flex items-start gap-3">
        <Image src="/pwa-icon/192" alt="" width={44} height={44} className="size-11 shrink-0 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="text-14 font-semibold leading-snug text-ink">Install {name}</p>
          <p className="mt-0.5 text-13 leading-snug text-muted">
            {ios ? (
              <>Tap <ShareGlyph /> <span className="font-semibold text-ink-2">Share</span>, then <span className="font-semibold text-ink-2">Add to Home Screen</span>.</>
            ) : (
              "Open it from your home screen — full screen, quicker, and pages you have seen still open offline."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-ink"
        >
          <IconClose className="size-4" />
        </button>
      </div>
      {!ios && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={install} className="flex-1 sm:flex-none">Install</Button>
          <Button size="sm" variant="ghost" onClick={dismiss} className="flex-1 sm:flex-none">Not now</Button>
        </div>
      )}
    </div>
  );
}
