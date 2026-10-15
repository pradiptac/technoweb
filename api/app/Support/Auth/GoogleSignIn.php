<?php

namespace App\Support\Auth;

use App\Models\Setting;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * "Continue with Google" for customers (0.133.0, docs/auth.md "Signing in
 * with Google").
 *
 * The ordinary OpenID Connect code flow, and nothing kept from it: Google is
 * asked who somebody is, once, and its tokens are thrown away. That is why
 * this is not an `OAuthConnection` — those hold a refresh token to go on
 * reading a mailbox or a calendar, and a sign-in has nothing to go on doing.
 *
 * Three things a round trip is held to, each closing a different door:
 *
 *   - **`state` is single-use and server-side** (`Cache::pull`), so a
 *     callback cannot be replayed and a code cannot arrive from nowhere.
 *   - **It is bound to the browser that started it.** The website keeps a
 *     random value in an httpOnly cookie and sends it at both ends; only its
 *     hash is stored. Without it an attacker completes the consent with
 *     *their* Google account and hands the victim the finished callback URL
 *     — the victim is then signed in as the attacker, and whatever they type
 *     next lands in an account somebody else reads.
 *   - **The redirect address is this site's own callback and nothing else**
 *     (`CallbackPath::assert`, at the controller), and it must be the same
 *     one at both ends.
 *
 * The ID token comes straight from Google's token endpoint over TLS, in
 * exchange for a code and this site's own secret. OpenID Connect Core
 * §3.1.3.7 allows the TLS server check to stand in for verifying the token's
 * signature in exactly that case, so no key set is fetched and no JWT
 * library is needed. The claims are still checked — issuer, audience,
 * expiry and the nonce minted with the state.
 */
final class GoogleSignIn
{
    public const CALLBACK_PATH = '/portal/auth/google/callback';

    private const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    private const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

    /** How long somebody has to get through Google's screens. */
    private const STATE_MINUTES = 10;

    /** Clock difference tolerated on the token's expiry. */
    private const SKEW_SECONDS = 300;

    /** The switch and both halves of the client: the one answer to "may this be offered". */
    public static function live(): bool
    {
        return (bool) Setting::get('google_login_enabled', false)
            && filled(self::clientId())
            && filled(Setting::get('google_login_client_secret'));
    }

    public static function clientId(): string
    {
        return trim((string) Setting::get('google_login_client_id', ''));
    }

    /**
     * Where to send the browser.
     *
     * `$binding` is the value the website put in its cookie; only its hash is
     * kept, so a read of the cache yields nothing that completes a sign-in.
     * `prompt=select_account` because a shared office machine is usually
     * signed in to somebody's Google account already, and silently using it
     * is how a colleague ends up in the wrong portal account.
     */
    public static function authorizeUrl(string $redirectUri, string $binding): string
    {
        $state = bin2hex(random_bytes(24));
        $nonce = bin2hex(random_bytes(16));

        Cache::put(self::stateKey($state), [
            'redirect_uri' => $redirectUri,
            'binding' => hash('sha256', $binding),
            'nonce' => $nonce,
        ], now()->addMinutes(self::STATE_MINUTES));

        return self::AUTHORIZE_URL.'?'.http_build_query([
            'client_id' => self::clientId(),
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'nonce' => $nonce,
            'prompt' => 'select_account',
        ]);
    }

    /**
     * Spend a callback and say who Google says this is.
     *
     * @return array{sub: string, email: string, name: string}
     *
     * @throws GoogleSignInRefused
     */
    public static function identify(string $code, string $state, string $redirectUri, string $binding): array
    {
        // Pulled, not read: a state is good for one attempt whatever happens next.
        $stored = Cache::pull(self::stateKey($state));

        if (! is_array($stored)
            || ! hash_equals((string) ($stored['redirect_uri'] ?? ''), $redirectUri)
            || ! hash_equals((string) ($stored['binding'] ?? ''), hash('sha256', $binding))) {
            throw new GoogleSignInRefused('expired', 'That sign-in attempt has expired. Start again.');
        }

        try {
            $response = Http::asForm()->connectTimeout(5)->timeout(10)->post(self::TOKEN_URL, [
                'code' => $code,
                'client_id' => self::clientId(),
                'client_secret' => (string) Setting::get('google_login_client_secret'),
                'redirect_uri' => $redirectUri,
                'grant_type' => 'authorization_code',
            ]);
        } catch (ConnectionException $e) {
            logger()->warning('Google sign-in: the token endpoint could not be reached', ['error' => $e->getMessage()]);

            throw new GoogleSignInRefused('failed', 'Google could not be reached. Try again, or sign in another way.');
        }

        if (! $response->successful()) {
            // Google's own words name the client and what is wrong with it —
            // for whoever set it up, in the log, and never for a visitor.
            logger()->warning('Google sign-in: the code was refused', [
                'status' => $response->status(),
                'error' => $response->json('error'),
                'description' => $response->json('error_description'),
            ]);

            throw new GoogleSignInRefused('failed', 'Google did not confirm that sign-in. Try again, or sign in another way.');
        }

        $claims = self::claims((string) $response->json('id_token'));

        $audience = $claims['aud'] ?? null;

        if ($claims === []
            || ! in_array($claims['iss'] ?? null, self::ISSUERS, true)
            || ! (is_array($audience) ? in_array(self::clientId(), $audience, true) : $audience === self::clientId())
            || (int) ($claims['exp'] ?? 0) < now()->timestamp - self::SKEW_SECONDS
            || ! hash_equals((string) $stored['nonce'], (string) ($claims['nonce'] ?? ''))
            || blank($claims['sub'] ?? null)) {
            logger()->warning('Google sign-in: the ID token did not check out', [
                'iss' => $claims['iss'] ?? null,
                'aud_matches' => $audience === self::clientId(),
            ]);

            throw new GoogleSignInRefused('failed', 'Google did not confirm that sign-in. Try again, or sign in another way.');
        }

        $email = Str::lower(trim((string) ($claims['email'] ?? '')));

        // An address Google has not verified proves nothing about a mailbox,
        // and the address is what an account here is found by.
        if ($email === '' || ! filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            throw new GoogleSignInRefused('unverified', 'That Google account has no confirmed email address, so we cannot sign you in with it.');
        }

        $name = trim((string) ($claims['name'] ?? ''));

        return [
            'sub' => (string) $claims['sub'],
            'email' => $email,
            // A Google account need not carry a name; an account here must.
            'name' => Str::limit($name !== '' ? $name : Str::before($email, '@'), 120, ''),
        ];
    }

    /**
     * The payload of a JWT, unverified — see the class docblock for why the
     * signature is not what is relied on here.
     *
     * @return array<string, mixed>
     */
    private static function claims(string $jwt): array
    {
        $parts = explode('.', $jwt);

        if (count($parts) !== 3) {
            return [];
        }

        $json = base64_decode(strtr($parts[1], '-_', '+/'), true);
        $claims = $json === false ? null : json_decode($json, true);

        return is_array($claims) ? $claims : [];
    }

    private static function stateKey(string $state): string
    {
        // Hashed so whatever arrives in a query string is never a cache key as typed.
        return 'google-signin:state:'.hash('sha256', $state);
    }
}
