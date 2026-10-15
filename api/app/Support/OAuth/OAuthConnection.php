<?php

namespace App\Support\OAuth;

use App\Enums\InboundMailProvider;
use App\Enums\MailTransport;
use App\Models\Setting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Consent, tokens and refresh for one connected mailbox.
 *
 * There are two of them now — the mailbox outgoing mail leaves through, and
 * the one support tickets are read from — and they must not share anything:
 * not the settings rows, not the cached access token, not the `state` a
 * consent round trip is proved by. So everything that used to be a string
 * literal in `MailOAuth` is constructor state here, keyed by a *slot*. A
 * state minted for one slot cannot be spent by the other, because the cache
 * key it lives under carries the slot's name.
 *
 * `MailOAuth` is the outgoing slot's facade and keeps the static API every
 * caller had; nothing on that side changed shape.
 *
 * The scope is broader than it looks and worth naming here.
 * `https://mail.google.com/` is full mailbox access: there is no send-only
 * scope that works over SMTP AUTH, and no read-only one that works over IMAP
 * XOAUTH2 either. That trade is written down rather than discovered during a
 * security review. Microsoft's `IMAP.AccessAsUser.All` is the IMAP-only
 * equivalent, and `offline_access` is what makes a refresh token come back.
 */
final class OAuthConnection
{
    /** Refresh this long before the token actually expires. */
    private const SKEW_SECONDS = 300;

    /**
     * @param  string  $prefix  settings key prefix — `oauth_` or `inbound_oauth_`
     * @param  string  $slot  cache namespace — `mail` or `inbound`
     * @param  string  $errorKey  the `*_error` settings row a refusal is written to
     * @param  list<string>  $fallbackAccountKeys  settings read, in order, when the token carries no address
     * @param  ?string  $credentialsPrefix  where the client id and secret live when a slot borrows
     *                                      another's app registration; null means its own prefix
     * @param  string  $noun  what is connected, in the refusals a person reads — `mailbox`, `Google Drive`
     */
    public function __construct(
        public readonly OAuthProvider $provider,
        public readonly string $scope,
        public readonly string $prefix,
        public readonly string $slot,
        public readonly string $errorKey,
        public readonly ?string $tenant = null,
        public readonly array $fallbackAccountKeys = [],
        public readonly ?string $credentialsPrefix = null,
        public readonly string $noun = 'mailbox',
    ) {}

    /** The mailbox outgoing mail leaves through. Google only, as it always was. */
    public static function outgoing(MailTransport $transport): self
    {
        if ($transport !== MailTransport::Google) {
            throw new RuntimeException("{$transport->value} does not connect a mailbox.");
        }

        return new self(
            provider: OAuthProvider::Google,
            scope: 'https://mail.google.com/',
            prefix: 'oauth_',
            slot: 'mail',
            errorKey: 'mail_error',
            fallbackAccountKeys: ['mail_from_address', 'smtp_username'],
        );
    }

    /**
     * The mailbox tickets are read from.
     *
     * `openid email` is asked for here and not on the outgoing side, because
     * XOAUTH2 over IMAP authenticates as an *address*, and the administrator
     * may not have typed one anywhere — the consent is the only place it can
     * come from with certainty.
     */
    public static function inbound(InboundMailProvider $provider): self
    {
        $oauth = $provider->oauthProvider()
            ?? throw new RuntimeException("{$provider->label()} does not use OAuth.");

        return new self(
            provider: $oauth,
            scope: self::mailboxScope($oauth),
            prefix: 'inbound_oauth_',
            slot: 'inbound',
            errorKey: 'inbound_mail_error',
            tenant: $oauth === OAuthProvider::Microsoft ? (string) Setting::get('inbound_oauth_tenant') : null,
            fallbackAccountKeys: ['inbound_mail_address', 'inbound_imap_username'],
        );
    }

    /**
     * What reading a mailbox over IMAP asks for. A provider that has no
     * mailbox to read — Zoho here is Zoho Books — is refused rather than
     * given a scope that would be granted and then do nothing.
     */
    private static function mailboxScope(OAuthProvider $provider): string
    {
        return match ($provider) {
            OAuthProvider::Google => 'https://mail.google.com/ openid email',
            OAuthProvider::Microsoft => 'https://outlook.office365.com/IMAP.AccessAsUser.All offline_access openid email',
            OAuthProvider::Zoho => throw new RuntimeException('Zoho does not connect a mailbox.'),
        };
    }

