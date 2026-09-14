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
