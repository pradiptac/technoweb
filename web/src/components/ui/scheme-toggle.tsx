"use client";

import { usePathname } from "next/navigation";
import { areaForPath, useSchemePreference, setSchemePreference, type SchemeArea, type SchemePreference } from "@/lib/scheme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: SchemePreference; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
  { value: "system", label: "System", icon: <SystemIcon /> },
];

/**
 * Light, dark, or follow the operating system.
 *
 * Three states, not a two-way switch. "System" has to be sayable: someone
 * whose laptop turns dark at sunset wants the site to do the same, and a
 * toggle that only offers light and dark silently opts them out of that the
 * first time they touch it.
 *
 * A radiogroup rather than three buttons, so arrow keys move between the
 * options and a screen reader announces which one is chosen — that is what
 * `aria-checked` is for, and a pressed-button pattern cannot express "one of
 * these three".
 *
 * Before hydration the store reports "system", which is the honest answer: the
 * document is already painted correctly by the inline script in the head, but
 * this component genuinely does not know what was stored until it runs.
 */
export function SchemeToggle({
  area, className, onDark = false,
}: {
  area: SchemeArea;
  className?: string;
  /**
   * For a dark band — the site's utility bar, the footer.
   *
   * Those bands stay dark in both schemes, so the control on them has to stay
   * light in both. Using the page tokens there would invert it along with the
   * page and leave a dark control on a dark strip.
   */
  onDark?: boolean;
}) {
  const preference = useSchemePreference(area);

  return (
    <div
      role="radiogroup"
      aria-label={area === "console" ? "Console colour scheme" : "Colour scheme"}
      className={cn(
        "inline-flex rounded-full border p-0.5",
        onDark ? "border-dark-line bg-dark-2" : "border-line-strong bg-card",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = option.value === preference;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.label}
            onClick={() => setSchemePreference(area, option.value)}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-colors [&_svg]:size-[15px]",
              active
                ? "bg-brand-600 text-white"
                : onDark ? "text-dark-muted hover:text-dark-ink" : "text-muted hover:text-ink",
            )}
          >
            {option.icon}
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4.5" width="18" height="12" rx="1.6" />
      <path d="M9 20h6" />
    </svg>
  );
}

/**
 * The toggle for whichever area the current path belongs to.
 *
 * The sign-in, registration and password-recovery screens are shared: both
 * `/admin/login` and `/portal/login` render the same `AuthLayout`. Hard-coding
 * an area there would hand a staff member the site's preference, or a customer
 * the console's — and they are kept apart on purpose. `areaForPath` is already
 * the single place that rule is written, so this asks it rather than repeating
 * it.
 */
export function AreaSchemeToggle(props: Omit<React.ComponentProps<typeof SchemeToggle>, "area">) {
  return <SchemeToggle area={areaForPath(usePathname())} {...props} />;
}
