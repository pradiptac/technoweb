# Editor-built forms and embeds

`FormValidator`, the frame, the raw-HTML snippet and its CORS.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**A form can be framed on somebody else's website, and the whole feature is a
chrome-less route plus one CSP exception.** `/embed/forms/{slug}` renders
`FormBlock` and nothing else, so **no part of the submission path changed**:
same Server Action, same `FormValidator`, same `website` honeypot, same 10/min
throttle, same `LeadIntake`. The alternative — handing out markup that posts
cross-origin — was refused on measurement rather than taste: `config/cors.php`
allows exactly `FRONTEND_URL` and sets `supports_credentials: true`, which makes
`allowed_origins: ['*']` illegal rather than merely unwise, so every embedding
domain would have to be registered and their page would carry none of the
validation this one already has.

**Two CSP headers are intersected by the browser, not overridden, and that
decides the shape of the fix.** Adding a second `headers()` block for `/embed`
carrying `frame-ancestors *` leaves the first block's `'self'` in force, so the
effective policy is still `'self'` — a change that reads as correct, ships, and
blocks every embed with nothing saying why. The site-wide block is therefore
`source: "/((?!embed/).*)"`, and `/embed/:path*` gets its own. `X-Frame-Options`
comes off there too: it is the older spelling of the same rule and has no "allow
any origin" value, so `SAMEORIGIN` beside a permissive `frame-ancestors` is the
same intersection one layer down.

**`frame-ancestors *` rather than a per-form allowlist, deliberately.** The
allowlist would have to be resolved per request, because `headers()` is
evaluated at build time and the form's row is not knowable there. What it buys
is protection from clickjacking on a page with no session, no authenticated
action and nothing destructive behind it — where the worst a hostile frame
achieves is a junk lead that anybody can already post with curl. `embed_enabled`
(default false) is what controls exposure; the throttle and honeypot control
abuse.

**An embedded lead must record the host's page, and would not by default.**
`PageContextFields` posts `window.location.href`, which inside the frame is our
own `/embed/forms/{slug}` — so every embedded submission would have been filed
against this site: plausible, constant, and measuring nothing, which is the
exact failure that component exists to prevent one layer up. It posts
`document.referrer` when framed. Verified with a real second origin: a form
framed from `127.0.0.1:4555` filed leads against **that** origin. Expect an
origin rather than a full path, since a host on the usual
`strict-origin-when-cross-origin` gives a cross-origin frame no more.

**The raw-HTML snippet is the second shape of the same feature, and its CORS
lives on a frontend route rather than in Laravel.** `POST /api/embed/forms/
{slug}` on the Next side forwards to the API and answers with
`Access-Control-Allow-Origin: *` and **no** `Allow-Credentials` — the safe
combination, since a browser then sends no cookies and there is no session to
ride. Widening `config/cors.php` was the alternative and was refused: it allows
exactly `FRONTEND_URL` with `supports_credentials: true`, so `'*'` is illegal
there, and the only ways through were registering every embedding domain or
loosening CORS for every authenticated route in the product to serve one public
form.

**That header grants no new capability, which is why `*` is defensible here.**
A cross-origin `fetch` is *sent* whether or not CORS allows it — the browser
blocks the caller from reading the reply, not the request from arriving — so
this endpoint was always reachable from anywhere. What the header changes is
whether their script may read the answer, and the answer is a success sentence
or validation messages about the submission they just made. It is also the
reason this had to be **measured rather than reasoned about**: without the
header the form looks broken and files a lead every time, so
`scripts/_embed-html-probe.mjs` submits from a real second origin and then
counts the leads.

**The generated markup carries three things that must survive being restyled**,
and the console says so at the point somebody copies it: the hidden `website`
honeypot, which is what the API checks and whose removal turns the form into a
robot's inbox; a `<label for>` on every control, the first casualty when a form
is rewritten by hand; and the `_source_url`/`_referrer` envelope, filled by the
snippet's script from *their* page. It carries no classes and no styling of
ours — anything we put there is something they must override first.

