# The media library and uploads

Upload paths, limits, the SVG sanitiser, in-place edits, the bin, alt text.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**An SVG is a document, so the media library sanitises one on write.** A
browser runs whatever script an SVG carries the moment its URL is opened, which
made every upload to the public disk stored active content on the API origin.
`App\Support\SvgSanitiser` keeps an **allowlist** of elements and attributes
and drops everything else — a denylist cannot be finished from memory here, and
`<animate attributeName="href" values="javascript:…">` is the payload that
proves it: the dangerous value is not in the attribute at parse time. The bytes
are cleaned **before** they reach the disk, so there is no window in which the
raw file is fetchable, and a file the XML parser cannot read is refused with a
422 rather than repaired. `MediaController` carried a comment claiming "no
svg-as-document" with `svg` in the allowlist four lines below it for months,
which is the argument for `tests/Unit/SvgSanitiserTest.php` having one test per
vector: the first cut of the class never scrubbed the **root** element's own
attributes, and `onload` on `<svg>` is the payload that needs no interaction at
all.

**`api/public/.htaccess` sets `nosniff` on everything and a sandbox CSP on
`.svg`.** The sanitiser is the boundary; this is the half that holds for a file
type nobody thought to sanitise, since without `nosniff` a browser may
re-classify a file by its bytes rather than its Content-Type. Two traps in
writing it: **`<LocationMatch>` is not permitted in `.htaccess`** — it is a
server-config directive and Apache answers 500 for the whole vhost if it
appears there — and scoping the sandbox policy to `/storage/` rather than to
`.svg` would take PDFs with it, because `sandbox` stops Chrome's built-in
viewer rendering one inline and a datasheet would download instead of opening.

**`CoverField` takes a `fit`, and the default is still `cover`.** A blog cover or
a case-study hero is a photograph with a known ratio and a subject in the middle,
so cropping to a strip is roughly what the site renders. Everything in Settings
is `contain`: a logo, a favicon and a UPI QR code are **marks**, the file decides
its own aspect ratio because a client uploaded it, and `object-cover` was showing
the middle third of a 600x81 wordmark. A cropped QR code is worse than useless —
it is a preview that cannot be checked by doing the only thing worth doing with
it. `max-h` is set as well as `max-w`, or a tall narrow mark runs to whatever
height its ratio asks for and pushes every field below it down the page.

**Every upload in this product goes through a Server Action, and Next caps a
Server Action body at 1MB.** `next.config.ts` sets `serverActions.bodySizeLimit`
to cover the largest request the API accepts — a ticket reply is five
attachments at 10MB. The default failed anything bigger than a small image with
a **500 and nothing on screen**, because the action throws before its own body
runs and there is no error path to report from: small test images passed and
photographs did not, which is why it presented as "most of the time it does not
upload" rather than as a size rule. It is a transport ceiling, not a policy —
setting it below the API's limits does not enforce them, it breaks them
silently.

**The effective upload limit is a *minimum* across three ceilings**: the
`media_max_kb` setting, `upload_max_filesize` and `post_max_size`. A setting
above php.ini does nothing except break uploads in a way the console cannot
explain, so `App\Support\UploadLimits` clamps it, Settings shows php.ini's own
figures, and the endpoint refuses a value above them. `post_max_size` is the
one that bites hardest: exceed it and PHP throws away the *entire* body, so
Laravel reports the file as missing rather than as too large.

