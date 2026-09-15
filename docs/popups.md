# Popups

Targeting, matching in the browser, the seen rules, the audit's dismissal.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**A popup is a picture, a message, or both, and "neither" is refused on `body`.**
`popups.body` is rich text through the same `HtmlSanitiser` as every CMS body —
it renders through `Prose` on every page the popup targets, the widest reach any
body on the site has — and `image_path` is nullable. The gate is in
`PopupRequest::withValidator`, resolved request-or-record like the targeting
gate, so a PATCH changing the delay on a message-only popup is not refused for
having no picture. Links go in the text; there is deliberately no button field.
`SanitisesRichText`'s `prepareForValidation` is aliased there, because the
request has one of its own and the trait's would otherwise be silently shadowed
with the `use` line reading as though `body` were covered.

**A popup has no slug at all**, which is a step further than a slider having no
URL. A slider is addressed by slug because a shortcode names one; a popup is
never asked for by name — the site fetches every live one and the browser picks
— so a slug would be a second identity nothing reads.

**Sections are expanded into path patterns in `Popup::matchPatterns()`, so
`SiteSection` never crosses the wire.** The public resource emits `*`,
`/store/*` or `/contact` and the client does ten lines of string matching.
Sending section keys instead would put a hand-written copy of that allowlist in
TypeScript, which is the `admin_path` and `schema_type_options` drift again.
**`home` emits `/` exactly**: every other section becomes a subtree, and `/` as
a subtree is every page on the site, so ticking Home would silently tick
everything.

**The match is in the browser because a layout has no pathname.** The App
Router gives `(marketing)/layout.tsx` no way to know which page is rendering,
so every live popup is sent and `site-popup.tsx` picks the **first** one that
matches. Exactly one is ever shown; two stacked over one page is how a site
becomes unusable, and `sort_order` is what decides between them.

**`site-popup.tsx` closes the dialog from an effect *cleanup*, not from an
effect keyed on the pathname.** `react-hooks/set-state-in-effect` refuses a
synchronous `setState` in an effect body — so the cleanup calls
`dialog.close()`, which fires the element's own `close` event, and the listener
sets the state from an event handler where it belongs. `setTimeout` is the
exception the rule already allows, which is why the `setOpen(true)` inside the
delay timer is fine. Capture `const dialog = ref.current` inside the effect: by
the time a cleanup runs, `ref.current` may be a different node or none.

**"Already seen" fails closed.** A private window or blocked site data means
*shown*, the call `chat-widget.tsx` makes — treating a throw as "never seen"
turns a blocked-storage browser into one where the popup opens on every page.
`sessionStorage` for "not this visit", `localStorage` for "not today": the
split is a statement about whose decision it is.

**It is marked seen when it opens, not when it is dismissed.** Somebody who
navigates away from a popup has still been shown it, and counting only
dismissals shows it again on the next page.

**MySQL cannot default a JSON column at all**, so `sections` and `paths` are
declared in the model's `$attributes` as the raw pre-cast `'[]'`. Without it a
plain `Popup::create()` with neither key fails with
`SQLSTATE[HY000] 1364 Field 'paths' doesn't have a default value` — a wider case
than the in-memory-defaults trap `StoreProduct` documents, where a column *has*
a default and the model simply had not read it back.

**The popup opens with focus on the `<dialog>` itself, not on its close
button.** `showModal()` hands focus to the first focusable descendant, which
lit the site's two-tone focus ring around the one control the moment the
popup appeared — the user's report was that the button looked huge, and
half of what they were looking at was the ring. The dialog carries
`tabIndex={-1}` and takes focus after `showModal()`; the first Tab lands on
the button and lights it then. The button is 32px with the glyph turning a
quarter under the pointer.

**The close button's disc is opaque, and that is the third time this has been
written down.** It was `bg-dark/70`, which measured **4.05:1** in a browser —
over the white card the real composite is `#606060`, and white on that fails
AA. Worse, `npm run audit` reported it as a **pass**: a Tailwind v4 opacity
modifier resolves through `color-mix`, so the computed value came back as
`oklab(0.188547 … / 0.7)` and the audit's `parse()` reads that lightness
channel as an RGB byte — grading white on near-black. Solid `dark` is 17.9:1
whatever the artwork behind it and is a plain `rgb()` the check can read. The
slide caption gradient and `text-white/85` are the same trap twice already:
**over a picture nobody has seen yet, the stop must be opaque.**

**The disc sits on the card's corner, a third outside it, at 60% opacity
until pointed at — the client's request, 2026-09-15.** 28px (the smallest
that clears the 24px target floor with its ring), offset 10px past the
card's top-right, and a sibling of the card rather than a child, because
the card clips its overflow for a picture and would cut the disc in half;
the modal dialog is the positioning box and 10px past its edge is inside
the 16px viewport margin, so nothing widens. `opacity-60`, to full on hover
and focus, is *element* opacity: the colours stay solid `dark` and white,
so the rule above still holds for what the audit reads (17.9:1) and for
what anybody about to press it sees. What the rest state measures is worth
knowing: over the white half of the corner white-on-disc composites to
about 4:1, over the dimmed page on the other half well above it.

**A published popup made `/checkout` unauditable, and the audit had to learn to
dismiss one.** A popup is a real modal `<dialog>` in the top layer, so while it
is open it genuinely obscures the page — every click Playwright tries times out
after 180 seconds. `PREPARE` is the one thing in `audit.mjs` that *drives* the
site rather than measuring it, so it calls `dismissPopup()` before clicking and
again after navigating (a popup set to "every visit" reopens on each page). The
audited routes deliberately leave it alone: it is on screen for a visitor, so
its contrast and its close button belong in the measurement. Without this,
publishing one sitewide silently costs the most important form on the site its
coverage — reported honestly as a skip, and unaudited all the same.

**The popup's picture is `loading="eager"`, never `priority`.** The dialog is
closed at first paint and opens after `delay_ms`; at that moment the picture
is the largest thing on screen, and Next's dev LCP detector logs a warning for
a lazy image there — which `npm run audit` counts as a console failure on
every page the popup targets (found on `/` the day a popup with a photograph
was published). Eager fetches it on load, so the dialog also opens full rather
than empty. `priority` would add a preload hint competing with the page's real
LCP for a picture a visitor who has already dismissed it never sees.
