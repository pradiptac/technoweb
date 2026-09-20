<?php

namespace App\Support\Mail;

/**
 * `{{name}}` in an editor's copy, replaced with what this send knows.
 *
 * ## Why this is not `EmailRenderer::personalise()`
 *
 * That method does the same job for a campaign and reusing it looks obviously
 * right, which is why the reason for not doing so is written down here rather
 * than left to be rediscovered.
 *
 * It pre-seeds a **subscriber's** fields — `first_name`, `last_name`,
 * `company`, `email` — and falls back to "there" for a blank first name. In a
 * transactional message that means `{{first_name}}` silently becomes "there"
 * in a receipt that never offered it, and the other three resolve to empty
 * strings rather than being stripped as the unknown names they are. A
 * campaign has a subscriber; an order confirmation has an order.
 *
 * **This is a deliberate second implementation of one regex**, which is the
 * drift this codebase keeps being caught by, so both carry a comment naming
 * the other and both are tested. If a third ever appears, extract instead.
 *
 * ## Escaping
 *
 * Every value is escaped, because it lands in HTML and a customer may be
 * called `A <script>`. The exception is a value the catalogue declares as
 * `html` — an order's lines, say — which is a fragment the application built
 * rather than something a person typed. That is the same carve-out
 * `personalise()` makes for `unsubscribe_url`, and the direction that must
 * never be got backwards.
 */
class Placeholders
{
    /**
     * Fill `$template`, escaping every value except those named in `$raw`.
     *
     * @param  array<string, string>  $values
     * @param  list<string>  $raw  keys whose value is already HTML
     */
    public static function fill(string $template, array $values, array $raw = []): string
    {
        foreach ($values as $key => $value) {
            $value = (string) $value;

            if (! in_array($key, $raw, true)) {
                $value = htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            }

            // Both spellings, because an editor types whichever looks tidier
            // and a chip pasted from the palette is only ever one of them.
            $template = str_replace(['{{'.$key.'}}', '{{ '.$key.' }}'], $value, $template);
        }

        return self::strip($template);
    }

    /**
     * Fill without escaping, for a plain-text part.
     *
     * Escaping here would put `&amp;` into a message nothing will ever render
     * as HTML — which is the bug that reads as the system mangling somebody's
     * company name.
     *
     * @param  array<string, string>  $values
     */
    public static function fillText(string $template, array $values): string
    {
        foreach ($values as $key => $value) {
            $template = str_replace(['{{'.$key.'}}', '{{ '.$key.' }}'], (string) $value, $template);
        }

        return self::strip($template);
    }

    /**
     * Anything still in braces, removed.
     *
     * A name this message does not offer is a typo — `{{customer_nmae}}` — and
     * a sentence missing a word reads better than one showing its own
     * plumbing. The console warns about these on save so the typo is caught
     * where it was made rather than in somebody's inbox.
     */
    public static function strip(string $template): string
    {
        return preg_replace('/\{\{\s*[a-z0-9_]+\s*\}\}/i', '', $template) ?? $template;
    }

    /**
     * The names used in a piece of copy.
     *
     * Feeds the warning on save. It is the *used* set rather than the valid
     * one, so the controller can subtract what the message offers and name
     * only what is left.
     *
     * @return list<string>
     */
    public static function used(string $template): array
    {
        preg_match_all('/\{\{\s*([a-z0-9_]+)\s*\}\}/i', $template, $matches);

        return array_values(array_unique($matches[1]));
    }
}
