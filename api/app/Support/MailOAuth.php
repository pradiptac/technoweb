<?php

namespace App\Support;

use App\Enums\MailTransport;
use App\Models\Setting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Consent, tokens and refresh for the connected Google mailbox.
 *
 * The endpoints sit in a map keyed by transport rather than inline, so adding
 * Microsoft later is a row and a scope string. That is not speculative
 * generality — it is a table with one entry in it, and it costs nothing.
 *
 * The scope is broader than it looks and worth naming here.
 * `https://mail.google.com/` is full mailbox access: there is no send-only
 * scope that works over SMTP AUTH. `gmail.send` *is* send-only, and is
 * accepted only by the Gmail HTTP API — a different transport. That trade is
 * written down rather than discovered during a security review.
 */
class MailOAuth
{
    /** Refresh this long before the token actually expires. */
    private const SKEW_SECONDS = 300;

    /**
     * @return array{auth: string, token: string, scope: string, host: string, port: int, revoke: ?string}
     */
    public static function provider(MailTransport $transport): array
    {
        return match ($transport) {
            MailTransport::Google => [
                'auth' => 'https://accounts.google.com/o/oauth2/v2/auth',
                'token' => 'https://oauth2.googleapis.com/token',
                // Full mailbox access, because SMTP XOAUTH2 accepts nothing
                // narrower. See the class docblock.
                'scope' => 'https://mail.google.com/',
                'host' => 'smtp.gmail.com',
                'port' => 587,
                'revoke' => 'https://oauth2.googleapis.com/revoke',
            ],
            default => throw new RuntimeException("{$transport->value} does not connect a mailbox."),
        };
    }

    /**
     * Where to send the administrator, and the state proving they came back
     * from where we sent them.
     *
     * The state is random, stored server-side on a short TTL, and spent on
     * use. Without it the callback accepts an authorisation code from
     * anywhere: someone who can get an administrator's browser to open that
     * URL connects *their* mailbox as this site's sender, and every ticket
     * notification then leaves through it.
     *
     * @return array{url: string, state: string}
     */
    public static function authorizeUrl(MailTransport $transport, string $redirectUri): array
    {
        $config = self::provider($transport);
        $clientId = trim((string) Setting::get('oauth_client_id'));

        if ($clientId === '') {
            throw new RuntimeException('Save the client ID and secret before connecting an account.');
        }

        $state = bin2hex(random_bytes(24));
        Cache::put(self::stateKey($state), [
            'transport' => $transport->value,
            'redirect' => $redirectUri,
        ], now()->addMinutes(15));

        $query = [
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => $config['scope'],
            'state' => $state,
            // Google returns a refresh token only when asked, and only when
            // consent is actually re-granted — so a second connection without
            // `prompt=consent` succeeds and stores nothing usable, which looks
            // exactly like a bug in this code.
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
        ];

        return ['url' => $config['auth'].'?'.http_build_query($query), 'state' => $state];
    }

    /** @return array{transport: MailTransport, redirect: string} */
    public static function consumeState(string $state): array
    {
        $stored = Cache::pull(self::stateKey($state));

        if (! is_array($stored) || ! isset($stored['transport'], $stored['redirect'])) {
            throw new RuntimeException('That connection link has expired or was already used. Start again from Settings.');
        }

        return [
            'transport' => MailTransport::from($stored['transport']),
            'redirect' => $stored['redirect'],
        ];
    }

