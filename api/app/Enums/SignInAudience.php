<?php

namespace App\Enums;

/**
 * Which sign-in a code was issued for.
 *
 * The two values are the Sanctum token names this application already uses —
 * `portal` for a customer and `admin` for a staff member — deliberately, so
 * there is one vocabulary for "which of the two principals is this about"
 * rather than a second set of words that has to be mapped to the first.
 *
 * A code carries its audience because the two principals share an address
 * space: the same person can legitimately be a customer and a staff member,
 * and an attacker can always type either address at either form. A code
 * requested at the portal must be worthless at the console, which is the
 * failure the shared `password_reset_tokens` table produced once already.
 */
enum SignInAudience: string
{
    case Portal = 'portal';
    case Admin = 'admin';

    public function label(): string
    {
        return match ($this) {
            self::Portal => 'Customer portal',
            self::Admin => 'Admin console',
        };
    }

    /** The setting that says whether codes are offered here at all. */
    public function settingKey(): string
    {
        return match ($this) {
            self::Portal => 'otp_login_enabled',
            self::Admin => 'otp_admin_login_enabled',
        };
    }
}
