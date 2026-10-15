import Link from "next/link";
import { IconMail, IconPhone, IconWhatsApp } from "@/components/icons-ui";
import type { ActionButton } from "@/lib/action-bar";
import { cn } from "@/lib/utils";

/**
 * The phone's action bar (0.122.0): Call, WhatsApp and one button of the
 * site's own, pinned to the foot of the screen below `sm`.
 *
 * Server-rendered from the public settings, so the page stays cached and
 * nothing is decided in the browser. It is a direct child of `.public-site`:
 * the rule in `globals.css` keys on that to pad the page's foot by the bar's
 * height and to lift the assistant, the compare tray and the install card
 * clear of it. `z-30`, under the assistant and the mobile drawer.
 *
 * The last button is the filled one. Three equal buttons read as a menu; one
 * that is filled reads as the thing to press.
 */
const GLYPH = { call: IconPhone, whatsapp: IconWhatsApp, enquire: IconMail } as const;

export function ActionBar({ buttons }: { buttons: ActionButton[] }) {
  if (buttons.length === 0) return null;

  return (
    <nav
      aria-label="Quick contact"
      data-action-bar
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="flex">
        {buttons.map((button, i) => {
          const Glyph = GLYPH[button.kind];
          const filled = i === buttons.length - 1 && buttons.length > 1;
          const className = cn(
            "flex min-h-13 items-center justify-center gap-2 px-2 text-14 font-semibold",
            filled ? "bg-brand-600 text-brand-on" : "text-ink",
            i > 0 && !filled && "border-l border-line",
          );
          const inner = (
            <>
              <Glyph className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="truncate">{button.label}</span>
            </>
          );

          return (
            <li key={button.kind} className="min-w-0 flex-1">
              {button.href.startsWith("/") ? (
                <Link href={button.href} className={className}>{inner}</Link>
              ) : (
                <a
                  href={button.href}
                  className={className}
                  {...(button.external ? { target: "_blank", rel: "noopener" } : {})}
                >
                  {inner}
                  {button.external && <span className="sr-only"> (opens in a new tab)</span>}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
