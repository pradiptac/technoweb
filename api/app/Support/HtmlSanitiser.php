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

    /**
     * Rich text as a single line of plain text, for meta descriptions and the
     * plain-text half of a notification email.
     *
     * strip_tags on its own is wrong for this, and quietly so: it deletes a
     * tag without leaving anything in its place, so the end of one block runs
     * straight into the start of the next. A downloads page whose body was
     * "…asked for.</p><h2>Remote support</h2><p>When an engineer…" published a
     * meta description reading "…asked for.Remote supportWhen an engineer…",
     * which is what a search engine showed.
     *
     * Only block-level tags become a space. Doing it for every tag would be
     * just as wrong in the other direction — "<strong>ten</strong>ths" is one
     * word and must stay one.
     */
    public static function toText(?string $html): string
    {
        if ($html === null || $html === '') {
            return '';
        }

        $blocks = 'address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure'
            .'|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody'
            .'|td|tfoot|th|thead|tr|ul';

        $spaced = preg_replace('#</?('.$blocks.')\b[^>]*>#i', ' ', $html) ?? $html;
        $text = html_entity_decode(strip_tags($spaced), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // A UTF-8 non-breaking space, which trim() leaves alone.
        $text = str_replace("\xC2\xA0", ' ', $text);

        return trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
    }

    /**
     * Elements that *are* the content, rather than containing it.
     *
     * A body holding one of these and no prose is not an empty body, and
     * discarding it because it carries no *text* is the bug this list exists
     * to stop. It was measured rather than reasoned about: an iframe survives
     * HTMLPurifier intact and this method then threw the whole result away, so
     * embedding a video and writing nothing beside it saved a null body while
     * reporting that it had saved.
     *
     * `<img` was the only entry, and was sufficient on its own only while it
     * was the only childless element the allowlist admitted. It is not any
     * more, which is the argument for a list rather than a condition.
     */
    private const CONTENTFUL_TAGS = ['<img', '<iframe', '<hr'];

    private static function isBlank(string $html): bool
    {
        foreach (self::CONTENTFUL_TAGS as $tag) {
            if (str_contains($html, $tag)) {
                return false;
            }
        }

        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // \xC2\xA0 is a UTF-8 non-breaking space, which trim() leaves alone.
        return trim(str_replace("\xC2\xA0", ' ', $text)) === '';
    }
}
