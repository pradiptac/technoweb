import Link from "next/link";
import { IconArrowRight } from "@/components/icons-ui";
import type { MenuItem, MenuSection } from "@/lib/navigation";

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
 * keyboards — so it needs no state. Same reasoning as the FAQ accordion using
 * <details>: if the platform does it, the platform should do it.
 *
 * Both variants are guarded with `:not([data-closed])`, and that guard is the
 * one piece of JavaScript involved: the `<li>` in `site-header.tsx` sets the
 * attribute when a link inside it is clicked, because a client-side
 * navigation leaves the header mounted with the clicked link still focused
 * and the pointer still over the panel — so an unguarded panel stayed open
 * over the page it had just navigated to. See `closePanelOnNavigate`.
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
        /*
          `translate` and `visibility`, not `transform`. Tailwind v4's
          `translate-y-1` sets the CSS `translate` property, so a list naming
          `transform` animated the opacity and nothing else — the panel faded
          in with its 4px rise skipped, the trap the drawer, the underline and
          the chat panel each fell into. And with `visibility` outside the list
          the panel vanished the instant the pointer left: it now stays painted
          while it fades. The closed state carries the exit timing and the open
          variants override it with the arrival's, so leaving is shorter than
          arriving.
        */
        "transition-[opacity,translate,visibility] duration-(--duration-exit) ease-exit",
        "translate-y-1 group-[:hover:not([data-closed])]:visible group-[:hover:not([data-closed])]:translate-y-0 group-[:hover:not([data-closed])]:opacity-100 group-[:hover:not([data-closed])]:duration-(--duration-base) group-[:hover:not([data-closed])]:ease-brand",
        "group-[:focus-within:not([data-closed])]:visible group-[:focus-within:not([data-closed])]:translate-y-0 group-[:focus-within:not([data-closed])]:opacity-100 group-[:focus-within:not([data-closed])]:duration-(--duration-base) group-[:focus-within:not([data-closed])]:ease-brand",
        // Reduced motion still needs the panel to appear, just without the slide.
        "motion-reduce:transition-none",
      ].join(" ")}
    >
      <div className="overflow-hidden rounded-xl border border-line-strong bg-card shadow-2">
        <ul className="grid gap-0.5 p-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item) => {
            // Null when the CMS supplied no icon, or one this build does not
            // know; the tile itself was rendered on the server.
            const hasIcon = item.tile !== null && item.tile !== undefined;

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
                  {hasIcon && (
                    // Nudged down only when top-aligned, to sit on the
                    // title's cap height. Centred, it would push it off.
                    <span className={item.summary ? "mt-0.5 shrink-0" : "shrink-0"}>{item.tile}</span>
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

                {/*
                  Whatever nests under this entry.
                  
                  A menu has no depth limit now, so the panel walks the tree
                  rather than reading one level and dropping the rest — which is
                  what it did, and is why the API used to refuse a third level
                  as "data an editor arranges carefully and never sees".
                  
                  Sub-entries are a plain indented list with no icon and no
                  summary. An icon tile at every level would make a panel of
                  three levels read as three unrelated grids, and the tile is
                  what marks a *section* entry; the rule beside them is what
                  says "these belong to the thing above".
                */}
                {item.children && item.children.length > 0 && (
                  <SubItems items={item.children} indented={hasIcon} />
                )}
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

/**
 * The levels below the first, drawn as an indented rule-marked list.
 *
 * Recursive, so a menu of any depth renders — and deliberately plainer the
 * further down it goes: the panel's job is to make the *first* level scannable,
 * and giving level four the same weight as level two is how a mega menu becomes
 * a wall.
 *
 * `indented` aligns the list under the title rather than under the icon tile,
 * so a child sits beneath the words it belongs to. Without it the rule appears
 * to hang off the icon, which reads as a different kind of relationship.
 */
function SubItems({ items, indented }: { items: MenuItem[]; indented: boolean }) {
  return (
    <ul className={["mt-0.5 grid gap-0.5 border-l border-line", indented ? "ml-[52px]" : "ml-4"].join(" ")}>
      {items.map((child) => (
        <li key={child.href}>
          <Link
            href={child.href}
            className="block rounded py-1.5 pr-2 pl-3 text-[13px] text-muted transition-colors duration-200 hover:bg-brand-50 hover:text-ink"
          >
            {child.label}
          </Link>

          {child.children && child.children.length > 0 && (
            // Never indented again: each level adds its own rule, and adding an
            // icon-width offset per level would push level five off the panel.
            <SubItems items={child.children} indented={false} />
          )}
        </li>
      ))}
    </ul>
  );
}
