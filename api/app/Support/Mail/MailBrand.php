<?php

namespace App\Support\Mail;

use App\Models\Setting;

/**
 * Whose name a message goes out under.
 *
 * The product is sold under each customer's own company name, so no
 * notification may name the company in a literal. The name is the
 * `company_name` setting (Settings → General), falling back to `APP_NAME`
 * for an install that has not set it.
 */
final class MailBrand
{
    public static function name(): string
    {
        $name = trim((string) Setting::get('company_name'));

        return $name !== '' ? $name : (string) config('app.name');
    }

    /** The line a message is signed with. */
    public static function signoff(): string
    {
        return '— '.self::name();
    }
}
