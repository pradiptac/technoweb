import Link from "next/link";
import { iconMap } from "@/components/icons";
import { IconArrowRight } from "@/components/icons";
import type { MenuSection } from "@/lib/navigation";

/** Cuts on a word boundary — slicing mid-word reads as a rendering fault. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The dropdown panel for one top-level nav item.
 *
 * Opened by CSS alone — group-hover for pointers, group-focus-within for
 * keyboards — so it needs no JavaScript, no hydration and no state. Same
 * reasoning as the FAQ accordion using <details>: if the platform does it,
 * the platform should do it.
 *
 * On touch there is no hover, so tapping the parent simply follows its link to
 * the index page. That is the right outcome — the panel is a shortcut, not the
 * only route to this content, and the mobile drawer lists it all anyway.
 *
 * Deliberately no headings inside: this sits between the page's h1 and its
 * sections, and a heading here would break the document outline the audit
 * checks.
 */
export function MegaMenu({ section }: { section: MenuSection }) {
  return (
    <div
      className={[
        "invisible absolute left-0 top-full z-50 w-max max-w-[min(920px,calc(100vw-2rem))] pt-2 opacity-0",
        "transition-[opacity,transform] duration-200 ease-brand",
        "translate-y-1 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100",
        "group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100",
        // Reduced motion still needs the panel to appear, just without the slide.
        "motion-reduce:transition-none",
      ].join(" ")}
    >
      <div className="overflow-hidden rounded-xl border border-line-strong bg-card shadow-2">
        <ul className="grid gap-0.5 p-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item) => {
            const Icon = item.icon && item.icon in iconMap ? iconMap[item.icon] : null;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    "flex h-full gap-3 rounded-lg p-3 transition-colors duration-200 hover:bg-brand-50",
                    // With a summary the text block is several lines tall and
                    // the icon belongs beside the title, at the top. Without
                    // one it is a single line shorter than the icon, and
                    // top-aligning it just looks misaligned.
                    item.summary ? "items-start" : "items-center",
                  ].join(" ")}
                >
                  {Icon && (
                    <span
                      className={[
                        "grid size-8 shrink-0 place-items-center rounded-lg border border-brand-200 bg-brand-50 text-brand-ink [&_svg]:size-4",
                        // Nudged down only when top-aligned, to sit on the
                        // title's cap height. Centred, it would push it off.
                        item.summary ? "mt-0.5" : "",
                      ].join(" ")}
                    >
                      <Icon />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">{item.label}</span>
                    {item.summary && (
                      <span className="mt-0.5 block max-w-[34ch] text-[12.5px] leading-[1.5] text-muted">
                        {truncate(item.summary, 84)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-line bg-surface px-5 py-3">
          <Link
            href={section.viewAll.href}
            className="group/all inline-flex items-center gap-1.5 py-1 text-[13px] font-semibold text-brand-ink transition-all duration-200 ease-brand hover:gap-2.5"
          >
            {section.viewAll.label}
            <IconArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