**A copied snippet is a snapshot and will go stale.** Add a field and their page
does not have it; remove one and their page posts a key the form no longer
declares, which `FormValidator` drops in silence — so nothing on either side
reports the drift. The frame cannot drift because it is not a copy, which is why
it is the offer made first and this one is behind a disclosure.

**A `noindex` page is not required to carry a canonical, and `audit.mjs` says
so as a rule rather than as an exemption.** The canonical check exists so two
URLs serving one page cannot split their own ranking, which stops being a
question the moment a page asks not to be indexed. The embed route forced it
into the open — it is a deliberate duplicate of a form that already lives on a
real page, kept out of the index for that reason, and a canonical on it would
be either a claim about a URL we do not want found or a pointer at another
page's identity. Its `h1` is `sr-only` rather than absent: an iframe is its own
document and a screen reader entering one that starts at a form field has
nothing to say where it arrived, while a visible title in our styling inside a
partner's column is what makes an embed look bolted on.

**A form's validation comes from its stored definition, not its payload.**
`FormValidator` builds the rules from `form_fields`. Unknown keys are dropped
rather than rejected, selects are validated against their own options, and
`website` is reserved for the honeypot — a field of that name is refused on
write, because it would silently disable the trap.

## Field kinds, conditions, steps and uploads (0.117.0)

2026-10-06. The builder went from seven kinds to sixteen — `url`, `date`,
`radio`, `checkboxes`, `rating`, `file`, `hidden`, `heading` and `step` joined
`text`, `email`, `tel`, `number`, `textarea`, `select` and `checkbox` — and a
field gained two JSON columns, `settings` and `show_if`. Every rule below is
the first rule of this file seen from a new direction: **the stored
definition is the contract, not the payload.** `FormBuilderTest` pins each.

**`FormField::KINDS` is the list and `App\Support\Forms\FieldSpec` says what
each entry means.** Which kinds take options, which collect nothing, what a
kind keeps in `settings`, what may be a condition's source, what a file field
may accept. Four callers read it — the save request, the submit validator,
the resources and the console — and the console is *sent* it: `meta` on the
forms index, the read and both writes carries `kinds`, `ops`, `file_accepts`,
`max_upload_kb` and `max_file_fields`. A second list of kinds in TypeScript is
the drift this project keeps being caught by (`schema_type_options`,
`admin_path`), and here it would fail quietly in both directions: a kind the
console offers and the API refuses, or one the API stores and the console
cannot draw.

**A hidden field's value is never read from the request.** `settings.value` is
what is stored, whatever is posted under the field's key — the validator does
not put a hidden field's key into the input it validates at all. It is the
easiest field on a form to rewrite (it is in the page for nobody to see, so
nobody notices it changed), and the reason it exists — a campaign code, a
routing word, the name of the page a form sits on — is that the *editor* chose
it. For the same reason the public read does not send the value: `settings`
is null for a `hidden` field on `GET /forms/{slug}`, and the console's read
carries it. The browser has no use for something the server fills in, and a
routing word in the page source is one more thing somebody can read.

**A field its condition hides is dropped on the server, not just hidden in
the browser.** `show_if` is `{field, op, value?}`, and the page hides the
field when it fails. That is presentation. `FormValidator::shown()` evaluates
the same condition against the submitted answers and a hidden field is
*skipped*: it is not required, and whatever was posted for it is not stored.
Both halves matter. Without the first, a required field nobody was shown
refuses every submission, with an error under a control that is not on the
screen. Without the second, a value typed into a field that was then hidden
again — or posted by something that never rendered the form — is stored and
emailed as the answer to a question that was never asked.

**A chain follows its first broken link.** A field whose source is itself
hidden is hidden, whatever its own operator says. The case that makes this a
rule rather than a detail is `empty`: "show *Why not?* when *City* is not
answered" is literally true of a *City* that was hidden and dropped, and
evaluated naively it would put a required question in front of nobody. The
source's visibility is asked first and its answer second.

