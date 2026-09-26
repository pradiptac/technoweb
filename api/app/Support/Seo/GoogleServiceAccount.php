<?php

namespace App\Support\Seo;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * The one Google credential, and the token exchange every Google read
 * shares.
 *
 * Search Console and Analytics are two APIs behind one service account:
 * the same JSON key file (`gsc_service_account`, encrypted, never shown
 * again) is added to the Search Console property as a user and to the GA4
 * property as a Viewer, and each read asks for an access token in its own
 * scope. This is the exchange `SearchConsole` carried until GA4 needed it
 * too, moved out unchanged: a service account signs its own JWT (RS256
 * through `openssl_sign`) and trades it for an hour's token at Google's
 * token endpoint — forty lines against the ~50MB `google/apiclient` would
 * add to every deploy, the `aws/aws-sdk-php` argument.
 *
 * A token is cached for fifty minutes **per scope**, keyed on the scope:
 * a Search Console token does not open the Data API, so the two cannot
 * share one entry, and a token for a scope this class has never been
 * asked for is a call it has never made.
 */
class GoogleServiceAccount
{
    public const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    public const SETTING = 'gsc_service_account';

    /**
     * The `project_id` Google wrote into a key file, or null — FCM's send
     * URL is addressed by project.
     */
    public static function projectId(string $setting = self::SETTING): ?string
    {
        $account = json_decode((string) Setting::get($setting), true);
        $id = is_array($account) ? ($account['project_id'] ?? null) : null;

        return is_string($id) && $id !== '' ? $id : null;
    }

    /** Forget a cached token, after a key file is replaced. */
    public static function forget(string $scope, string $setting = self::SETTING): void
    {
        Cache::forget('seo:google:token:'.md5($scope).($setting === self::SETTING ? '' : ':'.$setting));
    }

    /**
     * Whether a key file is saved at all — each API adds its own condition on top.
     *
     * `$setting` names the row: Search Console and GA4 share `gsc_service_account`,
     * while RCS Business Messaging and Firebase Cloud Messaging each read their own
     * (`rcs_rbm_service_account`, `push_fcm_service_account`), because those are
     * different Google projects more often than not.
     */
    public static function configured(string $setting = self::SETTING): bool
    {
        return filled(Setting::get($setting));
    }

    /**
     * An hour's access token for the service account in one scope, cached
     * for fifty minutes. Throws with a sentence a person can act on when
     * the key is not Google's file, cannot be read, or Google refuses it.
     */
    public static function accessToken(string $scope, string $setting = self::SETTING): string
    {
        // The key file is part of the cache key as well as the scope: two
        // service accounts asking for one scope are two tokens.
        $key = 'seo:google:token:'.md5($scope).($setting === self::SETTING ? '' : ':'.$setting);

        return Cache::remember($key, now()->addMinutes(50), function () use ($scope, $setting) {
            $account = json_decode((string) Setting::get($setting), true);

            if (! is_array($account) || empty($account['client_email']) || empty($account['private_key'])) {
                throw new RuntimeException('The service account key is not the JSON file Google issued: it needs client_email and private_key.');
            }

            $now = time();
            $encode = fn (array $part) => rtrim(strtr(base64_encode(json_encode($part, JSON_UNESCAPED_SLASHES)), '+/', '-_'), '=');
            $unsigned = $encode(['alg' => 'RS256', 'typ' => 'JWT']).'.'.$encode([
                'iss' => $account['client_email'],
                'scope' => $scope,
                'aud' => self::TOKEN_URL,
                'iat' => $now,
                'exp' => $now + 3600,
            ]);

            $signature = '';
            $key = openssl_pkey_get_private((string) $account['private_key']);

            if ($key === false || ! openssl_sign($unsigned, $signature, $key, OPENSSL_ALGO_SHA256)) {
                throw new RuntimeException('The private key in the service account file could not be read.');
            }

            $jwt = $unsigned.'.'.rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');

            $res = Http::asForm()->acceptJson()->timeout(15)->post(self::TOKEN_URL, [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            ]);

            if (! $res->ok() || ! filled($res->json('access_token'))) {
                throw new RuntimeException(self::googleWords($res->json(), $res->status()));
            }

            return (string) $res->json('access_token');
        });
    }

    /**
     * Google's own sentence, which says what to fix — a property the
     * account cannot see, an expired key, a quota spent.
     */
    public static function googleWords(mixed $json, int $status): string
    {
        $message = is_array($json) ? ($json['error']['message'] ?? $json['error_description'] ?? $json['error'] ?? null) : null;

        return is_string($message) && $message !== '' ? "Google answered {$status}: {$message}" : "Google answered {$status}.";
    }
}
