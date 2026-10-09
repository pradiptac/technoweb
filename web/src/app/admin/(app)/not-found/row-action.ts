/**
 * The look of a row's two controls on Missing pages: the console's compact row
 * button (the reviews queue and the JavaScript-errors list draw the same one),
 * 32px tall so a row stays one line of text high.
 *
 * In a module with no directive, because the page (a server component) puts it
 * on a link and `IgnoreButton` (a client component) on a button - and a
 * constant exported from a client module reaches the server as a reference.
 */
export const ROW_ACTION =
  "inline-flex min-h-8 items-center rounded border border-line-strong bg-card px-2.5 text-12 font-medium whitespace-nowrap transition-colors duration-(--duration-fast) hover:border-faint disabled:opacity-60";