**Five operators, and what "equals" means is written down because two
implementations have to agree.** `equals`, `not_equals`, `includes`, `filled`,
`empty`. The comparison is exact, case and all — an option's value is a key an
editor wrote, not prose. Two numbers are compared as numbers, so a rating
posted as `4` by JSON and `"4"` by a multipart form are one answer. A tick box
is "filled" when ticked, and equals any of `1/true/on/yes` when ticked and
`0/false/off/no` when not, rather than one spelling of each. On a
`checkboxes` source `equals` and `includes` both mean "is among those ticked"
and `not_equals` "is not". `includes` on anything *but* a `checkboxes` source
is refused when the form is saved: "contains" on a line of text is a
different operator from "is ticked", and one word doing both is a condition
the browser and the server can read two ways.

**A condition that could never be evaluated is refused on save.** The source
must exist, come **earlier** in the list, not be the field itself, and have an
answer to read — not a `file` (absent from the values a browser evaluates
conditions on), not a `hidden` (it never varies), not a `heading` or a `step`.
Each refusal is its own sentence on `fields.N.show_if.field`. Every one of
these saves happily without the check and fails in front of a visitor
instead, as a field that never appears. "Earlier" is what makes a cycle
unrepresentable rather than merely refused, the menu builder's argument.

**Layout kinds store nothing.** A `heading` (its `label` the heading, its
`help` an optional paragraph) and a `step` (its `label` the title of the step
it opens) are rows in `form_fields` because their *position* among the fields
is the whole of what they are, and a second table would have to be kept in
order with the first. They are never validated as answers, never required —
`required` is stored false on them whatever is sent — and never in a
submission, an email or an export. The server names them (`section_1`,
`step_1`) when the request does not, because `(form_id, name)` is a unique,
non-null index and nothing ever reads that name back as a value; a step left
untitled is "Step N". And a form made of nothing but layout rows is
**fieldless**: both public endpoints answer 404 for it, the rule a form with
no rows already followed.

**`steps` and `has_files` are sent rather than left to be counted.** The
public read carries how many steps the form is walked through (its step breaks
plus the one it opens on) and whether it must be posted as
`multipart/form-data`. Both are derivable from `fields`; both are the kind of
derivation that gets written twice and agrees until an edge case.

**A multipart body is read like a JSON one.** A form with a file field cannot
be posted as JSON, and a browser's multipart encoding of the same answers is
not the same bytes: a ticked box is the word `on`, and one ticked option of a
group arrives as a bare string where two arrive as a list. `FormValidator`
normalises both before the rules run, so `checkboxes` is always an array and
a tick box always a boolean in what is stored.

**A required tick box is `accepted`, and that changed behaviour.** `required`
alone is satisfied by `false` — Laravel's rule asks whether a value is
*present* — so a JSON submission with a required consent box unticked used to
pass, storing a consent nobody gave. It is a 422 now.

**A bad choice is reported under the field's own key.** The options of a
`checkboxes` field are checked by a closure on the field rather than by a
`name.*` rule, so the error arrives as `errors.interests` and not
`errors.interests.1` — which is not the name of any control on the page, and
would be shown nowhere.

**An upload is private, hashed, checked by content, and never attached to
mail.** `App\Support\Forms\FormUploads`. This is the second unauthenticated
upload in the product after the careers form's CV, and it is built to the same
rules:

- *The private disk*, under `form-uploads/{form id}/`. Nothing there has a
  URL; the only way to a file is
  `GET /admin/forms/{id}/submissions/{sid}/files/{field}`, inside the forms'
  own role group, which answers 404 for a submission addressed through another
  form — the id in a URL is a number anybody can change.
- *A random name with the extension the bytes earn.* Nothing a stranger typed
  is ever a path on this server. What they called the file is kept as a
  label only — last path segment, control characters and quotes out, capped —
  for the download's `Content-Disposition` and for `data[field]`.
- *Extension and content, both.* `extensions:` reads the name and `mimes:`
  the type the bytes sniff as, so a script renamed `brief.pdf` is refused for
  being a script and a real PDF arriving as `brief.php` for being called one.
  Either rule alone lets one of those through.
- *Never attached.* `FormSubmitted` lists the filename among the answers and
  adds one line saying files are downloaded from the console. An attachment
  would deliver something a stranger uploaded into an inbox — past the role
  check on the download, onto whatever device reads that mailbox, and
  forwarded from there by one press.
