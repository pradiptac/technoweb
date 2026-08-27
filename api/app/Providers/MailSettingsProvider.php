<?php

namespace App\Providers;

use App\Enums\MailTransport;
use App\Models\Setting;
use App\Support\MailOAuth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoApiTransport;
use Symfony\Component\Mailer\Transport\Smtp\Auth\XOAuth2Authenticator;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;

/**
 * Lets outgoing mail be configured in the admin instead of the .env file.
 *
 * The client changes providers without a deploy; the alternative is asking
 * somebody with server access every time. Applied at boot, before anything
 * resolves the mailer.
 *
 * **`.env` stays the fallback, and silence stays the default.** With no
 * transport chosen nothing here fires, which matters for the first deploy —
 * there is a database but nobody has opened the settings screen — and for
 * local development, where MAIL_MAILER is usually `log`.
 */
class MailSettingsProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->registerOAuthTransport();
        $this->registerBrevoTransport();

        // Nothing here can be allowed to stop the application booting. A
        // missing settings table during an early migrate, or a value that will
        // not decrypt after an APP_KEY change, must fall back to .env rather
        // than take the site down.
        try {
            $transport = MailTransport::current();
            $configured = filled(Setting::get('mail_transport'));
        } catch (\Throwable $e) {
            return;
        }

        // Nothing chosen: leave .env alone. Legacy installs that filled in the
        // SMTP host before this selector existed are treated as having chosen
        // SMTP, so an upgrade does not silently stop sending mail.
        if (! $configured) {
            if (blank(Setting::get('smtp_host'))) {
                return;
            }

            $transport = MailTransport::Smtp;
        }

        if (! $transport->isAvailable()) {
            Log::warning('The configured mail transport is not installed', [
                'transport' => $transport->value,
                'install' => $transport->installCommand(),
            ]);

            return;
        }

        $this->applyFrom();

        match ($transport) {
            MailTransport::Smtp => $this->applySmtp(),
            MailTransport::Google => $this->applyOAuth(),
            MailTransport::Brevo => $this->applyBrevo(),
            MailTransport::Mailgun => $this->applyMailgun(),
            MailTransport::Ses => $this->applySes(),
            MailTransport::Log => $this->applyLog(),
        };
    }

    /**
     * The XOAUTH2 transport, registered whether or not it is in use.
     *
     * `Mail::extend` only defines a driver; nothing builds one until a mailer
     * named `oauth` is resolved. Registering unconditionally keeps the token
     * fetch — a network call to Google — out of the boot path and inside the
     * send, which is the only place it can be allowed to fail.
     */
    private function registerOAuthTransport(): void
    {
        Mail::extend('oauth', function (array $config) {
            $transport = MailTransport::current();
            $provider = MailOAuth::provider($transport);

            $smtp = new EsmtpTransport($provider['host'], $provider['port'], false);

            /*
             * XOAUTH2 and nothing else. Left with the default list the
             * transport would try LOGIN and PLAIN first and send the access
             * token as though it were a password — which Google rejects with
             * "Username and Password not accepted", an error that sends
             * everybody looking in exactly the wrong place.
             */
            $smtp->setAuthenticators([new XOAuth2Authenticator]);
            $smtp->setUsername((string) Setting::get('oauth_account'));
            $smtp->setPassword(MailOAuth::accessToken($transport));

            return $smtp;
        });
    }

    /**
     * Brevo, which Laravel does not know about.
     *
     * Its manager ships smtp, ses, mailgun, postmark, resend, sendmail, log
     * and the two failover drivers — and nothing else. A mailer configured as
     * `brevo` without this throws "Unsupported mail transport", which reads
     * like a missing package rather than a missing three lines.
     *
     * Guarded on the bridge being installed, because `Mail::extend` runs on
     * every boot and referencing the class when it is absent is a fatal error
     * on a machine that never chose Brevo.
     */
    private function registerBrevoTransport(): void
    {
        if (! MailTransport::Brevo->isAvailable()) {
            return;
        }

        Mail::extend('brevo', fn (array $config) => new BrevoApiTransport(
            (string) ($config['key'] ?? Setting::get('mail_api_key')),
        ));
    }

    private function applyOAuth(): void
    {
        if (blank(Setting::get('oauth_refresh_token'))) {
            Log::warning('Google is the chosen mail transport but no mailbox is connected');

            return;
        }

        config([
            'mail.default' => 'oauth',
            'mail.mailers.oauth' => ['transport' => 'oauth'],
        ]);
    }

    private function applySmtp(): void
    {
        if (blank($host = Setting::get('smtp_host'))) {
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
    }

    /**
     * Write one API transport's configuration.
     *
     * Both places, deliberately. Laravel's factories look in the mailer's own
     * config and fall back to `services.{name}`, and which of the two they read
     * differs per transport — writing one and not the other works until
     * somebody changes a mailer name.
     *
     * The caller decides whether there is anything to apply: each transport
     * needs a different set of values before it can send, and a guard here
     * would have to know all of them.
     */
    private function applyApi(string $name, array $extra): void
    {
        config([
            'mail.default' => $name,
            "mail.mailers.{$name}" => ['transport' => $name] + $extra,
            "services.{$name}" => $extra,
        ]);
    }

    private function applyBrevo(): void
    {
        if (blank($key = Setting::get('mail_api_key'))) {
            return;
        }

        $this->applyApi('brevo', ['key' => (string) $key]);
    }

    private function applyMailgun(): void
    {
        $domain = Setting::get('mailgun_domain');

        if (blank($key = Setting::get('mail_api_key')) || blank($domain)) {
            return;
        }

        $this->applyApi('mailgun', [
            /*
             * `secret`, not `key`.
             *
             * Laravel's Mailgun factory reads `$config['secret']` with no
             * default, so the obvious name produces "Undefined array key
             * 'secret'" the first time something tries to send — a PHP notice
             * about an array, from a screen that had just reported the settings
             * saved. Brevo's own transport takes `key`, which is exactly how
             * the two came to disagree.
             */
            'secret' => (string) $key,
            'domain' => (string) $domain,
            // The EU region is a different host, and a US endpoint with EU
            // credentials fails as an authentication error rather than as the
            // region mistake it is.
            'endpoint' => (string) (Setting::get('mailgun_endpoint') ?: 'api.mailgun.net'),
            'scheme' => 'https',
        ]);
    }

    private function applySes(): void
    {
        if (blank(Setting::get('ses_key')) || blank(Setting::get('ses_secret'))) {
            return;
        }

        config([
            'mail.default' => 'ses',
            'services.ses' => [
                'key' => (string) Setting::get('ses_key'),
                'secret' => (string) Setting::get('ses_secret'),
                'region' => (string) (Setting::get('ses_region') ?: 'ap-south-1'),
            ],
        ]);
    }

    /**
     * Write messages to a file of their own, at a level that survives.
     *
     * Laravel's log mailer calls `$logger->debug(...)`, and both `.env` and
     * `.env.example` ship `LOG_LEVEL=warning` — so choosing "write to the log"
     * produced a 200, a cheerful "sent" on screen, and absolutely nothing
     * anywhere on disk. Exactly the trap this project has already been caught
     * by once with the password-reset audit line.
     *
     * So it gets its own channel pinned to `debug`, and its own file. A
     * message in `mail.log` is also far easier to find than one interleaved
     * with every query and warning the application emits.
     */
    private function applyLog(): void
    {
        config([
            'logging.channels.mail' => [
                'driver' => 'single',
                'path' => storage_path('logs/mail.log'),
                'level' => 'debug',
            ],
            'mail.default' => 'log',
            'mail.mailers.log.channel' => 'mail',
        ]);
    }

    private function applyFrom(): void
    {
        if (filled($from = Setting::get('mail_from_address'))) {
            config(['mail.from.address' => $from]);
        }

        if (filled($fromName = Setting::get('mail_from_name'))) {
            config(['mail.from.name' => $fromName]);
        }
    }
}
