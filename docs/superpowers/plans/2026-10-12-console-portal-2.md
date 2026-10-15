# Console & Portal 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the staff console and the customer portal a brand-lit, modern, softly animated look: a glass top bar, an account menu, a redrawn foldable sidebar, a hero dashboard and a hero portal home. Routes, role gates and data stay as they are.

**Architecture:** Shared presentational pieces live in `web/src/components/app-shell/`, and the two existing area layouts use them in place of their hand-built chrome. Motion is one CSS block scoped to `[data-console]` / `[data-portal]`, built on existing tokens. Two per-browser preferences (sidebar fold, motion) live in `localStorage` and are stamped on `<html>` by the root layout's existing pre-paint script, the same mechanism as `tw_console_density`. No API change.

**Tech Stack:** Next.js 16 App Router, React 19.3, TypeScript 5.9, Tailwind v4 (CSS-first tokens in `globals.css`), Playwright probes. No new npm dependency.

**Spec:** `docs/superpowers/specs/2026-10-12-console-portal-2-design.md`

## Deviations from the spec (smaller and equivalent; flag them in review)

1. **Preferences use `localStorage`, not cookies.** `tw_console_density` already does exactly this (`lib/table-view.ts` plus the pre-paint script in `app/layout.tsx`), and nothing server-side needs the values.
2. **There is no separate `MetricTile`.** `components/admin/stat-tile.tsx` already has `spark` and `delta`; it is upgraded in place (raised surface, icon disc, counting figure), so every caller benefits and nothing forks.
3. **There is no single `SideNav` component.** `admin-nav.tsx` (an accordion with a filter, a phone drawer and new-since counts) and `portal-nav.tsx` (a flat list) keep their own logic. The shared part is the look: `app-shell/nav-pill.tsx` (the sliding active indicator) and `app-shell/nav-classes.ts` (row classes). Merging their logic would be a refactor nobody asked for.
4. **The dashboard serves `support_engineer` and admins only** (`/admin` needs `support_engineer`; other roles land elsewhere). The hero's figures and quick actions therefore come from `counts`, `leads`, `visits` and `meetings` in `AdminDashboard`.

## Global Constraints

- **Colours:** never hard-code a hex; colours are tokens from `globals.css`. Text on a fill uses `text-*-on` (`brand-on`), never `text-white`, except on the non-inverting dark tokens (`bg-dark`, `brand-900`, `accent-900`).
- **Card grounds:** every card keeps a ground (`bg-card`). Never border-only, and never `bg-surface` on a `bg-surface` area.
- **Tailwind v4 traps:**
  - `translate-*` / `scale-*` / `rotate-*` set their own CSS properties, so transition `translate` / `scale` / `rotate`, never `transform`.
  - `[hidden]` is `display:none !important`, so anything that reappears at a breakpoint uses the `hidden` class, not the attribute.
- **Motion tokens:** durations come from `--duration-fast` (150ms), `--duration-base` (200ms), `--duration-slow` (300ms), `--duration-exit` (140ms); easing from `--ease-brand` and `--ease-exit`. No literal `duration-200`.
- **Reduced motion:** any hidden start state lives only inside `@media (prefers-reduced-motion: no-preference)`.
- **The command palette** and keyboard-initiated actions get **no** animation.
- **Client components** import glyphs from `@/components/icons-ui` only. Never `@/components/icons` in a `"use client"` file: it ships about 130 icons.
- **One `h1` per page.**
- **Overflow:** none at 320, 360, 390, 414, 1280.
- **Tap targets:** 24px or more.
- **Dates:** through `lib/dates.ts` (`relativeTime`, `formatDate`), never `toLocaleString()` without a locale.
- **Files under `web/`** are CRLF. Edit with the Edit tool; never Python `write_text`.
- **Every console page** keeps `await requireScreen();`.
- **No new npm dependency.**
- **Release discipline** for each release:
  - VERSION.md entry plus `APP_VERSION` in `web/src/lib/version.ts`
  - a module note `docs/console-portal.md` plus one-line rules in CLAUDE.md under "Modules"
  - `npx tsc --noEmit`, `npm run lint`
  - `npm run audit` (light and dark, admin and portal credentials) and `npm run audit:mobile`
  - the probes
  - judging by eye at 360, 768, 1280 and 1920 in every theme

## Review Focus

1. **A palette whose brand is very light or very dark** (a custom theme) must keep the hero band's text readable. Pinned: the hero uses only the non-inverting dark tokens; the `console-shell` probe and the audit grade it in light and dark; Task 7 checks the contrast under a second preset theme.
2. **Folding the sidebar, then reloading, must not flash the expanded nav.** Pinned in Task 4: a probe check reads the nav's width on the first frame after a reload.
3. **Keyboard users with the rail folded must still reach every screen.** Pinned in Task 4: a probe check tabs to a rail icon, sees the flyout open and closes it with Escape.
4. **A portal customer with no tickets, orders, visits or meetings** must see a composed empty state, not four missing tiles and a blank timeline. Pinned in Task 12: a throwaway customer in the `portal-home` probe.
5. **One failing portal read** (for example, meetings switched off answering 403) must drop only its tile. Pinned in Task 12: each read is wrapped in `.catch`, and the probe runs with meetings disabled.

---

# Release 0.166.0: Console shell and dashboard

### Task 1: The console probe (written first; fails)

**Files:**
- Create: `web/scripts/probes/console-shell.mjs`

**Interfaces:**
- Produces: `node scripts/probes/console-shell.mjs`, which exits non-zero on any failure. Later tasks run it after each change.

- [ ] **Step 1: Write the probe**

```js
import { chromium } from "playwright";

/**
 * Measures Console 2.0's shell (docs/console-portal.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/console-shell.mjs
 *
 * (1) The top bar carries an account menu button that opens and closes with
 * Escape. (2) The sidebar folds to the rail, stays folded after a reload
 * with no expanded first frame, and unfolds again. (3) With the rail folded,
 * Tab reaches a section icon whose flyout opens on focus and closes on
 * Escape. (4) The active pill's `translate` sampled mid-flight differs from
 * both ends. (5) Motion: Subtle stamps `html[data-console-motion]` and the
 * pill no longer transitions. (6) The dashboard has one h1, a hero band and
 * no horizontal overflow at 360 and 1280. (7) Nothing is logged.
 * Puts both preferences back.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE; // shared.mjs signs in on 127.0.0.1 unless told
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
const go = async (path = "/admin") => { await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(1500); };
await go();

// (1) Account menu
const account = page.locator("[data-account-menu] > button");
ok(await account.count() === 1, "account menu button present");
await account.click();
ok(await account.getAttribute("aria-expanded") === "true", "account menu opens");
await page.keyboard.press("Escape");
ok(await account.getAttribute("aria-expanded") === "false", "Escape closes the account menu");

// (2) Fold persists, no expanded first frame
const nav = page.locator("nav[aria-label='Admin sections']");
await page.getByRole("button", { name: /Fold the sidebar/ }).click();
await page.waitForTimeout(400);
ok(await page.evaluate(() => document.documentElement.dataset.consoleNav) === "rail", "folding stamps html[data-console-nav=rail]");
const widthAtFirstPaint = await page.evaluate(async (url) => {
  return await new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      const n = document.querySelector("nav[aria-label='Admin sections']");
      if (n) { obs.disconnect(); resolve(n.getBoundingClientRect().width); }
    });
    obs.observe(document, { childList: true, subtree: true });
    location.href = url;
  });
}, `${BASE}/admin`).catch(() => null);
await page.waitForLoadState("load");
await page.waitForTimeout(1200);
const railWidth = (await nav.boundingBox())?.width ?? 999;
ok(railWidth <= 80, `folded rail is narrow after reload (${Math.round(railWidth)}px)`);
ok(widthAtFirstPaint === null || widthAtFirstPaint <= 80, `no expanded first frame (${widthAtFirstPaint})`);

// (3) Keyboard reaches a rail icon; flyout opens on focus, Escape closes
const firstGroup = nav.locator("[data-rail-group] > button").first();
await firstGroup.focus();
await page.waitForTimeout(250);
const flyout = nav.locator("[data-rail-group]:focus-within [data-flyout]").first();
ok(await flyout.isVisible(), "flyout opens when a rail icon has focus");
await page.keyboard.press("Escape");
await page.waitForTimeout(250);
ok(!(await flyout.isVisible()), "Escape closes the flyout");
await page.getByRole("button", { name: /Unfold the sidebar/ }).click();
await page.waitForTimeout(400);
ok(await page.evaluate(() => !document.documentElement.dataset.consoleNav), "unfolding clears the attribute");

// (4) Pill slides: sample mid-flight
await go("/admin/tickets");
const pill = nav.locator("[data-nav-pill]");
const readY = () => pill.evaluate((el) => getComputedStyle(el).translate);
const before = await readY();
await nav.getByRole("link", { name: /^Dashboard$/ }).click();
await page.waitForTimeout(90);
const mid = await readY();
await page.waitForTimeout(600);
const after = await readY();
ok(mid !== before && mid !== after, `pill moves through a middle value (${before} → ${mid} → ${after})`);

// (5) Subtle stops the pill's transition
await go("/admin/profile");
await page.getByRole("radio", { name: /Subtle/ }).check();
ok(await page.evaluate(() => document.documentElement.dataset.consoleMotion) === "subtle", "Subtle stamps html[data-console-motion]");
const dur = await pill.evaluate((el) => getComputedStyle(el).transitionDuration);
ok(/^0s/.test(dur), `Subtle: pill transition is 0s (${dur})`);
await page.getByRole("radio", { name: /Full/ }).check();

// (6) Dashboard structure and overflow
for (const width of [360, 1280]) {
  await page.setViewportSize({ width, height: 800 });
  await go("/admin");
  ok(await page.locator("h1").count() === 1, `${width}: exactly one h1`);
  ok(await page.locator("[data-hero-band]").count() === 1, `${width}: hero band present`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${width}: no horizontal overflow (${over})`);
}

