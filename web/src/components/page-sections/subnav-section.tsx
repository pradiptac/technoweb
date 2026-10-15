import { Container } from "@/components/ui/container";
import type { SubnavSectionData } from "@/types/api";

/**
 * An in-page menu (0.126.0): a strip of links to the page's own sections,
 * which stays under the site header as the page scrolls.
 *
 * The links are the API's — every section that is drawn and has an anchor,
 * in page order — so this cannot name one that is not on the page, and it
 * renders nothing with none.
 *
 * **Its root is the sticky element, and it has no wrapper.** A sticky
 * element is held by its own parent's box and by nothing further up (the
 * shop strip's lesson), so the `<nav>` has to be a direct child of
 * `[data-page-sections]`, the element that spans the page. `PageSections`
 * therefore draws this type bare — no background shell, no style wrapper —
 * and a background or a style set on it is not applied.
 *
 * The row scrolls sideways inside itself on a phone rather than wrapping to
 * three lines of the screen: it is a menu, and its links are focusable, so
 * the scroller needs no tab stop of its own. Plain links, no script — the
 * browser scrolls to the anchor, and the rule in globals.css gives every
 * anchored section on a page with a menu enough `scroll-margin-top` to clear
 * both bars.
 */
export function SubnavSection({ data }: { data: SubnavSectionData }) {
  const items = data.items ?? [];
  if (items.length === 0) return null;

  const label = data.label?.trim() || "On this page";

  return (
    <nav data-page-section="subnav" aria-label={label} className="sticky top-[var(--h-site-header)] z-20 border-y border-line bg-page">
      <Container className="flex items-center gap-4">
        <span className="hidden shrink-0 text-13 font-semibold text-muted sm:block">{label}</span>
        <ul className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 py-2 [scrollbar-width:none]">
          {items.map((item) => (
            <li key={item.anchor} className="shrink-0">
              <a
                href={`#${item.anchor}`}
                className="block rounded-full px-3.5 py-1.5 text-14 font-semibold whitespace-nowrap text-ink-2 transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-ink"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}
