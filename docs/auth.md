# Sign-in

Codes, passwords, the two principals and what they must never share.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**`default_login_method` decides which step a sign-in form opens on**, and it is
a different question from the three switches beside it. "May somebody use a
password" and "is a password what we offer first" are not the same, and the other
route stays one link away either way. If the chosen default has been switched
off, the form falls back to whatever is still enabled - an install with codes as
the default and mail broken has to leave somebody a way in.

**The two principals must not share anything keyed on a value they both
hold.** Both password brokers pointed at `password_reset_tokens`, whose primary
key is the email address — so a token issued to a *customer* reset the *staff*
account at the same address. Verified working before the fix, and it is
privilege escalation into the admin console. Customers now have
`customer_password_reset_tokens`. This is the same shape as the id collision
between `Customer` and `User` that `EnsureUserIsCustomer` exists for.

**A sign-in code is the third secret with that shape, and `sign_in_codes` is
keyed on `(audience, email)` for exactly that reason.** Not filtered by
audience after the lookup — keyed on it, in every query, because "the check
that is applied afterwards" is the one somebody removes while refactoring.
`SignInCodeTest` pins both directions, and deleting the audience clause from
`SignInCodes::consume()` fails precisely those two tests. The audience values
are the Sanctum token names already in use, `portal` and `admin`, so there is
one vocabulary for which principal is meant rather than two that must be kept
in step.

**Codes are the default way in and passwords are a link away.** The rules that
matter, each blocking something specific: hashed at rest, ten-minute expiry,
**five wrong entries burn the code** — the attempt cap is what actually closes
six digits, since a rate limit only slows guessing — single-use via a
conditional `UPDATE` on `consumed_at IS NULL` with the affected row count
checked, and a new code retiring any still outstanding. `random_int`, never
`mt_rand`.

**`request-code` writes a row for an address with no account.** Nothing is
sent, but the work done has to look the same from outside or the sign-in form
becomes the membership oracle `/auth/register` goes out of its way not to be.
The frontend has the other half of that rule: **the form advances to the code
step whatever happened**, because a form that only advanced for addresses it
recognised gives away precisely what the API withholds.

**One gap in that is real and is not closed.** Mail goes out inside the
request, so an address with an account behind it answers measurably slower —
measured here at 1.6s against 1.0s. The throttle bounds how fast that can be
walked; the fix is a queue worker, which is the deployment change `Notifier`
has wanted since tickets shipped.

**A code confirms an unverified address, and the support desk has to be told.**
Delivering a code and having it typed back is exactly the proof
`/auth/verify-email` asks for, so `email_unverified` cannot arise from this
path. The confirmation therefore fires `CustomerRegistered` the way the
verification endpoint does — without it a customer confirms by signing in,
waits for approval, and is in nobody's queue, which is the quiet failure in the
whole feature.

**Codes make the mailbox the only factor, and for the console that is a
reduction.** A password sign-in needed the mailbox *and* something known. It is
deliberate, it was asked for, and it is reversible from Settings without a
deploy: `otp_admin_login_enabled`. `password_login_enabled` is a separate
switch on purpose — mail is configured from the console and can be
misconfigured from the console, so an install that has turned passwords off and
then broken SMTP has locked every administrator out, and the way back in is a
database edit.

**One input for the code, never six boxes.** `components/ui/code-field.tsx`.
Six inputs breaks paste, announces six unlabelled fields to a screen reader,
needs hand-written backspace handling, and puts six targets inside the 24px
clearance the audit enforces. `autoComplete="one-time-code"` is the attribute
that earns the shared component: it is what lets a phone offer the code from
the notification, and it is exactly the thing that gets left off one of two
copies.

