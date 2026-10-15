<?php

namespace App\Support;

/**
 * What an editor may put in an `href`: a path on this site, an http(s) URL,
 * a `mailto:` or a `tel:` — and nothing else.
 *
 * One definition, because it had become five: menus, popups, content blocks
 * and the store's promo band each carried a copy of the regex, and the
 * slider and gallery link fields carried none at all, so `javascript:alert(1)`
 * saved on a slide and ran for whoever pressed it.
 *
 * **The path branch refuses a second slash or a backslash after the first.**
 * `/[^\s]*` admitted `//evil.example`, which a browser reads as
 * protocol-relative — another site, sent from ours — and `/\evil.example`,
 * which browsers normalise to the same thing. A path on this site never
 * needs either.
 */
class LinkPattern
{
    public const REGEX = '#^(/(?![/\\\\])[^\s]*|https?://[^\s]+|mailto:[^\s]+|tel:[^\s]+)$#i';

    /** A menu item may also be `#`, a heading that links nowhere. */
    public const MENU_REGEX = '#^(\#|/(?![/\\\\])[^\s]*|https?://[^\s]+|mailto:[^\s]+|tel:[^\s]+)$#i';

    /**
     * Somewhere a visitor can be *sent*: a path on this site or an http(s)
     * URL. The same two branches as above without `mailto:` and `tel:`, which
     * are things to press, not places to arrive — a form that redirected to
     * one would leave its visitor on a page that never said "sent".
     */
    public const PAGE_REGEX = '#^(/(?![/\\\\])[^\s]*|https?://[^\s]+)$#i';

    /** For a validator's rule list. */
    public const RULE = 'regex:'.self::REGEX;

    public const PAGE_RULE = 'regex:'.self::PAGE_REGEX;

    public static function allows(?string $value): bool
    {
        return is_string($value) && preg_match(self::REGEX, $value) === 1;
    }
}