// (7) Console errors
ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await page.evaluate(() => { localStorage.removeItem("tw_console_nav"); localStorage.removeItem("tw_console_motion"); });
await browser.close();
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it against `npm run dev` and confirm it fails**

Run, from `web/`: `ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/console-shell.mjs`
Expected: `FAIL account menu button present` and further FAILs, with exit code 1.

- [ ] **Step 3: Commit**

```bash
git add web/scripts/probes/console-shell.mjs
git commit -m "probe: console-shell (Console 2.0, failing first)"
```

---

### Task 2: Console preferences (fold and motion), pre-paint, and the Profile control

**Files:**
- Create: `web/src/lib/console-prefs.ts`
- Create: `web/src/app/admin/(app)/profile/motion-choice.tsx`
- Modify: `web/src/app/layout.tsx` (the inline pre-paint script near line 204)
- Modify: `web/src/app/admin/(app)/profile/page.tsx` (render `<MotionChoice />`)

**Interfaces:**
- Produces:
  - `useConsoleNav(): "full" | "rail"` and `setConsoleNav(v)`
  - `useConsoleMotion(): "full" | "subtle"` and `setConsoleMotion(v)`
  - `NAV_KEY = "tw_console_nav"` and `MOTION_KEY = "tw_console_motion"`
  - `<html data-console-nav="rail">` and `<html data-console-motion="subtle">`, set before paint

