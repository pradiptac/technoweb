<?php

namespace App\Providers;

use App\Models\Setting;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;

/**
 * Lets the SMTP details be set in the admin instead of the .env file.
 *
 * The client changes mail providers without a deploy; the alternative is
 * asking someone with server access every time. Applied at boot, before
 * anything resolves the mailer.
 *
 * `.env` stays the fallback and the source of truth when `smtp_host` is
 * blank — which matters for the very first deploy, when there is a database
 * but nobody has opened the settings screen yet, and for local development
 * where MAIL_MAILER is usually `log`.
 */
class MailSettingsProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Nothing here can be allowed to prevent the application booting. A
        // missing settings table during an early migrate, or a value that
        // will not decrypt after an APP_KEY change, must fall back to .env
        // rather than take the site down.
        try {
            $host = Setting::get('smtp_host');
        } catch (\Throwable $e) {
            return;
        }

        if (blank($host)) {
            return;
        }

        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => $host,
            'mail.mailers.smtp.port' => (int) (Setting::get('smtp_port') ?: 587),
            'mail.mailers.smtp.username' => Setting::get('smtp_username') ?: null,
            'mail.mailers.smtp.password' => Setting::get('smtp_password') ?: null,
        ]);

        // Laravel 11+ names this `scheme`; an empty value means "decide from
        // the port", which is the right behaviour for "none".
        $encryption = Setting::get('smtp_encryption');
        if (filled($encryption) && $encryption !== 'none') {
            config(['mail.mailers.smtp.scheme' => $encryption === 'ssl' ? 'smtps' : 'smtp']);
        }

        if (filled($from = Setting::get('mail_from_address'))) {
            config(['mail.from.address' => $from]);
        }

        if (filled($fromName = Setting::get('mail_from_name'))) {
            config(['mail.from.name' => $fromName]);
        }

        Log::debug('Mail configured from settings', ['host' => $host]);
    }
}