- *Nothing is written for a refused submission.* The files are stored after
  validation passes and before the row is created; if the row cannot be
  written they are deleted again.

**What a file field accepts is a choice of groups, not a list of
extensions.** `image` (jpg, jpeg, png, webp, gif), `pdf`, `document` (doc,
docx, xls, xlsx, csv, txt). That is the decision an editor is actually making,
and an allowlist typed by hand is how `svg` or `html` ends up in one. No SVG
— it is a document that runs script, which the media library sanitises and
this path does not — and no archives.

**Three file fields to a form, and the size limit is the lower of two.** A
fourth is refused on save. `settings.max_kb` is 100–20480 and is stored as
asked; the limit *in force* — what the validator applies and what the public
read sends — is that or php.ini's ceiling, whichever is lower
(`FieldSpec::maxKb()`, through `UploadLimits`). A figure above
`upload_max_filesize` is not a bigger limit, it is a promise the server will
not keep, and `meta.max_upload_kb` tells the console what the ceiling is.

**`files` sits beside `data`, not inside it.** `form_submissions.files` is
`{field: {path, name, size, mime}}`; `data[field]` holds the filename. `data`
is what is emailed, exported and sent to the `form.submitted` webhook, and a
path on the private disk must be in none of those. The resource turns `files`
into `{field, name, size, mime, submission_id, download_path}` — the API's own
route under `/api/v1`, never the stored path — and into `{}` rather than `[]`
when there are none.

**A submission's files are deleted with it, and kept when its form is
deleted.** `FormSubmission`'s `deleting` hook removes them, so
`DELETE /admin/forms/{id}/submissions/{sid}` is the same removal whoever calls
it; the lead made from the submission stays, the mirror of "deleting a lead
keeps the submission". Deleting the *form* nulls `form_id` in the database,
fires no model event, and leaves the submissions with their files — the
existing rule extended to what came with the answers. **There is no retention
prune for form uploads**, unlike job applications: it was out of scope for
0.117.0, so a form that takes files grows the private disk until somebody
deletes submissions. An orphaned submission's file also has no route to it,
since the download is addressed through the form.

**The redirect is a path or an http(s) URL and nothing else.**
`forms.redirect_url` is where a visitor is sent instead of being shown the
success message, so it becomes a navigation for everybody who fills the form
in. It is held to `LinkPattern::PAGE_RULE` — the two branches of the pattern
every editor-typed `href` uses, without `mailto:` and `tel:`, which are things
to press rather than places to arrive. `javascript:` and `//host` are refused
for the reasons they are everywhere else.

**Anything that prints a submission walks the form's fields, never the stored
keys.** `data` is a MySQL JSON object, and MySQL keeps an object's keys by
length and then alphabetically — the trap `App\Casts\SpecSheet` exists for.
So `FormSubmitted` lists the answers in the form's order by iterating
`valueFields()`, and the CSV export gives each field a column the same way;
`App\Support\Forms\AnswerText` is the one formatter both share. A choice is
printed as the **label** the visitor read (the stored value is a key written
for the condition rules), several are joined, a rating says what it is out of
("4 / 5"), a tick box is a word.

**The export is today's fields.** One row per submission, one column per
field that has an answer, between when it arrived and where from; written by
`Csv::write`, the application's one CSV writer, so a cell a stranger typed
that begins `=`, `+`, `-` or `@` is text to Excel. An answer to a field since
removed stays on the submission and in the console and is not in the file — a
column per key ever used would make the heading row depend on the data. The
"Source page" column is read from the lead made from the submission: a
submission does not record its own page, and the lead does.

**The WordPress importer reads the four controls the builder used to
flatten.** `FormReader` maps a radio group to `radio`, a group of checkboxes
to `checkboxes`, `type=date` to `date` and `type=url` to `url`; a group with
one option in it stays a dropdown, which is the kind that may hold a single
choice. A file input is still left out and named in the review — what the old
site accepted is not in the markup. The fallback key that identifies a form
with no plugin id is hashed over the *old* kind names, so the release in which
a radio group stopped being a dropdown is not the release in which every such
form is imported a second time.