- [ ] **Step 1: Write `lib/console-prefs.ts`** (the same shape as `lib/table-view.ts`'s density store)

```ts
import { useSyncExternalStore } from "react";

/**
 * Two conveniences of one browser for the console (Console 2.0): whether
 * the sidebar is folded to its icon rail, and whether motion is Full or
 * Subtle. Both live in `localStorage` (the density rule, `lib/table-view.ts`)
 * and are stamped on `<html>` before paint by the root layout's script —
 * change the keys in both places together.
 *
 * No directive: the client components import the hooks; the root layout
 * spells the keys out for itself.
 */
export const NAV_KEY = "tw_console_nav";
export const MOTION_KEY = "tw_console_motion";

export type ConsoleNav = "full" | "rail";
export type ConsoleMotion = "full" | "subtle";

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
const announce = () => listeners.forEach((l) => l());

function read(key: string, on: string): boolean {
  try { return localStorage.getItem(key) === on; } catch { return false; }
}

function write(key: string, on: string, value: boolean, attr: "consoleNav" | "consoleMotion") {
  try { if (value) localStorage.setItem(key, on); else localStorage.removeItem(key); } catch { /* attribute still applies */ }
  if (value) document.documentElement.dataset[attr] = on; else delete document.documentElement.dataset[attr];
  announce();
}

export function useConsoleNav(): ConsoleNav {
  return useSyncExternalStore(subscribe, () => (read(NAV_KEY, "rail") ? "rail" : "full"), () => "full");
}
export function setConsoleNav(v: ConsoleNav) { write(NAV_KEY, "rail", v === "rail", "consoleNav"); }

export function useConsoleMotion(): ConsoleMotion {
  return useSyncExternalStore(subscribe, () => (read(MOTION_KEY, "subtle") ? "subtle" : "full"), () => "full");
}
export function setConsoleMotion(v: ConsoleMotion) { write(MOTION_KEY, "subtle", v === "subtle", "consoleMotion"); }
```

- [ ] **Step 2: Extend the pre-paint script in `app/layout.tsx`**

Find, inside the `__html` template string:

```
if(a&&localStorage.getItem("tw_console_density")==="compact"){r.dataset.consoleDensity="compact"}
```

and replace it with:

```
if(a&&localStorage.getItem("tw_console_density")==="compact"){r.dataset.consoleDensity="compact"}if(a&&localStorage.getItem("tw_console_nav")==="rail"){r.dataset.consoleNav="rail"}if(a&&localStorage.getItem("tw_console_motion")==="subtle"){r.dataset.consoleMotion="subtle"}
```

- [ ] **Step 3: Write `profile/motion-choice.tsx`**

```tsx
"use client";

import { setConsoleMotion, useConsoleMotion, type ConsoleMotion } from "@/lib/console-prefs";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CHOICES: { value: ConsoleMotion; label: string; blurb: string }[] = [
  { value: "full", label: "Full", blurb: "Things slide and fade as they change. Quick, and never on keyboard shortcuts." },
  { value: "subtle", label: "Subtle", blurb: "Only fades. Nothing moves across the screen." },
];

/** This browser's choice (lib/console-prefs.ts); reduced-motion users get Subtle regardless. */
export function MotionChoice() {
  const motion = useConsoleMotion();
  return (
    <Card as="section" interactive={false} padding="sm" className="mt-6">
      <h2 className="text-15 font-semibold">Motion</h2>
      <p className="mt-1 text-13 text-muted">How much the console moves, in this browser.</p>
      <div role="radiogroup" aria-label="Motion" className="mt-3 grid gap-2 sm:grid-cols-2">
        {CHOICES.map((c) => (
          <label key={c.value} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", motion === c.value ? "border-brand-600 bg-brand-50" : "border-line-strong bg-card")}>
            <input type="radio" name="console-motion" value={c.value} checked={motion === c.value} onChange={() => setConsoleMotion(c.value)} className="mt-1 accent-brand-600" />
            <span><span className="block text-13-5 font-semibold">{c.label}</span><span className="block text-12-5 text-muted">{c.blurb}</span></span>
          </label>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Render it on the Profile page**

In `app/admin/(app)/profile/page.tsx`, import `MotionChoice` from `./motion-choice` and render `<MotionChoice />` as the last child of the page's content. Read the file first and place it after the existing password section.

- [ ] **Step 5: Type-check and lint**

Run, from `web/`: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/console-prefs.ts web/src/app/layout.tsx "web/src/app/admin/(app)/profile"
git commit -m "console: fold and motion preferences, stamped before paint"
```

---

### Task 3: Glass top bar and account menu

**Files:**
- Create: `web/src/components/app-shell/top-bar.tsx`
- Create: `web/src/components/app-shell/account-menu.tsx`
- Modify: `web/src/app/admin/(app)/layout.tsx` (lines 94–212: the sticky bar)

**Interfaces:**
- Produces:
  - `TopBar({ brand, children, className })`: a server-safe wrapper; renders a sticky glass bar and a 1px scroll sentinel.
  - `AccountMenu({ name, detail, items, signOut })` where `items: { label: string; href: string; external?: boolean }[]` and `signOut: (formData: FormData) => void` (a server action). The root element carries `data-account-menu`.

- [ ] **Step 1: Write `app-shell/top-bar.tsx`**

```tsx
import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import { TopBarEdge } from "./top-bar-edge";

/**
 * The glass bar both areas share (Console 2.0). Translucent card over the
 * page, blurred; its hairline appears only once the page has scrolled, which
 * `TopBarEdge` decides from a sentinel. Text in it is graded against
 * `--color-card`, so the contrast audit reads it as a solid ground.
 */
export function TopBar({ brand, children, className, width }: {
  brand: ReactNode; children: ReactNode; className?: string; width?: string;
}) {
  return (
    <>
      <span data-topbar-sentinel aria-hidden className="block h-px" />
      <div data-topbar className={cn("sticky top-0 z-30 border-b border-transparent bg-card/80 backdrop-blur-[12px] transition-[border-color] duration-(--duration-base) data-[scrolled]:border-line", className)}>
        <Container className={cn(width, "flex h-13 items-center gap-3")}>
          {brand}
          <div className="ml-auto flex min-w-0 items-center gap-1">{children}</div>
        </Container>
      </div>
      <TopBarEdge />
    </>
  );
}
```

Create `web/src/components/app-shell/top-bar-edge.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/** Stamps `data-scrolled` on the bar once its sentinel leaves the viewport. Renders nothing. */
export function TopBarEdge() {
  useEffect(() => {
    const sentinel = document.querySelector("[data-topbar-sentinel]");
    const bar = document.querySelector<HTMLElement>("[data-topbar]");
    if (!sentinel || !bar) return;
    const io = new IntersectionObserver(([e]) => { bar.toggleAttribute("data-scrolled", !e.isIntersecting); });
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);
  return null;
}
```

- [ ] **Step 2: Write `app-shell/account-menu.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { IconChevronDown, IconSignOut } from "@/components/icons-ui";
import { cn } from "@/lib/utils";

export type AccountItem = { label: string; href: string; external?: boolean };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

/**
 * The account disc (Console 2.0): name, a detail line (roles or company),
 * links, and Sign out as a real form post. A button with `aria-expanded`;
 * Escape and a click outside close it and focus returns to the button.
 */
export function AccountMenu({ name, detail, items, signOut }: {
  name: string; detail?: string | null; items: AccountItem[]; signOut: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);

  return (
    <div ref={root} data-account-menu className="relative">
      <button
        ref={button} type="button" aria-expanded={open} aria-controls={id}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors duration-(--duration-base) hover:bg-surface-2"
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-brand-600 text-12 font-bold text-brand-on">{initials(name)}</span>
        <span className="hidden max-w-[18ch] truncate text-13 font-medium sm:block">{name}</span>
        <IconChevronDown aria-hidden className={cn("hidden size-3.5 text-muted transition-[rotate] duration-(--duration-base) sm:block", open && "rotate-180")} />
      </button>
      <div
        id={id}
        className={cn(
          "popover-motion absolute top-full right-0 z-40 mt-2 w-64 rounded-xl border border-line-strong bg-card p-2 shadow-3",
          open ? "block" : "hidden",
        )}
      >
        <div className="border-b border-line px-3 pt-1 pb-3">
          <p className="truncate text-13-5 font-semibold">{name}</p>
          {detail && <p className="truncate text-12-5 text-muted">{detail}</p>}
        </div>
        <ul className="py-1">
          {items.map((i) => (
            <li key={i.href}>
              {i.external ? (
                <a href={i.href} target="_blank" rel="noopener" className="block rounded px-3 py-2 text-13 hover:bg-surface-2">
                  {i.label}<span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <Link href={i.href} onClick={() => setOpen(false)} className="block rounded px-3 py-2 text-13 hover:bg-surface-2">{i.label}</Link>
              )}
            </li>
          ))}
        </ul>
        <form action={signOut} className="border-t border-line pt-1">
          <button type="submit" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-13 font-semibold hover:bg-surface-2">
            <IconSignOut aria-hidden className="size-4" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
```

(`popover-motion` is the existing arrival class in `globals.css`; check it exists with `grep -n "popover-motion" web/src/app/globals.css`. If it does not, drop the class.)

- [ ] **Step 3: Use them in `admin/(app)/layout.tsx`**

Replace the whole `<div className="sticky top-0 z-30 …">…</div>` block (the bar, lines ~94–212) with:

```tsx
<TopBar
  width={CONSOLE_WIDTH}
  brand={
    /* the existing <Link href="/admin" className="group/logo …"> … </Link>, unchanged */
  }
>
  <CommandPalette pages={palettePages(staff.roles.map((r) => r.slug))} />
  <TableView />
  <SchemeToggle area="console" className="sm:mr-1.5" />
  <AccountMenu
    name={staff.name}
    detail={roles || null}
    items={[{ label: "Your account", href: "/admin/profile" }, { label: "View site", href: "/", external: true }]}
    signOut={logoutAction}
  />
</TopBar>
```

Move the existing logo `<Link>` (with its Console chip, unchanged) into `brand`. Delete the loose "View site" anchor, the name `<Link>` and the Sign out `<form>`; the menu carries all three. Remove the now-unused `IconSignOut` import, and add `import { TopBar } from "@/components/app-shell/top-bar"` and `import { AccountMenu } from "@/components/app-shell/account-menu"`. Keep the comment explaining why View site opens in a new tab, moved beside `external: true`.

- [ ] **Step 4: Run the probe. Check (1) passes; the others still fail**

Run: `node scripts/probes/console-shell.mjs`
Expected: three `ok` lines for the account menu.

- [ ] **Step 5: Type-check, lint, and a phone audit of two routes**

Run: `npx tsc --noEmit && npm run lint && MSYS_NO_PATHCONV=1 node scripts/mobile-audit.mjs /admin /admin/tickets`
Expected: clean. The bar fits at 320px.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/app-shell "web/src/app/admin/(app)/layout.tsx"
git commit -m "console: glass top bar and account menu"
```

---

### Task 4: The sidebar redrawn (sliding pill, fold to rail, flyouts)

**Files:**
- Create: `web/src/components/app-shell/nav-pill.tsx`
- Create: `web/src/components/app-shell/nav-classes.ts`
- Modify: `web/src/app/admin/(app)/admin-nav.tsx`
- Modify: `web/src/app/admin/(app)/layout.tsx` (grid columns)

**Interfaces:**
- Consumes: `useConsoleNav` and `setConsoleNav` from Task 2.
- Produces:
  - `useNavPill(listRef, activeSelector)`, which returns `{ top, height, visible }` for one absolutely positioned pill element carrying `data-nav-pill`
  - `NAV_ROW` (string)
  - `data-rail-group` on each section `<li>`, with a `[data-flyout]` panel inside it

- [ ] **Step 1: Write `app-shell/nav-classes.ts`**

```ts
/** One row's look in both areas' navigation (Console 2.0). */
export const NAV_ROW =
  "relative z-[1] flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-13 font-medium whitespace-nowrap " +
  "transition-colors duration-(--duration-base) [&_svg]:size-4 [&_svg]:shrink-0";
export const NAV_ROW_ACTIVE = "font-semibold text-brand-on";
export const NAV_ROW_IDLE = "text-muted hover:bg-surface-2 hover:text-ink";
```

- [ ] **Step 2: Write `app-shell/nav-pill.tsx`**

```tsx
"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Where the active row is inside a list, so one pill can slide to it rather
 * than each row painting its own fill (Console 2.0). Measured after layout
 * and on resize; the pill moves with `translate` (the Tailwind v4 rule:
 * transition `translate`, never `transform`).
 */
export function useNavPill(list: RefObject<HTMLElement | null>, key: string | undefined) {
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => {
      const row = el.querySelector<HTMLElement>("[aria-current='page']");
      if (!row || row.offsetParent === null) { setBox(null); return; }
      const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top;
      setBox({ y: top, h: row.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [list, key]);
  return box;
}

export function NavPill({ box }: { box: { y: number; h: number } | null }) {
  return (
    <span
      data-nav-pill aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0 rounded-lg bg-brand-600 shadow-1 transition-[translate,height,opacity] duration-(--duration-base) ease-brand"
      style={{ translate: `0 ${box?.y ?? 0}px`, height: box?.h ?? 0, opacity: box ? 1 : 0 }}
    />
  );
}
```

- [ ] **Step 3: Rework `admin-nav.tsx`**

Make these changes and keep every existing behaviour (filter, drawer, new-since counts, accordion, `bestRow`):

1. Import `NAV_ROW`, `NAV_ROW_ACTIVE`, `NAV_ROW_IDLE`, `useNavPill`, `NavPill`, `useConsoleNav`, `setConsoleNav`, plus `useRef` from React. Add `IconChevronLeft` to the `icons-ui` import (if it does not exist there, use `IconChevronDown` with `rotate-90`).
2. Replace the `row` constant with `NAV_ROW`.
3. In `links()`: the active class becomes `NAV_ROW_ACTIVE` with **no background** (the pill paints it), and idle becomes `NAV_ROW_IDLE`.
4. Wrap the tree's top `<ul className="grid gap-0.5">` (both the filtered and the full variant) as `<div ref={listRef} className="relative"><NavPill box={pill} />…</div>`, with `const listRef = useRef<HTMLDivElement>(null); const pill = useNavPill(listRef, onHref + String(open));`.
5. Give each group `<li>` the attributes `data-rail-group` and `className="group/rail relative min-w-0"`. Inside it, after the existing panel `<ul id={panelId} …>`, add the flyout that only the folded rail shows:

```tsx
<div data-flyout className="rail-flyout absolute top-0 left-full z-40 ml-2 hidden w-56 rounded-xl border border-line-strong bg-card p-2 shadow-3">
  <p className="px-2 pb-1 text-12 font-semibold text-muted">{item.label}</p>
  <ul className="grid gap-0.5">{links(item.links, false)}</ul>
</div>
```

6. Add the fold button at the bottom of the drawer `<div>`, after `{tree}`:

```tsx
<button
  type="button"
  onClick={() => setConsoleNav(nav2 === "rail" ? "full" : "rail")}
  aria-label={nav2 === "rail" ? "Unfold the sidebar" : "Fold the sidebar"}
  className="mt-3 hidden w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-12-5 text-faint transition-colors hover:bg-surface-2 hover:text-ink lg:flex"
>
  <IconChevronLeft aria-hidden className={cn("size-4 transition-[rotate] duration-(--duration-base)", nav2 === "rail" && "rotate-180")} />
  <span className="rail-label">Fold</span>
</button>
```

with `const nav2 = useConsoleNav();` at the top of the component.

7. Wrap each row label in `<span className="rail-label truncate">{label}</span>`, and the group button's label in the same span. CSS hides `.rail-label` in rail mode, and the row keeps `aria-label={label}` for its accessible name: add `aria-label={label}` to each `Link` and group `button`.
8. Give the filter `<div className="relative mb-2">` the class `rail-hide`.

- [ ] **Step 4: Add the rail CSS to `globals.css`**

Append it after the `[data-console]` table rules (around line 2060), outside any `@layer`:

```css
/* Console 2.0 — the sidebar folded to its icon rail (docs/console-portal.md).
   `html[data-console-nav="rail"]` is set before paint (lib/console-prefs.ts),
   so a folded sidebar never paints expanded first. From `lg` only: below it
   the sidebar is the drawer and folding means nothing. */
@media (width >= 64rem) {
  html[data-console-nav="rail"] [data-console] [data-console-grid] { grid-template-columns: 64px minmax(0, 1fr); }
  html[data-console-nav="rail"] [data-console] nav[aria-label="Admin sections"] :is(.rail-label, .rail-hide, [id$="-drawer"] [data-rail-group] > ul) { display: none; }
  html[data-console-nav="rail"] [data-console] nav[aria-label="Admin sections"] { padding-right: 0.5rem; }
  html[data-console-nav="rail"] [data-console] nav[aria-label="Admin sections"] :is(a, button) { justify-content: center; }
  html[data-console-nav="rail"] [data-console] [data-rail-group]:is(:hover, :focus-within) > .rail-flyout { display: block; }
  html[data-console-nav="rail"] [data-console] [data-rail-group] > button > svg:last-child { display: none; }
}
```

Escape closes a flyout because the component's existing key handling moves focus out. Add to the group `button`: `onKeyDown={(e) => { if (e.key === "Escape") (e.currentTarget as HTMLElement).blur(); }}`.

- [ ] **Step 5: Stamp the grid**

In `admin/(app)/layout.tsx` add `data-console-grid` to the `<Container className={\`${CONSOLE_WIDTH} grid flex-1 gap-6 py-5 lg:grid-cols-[196px_1fr] lg:gap-7\`}>` element. Change its columns to `lg:grid-cols-[216px_1fr]`: the rows grew 4px of padding each side.

- [ ] **Step 6: Run the probe. Checks (2), (3) and (4) pass**

Run: `node scripts/probes/console-shell.mjs`
Expected: `ok` for the fold, the first frame, the flyout, Escape, unfold and the pill.

- [ ] **Step 7: Run the nav probe and the role test** (nothing about roles may change)

Run: `node scripts/probes/nav.mjs`, then from `api/`: `php artisan test --filter=AdminNavRolesTest`
Expected: both pass unchanged.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/app-shell "web/src/app/admin/(app)/admin-nav.tsx" "web/src/app/admin/(app)/layout.tsx" web/src/app/globals.css
git commit -m "console: sidebar with sliding pill, fold to rail, keyboard flyouts"
```

---

### Task 5: Console motion set

**Files:**
- Modify: `web/src/app/globals.css` (append the console motion block)
- Modify: `web/src/app/admin/(app)/layout.tsx` (stamp `data-motion-page="fade"`, wrap `main` children in `PageEnter`)

**Interfaces:**
- Consumes: `html[data-console-motion="subtle"]` from Task 2; `PageEnter` (`components/ui/page-enter.tsx`) with its `.page-enter` and `.page-enter-active` classes.

- [ ] **Step 1: Route crossfade.** In the layout, add `data-motion-page="fade"` to the `<div data-console …>` wrapper. Change `<main id="main" className="min-w-0">{children}</main>` to `<main id="main" className="min-w-0"><PageEnter transition="fade">{children}</PageEnter></main>`, importing `PageEnter` from `@/components/ui/page-enter`.

- [ ] **Step 2: Append the motion block to `globals.css`**

```css
/* Console 2.0 motion (docs/console-portal.md). Existing tokens only. The
   command palette and keyboard actions are deliberately absent. Subtle and
   reduced motion keep opacity and drop movement. */
@media (prefers-reduced-motion: no-preference) {
  [data-console] .page-enter.page-enter-active { animation-duration: 160ms; }
  [data-console] :is(.btn, [data-press]) { transition-property: color, background-color, border-color, box-shadow, scale; }
  [data-console] :is(.btn, [data-press]):active { scale: .97; transition-duration: var(--duration-fast); }
  [data-console] main table.admin-table tbody tr:nth-child(-n+12) { animation: console-row var(--duration-slow) var(--ease-brand) both; animation-delay: calc(var(--row, 0) * 40ms); }
  @keyframes console-row { from { opacity: 0; translate: 0 6px; } }
}
html[data-console-motion="subtle"] [data-console] [data-nav-pill],
html[data-console-motion="subtle"] [data-console] :is(.btn, [data-press]) { transition-duration: 0s !important; scale: none !important; }
html[data-console-motion="subtle"] [data-console] main table.admin-table tbody tr { animation-name: console-fade !important; }
@keyframes console-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { [data-console] [data-nav-pill] { transition-duration: 0s; } }
```

Each row's stagger index `--row` comes from CSS, not a script (the first row keeps the default `0` from `var(--row, 0)`). Add these eleven lines inside the same `no-preference` block:

```css
[data-console] main table.admin-table tbody tr:nth-child(2) { --row: 1; }
[data-console] main table.admin-table tbody tr:nth-child(3) { --row: 2; }
[data-console] main table.admin-table tbody tr:nth-child(4) { --row: 3; }
[data-console] main table.admin-table tbody tr:nth-child(5) { --row: 4; }
[data-console] main table.admin-table tbody tr:nth-child(6) { --row: 5; }
[data-console] main table.admin-table tbody tr:nth-child(7) { --row: 6; }
[data-console] main table.admin-table tbody tr:nth-child(8) { --row: 7; }
[data-console] main table.admin-table tbody tr:nth-child(9) { --row: 8; }
[data-console] main table.admin-table tbody tr:nth-child(10) { --row: 9; }
[data-console] main table.admin-table tbody tr:nth-child(11) { --row: 10; }
[data-console] main table.admin-table tbody tr:nth-child(12) { --row: 11; }
```

The row animation is `from` only, so after it ends every row holds its natural state. A row added by a later re-render does not replay it, because CSS animations run once per element insertion, which is the "first load" rule.

- [ ] **Step 3: Run the probe. Check (5) passes**

Run: `node scripts/probes/console-shell.mjs`
Expected: `ok Subtle stamps…` and `ok Subtle: pill transition is 0s`.

- [ ] **Step 4: Audit two list screens in light and dark** (rows must not be caught at opacity 0)

Run: `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin/tickets /admin/blog` and `AUDIT_SCHEME=dark MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin/tickets /admin/blog`
Expected: clean. If contrast fails on rows, the audit sampled mid-animation: confirm `settle()` waits (it waits for two identical samples) and do not change the audit.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/globals.css "web/src/app/admin/(app)/layout.tsx"
git commit -m "console: crisp motion set (press, route fade, row arrival, Subtle)"
```

---

### Task 6: The raised stat tile and the panel surface

**Files:**
- Modify: `web/src/components/admin/stat-tile.tsx`
- Create: `web/src/components/app-shell/panel.tsx`

**Interfaces:**
- Produces:
  - `StatTile`, with an unchanged prop API (`label`, `value`, `note`, `href`, `tone`, `icon`, `compact`, `spark`, `delta`)
  - `Panel({ title, icon?, actions?, children, className, as? })`, a section card with a title row

- [ ] **Step 1: Upgrade `StatTile`**

Read the rest of `stat-tile.tsx` (from line ~120) first. Then:

1. The outer box gains `bg-card shadow-2 rounded-xl` and keeps its tone border (`t.skin`'s `border-*` part). Split `TILE_TONES[*].skin` into `border` and `tint`, and apply the tint only to the new icon disc: `grid size-9 place-items-center rounded-lg` plus the tint, holding the glyph in `t.value` colour.
2. Wrap the figure in `<CountUp value={value} />` (import from `@/components/ui/count-up`). Its own rules leave non-numbers alone, show the final figure on the server and do nothing under reduced motion.
3. A tile with `href`: hover becomes `hover:-translate-y-px hover:shadow-3`, transitioning `translate, box-shadow` over `--duration-base`, inside `motion-safe:` utilities.

Keep every existing comment that still applies; delete only the ones that describe the removed full-tint skin.

- [ ] **Step 2: Write `app-shell/panel.tsx`**

```tsx
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One surface for every dashboard panel (Console 2.0): raised card, a title row with an icon disc. */
export function Panel({ title, icon, actions, children, className }: {
  title: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <Card as="section" interactive={false} padding="sm" className={cn("rounded-xl shadow-2", className)}>
      <div className="mb-3 flex items-center gap-2.5">
        {icon && <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-ink [&_svg]:size-4">{icon}</span>}
        <h2 className="text-14 font-semibold">{title}</h2>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}
```

- [ ] **Step 3: Use `Panel` for the dashboard's `status` and `pipeline` cards** in `admin/(app)/page.tsx`. Replace each `<Card as="section" interactive={false} padding="sm"><h2 …>…</h2>` with `<Panel title="…">`, keeping the bodies. Leave `metrics.tsx` alone for now (Task 7 restyles it).

- [ ] **Step 4: Check every StatTile caller still renders.** Run `npx tsc --noEmit`, then `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin /admin/store /admin/chat /admin/leads /admin/newsletter`
Expected: clean in light. Repeat with `AUDIT_SCHEME=dark`.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/admin/stat-tile.tsx web/src/components/app-shell/panel.tsx "web/src/app/admin/(app)/page.tsx"
git commit -m "console: raised stat tiles with counting figures; shared Panel surface"
```

---

### Task 7: The dashboard hero band and the entrance

**Files:**
- Create: `web/src/components/app-shell/hero-band.tsx`
- Create: `web/src/components/app-shell/entrance.tsx`
- Create: `web/src/lib/greeting.ts`
- Modify: `web/src/app/admin/(app)/page.tsx`, `web/src/app/admin/(app)/metrics.tsx`
- Modify: `web/src/app/globals.css`

**Interfaces:**
- Produces:
  - `greeting(name: string, now?: Date): string`, using IST hours: before 12 "Good morning", before 17 "Good afternoon", otherwise "Good evening", followed by `, <first name>`
  - `HeroBand({ title, summary, actions })`, carrying `data-hero-band`
  - `<Entrance />`, which stamps `data-entrance` on `[data-hero-band]`'s area once per session

- [ ] **Step 1: Write `lib/greeting.ts`** with a self-check

```ts
/** "Good evening, Priya" — the hour in IST, worked out on the server so it hydrates as rendered. */
export function greeting(name: string, now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = name.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
```

Self-check, run once and not committed:

```bash
node --experimental-strip-types -e "import('./src/lib/greeting.ts').then(({greeting:g})=>{const a=g('Priya Sen',new Date('2026-10-12T03:00:00Z'));const b=g('Priya',new Date('2026-10-12T13:00:00Z'));if(a!=='Good morning, Priya'||b!=='Good evening, Priya'){console.error(a,b);process.exit(1)}console.log('ok')})"
```

Expected: `ok`. 03:00Z is 08:30 IST; 13:00Z is 18:30 IST.

- [ ] **Step 2: Write `app-shell/hero-band.tsx`**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The brand-lit band at the top of the dashboard and the portal home
 * (Console 2.0). Painted on the non-inverting dark tokens with an opaque
 * first stop, so its white text is graded against a real ground in both
 * schemes and every palette. The drifting wash is a sibling layer, never an
 * ancestor of the words.
 */
export function HeroBand({ title, summary, actions, className }: {
  title: ReactNode; summary?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <section data-hero-band className={cn("relative isolate overflow-hidden rounded-2xl bg-linear-120 from-brand-900 via-brand-800 to-accent-900 px-5 py-6 text-white shadow-3 sm:px-7 sm:py-8", className)}>
      <span aria-hidden data-hero-wash className="absolute -inset-1/2 -z-10 bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-brand-500)_45%,transparent),transparent)] opacity-60" />
      <p className="font-display text-2xl font-semibold tracking-[-.02em] sm:text-[28px]">{title}</p>
      {summary && <p className="mt-1.5 max-w-[70ch] text-14-5 text-dark-muted">{summary}</p>}
      {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}
```

The page's `h1` stays in `PageHeader` ("Dashboard"); the band's title is a `<p>`, so there is still exactly one `h1`. Check that `bg-linear-120`, `brand-800`, `accent-900` and `text-dark-muted` exist (`grep -n "brand-800\|accent-900\|dark-muted" web/src/app/globals.css`). If `brand-800` is missing, use `brand-900` for both stops.

- [ ] **Step 3: Write `app-shell/entrance.tsx`**

```tsx
"use client";

import { useEffect } from "react";

/** Plays the dashboard/portal-home entrance once per session (Console 2.0); renders nothing. */
export function Entrance({ scope }: { scope: string }) {
  useEffect(() => {
    try {
      const key = `tw_entrance_${scope}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { return; }
    document.documentElement.dataset.entrance = scope;
    const t = window.setTimeout(() => { delete document.documentElement.dataset.entrance; }, 1400);
    return () => window.clearTimeout(t);
  }, [scope]);
  return null;
}
```

- [ ] **Step 4: Append the entrance CSS to `globals.css`**

```css
/* Console 2.0 entrance: hero wash → tiles rise → (figures count, charts draw by
   themselves). Once per session, set by <Entrance>. `from`-only keyframes, so
   the resting state is the element's own; no hidden state outside the guard. */
@media (prefers-reduced-motion: no-preference) {
  html[data-entrance] [data-hero-band] { animation: hero-in var(--duration-slow) var(--ease-brand) both; }
  html[data-entrance] [data-hero-wash] { animation: hero-drift 1200ms var(--ease-brand) both; }
  html[data-entrance] [data-entrance-item] { animation: hero-tile var(--duration-slow) var(--ease-brand) both; animation-delay: calc(120ms + var(--i, 0) * 40ms); }
  @keyframes hero-in { from { opacity: 0; } }
  @keyframes hero-drift { from { opacity: 0; translate: -6% -4%; } }
  @keyframes hero-tile { from { opacity: 0; translate: 0 8px; } }
  html[data-console-motion="subtle"][data-entrance] :is([data-hero-wash], [data-entrance-item]) { animation-name: hero-in; }
}
```

- [ ] **Step 5: Put the hero on the dashboard**

In `AdminDashboardPage` (`page.tsx`), render the hero inside `DashboardBody` just before the onboarding card, so it streams with the data:

```tsx
const staff = await getCurrentStaff();
const due = dashboard.counts.overdue_tickets;
const bits = [
  due > 0 ? `${due} overdue ticket${due === 1 ? "" : "s"}` : null,
  dashboard.counts.open_tickets > 0 ? `${dashboard.counts.open_tickets} open` : null,
  dashboard.leads && dashboard.leads.new > 0 ? `${dashboard.leads.new} new lead${dashboard.leads.new === 1 ? "" : "s"}` : null,
  dashboard.visits && dashboard.visits.awaiting > 0 ? `${dashboard.visits.awaiting} visit${dashboard.visits.awaiting === 1 ? "" : "s"} to confirm` : null,
  dashboard.meetings && dashboard.meetings.today > 0 ? `${dashboard.meetings.today} meeting${dashboard.meetings.today === 1 ? "" : "s"} today` : null,
].filter(Boolean);
const actions = [
  { label: "Open the queue", href: "/admin/tickets?open=1" },
  due > 0 ? { label: "Overdue tickets", href: "/admin/tickets?overdue=1" } : null,
  dashboard.leads ? { label: "New leads", href: "/admin/leads?status=new" } : null,
].filter((a): a is { label: string; href: string } => a !== null).slice(0, 3);

// …inside the returned fragment, first:
<HeroBand
  title={greeting(staff?.name ?? "")}
  summary={bits.length ? `${bits.join(" · ")}.` : "All quiet. Nothing is waiting on you."}
  actions={actions.map((a, i) => (
    <Link key={a.href} href={a.href} data-press className={cn("rounded-full px-4 py-2 text-13-5 font-semibold transition-colors duration-(--duration-base)", i === 0 ? "bg-white text-brand-900 hover:bg-white/90" : "border border-white/35 text-white hover:bg-white/10")}>{a.label}</Link>
  ))}
  className="mb-5"
/>
<Entrance scope="console" />
```

Imports: `HeroBand`, `Entrance`, `greeting` (`@/lib/greeting`). `text-brand-900` on `bg-white` uses non-inverting tokens, so it reads in both schemes.

- [ ] **Step 6: Mark the tiles as entrance items.** In the glance panel's `<li key={t.label}>`, add `data-entrance-item style={{ "--i": idx } as CSSProperties}`, using a running index across groups (`let idx = 0` before the map, `idx++` per tile).

- [ ] **Step 7: Restyle `metrics.tsx`'s three panels with `Panel`.** Read `metrics.tsx` first. Each of `TicketFigures`, `TicketVolume` and `TicketArrivals` that wraps its body in a `Card` with an `h2` gets `<Panel title=… icon=…>` instead, keeping its period links in `actions`. Use `IconChart` / `IconClock` from `@/components/icons` (a server file, so this is allowed).

- [ ] **Step 8: Run the probe. Check (6) passes**

Run: `node scripts/probes/console-shell.mjs`
Expected: every check `ok`, exit 0.

- [ ] **Step 9: Contrast under a second palette.** On Settings → Appearance, switch the palette to a light preset (`sunset`) and then a dark one (`midnight`). Run `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin` and the `AUDIT_SCHEME=dark` variant for each. Put the palette back.
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add web/src/components/app-shell web/src/lib/greeting.ts "web/src/app/admin/(app)/page.tsx" "web/src/app/admin/(app)/metrics.tsx" web/src/app/globals.css
git commit -m "console: brand-lit dashboard hero, panels, once-a-session entrance"
```

---

### Task 8: The Activity widget

**Files:**
- Create: `web/src/components/app-shell/activity-feed.tsx`
- Modify: `web/src/lib/dashboard-view.ts` (`WIDGETS`, `WidgetKey`)
- Modify: `web/src/app/admin/(app)/page.tsx` (`availableFor`, `panels.activity`)
- Modify: `web/scripts/probes/dashboard-view.mjs`, only if it hard-codes the widget count

**Interfaces:**
- Consumes: `getActivity({ per_page: 8 })` (`lib/admin/accounts.ts`), returning `Paginated<ActivityEntry>`; `getTickets({ sort: "created", dir: "desc", per_page: 8 })` (`lib/admin/tickets.ts`).
- Produces: `ActivityFeed({ items })` where `items: { id: string; text: ReactNode; href?: string; at: string; tone?: "brand" | "info" | "ok" | "warn" }[]`.

- [ ] **Step 1: Write `app-shell/activity-feed.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { relativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type ActivityItem = { id: string; text: ReactNode; href?: string; at: string; tone?: "brand" | "info" | "ok" | "warn" };

const DOT = { brand: "bg-brand-600", info: "bg-info", ok: "bg-ok", warn: "bg-warn" } as const;

/** A vertical timeline (Console 2.0): dot, line, words, when. Server-rendered. */
export function ActivityFeed({ items, empty = "Nothing has happened yet." }: { items: ActivityItem[]; empty?: string }) {
  if (items.length === 0) return <p className="text-13 text-muted">{empty}</p>;
  return (
    <ol className="relative grid gap-3 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-line">
      {items.map((i) => (
        <li key={i.id} className="relative flex min-w-0 gap-3 pl-0">
          <span aria-hidden className={cn("relative z-[1] mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-card", DOT[i.tone ?? "brand"])} />
          <div className="min-w-0 flex-1">
            <p className="text-13 [overflow-wrap:anywhere]">{i.href ? <Link href={i.href} className="hover:underline">{i.text}</Link> : i.text}</p>
            <p className="text-12 text-faint"><time dateTime={i.at}>{relativeTime(i.at)}</time></p>
          </div>
        </li>
      ))}
    </ol>
  );
}
```

`relativeTime` changes with the clock, so the server's rendering and the client's could differ only if this were a client component. It is a server component, so there is nothing to hydrate.

- [ ] **Step 2: Register the widget in `lib/dashboard-view.ts`**

Add `"activity"` to the `WidgetKey` union, and add this to `WIDGETS` after `urgent`:

```ts
{ key: "activity", label: "Activity", blurb: "What changed lately: the activity log for administrators, new tickets for the desk." },
```

- [ ] **Step 3: Load and draw it in `page.tsx`**

In `availableFor`, push `"activity"` after `"urgent"`. In `DashboardBody`, beside `const onboarding = getOnboarding();`, start:

```ts
const isAdmin = (await getCurrentStaff())?.roles.some((r) => r.slug === "admin") ?? false;
const activity = (isAdmin
  ? getActivity({ per_page: 8 }).then((r) => r.data.map((e) => ({
      id: `a${e.id}`, at: e.created_at, tone: "brand" as const,
      text: <>{e.actor.name} · {e.action.replaceAll("_", " ")}{e.subject?.label ? <> · {e.subject.label}</> : null}</>,
    })))
  : getTickets({ sort: "created", dir: "desc", per_page: 8 }).then((r) => r.data.map((t) => ({
      id: `t${t.id}`, at: t.created_at, tone: "info" as const, href: `/admin/tickets/${t.reference}`,
      text: <>{t.reference} · {t.subject}</>,
    })))
).catch(() => null);
```

Then add `panels.activity`:

```tsx
activity: (await activity) && (
  <Panel title="Activity" icon={<IconClock />}>
    <ActivityFeed items={(await activity) ?? []} />
  </Panel>
),
```

Imports: `getActivity` and `getTickets` from `@/lib/admin`; `ActivityFeed` and `Panel`. Add `activity` to `gapAbove`'s rules as a card (`mt-3`): the default branch already does this.

- [ ] **Step 4: Run the dashboard-view probe** (the dialog must list the new panel)

Run: `node scripts/probes/dashboard-view.mjs`
Expected: pass. If it asserts a fixed count of panels, update that number by one and say why in the probe's comment.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/app-shell/activity-feed.tsx web/src/lib/dashboard-view.ts "web/src/app/admin/(app)/page.tsx" web/scripts/probes
git commit -m "console: Activity widget (activity log for admins, new tickets for the desk)"
```

---

### Task 9: Verify, document and release 0.166.0

**Files:**
- Modify: `VERSION.md`, `web/src/lib/version.ts` (`APP_VERSION = "0.166.0"`)
- Create: `docs/console-portal.md`
- Modify: `CLAUDE.md` (add a "Console & portal shell" module entry with one-line rules)

- [ ] **Step 1: Run everything**

```bash
cd web
npx tsc --noEmit
npm run lint
node scripts/probes/console-shell.mjs
node scripts/probes/nav.mjs
node scripts/probes/table-view.mjs
node scripts/probes/dashboard-view.mjs
node scripts/probes/command-palette.mjs
npm run audit                 # with ADMIN_LOGIN_* set
AUDIT_SCHEME=dark npm run audit
npm run audit:mobile
```

Expected: every command exits 0. For performance, build and run `npm run perf` before and after this release's commits (`git stash` is not needed; compare against the previous build's JSON snapshot) and confirm `/admin`'s JavaScript grew by 3KB gzipped or less.

- [ ] **Step 2: Check by eye.** Screenshot `/admin` and `/admin/tickets` at 360, 768, 1280 and 1920, in light and dark, with the sidebar expanded and folded. Fix any odd proportion before going on (the proportion rule in the project's memory).

- [ ] **Step 3: Write `docs/console-portal.md`.** One section per rule, each with the reason:
  - prefs in `localStorage` and pre-paint
  - the pill moves by `translate`
  - rail CSS only from `lg`
  - the hero on non-inverting tokens
  - the entrance once per session
  - the palette has no animation
  - the Activity widget's two sources

Add the matching one-liners to CLAUDE.md under a new `### Console & portal shell — docs/console-portal.md` heading in "Modules".

- [ ] **Step 4: Add the VERSION.md entry** for 0.166.0 (newest first, today's date, what an editor would notice) and bump `APP_VERSION`.

- [ ] **Step 5: Commit**

```bash
git add VERSION.md web/src/lib/version.ts docs/console-portal.md CLAUDE.md
git commit -m "0.166.0: Console 2.0 — glass bar, account menu, foldable sidebar, hero dashboard, motion"
```

---

# Release 0.167.0: Portal 2.0

### Task 10: The portal probe (written first; fails)

**Files:**
- Create: `web/scripts/probes/portal-home.mjs`

- [ ] **Step 1: Write the probe**

```js
import { chromium } from "playwright";

/**
 * Measures Portal 2.0's home (docs/console-portal.md).
 *
 *   PORTAL_LOGIN_EMAIL=… PORTAL_LOGIN_PASSWORD=… node scripts/probes/portal-home.mjs
 *   EMPTY_LOGIN_EMAIL=… EMPTY_LOGIN_PASSWORD=…   # optional: a customer with nothing yet
 *
 * (1) The top bar shows the site's logo and an account menu; no "Support
 * portal" h1. (2) Exactly one h1 on /portal, /portal/orders, /portal/tickets,
 * /portal/downloads. (3) The home has a hero band, at least one tile link and
 * an activity list for the seeded customer. (4) A customer with nothing sees
 * the "Here's what you can do" empty state. (5) No overflow at 360 and 1280.
 * (6) Nothing logged.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

async function signIn(context, email, password) {
  const page = await context.newPage();
  await page.goto(`${BASE}/portal/login`, { waitUntil: "load", timeout: 180000 });
  const toPassword = page.getByRole("button", { name: /password instead/i });
  if (await toPassword.count()) await toPassword.click();
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/portal(\/|$)/, { timeout: 60000 });
  return page;
}

const errors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await signIn(context, process.env.PORTAL_LOGIN_EMAIL, process.env.PORTAL_LOGIN_PASSWORD);
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
await page.goto(`${BASE}/portal`, { waitUntil: "load" }); await page.waitForTimeout(1500);

ok(await page.locator("[data-account-menu]").count() === 1, "account menu present");
ok(await page.getByRole("heading", { level: 1, name: "Support portal" }).count() === 0, "no 'Support portal' h1");
for (const path of ["/portal", "/portal/orders", "/portal/tickets", "/portal/downloads"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load" }); await page.waitForTimeout(800);
  ok(await page.locator("h1").count() === 1, `${path}: exactly one h1`);
}
await page.goto(`${BASE}/portal`, { waitUntil: "load" }); await page.waitForTimeout(1200);
ok(await page.locator("[data-hero-band]").count() === 1, "hero band present");
ok(await page.locator("[data-portal-tile]").count() >= 1, "at least one live tile");
ok(await page.locator("[data-activity] li").count() >= 1, "activity timeline has entries");
for (const width of [360, 1280]) {
  await page.setViewportSize({ width, height: 800 });
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(800);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${width}: no horizontal overflow (${over})`);
}

if (process.env.EMPTY_LOGIN_EMAIL) {
  const ctx2 = await browser.newContext();
  const p2 = await signIn(ctx2, process.env.EMPTY_LOGIN_EMAIL, process.env.EMPTY_LOGIN_PASSWORD);
  await p2.goto(`${BASE}/portal`, { waitUntil: "load" }); await p2.waitForTimeout(1200);
  ok(await p2.getByText("Here's what you can do").count() === 1, "new customer sees the empty state");
  ok(await p2.locator("[data-portal-tile]").count() === 0, "new customer sees no zero tiles");
}

ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
```

Check the portal sign-in form's real labels with `grep -n "label=" web/src/components/auth/sign-in-form.tsx` and adjust the three locators if they differ.

- [ ] **Step 2: Run it. It fails** (no account menu, an h1 "Support portal")

- [ ] **Step 3: Commit**: `git add web/scripts/probes/portal-home.mjs && git commit -m "probe: portal-home (Portal 2.0, failing first)"`

---

### Task 11: Portal shell (top bar, account menu, nav with pill and badges, one h1)

**Files:**
- Modify: `web/src/app/portal/(app)/layout.tsx`, `web/src/app/portal/(app)/portal-nav.tsx`
- Modify: every portal page whose title is an `h2` (find them with `grep -rln "<h2" "web/src/app/portal/(app)"` and inspect each title)

**Interfaces:**
- Consumes: `TopBar` and `AccountMenu` (Task 3); `useNavPill`, `NavPill`, `NAV_ROW*` (Task 4).
- Produces: `PortalLink` gains an optional `count?: number`; the wrapper carries `data-portal`.

- [ ] **Step 1: Layout.** Replace the `<div className="border-b border-line bg-card"> … </div>` header with:

```tsx
<TopBar
  brand={<Link href="/portal" className="flex shrink-0 items-center"><Logo className="text-17" logoUrl={settings.logo_url} logoWidth={settings.logo_width} logoHeight={settings.logo_height} companyName={settings.company_name} /></Link>}
>
  {push && !impersonated && <PushBell config={push} consentGated={false} />}
  <AccountMenu
    name={customer.name}
    detail={customer.company ?? customer.email}
    items={[{ label: "My profile", href: "/portal/profile" }, { label: "Back to site", href: "/" }]}
    signOut={logoutAction}
  />
</TopBar>
```

Add `data-portal` to the outer wrapper `div`. Wrap `PageEnter` as it is now. Remove the now-unused `Button` import. Pass counts into the nav:

```ts
const summary = await getTicketSummary().catch(() => null);
const openTickets = summary ? summary.open + summary.in_progress + summary.pending : 0;
// …
<PortalNav links={portalLinks({ openTickets })} knowledgeBaseIcon={knowledgeBaseIcon} />
```

`getTicketSummary` comes from `@/lib/portal`.

- [ ] **Step 2: `portal-links.tsx`.** Change the signature to `portalLinks(counts: { openTickets?: number } = {})` and set `count: counts.openTickets || undefined` on the "My tickets" row.

- [ ] **Step 3: `portal-nav.tsx`.** Wrap the `<ul>` in `<div ref={listRef} className="relative"><NavPill box={pill} />…</div>`, with `const listRef = useRef<HTMLDivElement>(null); const pill = useNavPill(listRef, pathname);`. Rows use `NAV_ROW` with `NAV_ROW_ACTIVE` / `NAV_ROW_IDLE` (the active row loses `bg-brand-50`; the pill paints it). After the label, render the count:

```tsx
{l.count ? <span className="ml-auto rounded-full bg-brand-600 px-1.5 py-px text-10-5 font-semibold text-brand-on tabular-nums" aria-label={`${l.count} open`}>{l.count}</span> : null}
```

Below `lg` the list is a horizontal scroller and the pill measures `offsetParent`, so hide the pill there with `hidden lg:block` on `NavPill`'s root: pass a `className` prop. Below `lg`, keep a visible active state with the class `max-lg:bg-brand-600 max-lg:text-brand-on` on the active row.

- [ ] **Step 4: One h1 per portal page.** The layout no longer renders an `h1`. On each portal page whose page title is an `h2` (Dashboard, Orders, Wishlist, Tickets, Visits, Meetings, Downloads, Profile, and the detail pages), change that title to `h1` and leave lower headings as they are. Look for a "first heading" `h2` with `display-3` or `text-xl` and similar.

- [ ] **Step 5: Run the probe. Checks (1) and (2) pass.** Then `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /portal /portal/orders /portal/tickets /portal/profile` with `PORTAL_LOGIN_*` set. Expected: clean, with no heading-jump failures.

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/portal/(app)"
git commit -m "portal: glass top bar with logo, account menu, sliding nav pill, ticket badge, one h1"
```

---

### Task 12: Portal home (hero, live tiles, timeline, help card)

**Files:**
- Modify: `web/src/app/portal/(app)/page.tsx` (rewrite)

**Interfaces:**
- Consumes:
  - `getTicketSummary`, `getTickets`, `getMyOrders`, `getMyVisits` (`@/lib/portal`)
  - `getMyMeetings` (`@/lib/meetings`), `getWishlist` (`@/lib/wishlist`)
  - `HeroBand`, `Entrance`, `ActivityFeed`, `greeting`
  - `getSiteSettings` and `settingEnabled` (`@/lib/settings`, `@/lib/site-settings`) for `visits_enabled` and `meetings_enabled`
  - `getCurrentCustomer` (`@/lib/auth`)

- [ ] **Step 1: Read `lib/meetings.ts:130` and `lib/wishlist.ts:36`** to confirm their return shapes: `Paginated<CustomerMeeting>` and `WishlistSummary | null` with `items[].saving_paise`.

- [ ] **Step 2: Rewrite `page.tsx`**

```tsx
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty";
import { Card } from "@/components/ui/card";
import { HeroBand } from "@/components/app-shell/hero-band";
import { Entrance } from "@/components/app-shell/entrance";
import { ActivityFeed, type ActivityItem } from "@/components/app-shell/activity-feed";
import { IconBox, IconCalendar, IconHeart, IconTicket } from "@/components/icons";
import { getMyOrders, getMyVisits, getTicketSummary, getTickets } from "@/lib/portal";
import { getMyMeetings } from "@/lib/meetings";
import { getWishlist } from "@/lib/wishlist";
import { getCurrentCustomer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled } from "@/lib/site-settings";
import { greeting } from "@/lib/greeting";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

export const metadata = buildMetadata({ title: "Dashboard", path: "/portal", seo: noIndex });

export default async function PortalHome() {
  // Each read fails on its own: a missing figure drops one tile, never the page.
  const [customer, settings, summary, tickets, orders, visits, meetings, wishlist] = await Promise.all([
    getCurrentCustomer(),
    getSiteSettings(),
    getTicketSummary().catch(() => null),
    getTickets().then((r) => r.data).catch(() => []),
    getMyOrders().then((r) => r.data).catch(() => []),
    getMyVisits().then((r) => r.data).catch(() => []),
    getMyMeetings().then((r) => r.data).catch(() => []),
    getWishlist().catch(() => null),
  ]);

  const visitsOn = settingEnabled(settings, "visits_enabled", false);
  const meetingsOn = settingEnabled(settings, "meetings_enabled", false);
  const open = summary ? summary.open + summary.in_progress + summary.pending : 0;
  const onTheWay = orders.filter((o) => o.status === "dispatched");
  const now = Date.now();
  const nextVisit = visits.filter((v) => v.status === "confirmed" && v.scheduled_start_at && Date.parse(v.scheduled_start_at) > now)
    .sort((a, b) => Date.parse(a.scheduled_start_at!) - Date.parse(b.scheduled_start_at!))[0];
  const nextMeeting = meetings.filter((m) => m.status === "scheduled" && Date.parse(m.starts_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  const drops = wishlist?.items.filter((i) => (i.saving_paise ?? 0) > 0) ?? [];

  const next = nextMeeting && (!nextVisit || Date.parse(nextMeeting.starts_at) < Date.parse(nextVisit.scheduled_start_at!))
    ? { label: `${nextMeeting.date_label}`, sub: nextMeeting.time_label, href: `/portal/meetings/${nextMeeting.reference}`, line: `Your next meeting is ${nextMeeting.date_label}, ${nextMeeting.time_label}.` }
    : nextVisit ? { label: nextVisit.visit_date, sub: nextVisit.visit_time, href: `/portal/visits/${nextVisit.reference}`, line: `Your engineer visit is ${nextVisit.visit_date}, ${nextVisit.visit_time}.` }
    : null;

  const line = next?.line
    ?? (orders[0] ? `Order ${orders[0].order_number} is ${orders[0].status_label.toLowerCase()}.` : "How can we help today?");

  const tiles = [
    open > 0 && { key: "tickets", value: String(open), label: summary && summary.pending > 0 ? `open · ${summary.pending} awaiting you` : "open tickets", href: "/portal/tickets", icon: IconTicket, tone: "text-info" },
    onTheWay.length > 0 && { key: "orders", value: String(onTheWay.length), label: onTheWay.length === 1 ? `on the way · ${onTheWay[0].order_number}` : "orders on the way", href: "/portal/orders", icon: IconBox, tone: "text-brand-ink" },
    next && { key: "next", value: next.label, label: next.sub, href: next.href, icon: IconCalendar, tone: "text-ok" },
    drops.length > 0 && { key: "drops", value: String(drops.length), label: drops.length === 1 ? "saved item is cheaper" : "saved items are cheaper", href: "/portal/wishlist", icon: IconHeart, tone: "text-err" },
  ].filter(Boolean) as { key: string; value: string; label: string; href: string; icon: typeof IconTicket; tone: string }[];

  const activity: ActivityItem[] = [
    ...tickets.map((t) => ({ id: `t${t.id}`, at: t.updated_at, tone: "info" as const, href: `/portal/tickets/${t.reference}`, text: <>{t.reference} · {t.status_label}</> })),
    ...orders.map((o) => ({ id: `o${o.order_number}`, at: o.dispatched_at ?? o.placed_at ?? "", tone: "brand" as const, href: `/portal/orders/${o.order_number}`, text: <>{o.order_number} · {o.status_label}</> })),
    ...visits.map((v) => ({ id: `v${v.reference}`, at: v.created_at ?? "", tone: "ok" as const, href: `/portal/visits/${v.reference}`, text: <>Visit {v.reference} · {v.status_label}</> })),
    ...meetings.map((m) => ({ id: `m${m.reference}`, at: m.created_at ?? m.starts_at, tone: "warn" as const, href: `/portal/meetings/${m.reference}`, text: <>Meeting {m.reference} · {m.status_label}</> })),
  ].filter((a) => a.at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 10);

  const pill = "rounded-full px-4 py-2 text-13-5 font-semibold transition-colors duration-(--duration-base)";
  const actions = [
    <Link key="t" href="/portal/tickets/new" data-press className={cn(pill, "bg-white text-brand-900 hover:bg-white/90")}>Raise a ticket</Link>,
    visitsOn && <Link key="v" href="/visit" data-press className={cn(pill, "border border-white/35 text-white hover:bg-white/10")}>Book a visit</Link>,
    meetingsOn && <Link key="m" href="/meeting" data-press className={cn(pill, "border border-white/35 text-white hover:bg-white/10")}>Book a meeting</Link>,
  ];

  return (
    <>
      <h1 className="sr-only">Dashboard</h1>
      <HeroBand
        title={`${greeting(customer?.name ?? "").replace(/^Good (morning|afternoon|evening)/, "Hello")}${customer?.company ? ` · ${customer.company}` : ""}`}
        summary={line}
        actions={actions}
        className="mb-6"
      />
      <Entrance scope="portal" />

      {tiles.length === 0 && activity.length === 0 ? (
        <EmptyState illustration="inbox" title="Here's what you can do" action={actions[0]}>
          Raise a ticket when something needs fixing, track every order you place here, and book an engineer when you need one on site.
        </EmptyState>
      ) : (
        <>
          {tiles.length > 0 && (
            <ul className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tiles.map((t, i) => (
                <li key={t.key} data-entrance-item style={{ "--i": i } as CSSProperties}>
                  <Link href={t.href} data-portal-tile className="group flex h-full flex-col rounded-xl border border-line-strong bg-card p-4 shadow-2 transition-[translate,box-shadow] duration-(--duration-base) motion-safe:hover:-translate-y-px hover:shadow-3">
                    <span aria-hidden className={cn("mb-3 grid size-10 place-items-center rounded-lg bg-surface-2 [&_svg]:size-5", t.tone)}><t.icon /></span>
                    <span className="font-display text-[26px] font-bold leading-none tracking-[-.03em]">{t.value}</span>
                    <span className="mt-1.5 text-13 text-muted">{t.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card as="section" interactive={false} padding="sm" className="rounded-xl shadow-2" data-activity>
              <h2 className="mb-3 text-15 font-semibold">Recent activity</h2>
              <ActivityFeed items={activity} empty="Nothing yet. Updates on your tickets, orders and bookings appear here." />
            </Card>
            <Card as="section" interactive={false} padding="sm" className="rounded-xl shadow-2">
              <h2 className="text-15 font-semibold">Need help?</h2>
              <form action="/knowledge-base" method="get" className="mt-3">
                <label htmlFor="kb-q" className="sr-only">Search the knowledge base</label>
                <input id="kb-q" name="q" type="search" placeholder="Search the knowledge base" className="w-full rounded-lg border border-line-strong bg-card px-3 py-2.5 text-14 focus:border-brand-400 focus:ring-3 focus:ring-brand-100 focus:outline-none" />
              </form>
              <Link href="/knowledge-base" className="mt-3 inline-block text-13 font-semibold text-brand-ink hover:underline">Browse all articles</Link>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
```

Before writing this, check these assumptions and correct the code where they are wrong:
- The `Card` component forwards `data-*` props. If it does not, put `data-activity` on the inner `ActivityFeed` wrapper: add a `data-activity` attribute to the `<ol>` in `ActivityFeed` and drop it from the `Card`.
- The public booking routes for a visit and a meeting: `ls web/src/app/(marketing)` shows the real paths (`/visit` or `/book-a-visit`; `/meeting` or similar). Use what exists.
- `IconCalendar` and `IconHeart` exist in `@/components/icons`. Otherwise use `IconMeeting` and `IconHeart`, as `portal-links.tsx` does.
- The order status value for "dispatched" in `OrderStatus`: `grep -n "export type OrderStatus" -A3 web/src/types/api.ts`.
- `customer` from `getCurrentCustomer()` has `name` and `company`.

The hero title is a `<p>` inside `HeroBand`, and the page's one `h1` is a visually hidden "Dashboard". The visible "Hello …" carries the greeting.

- [ ] **Step 3: Run the probe in full**

Create a throwaway customer for the empty case. From `api/`: `php artisan technoware:customer empty-probe@example.test --name="Probe Empty"`, which prints a password. Then:

```bash
PORTAL_LOGIN_EMAIL=… PORTAL_LOGIN_PASSWORD=… EMPTY_LOGIN_EMAIL=empty-probe@example.test EMPTY_LOGIN_PASSWORD=… node scripts/probes/portal-home.mjs
```

Expected: all `ok`. Then switch meetings off (Settings → Meetings: `meetings_enabled` off) and run it again: still all `ok`, with no "Book a meeting". Delete the throwaway customer afterwards through the console (Customers → the account → Suspend, since nothing deletes a customer), or remove it with `php artisan tinker` from a temporary file, per the project's rule on throwaway accounts.

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/portal/(app)/page.tsx" web/src/components/app-shell/activity-feed.tsx
git commit -m "portal: brand-lit home — hero, live tiles, activity timeline, help card, empty state"
```

---

### Task 13: The other portal pages' surfaces

**Files:**
- Modify: list rows in `web/src/app/portal/(app)/{orders,tickets,visits,meetings,wishlist,downloads}/page.tsx`

- [ ] **Step 1: One row look.** In each list page, the row link's classes `rounded-lg border border-line-strong bg-card … hover:border-brand-300 hover:bg-brand-50` become `rounded-xl border border-line-strong bg-card shadow-1 transition-[translate,box-shadow,border-color] duration-(--duration-base) hover:border-brand-ink/30 hover:shadow-2 motion-safe:hover:-translate-y-px`, so each row lifts instead of tinting. Use `grep -rn "hover:bg-brand-50" "web/src/app/portal/(app)"` to find each one, and change only portal list rows.

- [ ] **Step 2: Audit every portal route** in light and dark, plus `audit:mobile`. Expected: clean.

- [ ] **Step 3: Commit**: `git commit -am "portal: lifted list rows across the portal"`

---

### Task 14: Verify, document and release 0.167.0

- [ ] **Step 1: Run everything:** `npx tsc --noEmit`, `npm run lint`, `portal-home.mjs`, `console-shell.mjs`, `impersonation.mjs` (the "View as" banner must still sit on top), `npm run audit` (light and dark, with portal credentials), `npm run audit:mobile`. Expected: every command exits 0.
- [ ] **Step 2: Check by eye:** `/portal`, `/portal/orders` and `/portal/tickets/<ref>` at 360, 768, 1280 and 1920, light and dark, in three themes (classic, Enterprise, Summit).
- [ ] **Step 3: Extend `docs/console-portal.md`** with the portal rules (each read fails alone; a tile with nothing is left out; the hero's actions follow the switches; one hidden h1) and the matching CLAUDE.md lines.
- [ ] **Step 4: VERSION.md entry and `APP_VERSION = "0.167.0"`.**
- [ ] **Step 5: Commit:** `git commit -m "0.167.0: Portal 2.0 — logo bar, account menu, hero home, live tiles, activity timeline"`

---

## Self-review notes

- **Spec coverage:**
  - shell pieces: Tasks 3, 4, 6, 7, 8
  - dashboard hero, tiles, panels, activity and entrance: Tasks 6, 7, 8
  - portal shell and home: Tasks 11, 12
  - other portal pages: Task 13
  - motion and Full/Subtle: Tasks 2, 5, 7
  - surfaces and accessibility: Tasks 3, 4, 7, 11
  - testing: Tasks 1, 10, and the verification steps
- **Deviations** are listed at the top (localStorage; StatTile upgraded instead of a new MetricTile; shared nav pieces instead of one SideNav; dashboard roles).
- **Known assumptions** that must be checked before code (each names its check): `popover-motion`, the `brand-800` token, `Card` forwarding `data-*`, the booking route paths, the icon names, the `OrderStatus` value, the sign-in form labels.
