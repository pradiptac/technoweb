<?php

namespace App\Support\Newsletter;

use App\Enums\InboundMailProvider;
use App\Models\Setting;
use App\Models\User;
use App\Support\InboundMail\InboundMail;
use App\Support\OAuth\OAuthConnection;

/**
 * What the newsletter knows about the mailbox a subscriber import scans.
 *
 * The `InboundMail` shape for the other mailbox: one place that reads the
 * settings, so the controller, the job and the harvester agree about what
 * is connected, what counts as "our own" address, and where the consent
 * round trip comes back to.
 *
 * Unlike the ticket mailbox there is no standing connection here. A consent
 * is spent by the scan it was given for and forgotten when the scan ends
 * (`forgetConsent()`), and one-off IMAP credentials never touch a settings
 * row at all (`ScanCredentials`).
 */
final class MailboxImport
{
    public const CALLBACK = '/admin/newsletter/subscribers/import/mailbox/callback';

    /** @var list<InboundMailProvider> the two that use a consent */
    public const PROVIDERS = [InboundMailProvider::Google, InboundMailProvider::Microsoft];

    /** The provider a consent is currently held for, or null. */
    public static function connectedProvider(): ?InboundMailProvider
    {
        $provider = InboundMailProvider::tryFrom((string) Setting::get('newsletter_oauth_provider'));

        if ($provider === null || ! $provider->isOAuth()) {
            return null;
        }

        return OAuthConnection::newsletter($provider)->isConnected() ? $provider : null;
    }

    public static function oauth(InboundMailProvider $provider): OAuthConnection
    {
        return OAuthConnection::newsletter($provider);
    }

    /** The app registration lives under Settings → Ticketing; this slot borrows it. */
    public static function clientConfigured(): bool
    {
        return filled(Setting::get('inbound_oauth_client_id')) && filled(Setting::get('inbound_oauth_client_secret'));
    }

    /**
     * Let go of whatever consent is held. Called when a scan ends however it
     * ends, and from the Disconnect button — the mailbox is not needed once
     * the addresses are collected, and a token nobody needs is a token
     * nobody should hold.
     */
    public static function forgetConsent(): void
    {
        foreach (self::PROVIDERS as $provider) {
            OAuthConnection::newsletter($provider)->disconnect();
        }

        Setting::put('newsletter_oauth_provider', null);
    }

    /**
     * Every address a scan must not collect: the installation's own sending
     * addresses, every staff account, the account being scanned.
     *
     * @return list<string> lower-cased
     */
    public static function ownAddresses(?string $account = null): array
    {
        $out = InboundMail::ownAddresses();

        foreach (User::query()->pluck('email') as $email) {
            $out[] = strtolower(trim((string) $email));
        }

        if (filled($account) && filter_var($account, FILTER_VALIDATE_EMAIL)) {
            $out[] = strtolower(trim((string) $account));
        }

        return array_values(array_unique(array_filter($out)));
    }

    /**
     * The domains that are "ours", for the review's default unticking: the
     * domains of every own address plus the site's own hosts — minus the
     * freemail providers, or a Gmail mailbox would untick every Gmail contact.
     *
     * @return list<string> lower-cased
     */
    public static function ownDomains(?string $account = null): array
    {
        $domains = [];

        foreach (self::ownAddresses($account) as $email) {
            $domains[] = AddressKinds::domain($email);
        }

        foreach ([config('app.frontend_url'), config('app.url')] as $url) {
            $host = strtolower((string) parse_url((string) $url, PHP_URL_HOST));
            $domains[] = str_starts_with($host, 'www.') ? substr($host, 4) : $host;
        }

        $domains = array_filter($domains, fn (string $d) => $d !== '' && ! AddressKinds::isFreemail($d)
            && ! in_array($d, ['localhost', '127.0.0.1'], true));

        return array_values(array_unique($domains));
    }

    /** @return array<string, bool> */
    public static function phpRequirements(): array
    {
        return InboundMail::phpRequirements();
    }
}