    /**
     * The mailbox a subscriber import scans.
     *
     * A slot of its own — its own token, its own state namespace, its own
     * error row — that borrows the *app registration* saved under Settings →
     * Ticketing (`inbound_oauth_client_id/secret/tenant`): one OAuth client
     * with two callback addresses, rather than two clients to keep. The
     * consent it holds is spent by one scan and forgotten when the scan ends;
     * the newsletter never keeps a standing connection to anybody's inbox.
     */
    public static function newsletter(InboundMailProvider $provider): self
    {
        $oauth = $provider->oauthProvider()
            ?? throw new RuntimeException("{$provider->label()} does not use OAuth.");

        return new self(
            provider: $oauth,
            scope: self::mailboxScope($oauth),
            prefix: 'newsletter_oauth_',
            slot: 'newsletter',
            errorKey: 'newsletter_oauth_error',
            tenant: $oauth === OAuthProvider::Microsoft ? (string) Setting::get('inbound_oauth_tenant') : null,
            fallbackAccountKeys: [],
            credentialsPrefix: 'inbound_oauth_',
        );
    }

    /**
     * The Google Drive backups are kept in (2026-09-27, `docs/backups.md`).
     *
     * `drive.file` is the narrowest scope Drive offers — the files this
     * application created and nothing else — so a leaked token reads the
     * backups and not the rest of somebody's Drive. `openid email` names the
     * account on the settings screen. Its own client id and secret: a Drive
     * consent is not a mailbox's, and borrowing another slot's registration
     * would make removing one quietly break the other.
     */
    public static function backupDrive(): self
    {
        return new self(
            provider: OAuthProvider::Google,
            scope: 'https://www.googleapis.com/auth/drive.file openid email',
            prefix: 'backup_gdrive_oauth_',
            slot: 'backup-drive',
            errorKey: 'backup_gdrive_error',
            noun: 'Google Drive',
        );
    }

    /**
     * The Google Workspace calendar every online meeting is organised on
     * (2026-09-29, `docs/meetings.md`, "Google Calendar").
     *
     * `calendar.events` writes the events the application organises;
     * `calendar.events.freebusy` is the scope that reads *other people's*
     * free/busy — `calendar.freebusy` reaches only the connected account's
     * own calendar, and every host's busy times are what block a slot.
     * `openid email` names the account, which is also what an event is
     * checked against later: an event made under another account is never
     * touched again. Its own client id and secret, the Drive slot's reasoning.
     */
    public static function meetingsCalendar(): self
    {
        return new self(
            provider: OAuthProvider::Google,
            scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy openid email',
            prefix: 'meetings_google_oauth_',
            slot: 'meetings-calendar',
            errorKey: 'meetings_google_error',
            noun: 'Google Calendar',
        );
    }

    /**
     * The company's Zoho Books, where an order's invoice is made (0.134.0,
     * docs/store.md "Zoho Books invoices").
     *
     * Zoho's scopes are comma-separated and per resource and verb: invoices
     * are created, read back (the PDF, and the look-up that stops a second
     * one being made) and marked sent; a customer is looked up by address
     * and created when absent; settings are read for the organisations and
     * the taxes the screen offers. Since 0.136.0 customer payments and
     * credit notes are created and read back, and the chart of accounts is
     * read for the deposit accounts the screen offers — `ZohoSettings::
     * SCOPE_VERSION` says which consent a connection was made under. Nothing
     * is deleted. `$dataCentre` is the region the account lives in — its own
     * client id and secret, the reasoning every slot here gives.
     */
    public static function zohoBooks(?string $dataCentre = null): self
    {
        return new self(
            provider: OAuthProvider::Zoho,
            scope: 'ZohoBooks.invoices.CREATE,ZohoBooks.invoices.READ,ZohoBooks.invoices.UPDATE,ZohoBooks.contacts.CREATE,ZohoBooks.contacts.READ,ZohoBooks.settings.READ'
                .',ZohoBooks.customerpayments.CREATE,ZohoBooks.customerpayments.READ,ZohoBooks.creditnotes.CREATE,ZohoBooks.creditnotes.READ,ZohoBooks.creditnotes.UPDATE,ZohoBooks.accountants.READ',
            prefix: 'zoho_books_oauth_',
            slot: 'zoho-books',
            errorKey: 'zoho_books_error',
            tenant: $dataCentre ?? (string) Setting::get('zoho_books_dc', 'in'),
            noun: 'Zoho Books',
        );
    }

    /** @return array{auth: string, token: string, revoke: ?string} */
    public function endpoints(): array
    {
        return $this->provider->endpoints($this->tenant);
    }

