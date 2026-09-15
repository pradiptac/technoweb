# Brands, categories and the company profile

Real logos, the refresh discriminator, category images, and the three index-page entities.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**The company profile is three index-page entities, and what they do not have
is the point.** Team members, clients and certifications carry no slug, no
`Sluggable`, no `HasSeo` and no detail route: `/team`, `/clients` and
`/certifications` are lists, and a slug nothing looks up is an identifier that
exists only to 301 between URLs that never existed — the `Popup` reasoning.
Three `SiteSection` keys make them menu and popup targets; the sitemap carries
three static rows. Vendor partnerships are **a column on `Brand`**
(`partner_tier`) and `GET /brands?partners=1`, not a second logo table that
would hold the same 26 sanitised logos twice. An engineer's certifications are
a child table replaced wholesale on save (`slides`' rule: absent leaves alone,
`[]` clears), not a pivot to the company's — a person's CCNA has its own
expiry and belongs in no company list. `department` is free text with a
datalist of the values in use; there is **no phone column**, and
`credential_id` never reaches the public resource. A lapsed certification —
company or personal — is dropped from the public read and flagged in the
console, the closed-vacancy rule: a badge past its validity is a claim that is
no longer true. About became `async` for them, with a `.catch()` on each so a
supplementary section hides rather than errors the page, which is why every
action here calls `revalidatePath("/about")` beside its `updateTag`.

**The catalogue now carries real manufacturer logos, and that is structural
data, not demo content.** `CatalogueSeeder::applyRealLogo()` is the opposite
case from the placeholder tile above: a trademarked logo is correct the day it
is written and stays correct, so it lives with the brand names in
`CatalogueSeeder` rather than with the copy `DemoContentSeeder` owns, which
must be replaced before launch. 26 brands now (8 original, featured, plus 18
hardware and software brands a network integrator plausibly resells), each
with a real vendored logo under `resources/brand-logos/{slug}.svg` — 23 pulled
from `simple-icons` (CC0), 3 (Sophos, APC, HPE Aruba) from Wikimedia Commons,
none of them kept as a runtime dependency, the rule the pincode table and the
Tabler icons both already follow.

**The discriminator for "safe to refresh" is the stored path, not a flag.**
This seeder's own writes always land at `media/seed/brands/{slug}.svg`; an
admin's own upload through the media library always lands at a hashed
filename somewhere else. So a stored path outside that one convention is never
touched again — the same guarantee `DemoContentSeeder` gives the placeholder
it replaces, arrived at without a column to remember which kind a given row is.

**Sanitised on the way to disk regardless of source**, the rule
`MediaController` already applies to every upload. Two of these files came
from outside the codebase entirely — an npm package and a Wikimedia Commons
download — which is exactly the case that rule exists for, and it is
control-tested: `BrandCatalogueTest::test_a_hostile_vendored_file_is_still_sanitised`
plants a `<script>` in a vendored source file and asserts it does not survive
the seeder.

**HPE Aruba's colour was one `<style>` block away from being lost.** The
downloaded SVG set the orange on `class="st0"` and defined the colour in a
`<style>` element — and `SvgSanitiser`'s element allowlist has no `<style>`,
by design, because an inline stylesheet is a fetch primitive wearing a
presentation hat. Sanitised as fetched, the path would have kept its shape and
lost its colour to the default black. Fixed by inlining the colour as a `fill`
attribute on the path itself before it ever reaches the sanitiser, which is
where every other presentation value in these files already lived.

**`?v=<updated_at>` came to `BrandResource` because of this**, not before it.
`logo_path` is a plain stored path edited in place, and swapping a generated
placeholder for a real logo — like a resize or a replace elsewhere in the
media system — rewrites the same file at the same address. Without a version
a browser that had already fetched the old bytes goes on serving them from
cache. Same rule `Admin\MediaResource` already followed; `BrandResource` had
simply never needed it before now.

**New brands need a product before they are visible on the public site.**
`/brands` (the API endpoint, not the landing-page index) lists only brands
with a published product — see the note on programmatic SEO and the doorway
page gate — so the 18 added here exist in the admin and in the database with
real logos, and are invisible on `/products`' brand filter until something is
actually catalogued under them. That is the correct behaviour of the existing
system, not a gap this change needs to close: the alternative is a filter chip
for a brand with nothing behind it.

**A product category carries an `image_path`, the same shape as a solution's
`hero_image_path`.** Categories were taxonomy with an icon and nothing else —
`CoverField` was never wired into `category-form.tsx` at all — so the
homepage's product grid had no photograph to show, only the icon tile.
`image_path` is nullable and resolved the same way everywhere else in the
product: `image` (a URL) and `image_alt` (via `App\Support\MediaAlt`, keyed
on the stored path) on the public resource, `image_path` plus the resolved
`image` on the admin one. It also backs the category's own `og_image` in
`defaultSeo()`, which had been hard-coded `null` — a category page had never
had anything to offer a social share preview.

**A brand logo's real colours only read against a light ground, so dark scheme
turns every one of them into a flat white silhouette rather than pinning the
strip's background to always be light.** The first cut of the marquee did the
latter, to fix HPE Aruba's own artwork having no `fill` at all on its "HPE"
glyph — it rendered in whatever text colour it inherited, black-on-near-black
in dark — and that traded one brand's legibility for every other brand's
colour on a page that was otherwise dark, which reads as a mistake sitting in
the middle of the homepage rather than as a design. `filter: brightness(0)
invert(1)` on `.brand-logo`, scoped to `:root[data-scheme="dark"]`, collapses
every colour in the image to black and flips that to white — CSS `color` does
not reach into an `<img src="…svg">` the way it would an inline `<svg>`, so a
filter is the only lever available, and it closes HPE Aruba's specific gap the
same way it closes everything else: once every colour is the same one, there
is none left to be missing.

**Hardware is compared side by side, and the tray lives in `sessionStorage`.**
`components/product/compare.tsx` puts a Compare tick over each catalogue
card — from the `<li>`, never inside the card's `<Link>`, because a link card
holds no other interactive element — and a tray at the foot of the listing
holding up to `COMPARE_MAX` (four) as `{slug, name}` pairs in
`sessionStorage` (`lib/compare.ts`): a comparison is something somebody is
doing now, and a tray that reappears next week is a mystery. Compare is live
from two. `/products/compare?p=slug,slug` fetches one `publicApi.product()`
per column — the same cached read the product page makes — and renders the
union of the spec sheets' keys in first-seen order, "—" where a product does
not state one; `noindex`, for the search page's reason. **`COMPARE_MAX` is
in `lib/compare-max.ts`, a module with no directive**: imported from the
`"use client"` store into the server-rendered page it arrived as a client
reference rather than a number, `.slice(0, ref)` was `.slice(0, NaN)`, and
the page compared nothing while reporting no error. `scripts/probes/compare.mjs`
measures the tick, the tray and the table; the tray is 180px tall with three
items at 320px and widens nothing.
