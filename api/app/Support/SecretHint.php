<?php

namespace App\Support;

/**
 * A recognisable fragment of a saved credential, so an administrator can tell
 * WHICH key is stored without the API ever returning it.
 *
 * Only a long, single-line, typed-by-a-person API key gets one: the first 8 and
 * last 2 characters. Everything else is `null`, for a reason each:
 *
 *  - under 20 characters: eight plus two would reveal too much of the secret;
 *  - a line break: a PEM key or JSON file, whose first characters are the same
 *    in every one of them (`-----BEGIN`, `{"type"`) and so identify nothing;
 *  - `_password`: a partial password helps a guesser, and a password is chosen
 *    by a person so the fragment is worth more than for a random token;
 *  - `service_account` / `private_key`: file-shaped secrets, as above;
 *  - `_refresh_token` / `_access_token`: written by the system after an OAuth
 *    consent, never typed or pasted by a person, so there is nothing to recognise.
 */
final class SecretHint
{
    private const MIN_LENGTH = 20;

    public static function for(string $key, ?string $value): ?string
    {
        if ($value === null || preg_match('/_password$|_refresh_token$|_access_token$|service_account|private_key/', $key)) {
            return null;
        }

        $value = trim($value);

        if (mb_strlen($value) < self::MIN_LENGTH || preg_match('/[\r\n]/', $value)) {
            return null;
        }

        return mb_substr($value, 0, 8).'…'.mb_substr($value, -2);
    }
}