**What sits beside the sign-in form is a setting, and the eight animations
are drawn in the theme's own colours (2026-09-17).** Settings → Sign-in
screen, a new public `login` group: `login_backdrop` is `image` — the
uploaded `login_image_path` (moved into this group from General so the
choice sits beside the picture it uses), or the brand gradient with none —
or one of `particles`, `waves`, `circuit`, `geometric`, `dataflow`,
`gradient`, `quantum`, `stars`; `login_intensity` (low/medium/high) and
`login_speed` (slow/normal/fast) scale counts and time. The list is
`lib/login-backdrop-choices.ts`, the API checks an id's shape only and
`loginBackdropFor()` falls back per field to the first entry — the motion
rule, for the motion reason — so the default install renders exactly what
it did. `components/layout/auth-backdrop.tsx` is one canvas and eight
scenes; it reads `--color-brand-400`, `--color-secondary-500` and
`--color-accent-500` at mount and paints them at low alpha over the panel's
`bg-dark`, which stays the ground the caption is graded against (the
contrast audit reads `background-color`, never a canvas). Two soft washes
in the theme's hues go under every scene, because hairlines on flat
near-black read as thin — measured against the reference, whose shapes sat
on a coloured ground. Reduced motion draws one frame at t = 4 and stops
(at t = 0 every wave is flat); a hidden tab draws nothing; the canvas is
`absolute inset-0` inside a panel that clips, so nothing here can widen the
page, and the panel is hidden below `lg` as it always was. The settings tab
shows every style as a real still frame and runs the chosen one live at the
chosen intensity and speed; a disabled intensity or speed row posts nothing,
so switching back to the picture keeps them for next time.

**The panel carries a written message in its middle, in place of the
tagline (2026-09-18).** `login_message`, rich text in the `login` group,
cleaned through the `cms` profile on write like `activation_procedure` and
edited with the same Summernote field on the Sign-in screen tab. With one
written it is drawn centred over the picture or the animation through
`Prose` with `onDark`, which swaps the inks for the dark band's
non-inverting tokens — the message sits on `bg-dark`, where the page's
`ink-2` is near-black on near-black; with none the tagline stays in the
corner as before. `Prose`'s ink utilities became exclusive per ground in
the same change: two `[&_a]:text-*` utilities at equal specificity are
decided by stylesheet order, and the light link colour won on the dark
panel while both were emitted. Measured: the heading centred on the panel
(x 360 of 720, y 429 of 900), white, the link in `dark-muted-brand`, the
tagline gone; light and dark audits clean.

**Both doors render one form (2026-09-18).** `admin/login/login-form.tsx`
and `portal/login/login-form.tsx` were the same three hundred lines — the
portal's "built from" the console's, and drifted by a refusal panel and a
register link. `components/auth/sign-in-form.tsx` is the form; what differs
between the doors is data and arrives as props: the three Server Actions
(`login`, `sendCode`, `verifyCode`), `forgotHref`, and `registerHref` when
registration is open. The two files that remain are wrappers that pass
those. The refusal panel — "waiting for approval" as an info panel with
nothing to press, "confirm your address" with the resend beside it — lives
in the shared form and never fires for the console, whose actions set no
`reason`. The audit signs in through it on every run, which is the test.

## Seven more backgrounds (2026-09-24)

Wave grid, Aurora, Fluid morph, Twisting ribbon, Animated rays, Perspective
grid and Light lines, after Vengeance UI's backgrounds — read as behaviour
and re-drawn on the same 2D canvas as the first eight. The references' wave
grid is a three.js scene with post-processing and the fluid morph is
framer-motion; neither is added. The scenes moved out of `auth-backdrop.tsx`
into `components/layout/backdrop-scenes/` (`shared.ts`, `original.ts` for
the first eight verbatim, `vengeance.ts`, `index.ts` typed as the full
record so an id without a scene is a type error). Scenes now receive
`input.pointer` — listened for on the panel, only while animating — which
the wave grid ripples from. The ribbon turns three times, not the
reference's six: at panel width six read as a string of beads.

## Passwords switched off means switched off (2026-09-26)

