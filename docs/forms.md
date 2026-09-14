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
