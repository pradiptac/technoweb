<?php

namespace App\Support\Mail;

use App\Support\Newsletter\Branding;

/**
 * What every transactional email is wrapped in.
 *
 * The published mail theme (`resources/views/vendor/mail/**`) reads this, so
 * the logo, the company name and the postal address a receipt carries are the
 * same three facts a campaign carries. It **delegates to
 * `Newsletter\Branding`** rather than reading the settings itself: two
 * resolvers for one company name is the drift this codebase keeps being caught
 * by, and that class has already had to be written once for exactly that
 * reason — three screens were reading `newsletter_address` and `address`
 * differently, and a site with its address filled in had a newsletter
 * insisting there was none.
 *
 * **There is no unsubscribe line here, and there must never be one.** A
 * receipt, a sign-in code and a dispatch notice are not marketing: somebody
 * cannot opt out of being told their order shipped. `EmailRenderer::footer()`
 * hard-codes one because a campaign is legally obliged to carry it, which is
 * precisely why the transactional shell is a published theme rather than a
 * reuse of that block.
 */
class Shell
{
    /**
     * Where a person should land from an email.
     *
     * `app.url` is the **API**, which serves JSON and has no page to open.
     * Laravel's stock header points the logo at it, which on this deployment
     * would send every recipient to an endpoint listing. `frontend_url` is the
     * site — and it is pinned to the production domain on every machine, so a
     * test send from a laptop still links somewhere real.
     */
    public static function siteUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }

    /** The name in the header when there is no logo, and in the footer always. */
    public static function company(): string
    {
        return Branding::company() ?: (string) config('app.name');
    }

    /**
     * The mark, as an absolute URL a mail client can fetch.
     *
     * **Built on `APP_URL`**, because that is where `storage/` is served from
     * — so it has to be the public API origin for a logo to load at all. On a
     * development machine it is `127.0.0.1`, which no mail client can reach:
     * a test send will show a broken image and that is the environment rather
     * than the theme. `Branding::logoUrl()` versions it, so a replaced logo is
     * not served stale from a client's cache for ever.
     */
    public static function logoUrl(): ?string
    {
        return Branding::logoUrl();
    }

    /** The postal address, which the footer prints when there is one. */
    public static function address(): ?string
    {
        return Branding::address();
    }
}