`password_login_enabled` used to decide which step the sign-in screens opened
on and nothing else: `POST /auth/login` and `POST /admin/auth/login` took a
password from anybody who posted to them. Both now refuse **before** the
credentials are looked at — 403, `reason: password_login_disabled`, one answer
for every address — and the console's refusal is written to the activity log
as a `login_failed` with that reason.

**The break-glass is `AUTH_PASSWORD_BREAK_GLASS=true` in `api/.env`** (then
`php artisan config:clear`; `config('auth.password_break_glass')`). Mail is
configured from the console and can be misconfigured from it: an install with
passwords off and broken SMTP has no code that can arrive and no
administrator who can sign in to fix it. The flag re-opens **staff** password
sign-in only — never the portal's — and is meant to be switched off again the
moment mail works. It is a file on the server rather than a setting because
the setting is behind the door it has to open.

## A confirmation retires the password it did not prove (2026-09-26)

`/auth/register` stores whatever password the caller chose on an account
nobody has confirmed, and anybody can register anybody's address. A code,
the emailed link, or mail piped in from the address all prove the *mailbox*
and nothing about who typed that password — so before this, the owner
signing in by code or clicking their link switched on an account the
registrant could also sign in to, holding the owner's orders and tickets.

`Customer::markEmailVerified()` therefore, on the **first** confirmation only,
replaces the password with 64 random characters, deletes every token, and
then joins the paid guest orders under the address (`Checkout::claimOrders`).
The owner signs in with a code, or sets a password through "Forgot your
password?", which is itself a mailbox proof. Confirming an address already
confirmed changes nothing. The verification response says so: "Sign in with
a one-time code sent to it, or choose a password with 'Forgot your
password?'."

## The attempt is claimed before the code is compared (2026-09-26)

`SignInCodes::consume()` read `attempts`, ran bcrypt, then incremented — so
guesses sent in parallel all read the same count while the first was being
hashed, and the cap of five meant nothing. One conditional
`UPDATE … SET attempts = attempts + 1 WHERE attempts < 5 AND consumed_at IS
NULL AND expires_at > now()` decides whether a request gets a guess at all;
only a request that changed a row compares. `SignInCodeTest` stages the race
by answering the first comparison with seven more guesses.

## Signing in with Google (0.133.0)

Customers can sign in to the portal — and register — with a Google account.
Customers only: the console's sign-in is unchanged, and this is not a way
into it. Off until an administrator saves an OAuth client and switches it on
(System → Settings → Sign-in → Sign in with Google).

**It is a sign-in, not a connection.** The other Google integrations
(outgoing mail, the ticket mailbox, the calendar, Drive) are
`OAuthConnection`s: they keep a refresh token and go on acting. This asks
Google who somebody is, once, and throws its tokens away —
`App\Support\Auth\GoogleSignIn`, the ordinary OpenID Connect code flow with
scope `openid email profile`.

**The round trip, and the three things it is held to.**

1. The button is a plain `<a>` at `/portal/auth/google` (a Next route
   handler). It asks `POST /auth/google/authorize` where to send the
   browser, having put a random value in an httpOnly cookie
   (`tw_google_signin`, ten minutes, `sameSite: lax`, path
   `/portal/auth/google`). The API mints a **state** and a **nonce** and keeps
   them in the cache with the redirect address and the **hash** of that
   value.
2. Google returns the browser to `/portal/auth/google/callback`, which posts
   the `code`, the `state` and the cookie's value to
   `POST /auth/google/callback`.
3. The API pulls the state (`Cache::pull` — one attempt, whatever happens),
   refuses unless the redirect address and the value match what it stored,
   exchanges the code at Google's token endpoint, and checks the ID token's
   issuer, audience, expiry and nonce.

- **The state is single-use and server-side**, so a callback cannot be
  replayed.
- **The attempt belongs to the browser that began it.** Without the cookie
  value, somebody finishes the consent with *their* Google account and hands
  a victim the callback link; the victim is then signed in as the attacker
  and whatever they type lands in an account somebody else reads. A callback
  from another browser is refused **before Google is asked anything**, and
  spends the attempt.