## On the page and in the console (0.117.0)

The API half is above. These are the rules the two frontends keep, each found
or confirmed by driving the form in a browser (`scripts/probes/form-builder.mjs`).

**The server's HTML is the no-JavaScript form.** Every step stacked under its
title, every conditional field shown and not `required`, one submit button.
What hydration will hide carries `data-form-wait` and what only makes sense
with script (the step counter, the word "Next") `data-form-js`; a four-second
`step-end` animation in `globals.css` holds both in their after-hydration
state so nothing moves when React arrives, and then *ends* — a bundle that
never loads leaves a whole, sendable form rather than a first step whose
button does nothing.

**Conditions are evaluated twice and must agree.** `hiddenNames()` in
`components/forms/form-logic.ts` is a port of `FormValidator::shown()`,
operator for operator — exact case, numbers as numbers, the tick-box words,
`equals` on a `checkboxes` source meaning "is ticked", and a field whose
source is itself hidden being hidden whatever its operator. Change one and
change the other; the browser's copy only decides what is drawn, the server's
what is stored.

**No step panel is ever unmounted.** They sit in one `<form>` behind `hidden`,
the entity forms' rule: an unmounted panel takes its inputs out of the DOM,
and a 422 naming a field on step one has to be able to jump back to it. Next
runs `reportValidity()` over the current step's enabled controls; the last
step's button is the form's own submit, so Enter and a click take one path.

**Moving a step focuses its title, and scrolls it by rule.** A focused element
is brought only just into view, which under the public site's sticky header
is behind it — the title measured 7px from the top of a 390px screen, under a
69px bar. So the title is focused with `preventScroll` and then
`scrollIntoView`'d, and `[data-form-step-title]` carries a
`scroll-margin-top` of the header plus the "Step N of M" line.

**A form with a file field is posted as multipart through `apiUpload`**, and
only then; every other form keeps the JSON path. A file of the wrong
extension or over `settings.max_kb` is taken back out of the input when it is
chosen, with a sentence in the field's live note — the API refuses it anyway,
but only after the whole upload has been sent.

**`redirect_url` is followed by the Server Action, outside its `try`**, and
only to a same-site path or an http(s) URL; anything else shows the success
message. Inside the embed frame it is never followed: the frame shows the
message and a "Continue" link with `target="_top"`, because a frame that
navigates itself strands the visitor inside somebody else's page.

**The raw-HTML snippet refuses what it cannot do.** `POST /api/embed/forms/{slug}`
answers 422 for a form with a file field before reading the body, and the
console does not offer the snippet at all for a form with an upload, a step
break or a condition — a copy of the markup has no script to run them.

**The builder's rows fold, and a row with an error is always open.** Seventeen
open cards measured 8,600px; folded, the same form is 2,500px. A saved form
of more than three rows opens folded, a new row opens as it is added, and a
row holding a `fields.N.*` error is unfolded whatever was chosen — a message
inside a folded card is the hidden-tab failure one level down. The 422 map is
pinned to row keys when it arrives, so reordering after a refused save does
not move a message to the wrong row.

**The list is re-mounted on the form's `reset` event.** React resets a form's
controls when its action completes, a refused one included, and `<Form>` puts
back only *named* controls. The builder's selects and tick boxes are
controlled and unnamed — they feed one hidden JSON input — so React believes
they already hold the right value and leaves the DOM's reset standing:
measured, a "Tick box" row showed "Short text" after a 422 while the posted
JSON still said `checkbox`. Any editor of controlled, unnamed controls inside
a `<Form>` has this shape.

**A condition is held by its source row's key, not its name.** The name is
written out when the form is posted, so renaming a source — and a new field's
key follows its label as it is typed — never breaks a condition. A source
that is removed, moved below or changed to a kind a condition cannot read
leaves the condition in place with a warning line, and it is still posted, so
the API's refusal lands on the row.

**A submission's file and the CSV export are plain `<a download>` links to
route handlers** under `/api/admin/forms/…`, never a `Link` — a `next/link` at
a route handler prefetches it, and this one builds the whole file.
