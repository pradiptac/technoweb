<?php

namespace App\Enums;

use App\Models\Setting;

/**
 * How outgoing mail leaves this application.
 *
 * An allowlist, and the single place that knows what each option needs. The
 * settings screen builds its form from `fields()`, the mail provider
 * configures Laravel from the same list, and validation refuses anything not
 * in here — so adding a transport is one case rather than a change in four
 * files that then have to agree.
 *
 * Three of these need a composer bridge, and all three are now required in
 * `composer.json` — Brevo, Mailgun and Amazon SES were asked for by name, so
 * the ~50MB `aws/aws-sdk-php` brings is a cost that has been accepted rather
 * than one to be avoided. `package()` and `isAvailable()` stay because the
 * check is about the *server*, not about this file: a deploy that has not run
 * `composer install` yet, or a vendor directory trimmed by hand, must say so
 * on the settings screen rather than fail with a class-not-found the next time
 * a ticket tries to send a receipt. Saying why before the button is pressed
 * beats failing afterwards — the same rule the media library follows when it
 * refuses to resize an SVG.
 *
 * **Every one of these also speaks plain SMTP.** Brevo, Mailgun and SES all
 * publish a host and credentials, so `Smtp` reaches any of them with no bridge
 * at all. What the API transports buy is better error reporting and immunity
 * to a host that blocks outbound 587 — which shared hosting does, and which is
 * the failure mode that is hardest to diagnose from inside the application.
 */
enum MailTransport: string
{
    case Smtp = 'smtp';
    case Google = 'google';
    case Brevo = 'brevo';
    case Mailgun = 'mailgun';
    case Ses = 'ses';
    case Log = 'log';

    public function label(): string
    {
        return match ($this) {
            self::Smtp => 'SMTP server',
            self::Google => 'Gmail or Google Workspace',
            self::Brevo => 'Brevo',
            self::Mailgun => 'Mailgun',
            self::Ses => 'Amazon SES',
            self::Log => 'Write to the log — do not send',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Smtp => 'Any provider that gives you a host, a username and a password — which is all of them, the three below included.',
            self::Google => 'Sends through a Gmail mailbox you connect below. Roughly 500 messages a day on a personal account and 2,000 on Workspace, so it suits a support desk rather than a mailing list.',
            self::Brevo => 'API key only. The free tier sends 300 a day, which is more than this site is likely to need.',
            self::Mailgun => 'API key, sending domain, and the right region. The EU endpoint is a different host and is the thing people miss.',
            self::Ses => 'Cheapest at volume and the most setup. Needs an IAM key with ses:SendRawEmail and a verified sender or domain.',
            self::Log => 'Nothing is sent. Every message is written to storage/logs/mail.log instead, which is what you want on a development machine.',
        };
    }

    /** Whether a mailbox has to be connected before this can send. */
    public function isOAuth(): bool
    {
        return $this === self::Google;
    }

    /**
     * The composer package this needs, or null when it needs none.
     *
     * SMTP and log are Symfony Mailer, which Laravel ships. Google is also
     * SMTP underneath — it needs a token, not a package. The other three are
     * in `composer.json`; this names them so the console can tell an
     * administrator what is missing when a server's vendor directory disagrees
     * with the lock file.
     */
    public function package(): ?string
    {
        return match ($this) {
            self::Brevo => 'symfony/brevo-mailer',
            self::Mailgun => 'symfony/mailgun-mailer',
            self::Ses => 'aws/aws-sdk-php',
            default => null,
        };
    }

    /**
     * A class from that package, so "is it installed" is a fact, not a guess.
     *
     * Each names the class the send path actually constructs — the one Brevo's
     * `Mail::extend` news up, the factory Laravel's Mailgun driver calls, the
     * client its SES driver wraps. Probing some other class from the same
     * package would answer a slightly different question than the one being
     * asked, which is "will building this transport work".
     */
    private function probeClass(): ?string
    {
        return match ($this) {
            self::Brevo => 'Symfony\\Component\\Mailer\\Bridge\\Brevo\\Transport\\BrevoApiTransport',
            self::Mailgun => 'Symfony\\Component\\Mailer\\Bridge\\Mailgun\\Transport\\MailgunTransportFactory',
            self::Ses => 'Aws\\Ses\\SesClient',
            default => null,
        };
    }

    public function isAvailable(): bool
    {
        $probe = $this->probeClass();

        return $probe === null || class_exists($probe);
    }

    /** What to run on the server. Shown in the UI beside a disabled option. */
    public function installCommand(): ?string
    {
        $package = $this->package();

        return $package === null ? null : "composer require {$package}";
    }

    /**
     * The settings this transport reads.
     *
     * The screen renders exactly these and hides the rest: twelve mail fields
     * on one panel with four of them relevant is a form where "have I filled
     * this in" has no answer. `mail_from_address` and `mail_from_name` are
     * deliberately absent — every transport uses them, so they sit outside the
     * switch.
     *
     * @return array<int, string>
     */
    public function fields(): array
    {
        return match ($this) {
            self::Smtp => ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_encryption'],
            self::Google => ['oauth_client_id', 'oauth_client_secret'],
            self::Brevo => ['mail_api_key'],
            self::Mailgun => ['mail_api_key', 'mailgun_domain', 'mailgun_endpoint'],
            self::Ses => ['ses_key', 'ses_secret', 'ses_region'],
            self::Log => [],
        };
    }

    public function usesField(string $key): bool
    {
        return in_array($key, $this->fields(), true);
    }

    /** Every mail field any transport can use, for the settings form. */
    public static function allFields(): array
    {
        return collect(self::cases())->flatMap(fn (self $t) => $t->fields())->unique()->values()->all();
    }

    public static function current(): self
    {
        return self::tryFrom((string) Setting::get('mail_transport')) ?? self::Smtp;
    }
}