    /**
     * Swap the authorisation code for tokens and keep what is worth keeping.
     *
     * The access token is cached rather than stored: it lives an hour, and a
     * settings row is the wrong home for something that expires before most
     * people finish reading the page it is on.
     */
    public static function exchange(MailTransport $transport, string $code, string $redirectUri): string
    {
        $config = self::provider($transport);

        $response = Http::asForm()->timeout(15)->post($config['token'], [
            'client_id' => trim((string) Setting::get('oauth_client_id')),
            'client_secret' => (string) Setting::get('oauth_client_secret'),
            'code' => $code,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
        ]);

        $body = $response->json() ?? [];

        if ($response->failed() || ! isset($body['refresh_token'])) {
            throw new RuntimeException(self::describe(
                $body,
                $response->status(),
                'No refresh token came back. Google sends one only on a fresh consent — remove this app under your Google account\'s third-party access and connect again.',
            ));
        }

        $email = self::identify($body);

        Setting::put('oauth_refresh_token', $body['refresh_token']);
        Setting::put('oauth_account', $email);
        Setting::put('oauth_connected_at', now()->toIso8601String());
        Setting::put('mail_error', null);

        self::cacheAccessToken($body);

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
    public static function accessToken(MailTransport $transport): string
    {
        $cached = self::usableToken(Cache::get(self::tokenKey()));

        if ($cached !== null) {
            return $cached;
        }

        return Cache::lock(self::tokenKey().':lock', 20)->block(10, function () use ($transport) {
            // Whoever held the lock may have refreshed it while we waited.
            $fresh = self::usableToken(Cache::get(self::tokenKey()));

            return $fresh ?? self::refresh($transport);
        });
    }

    public static function refresh(MailTransport $transport): string
    {
        $config = self::provider($transport);
        $refreshToken = (string) Setting::get('oauth_refresh_token');

        if ($refreshToken === '') {
            throw new RuntimeException('No mailbox is connected.');
        }

        $response = Http::asForm()->timeout(15)->post($config['token'], [
            'client_id' => trim((string) Setting::get('oauth_client_id')),
            'client_secret' => (string) Setting::get('oauth_client_secret'),
            'refresh_token' => $refreshToken,
            'grant_type' => 'refresh_token',
        ]);

        $body = $response->json() ?? [];

        if ($response->failed() || ! isset($body['access_token'])) {
            $why = self::describe($body, $response->status(), 'The mailbox connection was refused.');
            self::fail($why);

            throw new RuntimeException($why);
        }

        // Google rotates the refresh token on some accounts and not others.
        // Storing the new one when it appears is the difference between a
        // connection that lasts and one that dies at the next rotation.
        if (isset($body['refresh_token']) && $body['refresh_token'] !== $refreshToken) {
            Setting::put('oauth_refresh_token', $body['refresh_token']);
        }

        self::cacheAccessToken($body);
        Setting::put('mail_error', null);

        return $body['access_token'];
    }

    public static function disconnect(): void
    {
        $transport = MailTransport::current();
        $refreshToken = (string) Setting::get('oauth_refresh_token');

        // Best effort. A revoke that fails must not stop us forgetting the
        // token locally, or the screen will refuse to let go of a credential
        // it can no longer use.
        if ($transport->isOAuth() && $refreshToken !== '') {
            $revoke = self::provider($transport)['revoke'];

            if ($revoke !== null) {
                try {
                    Http::asForm()->timeout(10)->post($revoke, ['token' => $refreshToken]);
                } catch (\Throwable $e) {
                    Log::warning('Could not revoke the mail token upstream', ['error' => $e->getMessage()]);
                }
            }
        }

        Setting::put('oauth_refresh_token', null);
        Setting::put('oauth_account', null);
        Setting::put('oauth_connected_at', null);
        Setting::put('mail_error', null);
        Cache::forget(self::tokenKey());
    }

    /**
     * Record why mail stopped working, somewhere a person will see it.
     *
     * `Notifier` swallows send failures on purpose — a committed ticket must
     * still answer 201 when mail is down. That is right for SMTP, where a
     * failure means an outage. It is not enough here: a refresh token expiring
     * is not a fault but a certainty, and without this the console looks
     * perfectly healthy while every receipt silently stops arriving. The only
     * other trace is a log line, under a shipped LOG_LEVEL of warning.
     */
    public static function fail(string $message): void
    {
        Setting::put('mail_error', trim($message).' — '.now()->toDayDateTimeString());
        Cache::forget(self::tokenKey());
    }

    private static function usableToken(mixed $cached): ?string
    {
        return is_array($cached)
            && isset($cached['token'], $cached['expires'])
            && $cached['expires'] > time() + self::SKEW_SECONDS
                ? (string) $cached['token']
                : null;
    }

    private static function cacheAccessToken(array $body): void
    {
        $lifetime = (int) ($body['expires_in'] ?? 3600);

        Cache::put(self::tokenKey(), [
            'token' => $body['access_token'],
            'expires' => time() + $lifetime,
        ], now()->addSeconds(max(60, $lifetime)));
    }

    /**
     * Which address was connected.
     *
     * From the id_token when one arrives — it is signed by Google and comes
     * with the tokens, so it costs no extra request. The mail scope does not
     * ask for a profile, so usually one will not, and the fallback is what the
     * administrator has already typed. The claim is read rather than verified:
     * it decides what to print on a settings screen, and the token it arrived
     * with is the thing that actually authenticates.
     */
    private static function identify(array $body): string
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

        return (string) (Setting::get('mail_from_address') ?: Setting::get('smtp_username') ?: 'the connected mailbox');
    }

    /** Google's own words when it gives any, ours when it does not. */
    private static function describe(array $body, int $status, string $fallback): string
    {
        $description = $body['error_description'] ?? $body['error'] ?? null;

        return is_string($description) && $description !== ''
            ? "{$description} (HTTP {$status})"
            : "{$fallback} (HTTP {$status})";
    }

    private static function stateKey(string $state): string
    {
        return "mail-oauth-state:{$state}";
    }

    private static function tokenKey(): string
    {
        return 'mail-oauth-access-token';
    }
}
