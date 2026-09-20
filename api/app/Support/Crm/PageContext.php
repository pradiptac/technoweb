<?php

namespace App\Support\Crm;

use Illuminate\Http\Request;

/**
 * Where the form was, read off the envelope the browser posted.
 *
 * ### This cannot be read from the request, and that is the whole trap
 *
 * Every submission in this product arrives through a Next.js Server Action:
 * browser → Next server → Laravel. So `Referer` here is the Next server, and
 * `X-Forwarded-For` is a hop rather than the page. A `source_url` column filled
 * from `$request->headers->get('referer')` would record one plausible-looking
 * value for the entire site and never report an error — a whole marketing
 * attribution feature quietly measuring nothing.
 *
 * The page therefore has to say where it is, in the browser, and post it. That
 * is what `PageContextFields` on the frontend renders.
 *
 * ### Why every key starts with an underscore
 *
 * These travel in the same body as an editor-built form's own answers, and a
 * collision would let a field called `source_url` overwrite the attribution —
 * or, worse, be silently overwritten by it. A form field key is validated
 * against `^[a-z][a-z0-9_]*$`, so a name beginning with `_` **cannot be
 * created**. The collision is impossible by construction rather than forbidden
 * by a rule somebody has to remember, which is a stronger guarantee than the
 * `not_in:website` the honeypot relies on.
 *
 * Nothing here is trusted. It is a string a browser sent, so it is length-capped
 * to its column, and the path is derived here rather than accepted, so a lead
 * cannot claim to have come from a page whose URL says otherwise.
 */
class PageContext
{
    /** @return array<string, string|null> */
    public static function from(Request $request): array
    {
        $url = self::str($request, '_source_url', 2048);

        return [
            'source_url' => $url,
            // Derived from the URL rather than posted separately: two fields
            // saying where the page was is two chances to disagree, and the
            // path is what every grouping query reads.
            'source_path' => self::pathOf($url),
            'source_title' => self::str($request, '_source_title', 255),
            'referrer' => self::str($request, '_referrer', 2048),
            'utm_source' => self::str($request, '_utm_source', 255),
            'utm_medium' => self::str($request, '_utm_medium', 255),
            'utm_campaign' => self::str($request, '_utm_campaign', 255),
        ];
    }

    private static function str(Request $request, string $key, int $max): ?string
    {
        $value = $request->input($key);

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : mb_substr($value, 0, $max);
    }

    /**
     * The path and query of a URL, or null.
     *
     * The query is kept because it is often the whole point — `?utm_campaign=`
     * and a search term both live there. `parse_url` returning false for
     * something unparseable is treated as "no path" rather than as an error:
     * this is decoration on a lead that has already been accepted, and refusing
     * a genuine enquiry because its page URL was malformed would be absurd.
     */
    private static function pathOf(?string $url): ?string
    {
        if ($url === null) {
            return null;
        }

        $parts = parse_url($url);

        if ($parts === false || ! isset($parts['path'])) {
            return null;
        }

        $path = $parts['path'].(isset($parts['query']) ? '?'.$parts['query'] : '');

        return mb_substr($path, 0, 255);
    }
}
