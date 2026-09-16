# Site themes

One folder per theme under `web/src/themes/`, each filling a fixed set of
template slots; the active one is the `site_theme` setting (Site → Themes in
the console), `classic` by default. The colour palette (`appearance.theme`,
Settings → Colour palette) is a different thing and paints every theme. The
proposal this grew from is `docs/themes-plan.md`.

**A theme is code and choosing one is data.** `themes.site_theme` is a public
string; the API checks it for the shape of an id and nothing more
(`SettingController::validateSiteTheme`, the motion rule for the motion
reason), because the list lives in `web/src/themes/manifests.ts` and a copy
on the other side of the wire would be the `admin_path` drift. Every way the
value can be wrong lands on `classic`: unknown, blank, a theme removed in a
deploy, a folder that fails to import. The site cannot render themeless.

**`classic` is the site as it was on 2026-09-16, moved and not rewritten.**
Its four templates are the marketing layout's chrome, the homepage's
composition, `PageHero` and `CtaBand`, moved verbatim with their docblocks
— `git log --follow` on `themes/classic/templates/*` reaches the history —
and its `theme.css` is a comment, because everything classic paints is
`globals.css`. Step 1 was gated on `scripts/probes/html-snapshot.mjs`: 35
routes from a production build before and after, normalised, `diff -r`
empty; the build's route table identical; `npm run perf` CSS bytes
identical and JS bytes lower.

**Four slots, and the dispatcher pattern is what made step 1 a no-op.**
`Chrome`, `Home`, `PageHero`, `CtaBand` (`themes/contract.ts`). The ~30
pages that render a hero keep importing `@/components/ui/page-hero`; that
file is now a dispatcher — resolve the active theme, read the settings once,
hand both to the theme's template. Same for `cta-band.tsx`. **Every prop is a
type the data layer already produces**, and none is a function: a template
receives data and returns markup, so it cannot fetch (and make one page
dynamic where the others are cached), cannot read a cookie, and cannot emit
`JsonLd` — the structured data stays in the pages and the layout.

**`Card`, `SectionHeader` and `Container` are not slots, deliberately.**
`card.tsx` is imported by three console client components
(`jobs/reference/reference-lists.tsx`, `leads/lead-panels.tsx`,
`menus/menu-builder.tsx`), and a `server-only` registry behind it would be
the `lib/settings.ts` 500 on every console screen; it also renders outside
`.public-site`, where there is no theme. A theme restyles them through
`[data-theme="<id>"]` rules in its own `theme.css`. A slot for a detail
page's frame or a collection's shape is added in the step whose theme needs
it, with `classic` getting the pass-through and the pages that use it edited
once — which is the honest limit of the dispatcher approach: step 1 changed
nothing, and themes two to five each grow the contract.

**The registry is `server-only`, and its loaders are lazy literals.**
`themes/index.ts`. A client component that needs a theme's *name* imports
`themes/manifests.ts` (pure data); one that needs the *id* imports
`lib/site-theme.ts`; nothing on the client imports the registry, or
`server-only` throws at build. The loaders are `() => import("./<id>/templates")`
because Next builds a segment's client chunk from every `"use client"`
module *reachable in its server module graph*, not from what rendered — the
`IconField` lesson — so five statically imported themes would put five
headers' client islands into the marketing layout's chunk for every visitor.
Dynamically importing a *server* component lazy-loads only the client
components under it. Literal, because Turbopack cannot analyse a
template-string path. Measured in step 2, the first time there are two.

**Resolution is `activeTheme()`, cached per request, preview store first.**
React `cache()` around it, so the thirty dispatchers on a page resolve once.
It reads the preview store (below), then `siteThemeId(settings)`:
`SITE_THEME` in the environment wins over the stored setting, the id is
checked against the manifests, unknown falls to `classic` with one
`console.warn` per process. `resolveTheme(id)` walks the manifest's
`extends` chain root-first — depth cap 3, cycle guard — awaits each loader
inside a `try`, and overlays the templates; a root that will not load
resolves `classic` instead.

**`SITE_THEME` is the kill switch, and it has three caveats.** One line in
the runtime environment turns a misbehaving theme off with no console login
and no database edit, and it is what the audit matrix will use to run one
server per theme (a `PATCH` from a script does not `updateTag("settings")`,
so the setting is the wrong lever for that). It is process-wide; index pages
are prerendered at **build**, so for `next start` it belongs in the build
environment like `API_BASE_URL`; and the ISR cache survives a restart, so a
matrix run wants a fresh `.next` per theme. The Themes screen says
"overridden by SITE_THEME" when it is set — an editor activating a theme
that changes nothing would otherwise read the screen as broken.

