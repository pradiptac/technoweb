<?php

namespace App\Support\InboundMail;

use App\Enums\InboundMailProvider;
use App\Enums\TicketPriority;
use App\Models\Setting;
use App\Models\TicketCategory;
use App\Support\OAuth\OAuthConnection;

/**
 * What Settings → Ticketing says about the support mailbox, read in one
 * place.
 *
 * Every consumer — the piper, the notifications that set a Reply-To, the
 * command that decides whether to run, the panel that draws the form — asks
 * here rather than reading `Setting::get()` with a key of its own. The
 * option lists are here too, and the settings endpoint both offers and
 * refuses from them, so a value nothing recognises cannot be saved and
 * silently fall back while looking saved.
 */
final class InboundMail
{
    /** How many messages one run will take, whatever is waiting. */
    public const BATCH = 25;

    /** The portal's own ceiling on a description; an email gets no more. */
    public const MAX_BODY = 20000;

    /**
     * The choice lists, keyed by setting. Offered as `options` on the
     * settings endpoint and enforced on write, the rule `stats_size` and
     * `schema_type` follow. `inbound_mail_provider` is added from the enum
     * by options() so there is one list of providers.
     *
     * @var array<string, list<array{value: string, label: string, description: string}>>
     */
    public const OPTIONS = [
        'inbound_mail_after' => [
            ['value' => 'move', 'label' => 'Move it to a folder', 'description' => 'Each message is moved to the folder below once it is a ticket. The right choice when people also read this inbox by hand: mail somebody opens first is still picked up.'],
            ['value' => 'seen', 'label' => 'Mark it as read', 'description' => 'Each message is marked read and left where it is. Only unread mail is looked at, so a person opening a message before the minute ticks stops it being piped.'],
        ],
        'inbound_mail_unknown_sender' => [
            ['value' => 'create', 'label' => 'Open a ticket and create a portal account', 'description' => 'An active portal account is created from the sender\'s address and name, the ticket is opened, and the acknowledgement with the reference goes back. They can sign in with a code sent to that address.'],
            ['value' => 'ignore', 'label' => 'Ignore it', 'description' => 'Only addresses that already have a portal account get tickets by email. Anything else is listed below as skipped so the desk can see it.'],
        ],
        'inbound_imap_encryption' => [
            ['value' => 'ssl', 'label' => 'SSL / TLS (port 993)', 'description' => 'The usual choice.'],
            ['value' => 'tls', 'label' => 'STARTTLS (port 143)', 'description' => 'A plain connection upgraded to TLS.'],
            ['value' => 'none', 'label' => 'None', 'description' => 'A plain connection. Only for a server on the same network.'],
        ],
    ];

    /** @return array<string, list<array{value: string, label: string, description: string}>> */
    public static function options(): array
    {
        return self::OPTIONS + [
            'inbound_mail_provider' => array_map(
                fn (InboundMailProvider $p) => ['value' => $p->value, 'label' => $p->label(), 'description' => $p->blurb()],
                InboundMailProvider::cases(),
            ),
            'inbound_mail_priority' => array_map(
                fn (TicketPriority $p) => ['value' => $p->value, 'label' => $p->label(), 'description' => 'Target first response within '.$p->slaHours().' hours.'],
                TicketPriority::cases(),
            ),
        ];
    }

    /**
     * On, and with enough configured to attempt a connection.
     *
     * The switch alone is not enough: with it on and nothing else filled in,
     * a run would fail every minute and write the same error every minute.
     * A provider whose credentials are absent reads as off.
     */
    public static function enabled(): bool
    {
        if (! self::switchedOn()) {
            return false;
        }

        $provider = self::provider();

        if ($provider === null) {
            return false;
        }

        if ($provider->isOAuth()) {
            return OAuthConnection::inbound($provider)->isConnected();
        }

        return filled(Setting::get('inbound_imap_host'))
            && filled(Setting::get('inbound_imap_username'))
            && filled(Setting::get('inbound_imap_password'));
    }

    /** The switch alone, for the panel to explain the difference. */
    public static function switchedOn(): bool
    {
        return (bool) Setting::get('inbound_mail_enabled', false);
    }

    public static function provider(): ?InboundMailProvider
    {
        return InboundMailProvider::current();
    }

    /**
     * The address customers write to.
     *
     * Typed, or failing that whatever the mailbox authenticates as — the
     * connected account for OAuth, the IMAP username when it is an address.
     * It is the Reply-To on the acknowledgement, so a customer's reply lands
     * back in the box being read, and it is on the own-address list, so a
     * copy of our own mail landing here is not read as a complaint.
     */
    public static function address(): ?string
    {
        foreach (['inbound_mail_address', 'inbound_oauth_account', 'inbound_imap_username'] as $key) {
            $value = trim((string) Setting::get($key));

            if ($value !== '' && filter_var($value, FILTER_VALIDATE_EMAIL)) {
                return strtolower($value);
            }
        }

        return null;
    }

    /** The Reply-To for ticket notifications: the mailbox, while it is being read. */
    public static function replyTo(): ?string
    {
        return self::enabled() ? self::address() : null;
    }