**Every upload shows a real percentage, and the mechanism is a route handler
plus `XMLHttpRequest`, never a Server Action.** An action emits no progress
events, so for as long as every upload was one the bar could only count files —
a percentage animated on a timer being worse than none, since the bar is the
one part of an upload people watch to decide whether something has hung.
`lib/proxy-upload.ts` streams a multipart body through to the API (`duplex:
"half"`, the browser's own `Content-Type` and boundary kept, nothing buffered)
behind a route handler per endpoint — `/api/admin/media/upload`, `…/{id}/replace`,
`/api/portal/tickets[/{ref}/messages]`, `/api/admin/tickets/{ref}/reply`,
`/api/admin/store/orders/{n}/invoice`, `/api/careers/{slug}/apply` — each with
the same session check its action made. `lib/upload-client.ts` is the XHR half;
`lib/media-upload.ts` is what every console picker calls; `useUploadForm` is
how a `<Form>` keeps its Server Action for the no-file case and switches to a
watched request only when a file is attached, mapping a refusal onto the same
`{error, fieldErrors}` so the form cannot tell which path ran. The API is
unchanged: same endpoints, same rules, same 422s — only who sends the bytes
moved. `scripts/_upload-progress-probe.mjs` drives all three audiences with a
throttled connection and asserts a number strictly between 0 and 100 was shown.

**A form-mode `FileDrop` renames nothing.** The browser posts the input's own
name, so the watched path has to do what the action did — `attachments` →
`attachments[]`, the empty entry an untouched input still submits dropped —
in `useUploadForm`'s `prepare`. Forgetting it is a 422 "the attachments field
must be an array" that reads as the API refusing the file.

**The measured bar reads "Processing…" at 100.** The last byte leaves before
the server has stored the file, run the SVG sanitiser and answered, and a bar
sitting at "100%" for two seconds looks finished and is not.

**Two drop zones must not both handle one drop.** The library keeps a
whole-grid target *and* the upload panel inside it. `stopPropagation` on the
inner one stops the outer's `onDrop` running — and that handler is the only
thing that clears its "Drop to upload" overlay, so the file uploaded and the
screen stayed covered until a reload. The panel marks itself `data-filedrop`
and the outer target skips a drop that landed inside one *after* resetting its
own overlay. Never nest a `FileDrop` in a `FileDrop`: both fire and the files
upload twice.

**An upload loop needs try/finally.** `redirect()` works by throwing, so a 401
escapes the async block, leaves `busy` true and `progress` set, and every later
upload returns at the guard having done nothing and said nothing — an expired
session turns the uploader off until a reload.

**An absolute API URL cannot be an `<a href>`, and the failure is a 500 rather
than a 401.** Ticket attachments and the media library's Download button both
handed the browser `route('api.v1.admin...')` and let it navigate. A navigation
sends no `Authorization: Bearer` — the Sanctum token is in an httpOnly cookie on
the *Next* origin, which is never sent to the API's — and it sends
`Accept: text/html`, so Laravel's auth middleware tries to redirect to a `login`
route an API-only application does not define and answers **500 "Route [login]
not defined."** `API.md` opens with that exact warning, and a link is the one
caller that cannot set the header itself.

Every authorised download therefore goes through a **Next route handler** that
attaches the token server-side. There are now nine: the invoice, the CV, four
CSV exports, and `/api/admin/media/{id}/download`,
`/api/admin/ticket-attachments/{id}` and `/api/portal/ticket-attachments/{id}`.
The two attachment routes are separate on purpose — the portal endpoint checks
`customer_id` ownership and refuses anything hanging off an internal note, and
the staff one deliberately does neither.

**Ticket attachments had never worked from the interface, and nothing could have
caught it**: no attachment exists in the seeded data, so the audit renders no
link to press, and `TicketAttachment` appeared nowhere in the test suite. A
feature with no fixture and no test is one whose interface is unexercised
however green the suite is.

**A media URL carries `?v=<updated_at>`; a path never does.** Resize, crop,
rotate and replace all rewrite the file **in place**, because the path is the
identity records store and keeping it is what lets an edit reach every page
already using the image. Which means the URL does not change either, and the
browser goes on serving what it has — the console refetched the row and showed
the old picture. Reported as "the gallery does not refresh". The version is on
`url` only: `path` is what a record stores, and a stored path with a query
string is a filename that does not exist.

**An in-place edit archives the previous bytes *before* it runs.**
`App\Support\MediaHistory` — afterwards there is nothing left to copy, and
snapshotting after the fact looks identical from outside while storing the new
bytes every time. Capped at ten, and pruning goes one row at a time because the
model's `deleting` hook is what removes the file.

**Deleting a media file fills a bin and keeps the bytes.** Nothing tracks which
records reference a path, so the mistake is found by somebody opening a page
and seeing a hole in it. A restore has to put back the *exact* published URL,
which re-uploading under a new hashed name would not — so the file is held
until it is purged. `restore` and `purge` take a plain `{id}`: route-model
binding applies the default scope and 404s for every file in the bin.

**A bulk route must be declared above `media/{id}`.** Laravel matches in
declaration order, so `media/move` underneath binds `{id}` to the literal
"move" and 404s from model binding — a routing bug that reads as a missing
record. `MediaLibraryTest` pins it.

**GD sets two traps and both are invisible in a screenshot.** `imagerotate`
measures **anticlockwise**, so clockwise degrees are subtracted from 360 —
wrong is invisible at 180 and exactly wrong at the two angles anybody uses.
And `IMG_FILTER_CONTRAST` is **inverted**: a positive value flattens, so
passing a "more contrast" slider straight through reads as a weak filter
rather than a backwards one. Both are pinned by tests that assert on real
pixels, and mid-grey is the one value that cannot demonstrate contrast — it is
the fixed point the filter pivots around.

**The media library's right-click menu is not the only way in.** Every tile
and folder also carries a visible ⋯ button opening the same menu — right-click
alone is unreachable on touch and by keyboard, and this console is gated on
audits that would fail it. `media/item-menu.tsx`.

**The grid is worked from the keyboard, and it has one tab stop.** Arrows
move between tiles — up and down by the rendered column count, read off the
`<ul>`'s own `grid-template-columns` so it is right at every tile size —
Space opens the preview, Enter the details, Delete asks before binning, `x`
ticks the tile. A roving `tabIndex` (0 on the active tile, -1 on the rest)
is what keeps Tab from stopping forty times on the way to the pager. The
keys are read on the `<ul>` and only when the tile itself is focused, so a
key typed in the checkbox, the ⋯ menu or a dialog is left to that control.
`scripts/probes/media-keys.mjs` measures it and cancels the delete it opens.

**Uploads are multi-file and drag-and-drop, and both go through one
`UploadProvider`.** The toolbar's file input and the drop zone over the grid
sit in different parts of the tree, so the shared state is context rather than
two copies — otherwise dropping files reports in one place and choosing them
reports in another. Files upload **one at a time**: a server action per file
also revalidates the page, and twenty at once makes the count meaningless and
hides which one failed. The drop zone counts dragenter/dragleave depth, since
both fire again for every child crossed, and it must `preventDefault` on
dragover or the browser opens the file and navigates out of the console.

**Resize is raster-only, and the UI says so before the request.** GD cannot
scale a vector, so the API returns 422 for an SVG and the menu item is
disabled with the reason in its `title`. All 33 seeded images are SVG, so this
is the common case here, not the corner one.

**Image alt text is a property of the file, not of the page using it.**
It is written once in the media library ("Edit details") and resolved by path
through `App\Support\MediaAlt`, which memoises one `path => alt_text` map per
request. Four public resources expose it — `cover_image_alt`, `hero_image_alt`,
`image_alts` — and the frontend falls back to a derived name only where one
would actually help a reader. **A new `<img>` on a CMS-driven image should read
that field, not invent a string from the record's title**: a name is not a
description of the picture, and every duplicate of it is one more place to
change when the real photography lands.

**Deleting a media folder does not delete its files** — `folder_id` is
`nullOnDelete` and they move to Unfiled. The confirmation dialog says so,
because "Delete folder" reads like it takes the contents with it.

**Every image preview is the same control, and it has no options.**
`CoverField` shows the whole file, contained, capped at 200px and centred —
what Settings already did — with the picture and the "choose one" controls
**side by side, 50/50**. There is deliberately no `fit` prop any more: it used
to default to a cropped full-width strip, on the argument that a blog cover is
a photograph with a known ratio, which is true and not worth the cost. An
editor checking an image wants to see the image, and a picker that crops
differently on one screen than another is one whose preview cannot be trusted
anywhere; a cropped QR code is the extreme of it. Stacked, the 200px preview
sat between the label and the drop zone, so on a form with several image fields
the thing you press was always below the thing you were looking at. Both halves
need `min-w-0` — a grid item's automatic minimum is its min-content — and the
row is one column below `sm`, where a half is narrower than the drop zone's own
label.

**A `CoverField` needs the URL, not just the path.** It renders its preview
from a URL and cannot derive one from a stored path, so a repeater that kept
only the path showed the empty "no image chosen" strip for pictures that were
plainly there — **measured at 0 previews and 12 empty placeholders on a slider
that had slides**, and the slide repeater had shipped that way. Both repeaters
now carry the resource's `url` on the row and strip it before serialising, or
it would be posted as a field the API does not accept.
