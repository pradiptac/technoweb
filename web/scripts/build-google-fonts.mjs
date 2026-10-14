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
  // No Noto (the client does not need it, 2026-10-14): its CJK families alone
  // are hundreds of files each, which no install can copy in one request.
  .filter((f) => f.weights.length && f.slug.length <= 62 && !f.slug.startsWith("noto-"))
  .sort((a, b) => a.popularity - b.popularity)
  .map((f) => ({ family: f.family, slug: f.slug, category: f.category, weights: f.weights, subsets: f.subsets }));

writeFileSync(new URL("../../api/resources/google-fonts.json", import.meta.url), JSON.stringify(rows));
console.log(`Wrote ${rows.length} families.`);