**The preview route is a segment of its own, and the override is a
`cache()` store written before the first `await`.** `/theme-preview/<id>`
(the homepage) and `/theme-preview/<id>/specimen` (a made-up inner page:
hero with trail and banner, a card grid, the band), admin-only through
`getCurrentStaff()`, `noIndex`, disallowed in `robots.ts`. Outside
`(marketing)` so the real chrome is not drawn twice; under the root layout
so the fonts, the tokens and the scheme script are. It is dynamic — it reads
a cookie — and that costs the real site nothing because the marketing layout
stays cookie-free (the build's route table is the proof). `forcePreviewTheme(id)`
writes a request-scoped store that `activeTheme()` reads ahead of the
settings, so every dispatcher underneath renders the named theme with no
cookie, header or query string reaching a cached render. It must be called
**before the first `await` after `params`**, and never from a layout: Next
renders a layout and its page as separate segments, so a page's
`activeTheme()` can run before a layout's override is set.

**Theme CSS is one `@import` per theme in `themes/themes.css`, imported at
the top of `globals.css`.** Not imported from the theme module: a `.css`
reached through a lazy `import()` arrives with the chunk — a flash of
unthemed page — and a theme's rules that use a `--color-*` token need to be
inside the one Tailwind pipeline. `@import` must precede `@theme`, so theme
rules land *before* every unlayered rule at the bottom of `globals.css`: at
equal specificity the 12px type floor and the motion rules win, which is the
right default, and a theme that genuinely needs to beat one writes the more
specific selector. Every rule is scoped under `[data-theme="<id>"]`, stamped
on the `.public-site` div beside `motionAttrs()`, so the console is
untouched by construction — the motion argument, again.

**The Themes screen is `/admin/themes`, not a settings tab, and the palette
picker is "Colour palette".** The info-bar rule: a sidebar row *and* a tab is
two doors to one form. `STANDALONE_GROUPS` in `settings-copy.ts` keeps the
`themes` and `announcement` groups out of the strip; both are fetched with
every other setting and saved through `saveSettingsAction`, which PATCHes
only the `setting__*` names it finds. The gallery is a client component
reading `manifests.ts`; what only the server knows travels as props —
whether each screenshot exists under `public/themes/`, whether `SITE_THEME`
is set. The radio cards re-assert `checked` in an effect, the motion
picker's fix for React 19's post-action reset; the Preview link is a plain
`<a target="_blank">` because a `Link` would prefetch a dynamic signed-in
route from every render; and it sits **outside** the label, since an anchor
inside a label is two controls on one click.

**Screenshots are generated and committed.** `npm run theme-shots` signs in,
opens each manifest's preview at 1280×800 and writes `public/themes/<id>.png`;
a card whose file is missing draws a placeholder. `npm run themes:check`
refuses a duplicate or malformed id, an `extends` that does not resolve or
loops, a missing default, and notes a missing screenshot.

**Rules for a theme author**, each of which the rest of this file explains
somewhere: props are the data layer's types, never fetch in a template;
`next/image`, never a raw eager `<img>`; `<Form>`, never `<form>`; no
`JsonLd` from a theme; the `--duration-*` tokens; `translate`/`scale`, not
`transform`; nothing widens the document; a hidden start state only inside
`prefers-reduced-motion: no-preference`; a `PageHero` template renders
`<Breadcrumbs>` when given `crumbs`, or the `BreadcrumbList` a search engine
reads disappears silently; a new primitive goes in `components/ui` for every
theme, not in one theme's folder; and a theme is not shippable until both
audits have run against it.

**`Breadcrumbs` moved to `components/ui/breadcrumbs.tsx` and is re-exported
from `page-hero.tsx`.** Six importers keep the path they had. It moved
because classic's hero template imports it, and a template importing the
dispatcher that lazily loads it would be a cycle.

**The snapshot probe learned three things about "identical" HTML.** A
streamed page splits its RSC payload into a different number of `<script>`
chunks from one request to the next, so runs of them collapse to one. React's
`useId` values encode the component's position in the tree, so wrapping the
same markup in one more component renames every id on the page — normalised.
And the first request after a fresh `next start` on a dynamic route streams
its metadata behind a Suspense placeholder while the API call is cold; the
probe fetches twice and keeps the second.
