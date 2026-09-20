<?php

namespace App\Support\OAuth;

/**
 * The two identity providers a mailbox can be connected through.
 *
 * `MailOAuth`'s docblock promised that "adding Microsoft later is a row and a
 * scope string". This is the row. What differs between the two is the
 * endpoints, the parameters that make a refresh token come back, and whether
 * a token can be revoked upstream — Microsoft has no revocation endpoint for
 * a refresh token, so disconnecting from it is a local forget and the caller
 * is told as much by the null.
 */
enum OAuthProvider: string
{
    case Google = 'google';
    case Microsoft = 'microsoft';

    public function label(): string
    {
        return match ($this) {
            self::Google => 'Google',
            self::Microsoft => 'Microsoft',
        };
    }

    /**
     * @return array{auth: string, token: string, revoke: ?string}
     */
    public function endpoints(?string $tenant = null): array
    {
        return match ($this) {
            self::Google => [
                'auth' => 'https://accounts.google.com/o/oauth2/v2/auth',
                'token' => 'https://oauth2.googleapis.com/token',
                'revoke' => 'https://oauth2.googleapis.com/revoke',
            ],
            self::Microsoft => [
                'auth' => 'https://login.microsoftonline.com/'.self::tenant($tenant).'/oauth2/v2.0/authorize',
                'token' => 'https://login.microsoftonline.com/'.self::tenant($tenant).'/oauth2/v2.0/token',
                'revoke' => null,
            ],
        };
    }

    /**
     * What each provider needs on the consent URL beyond the standard five.
     *
     * Google returns a refresh token only when asked (`access_type=offline`)
     * and only when consent is actually re-granted (`prompt=consent`) — a
     * second connection without it succeeds and stores nothing usable, which
     * looks exactly like a bug in the exchange. Microsoft returns one whenever
     * `offline_access` is in the scope; `select_account` is so an
     * administrator signed into their own account can pick the desk's.
     *
     * @return array<string, string>
     */
    public function authorizeParams(): array
    {
        return match ($this) {
            self::Google => [
                'access_type' => 'offline',
                'prompt' => 'consent',
                'include_granted_scopes' => 'true',
            ],
            self::Microsoft => [
                'response_mode' => 'query',
                'prompt' => 'select_account',
            ],
        };
    }

    /**
     * A tenant id is a GUID or a verified domain; `common` accepts any
     * account. Anything that does not look like one of those is refused
     * rather than interpolated into a URL.
     */
    private static function tenant(?string $tenant): string
    {
        $tenant = trim((string) $tenant);

        if ($tenant === '' || ! preg_match('/^[A-Za-z0-9.\-]{1,100}$/', $tenant)) {
            return 'common';
        }

        return $tenant;
    }
}