    /**
     * Where to send the administrator, and the state proving they came back
     * from where we sent them.
     *
     * The state is random, stored server-side on a short TTL, and spent on
     * use. Without it the callback accepts an authorisation code from
     * anywhere: someone who can get an administrator's browser to open that
     * URL connects *their* mailbox as this site's, and every ticket
     * notification then leaves through it — or, on the inbound side, every
     * message in their inbox becomes a ticket here.
     *
     * @param  array<string, string>  $extra  remembered with the state and handed back by consumeState()
     * @return array{url: string, state: string}
     */
    public function authorizeUrl(string $redirectUri, array $extra = []): array
    {
        $clientId = trim((string) Setting::get($this->credential('client_id')));

        if ($clientId === '') {
            throw new RuntimeException('Save the client ID and secret before connecting an account.');
        }

        $state = bin2hex(random_bytes(24));
        Cache::put($this->stateKey($state), [
            'redirect' => $redirectUri,
            'extra' => $extra,
        ], now()->addMinutes(15));

        $query = [
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => $this->scope,
            'state' => $state,
        ] + $this->provider->authorizeParams();

        return ['url' => $this->endpoints()['auth'].'?'.http_build_query($query), 'state' => $state];
    }

    /** @return array{redirect: string, extra: array<string, string>} */
    public function consumeState(string $state): array
    {
        $stored = Cache::pull($this->stateKey($state));

        if (! is_array($stored) || ! isset($stored['redirect'])) {
            throw new RuntimeException('That connection link has expired or was already used. Start again from Settings.');
        }

        return ['redirect' => (string) $stored['redirect'], 'extra' => (array) ($stored['extra'] ?? [])];
    }

    /**
     * Swap the authorisation code for tokens and keep what is worth keeping.
     *
     * The access token is cached rather than stored: it lives an hour, and a
     * settings row is the wrong home for something that expires before most
     * people finish reading the page it is on.
     */
    public function exchange(string $code, string $redirectUri): string
    {
        $response = Http::asForm()->timeout(15)->post($this->endpoints()['token'], [
            'client_id' => trim((string) Setting::get($this->credential('client_id'))),
            'client_secret' => (string) Setting::get($this->credential('client_secret')),
            'code' => $code,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
        ]);

        $body = $response->json() ?? [];

        if ($response->failed() || ! isset($body['refresh_token'])) {
            throw new RuntimeException($this->describe(
                $body,
                $response->status(),
                match ($this->provider) {
                    OAuthProvider::Google => 'No refresh token came back. Google sends one only on a fresh consent — remove this app under your Google account\'s third-party access and connect again.',
                    OAuthProvider::Microsoft => 'No refresh token came back. Check that offline_access is among the permissions granted to the app registration.',
                    OAuthProvider::Zoho => 'Zoho did not accept that. Check that the client is a "Server-based Application", that its redirect address is this site\'s, and that the data centre chosen here is the one your Zoho account is in.',
                },
            ));
        }

        $email = $this->identify($body);

        Setting::put($this->key('refresh_token'), $body['refresh_token']);
        Setting::put($this->key('account'), $email);
        Setting::put($this->key('connected_at'), now()->toIso8601String());
        Setting::put($this->errorKey, null);

        $this->cacheAccessToken($body);

        return $email;
    }

    /**
     * A valid access token, refreshed if it is close to expiring.
     *
     * Locked, because two requests refreshing at once is not hypothetical on a
     * support desk: Google issues a new refresh token on rotation and
     * invalidates the one the other request is holding, disconnecting the
     * account in a way that looks random and is very hard to reproduce.
     */
    public function accessToken(): string
    {
        $cached = $this->usableToken(Cache::get($this->tokenKey()));

        if ($cached !== null) {
            return $cached;
        }

        return Cache::lock($this->tokenKey().':lock', 20)->block(10, function () {
            // Whoever held the lock may have refreshed it while we waited.
            $fresh = $this->usableToken(Cache::get($this->tokenKey()));

            return $fresh ?? $this->refresh();
        });
    }

    public function refresh(): string
    {
        $refreshToken = (string) Setting::get($this->key('refresh_token'));

        if ($refreshToken === '') {
            throw new RuntimeException($this->noun === 'mailbox' ? 'No mailbox is connected.' : "{$this->noun} is not connected.");
        }

        $response = Http::asForm()->timeout(15)->post($this->endpoints()['token'], [
            'client_id' => trim((string) Setting::get($this->credential('client_id'))),
            'client_secret' => (string) Setting::get($this->credential('client_secret')),
            'refresh_token' => $refreshToken,
            'grant_type' => 'refresh_token',
        ]);

        $body = $response->json() ?? [];

        if ($response->failed() || ! isset($body['access_token'])) {
            $why = $this->describe($body, $response->status(), "The {$this->noun} connection was refused.");
            $this->fail($why);

            throw new RuntimeException($why);
        }

        // Google rotates the refresh token on some accounts and not others,
        // and Microsoft on every refresh. Storing the new one when it appears
        // is the difference between a connection that lasts and one that dies
        // at the next rotation.
        if (isset($body['refresh_token']) && $body['refresh_token'] !== $refreshToken) {
            Setting::put($this->key('refresh_token'), $body['refresh_token']);
        }

        $this->cacheAccessToken($body);
        Setting::put($this->errorKey, null);

        return $body['access_token'];
    }