    public static function folder(): string
    {
        return trim((string) Setting::get('inbound_mail_folder')) ?: 'INBOX';
    }

    public static function movesProcessed(): bool
    {
        return self::choice('inbound_mail_after', 'move') === 'move';
    }

    public static function processedFolder(): string
    {
        return trim((string) Setting::get('inbound_mail_processed_folder')) ?: 'Processed';
    }

    public static function createsUnknownSenders(): bool
    {
        return self::choice('inbound_mail_unknown_sender', 'create') === 'create';
    }

    /** The default category for an emailed ticket, or null when none or a stale id. */
    public static function defaultCategoryId(): ?int
    {
        $id = (int) Setting::get('inbound_mail_category_id');

        return $id > 0 && TicketCategory::whereKey($id)->exists() ? $id : null;
    }

    public static function defaultPriority(): TicketPriority
    {
        return TicketPriority::tryFrom((string) Setting::get('inbound_mail_priority')) ?? TicketPriority::Normal;
    }

    /**
     * Every address this installation sends *as*, lower-cased.
     *
     * A message from one of these is our own mail landing in the box — the
     * desk's "New ticket" notification when `support_email` is the piped
     * address, a copy of a campaign, a bounce of our receipt — and piping it
     * would open a ticket about a ticket, once a minute, for ever. The list
     * is derived from the settings rather than typed, so a changed sender
     * address is covered the moment it is saved.
     *
     * @return list<string>
     */
    public static function ownAddresses(): array
    {
        $candidates = [
            Setting::get('mail_from_address'),
            config('mail.from.address'),
            Setting::get('support_email'),
            Setting::get('sales_email'),
            Setting::get('careers_email'),
            Setting::get('newsletter_from_email'),
            Setting::get('newsletter_reply_to'),
            Setting::get('oauth_account'),
            Setting::get('smtp_username'),
            Setting::get('inbound_mail_address'),
            Setting::get('inbound_oauth_account'),
            Setting::get('inbound_imap_username'),
        ];

        $out = [];

        foreach ($candidates as $value) {
            $value = strtolower(trim((string) $value));

            if ($value !== '' && filter_var($value, FILTER_VALIDATE_EMAIL)) {
                $out[$value] = true;
            }
        }

        return array_keys($out);
    }

    /**
     * The PHP extensions the IMAP library declares, and whether this server
     * has them. `webklex/php-imap` requires ext-zip; Composer's platform
     * check refuses to install without it, so it is normally present — but
     * an install forced past that check runs until the first connection.
     *
     * @return array<string, bool>
     */
    public static function phpRequirements(): array
    {
        return [
            'zip' => extension_loaded('zip'),
            'openssl' => extension_loaded('openssl'),
            'mbstring' => extension_loaded('mbstring'),
            'iconv' => extension_loaded('iconv'),
            'fileinfo' => extension_loaded('fileinfo'),
        ];
    }

    public static function fail(string $message): void
    {
        Setting::put('inbound_mail_error', trim($message).' — '.now()->toDayDateTimeString());
    }

    public static function clearError(): void
    {
        if (filled(Setting::get('inbound_mail_error'))) {
            Setting::put('inbound_mail_error', null);
        }
    }

    public static function touchLastRun(): void
    {
        Setting::put('inbound_mail_last_run', now()->toIso8601String());
    }

    /**
     * The mailbox the settings describe.
     *
     * For an OAuth provider the IMAP password is a fresh access token, so
     * building the mailbox can itself fail — a revoked consent surfaces here,
     * through `OAuthConnection::fail()`, as `inbound_mail_error`.
     */
    public static function mailbox(): Mailbox
    {
        $provider = self::provider() ?? InboundMailProvider::Imap;

        if ($provider->isOAuth()) {
            return new ImapMailbox([
                'host' => $provider->imapHost(),
                'port' => $provider->imapPort(),
                'encryption' => 'ssl',
                'username' => self::address() ?? (string) Setting::get('inbound_oauth_account'),
                'password' => OAuthConnection::inbound($provider)->accessToken(),
                'authentication' => 'oauth',
            ] + self::folderConfig());
        }

        return new ImapMailbox([
            'host' => trim((string) Setting::get('inbound_imap_host')),
            'port' => (int) (Setting::get('inbound_imap_port') ?: 993),
            'encryption' => self::choice('inbound_imap_encryption', 'ssl'),
            'username' => trim((string) Setting::get('inbound_imap_username')),
            'password' => (string) Setting::get('inbound_imap_password'),
            'authentication' => null,
        ] + self::folderConfig());
    }

    /** @return array{folder: string, move: bool, processed_folder: string} */
    private static function folderConfig(): array
    {
        return [
            'folder' => self::folder(),
            'move' => self::movesProcessed(),
            'processed_folder' => self::processedFolder(),
        ];
    }

    /** A stored choice, or the default when nothing valid is stored. */
    private static function choice(string $key, string $default): string
    {
        $value = (string) Setting::get($key);
        $allowed = array_column(self::options()[$key] ?? [], 'value');

        return in_array($value, $allowed, true) ? $value : $default;
    }
}
