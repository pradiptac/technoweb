import type { TabDef } from "@/components/admin/tabs";

export type TabGroup = {
  id: string;
  label: string;
  /**
   * Field names this panel owns. A key matches if it is equal to one of these
   * or nested under it, so `seo` covers `seo.meta_title` and `faqs` covers
   * `faqs.0.question` — which is the shape Laravel's 422 uses for the
   * repeating fields.
   */
  fields: string[];
};

/**
 * Turns a 422's `errors` map into tab badges and the tab to open.
 *
 * A tabbed form can hide the reason a save failed: the editor gets "could not
 * save" while every field they can see looks fine, because the offending one
 * is on a panel they are not looking at. So each tab carries a count of its
 * own problems and the form jumps to the first tab that has any.
 *
 * Anything that matches no group is charged to the first tab rather than
 * dropped. A field renamed on the server but not here would otherwise make an
 * error silently uncountable — the same failure this exists to prevent.
 */
export function buildFormTabs(
  groups: TabGroup[],
  fieldErrors: Record<string, string[]> | undefined,
): { tabs: TabDef[]; jumpTo: string | null } {
  const keys = Object.keys(fieldErrors ?? {});

  const owns = (group: TabGroup, key: string) =>
    group.fields.some((f) => key === f || key.startsWith(`${f}.`));

  const matched = new Set<string>();
  const counts = groups.map((g) => {
    const n = keys.filter((k) => owns(g, k)).length;
    keys.forEach((k) => { if (owns(g, k)) matched.add(k); });
    return n;
  });

  const orphans = keys.filter((k) => !matched.has(k)).length;
  if (orphans && counts.length) counts[0] += orphans;

  const tabs: TabDef[] = groups.map((g, i) => ({
    id: g.id,
    label: g.label,
    ...(counts[i] ? { badge: counts[i], tone: "err" as const } : {}),
  }));

  const first = counts.findIndex((n) => n > 0);
  return { tabs, jumpTo: first === -1 ? null : groups[first].id };
}
