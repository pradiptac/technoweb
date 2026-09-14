# The rich-text editor and CMS pages

Summernote, the purifier allowlist and `Prose` — three files that must agree.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**Two utilities at the same specificity are decided by load order, and
Summernote always loads second.** Already recorded for the colour palette; it
bit again on a content link inside the editor. Summernote ships
`.note-editor .note-editing-area .note-editable a { color: #337ab7 }` — (0,3,1)
— and its stylesheet arrives with the dynamically imported editor chunk, so it
loads **after** `globals.css`. The obvious override, swapping `.note-editor` for
`.cms-editor`, is *also* (0,3,1): it ties, loses on source order, and does
nothing at all while looking perfectly correct. It measured 3.77:1 in dark until
the selector went to four classes. **Count the selectors, then add one.**

**Summernote's own stylesheet loads after `globals.css`.** It ships from the
dynamically imported editor chunk, so a one-class override merely *ties* its
one-class rule and loses on source order — which is how the console's dark
scheme ended up with near-white text on `#fff` at 1.11:1 across the colour
palette, the link dialog and the help sheet. Count the selectors; two classes
beat one, and `.note-modal-footer a` needs three.

**CMS pages have two templates and the value is allowlisted.** `default` caps
the body at 72ch; `wide` drops the cap, for a page built around an embedded
slider or gallery. The API refuses anything else with a 422, because a template
the frontend does not know would fall back silently — a page laid out the wrong
way with nothing saying why. A slider embedded by shortcode carries no measure
of its own, so the template is what decides its width.

**The editor is Summernote, and three files have to agree about what it may
produce.** `rich-text-editor.tsx` decides which buttons exist,
`config/purifier.php` decides what survives the save, and `prose.tsx` decides
what the live site styles. Both failure directions are silent: a button whose
markup the allowlist drops looks like it worked until the page is reloaded, and
a tag the allowlist admits that `Prose` does not style renders as unstyled
markup on a public page. Change them in that order.

**The toolbar is the full set, and the two omissions are audit rules rather
than taste.** No `h1` — the page renders exactly one and it is the record's
title, so a second in the body fails `npm run audit` on every screen showing
it. No `h5`/`h6` — the same audit fails a heading-level jump. Everything else
Summernote ships is on: colour, highlight, font family and size, alignment,
indent, line height, tables, sub/sup, code blocks, rules, video and full screen.

**`styleWithCSS` is off, and turning it on is the trap.** With it on,
`document.execCommand` writes CSS instead of elements: Bold becomes
`<span style="font-weight:bold">`, which carries no emphasis for a screen
reader and which `Prose` does not style — and Underline becomes
`text-decoration-line`, a longhand the CSS allowlist does not name, so it was
being **dropped on save with nothing reporting it**. That was measured in a
browser, not reasoned about. Off, the same commands emit `<b>`, `<u>` and
`<font>`, which is why `b`, `i`, `strike` and `font` are in the allowlist: they
are what a browser actually hands over, and leaving them out does not produce
semantic markup, it produces a Bold button that does nothing.

**`HTML.TidyLevel` is `heavy`, and the shipped default would store `<font>`.**
HTMLPurifier's deprecated-element transforms all sit in the top band while the
default is `medium`, so at the default a `<font color>` is simply *kept* —
allowlisted, written to the database, and rendered as a deprecated element.
At `heavy` it is rewritten to a `<span style>` whose declaration is then
validated property by property. `HTML.TidyRemove` exempts `u` and `s`, whose
transforms are a loss rather than a normalisation: both are real elements the
allowlist admits and `Prose` styles, and flattening them into spans throws the
markup away to reproduce the appearance.

**Inline style is an allowlist of *properties*, not an open door.** Seven
toolbar controls work by writing inline CSS, so refusing `style` outright would
break them — but HTMLPurifier parses each declaration and validates the value
against the property's own grammar, so `expression(...)` and
`url(javascript:…)` are refused for not being valid values rather than by being
on a denylist. `position`, `display` and `z-index` are absent deliberately:
those are what let body content leave its own box and cover the page's chrome.

**A video is an iframe, and the host check is what makes that safe.**
`URI.SafeIframeRegexp` pins it to YouTube and Vimeo, anchored so
`youtube.com.attacker.test` cannot pass — the same trap `App\Support\YouTube`
documents for `str_contains`. Summernote's own list runs to nine hosts and each
is a decision about who may run code in a frame here, so the set is stated in
three places that must agree: that regexp, the editor's toolbar, and
`frame-src` in `next.config.ts`. A host allowed in one and not the others is
either a video that vanishes on save or one that saves and renders as an empty
box.

**`isBlank()` has a list of elements that *are* content.** A body holding only
a video has no text, and the old check — no text and no `<img>` — therefore
discarded it whole, after HTMLPurifier had kept the iframe perfectly. `<img>`
was sufficient exactly while it was the only childless element the allowlist
admitted. `CONTENTFUL_TAGS`.

**An image in a body goes to the media library, never into the body.**
Summernote inlines a chosen, dropped or pasted file as a base64 `data:` URI by
default — ~540KB in a MySQL TEXT column for a 400KB photograph, carried by
every read of that record, and invisible to the library, so it can never be
found, renamed, given alt text or deleted. `uploadEditorImageAction` posts it to
`/admin/media` instead and inserts the returned URL, which also puts it through
the SVG sanitiser that a `data:` URI would have gone around. The **Library**
button beside it inserts one already there — without it, reusing an image means
uploading a second copy under a second hashed name.

**A custom Summernote button must be given `container`.** Summernote's own
Buttons module wraps `ui.button` with a method that sets it; a custom button
calling `context.ui.button` directly skips that, and `TooltipUI.show` then
reads `.top` off `undefined` — on hover, so the button works and the console
fills with a TypeError the moment anyone points at it.

**Summernote's dialogs are moved to `<body>` by `dialogsInBody`.** Every CMS
form here is one `<form>`, and a dialog left where it is built puts its inputs
inside that form — so Enter while typing a URL into the link dialog submits the
record. The consequence is that those dialogs are **not** inside `.cms-editor`
and cannot be styled through it; the rules for them in `globals.css` are scoped
to Summernote's own class names.

**Summernote ships a light-only stylesheet and the console has a dark scheme.**
Every panel, border and button is re-pointed at the theme's tokens in
`globals.css` — no literal colours, since every one of those surfaces inverts.
`AUDIT_SCHEME=dark npm run audit` measures the CMS edit screens, which is
exactly where the editor is, so left alone it is a white slab in a near-black
page that fails the contrast gate rather than merely looking wrong. The
editable area is pinned to 16px there too: the `width < 40rem` block lifts every
*form control* to 16px for iOS, and a contenteditable div is not one.

**Rich text becomes plain text through `HtmlSanitiser::toText()`, never
`strip_tags`.** `strip_tags` deletes a tag without leaving anything in its
place, so the end of one block runs into the start of the next — the
downloads page published *"…asked for.Remote supportWhen an engineer…"* as its
meta description, and that is what a search engine showed. `toText` spaces
**block** tags only: doing it for every tag breaks the other way, since
`<strong>ten</strong>ths` is one word. It feeds all nine `defaultSeo()`
descriptions and the plain-text half of the notification emails.