    public function isConnected(): bool
    {
        return filled(Setting::get($this->key('refresh_token')));
    }

    public function disconnect(): void
    {
        $refreshToken = (string) Setting::get($this->key('refresh_token'));

        // Best effort. A revoke that fails must not stop us forgetting the
        // token locally, or the screen will refuse to let go of a credential
        // it can no longer use.
        $revoke = $this->endpoints()['revoke'];

        if ($revoke !== null && $refreshToken !== '') {
            try {
                Http::asForm()->timeout(10)->post($revoke, ['token' => $refreshToken]);
            } catch (\Throwable $e) {
                Log::warning('Could not revoke the mail token upstream', ['slot' => $this->slot, 'error' => $e->getMessage()]);
            }
        }

        Setting::put($this->key('refresh_token'), null);
        Setting::put($this->key('account'), null);
        Setting::put($this->key('connected_at'), null);
        Setting::put($this->errorKey, null);
        Cache::forget($this->tokenKey());
    }

    /**
     * Record why the mailbox stopped working, somewhere a person will see it.
     *
     * `Notifier` swallows send failures on purpose — a committed ticket must
     * still answer 201 when mail is down. That is right for SMTP, where a
     * failure means an outage. It is not enough here: a refresh token expiring
     * is not a fault but a certainty, and without this the console looks
     * perfectly healthy while every receipt silently stops arriving. The only
     * other trace is a log line, under a shipped LOG_LEVEL of warning.
     */
    public function fail(string $message): void
    {
        Setting::put($this->errorKey, trim($message).' — '.now()->toDayDateTimeString());
        Cache::forget($this->tokenKey());
    }

    private function key(string $suffix): string
    {
        return $this->prefix.$suffix;
    }

    /** The client id or secret: this slot's own, or the registration it borrows. */
    private function credential(string $suffix): string
    {
        return ($this->credentialsPrefix ?? $this->prefix).$suffix;
    }

    private function usableToken(mixed $cached): ?string
    {
        return is_array($cached)
            && isset($cached['token'], $cached['expires'])
            && $cached['expires'] > time() + self::SKEW_SECONDS
                ? (string) $cached['token']
                : null;
    }

    /** @param  array<string, mixed>  $body */
    private function cacheAccessToken(array $body): void
    {
        $lifetime = (int) ($body['expires_in'] ?? 3600);

        Cache::put($this->tokenKey(), [
            'token' => $body['access_token'],
            'expires' => time() + $lifetime,
        ], now()->addSeconds(max(60, $lifetime)));
    }

    /**
     * Which address was connected.
     *
     * From the id_token when one arrives — it is signed by the provider and
     * comes with the tokens, so it costs no extra request. The outgoing scope
     * does not ask for a profile, so there it usually will not, and the
     * fallback is what the administrator has already typed. The claim is read
     * rather than verified: it decides what to print on a settings screen (and,
     * on the inbound side, which address to log in as), and the token it
     * arrived with is the thing that actually authenticates.
     *
     * @param  array<string, mixed>  $body
     */
    private function identify(array $body): string
    {
        $idToken = $body['id_token'] ?? null;

        if (is_string($idToken) && substr_count($idToken, '.') === 2) {
            $payload = json_decode(base64_decode(strtr(explode('.', $idToken)[1], '-_', '+/')) ?: '', true);

            foreach (['email', 'preferred_username', 'upn'] as $claim) {
                if (is_array($payload) && filled($payload[$claim] ?? null)) {
                    return (string) $payload[$claim];
                }
            }
        }

        foreach ($this->fallbackAccountKeys as $key) {
            if (filled(Setting::get($key))) {
                return (string) Setting::get($key);
            }
        }

        return $this->noun === 'mailbox' ? 'the connected mailbox' : $this->noun;
    }

    /**
     * The provider's own words when it gives any, ours when it does not.
     *
     * @param  array<string, mixed>  $body
     */
    private function describe(array $body, int $status, string $fallback): string
    {
        $description = $body['error_description'] ?? $body['error'] ?? null;

        return is_string($description) && $description !== ''
            ? "{$description} (HTTP {$status})"
            : "{$fallback} (HTTP {$status})";
    }

    private function stateKey(string $state): string
    {
        return "{$this->slot}-oauth-state:{$state}";
    }

    private function tokenKey(): string
    {
        return "{$this->slot}-oauth-access-token";
    }
}
