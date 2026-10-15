<?php

namespace App\Support\Import;

use Closure;

/**
 * Rewriting the addresses inside imported markup and sections — what the
 * WordPress links step did for its own site, as a function of "this href
 * becomes that one" so another import can supply its own.
 *
 * `$map` takes an `href` as written (entities decoded) and answers the
 * address to use instead, or null to leave the link as it is.
 */
final class LinkRewriter
{
    /** @param  Closure(string): ?string  $map */
    public static function html(string $html, Closure $map): string
    {
        return (string) preg_replace_callback('/(\bhref=")([^"]+)(")/i', function (array $m) use ($map) {
            $new = $map(html_entity_decode($m[2], ENT_QUOTES));

            return $new === null ? $m[0] : $m[1].e($new).$m[3];
        }, $html);
    }

    /**
     * A section list with every `body` rewritten as markup and every `href`
     * as a link, at any depth.
     *
     * @param  array<int|string, mixed>  $value
     * @param  Closure(string): ?string  $map
     * @return array<int|string, mixed>
     */
    public static function sections(array $value, Closure $map): array
    {
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = self::sections($item, $map);
            } elseif ($key === 'body' && is_string($item) && $item !== '') {
                $value[$key] = self::html($item, $map);
            } elseif ($key === 'href' && is_string($item) && $item !== '') {
                $value[$key] = $map($item) ?? $item;
            }
        }

        return $value;
    }
}
