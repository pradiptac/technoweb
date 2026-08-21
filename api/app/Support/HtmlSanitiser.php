<?php

namespace App\Support;

use Mews\Purifier\Facades\Purifier;

/**
 * Sanitises CMS rich text on the way in.
 *
 * The frontend renders these bodies with dangerouslySetInnerHTML (see
 * web/src/components/ui/prose.tsx), so this is the only thing standing
 * between a content-manager account and script running on every visitor's
 * page. It must run on write — never on display, where the value has
 * already been persisted and may be read by something else.
 *
 * The allowlist is deliberately the exact set of tags Prose styles. Anything
 * outside it would render unstyled even if it were safe, so dropping it
 * keeps authored content inside the site's own design vocabulary as well as
 * making it safe.
 */
class HtmlSanitiser
{
    /** Purifier config key, defined in config/purifier.php. */
    private const PROFILE = 'cms';

    public static function clean(?string $html): ?string
    {
        if ($html === null) {
            return null;
        }

        $clean = trim(Purifier::clean($html, self::PROFILE));

        // An editor that has been emptied posts "<p>&nbsp;</p>" or similar
        // rather than "". Normalise that to null so `published` validation
        // and the reading-time calculation see an empty body as empty.
        return self::isBlank($clean) ? null : $clean;
    }

    private static function isBlank(string $html): bool
    {
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // \xC2\xA0 is a UTF-8 non-breaking space, which trim() leaves alone.
        return trim(str_replace("\xC2\xA0", ' ', $text)) === ''
            && ! str_contains($html, '<img');
    }
}