- **The redirect address is this site's own callback and nothing else** —
  `CallbackPath::assert()` with `/portal/auth/google/callback`, the check
  every other OAuth round trip here uses.

**The ID token's signature is not verified, deliberately.** It arrives
directly from Google's token endpoint over TLS, in exchange for the code and
this site's own client secret; OpenID Connect Core §3.1.3.7 allows the TLS
server check to stand in for the signature in exactly that case. So there is
no key set to fetch and no JWT library. The claims are still checked.

**Who it is, in order.**

1. The customer already linked to that Google account — `customers.google_sub`,
   Google's own stable id, so a customer who has since changed their address
   here is still found.
2. The customer at the address Google has **verified**, linked from then on.
   A verified Google address is the proof a sign-in code is: control of the
   mailbox. An address Google has not verified finds nobody and makes
   nothing.
3. Nobody — so a new account, while `registration_enabled` is on. It is born
   confirmed and `active` or `pending` exactly as the registration form
   decides (`customer_approval_required`). With registration closed the
   answer is 403 `registration_closed`; saying "no account uses that
   address" here is not the membership oracle `/auth/register` refuses to
   be, because it is said only to somebody Google has just confirmed owns
   the address.

**A first confirmation is `markEmailVerified()`, like every other.** An
unconfirmed account at that address — which anybody could have registered,
choosing its password — has that password replaced, its sessions ended and
the address's paid guest orders joined to it. And the desk is told
(`CustomerRegistered`, the `customer.registered` webhook), because the
approval queue is fed by nothing else.

**Google vouches for its own address and no other.** A customer linked
earlier who has moved their account to a new, unconfirmed address is found
by `google_sub` and refused `email_unverified`: signing in to Google proves
nothing about the new mailbox.

**The account's status still decides**, through the same private helpers a
password and a code use: pending waits, rejected and suspended are refused,
and `portal_enabled` off closes this door with the others (the `portal`
middleware is on both routes).

**What the site is told is one bit.** The client ID, the secret and the
switch are the private `google_login` group; `/settings` publishes
`google_login_live` — the switch *and* both halves of the client — so a
button is never drawn for a sign-in that cannot finish. `customers.google_sub`
is in no response; the customer's own resource and the console's carry
`google_linked`.

**The callback address is built on the browser's origin, not `siteUrl()`**
(`lib/google-redirect.ts`). `siteUrl()` is the production domain on every
machine, so the first cut sent a developer's browser back to the live site,
where the binding cookie does not exist — found by the probe, which reads
the redirect. The host is read `x-forwarded-host` first, the way `proxy.ts`
reads it; a caller who lies about `Host` is refused by `CallbackPath`. The
console's settings note shows the same address with a Copy button, read in
the browser for the same reason.

**On the page.** `GoogleButton` (`components/auth/`) is `ButtonAnchor` — a
plain `<a>`, because a `next/link` would prefetch the handler and mint an
attempt per render — with Google's "G" drawn from the `--color-g-*` tokens.
`SignInForm` takes it as `before`, rendered by the server and handed in, so
the shared client form knows nothing about Google and the console passes
nothing. The registration screen draws the same button as "Sign up with
Google". A round trip that does not end signed in lands on
`/portal/login?google=<key>`, and the sentence is a lookup
(`GOOGLE_NOTICES`), never text from the URL. The session cookie is set on
the redirect response (`SESSION_COOKIE`), fourteen days.

**Not built**: Microsoft sign-in (asked for and then withdrawn by the
client), Google sign-in for staff, unlinking from the portal (a linked
customer can still sign in with a code or a password), and Google One Tap.

`GoogleSignInTest` (23, Google `Http::fake()`d). `scripts/probes/google-signin.mjs`
drives the screens and reads the redirect without contacting Google. **A
real sign-in has not been driven end to end here**: it needs the client's
own OAuth client, and is the one check left for them to make.
