/**
 * Writes api/resources/google-fonts.json from Google's public family list
 * (no key). Re-run by hand to refresh; the release carries what is committed.
 *   cd web && node scripts/build-google-fonts.mjs
 */
import { writeFileSync } from "node:fs";

const res = await fetch("https://fonts.google.com/metadata/fonts");
const text = (await res.text()).replace(/^\)\]\}'\s*/, "");
const { familyMetadataList } = JSON.parse(text);

const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rows = familyMetadataList
  .map((f) => ({
    family: f.family,
    slug: slug(f.family),
    category: String(f.category).toLowerCase().replace(/\s+/g, "-"),
    weights: Object.keys(f.fonts ?? {}).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b),
    subsets: (f.subsets ?? []).filter((s) => s !== "menu"),
    popularity: f.popularity ?? 99999,
  }))
  .filter((f) => f.weights.length && f.slug.length <= 62)
  .sort((a, b) => a.popularity - b.popularity)
  .map(({ popularity, ...f }) => f);

writeFileSync(new URL("../../api/resources/google-fonts.json", import.meta.url), JSON.stringify(rows));
console.log(`Wrote ${rows.length} families.`);
