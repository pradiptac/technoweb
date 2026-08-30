<?php

namespace App\Support\Newsletter;

use App\Models\Setting;

/**
 * What the footer says about who sent this, in one place.
 *
 * It was three: the campaign controller, the template controller and the
 * health check each read the settings themselves — and they had already drifted.
 * Two of them fell back from `newsletter_company` to `company_name` and none of
 * them fell back for the address, so a site with its postal address filled in on
 * the Contact screen had a newsletter that insisted there was no address
 * anywhere, on a check that blocks sending.
 *
 * That is the ordinary case, not a corner one: the address of the company is the
 * address of the company, and asking for it twice under two names is a trap
 * rather than a feature. `newsletter_address` stays, because a business may
 * genuinely want mail to carry a different one — a registered office, a PO box —
 * but it is now an override rather than a second obligation.
 */
class Branding
{
    /** The sender name for the footer. */
    public static function company(): ?string
    {
        return Setting::get('newsletter_company') ?: Setting::get('company_name');
    }

    /**
     * The postal address for the footer.
     *
     * Falls back to the site's own address, which is the same building.
     */
    public static function address(): ?string
    {
        return Setting::get('newsletter_address') ?: Setting::get('address');
    }

    /** @return array<string, string|null> */
    public static function all(): array
    {
        return [
            'company' => self::company(),
            'address' => self::address(),
            'logo_url' => Setting::get('logo_path') ? asset('storage/'.Setting::get('logo_path')) : null,
        ];
    }
}
