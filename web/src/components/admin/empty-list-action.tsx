import { ButtonLink } from "@/components/ui/button";

/**
 * The next step under an empty console list (docs/help-and-tours.md):
 * "Clear filters" when filters or a search hid everything, "Add the first …"
 * when the list is truly empty and the screen has a "new" route, nothing
 * otherwise — a list nobody creates by hand (the activity log, submissions)
 * says what will appear there in its sentence instead.
 *
 * A server component: it is passed straight to `EmptyState`'s `action`.
 */
export function EmptyListAction({ filtered, clearHref, newHref, noun }: {
  filtered: boolean;
  /** The bare index path. */
  clearHref: string;
  /** The screen's "new" route, when it has one. */
  newHref?: string;
  /** Singular and lower-case: "vacancy", "post", "discount code". */
  noun: string;
}) {
  if (filtered) return <ButtonLink href={clearHref} variant="secondary" size="sm">Clear filters</ButtonLink>;
  if (newHref) return <ButtonLink href={newHref} size="sm">Add the first {noun}</ButtonLink>;
  return null;
}
