/**
 * One row's look in both areas' navigation (Console 2.0). `relative z-[1]`
 * keeps the row above the sliding pill (`nav-pill.tsx`) that paints the
 * active state; the active row keeps a fill of its own except while the pill
 * is travelling, so neither the first paint nor the contrast audit (which
 * reads ancestors, not the sibling pill) ever sees white text on a card.
 */
export const NAV_ROW =
  "relative z-[1] flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-13 font-medium whitespace-nowrap " +
  "transition-colors duration-(--duration-base) [&_svg]:size-4 [&_svg]:shrink-0";
export const NAV_ROW_ACTIVE = "bg-brand-600 font-semibold text-brand-on group-data-[moving]/navlist:bg-transparent";
export const NAV_ROW_IDLE = "text-muted hover:bg-surface-2 hover:text-ink";
