/**
 * The cache tags an entry save or delete purges (docs/content-presets.md).
 * The settings map is read by the marketing layout, so purging it re-renders
 * every cached public page; it is purged only for a testimonial, the one kind
 * of entry that can be the homepage's quote. Pure, so the check script can
 * import it.
 */
export function entryTags(type: string, slugs: (string | null | undefined)[], preset: string | null | undefined): string[] {
  const tags = [`entries:${type}`, "content-types", "menu"];
  for (const slug of new Set(slugs.filter(Boolean))) tags.push(`entry:${type}:${slug}`);
  if (preset === "testimonials") tags.push("settings");
  return tags;
}
