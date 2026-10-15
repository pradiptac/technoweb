<?php

namespace App\Support\Forms;

use App\Models\FormField;
use App\Support\HtmlSanitiser;

/**
 * One stored answer as a line of plain text.
 *
 * Two readers — the desk's notification and the CSV export — and they must
 * not print one submission two ways. A choice is printed as the **label** the
 * visitor read, because the stored value is a key an editor wrote for the
 * condition rules; a list of choices is joined; a rating says what it is out
 * of, since a bare "4" beside a label is a number of something; a tick box is
 * a word.
 *
 * Every string goes through `HtmlSanitiser::toText()`: a submission is the one
 * piece of content on this site written by an anonymous stranger, and nothing
 * typed into a public form should reach a mail client as markup.
 *
 * A file answer is its original filename, which is what `data` holds for it —
 * never a path, and never the file: an upload is fetched from the console.
 */
class AnswerText
{
    public static function for(?FormField $field, mixed $value, string $separator = ', ', int $limit = 1200): string
    {
        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        if (is_array($value)) {
            $parts = [];

            foreach ($value as $item) {
                if (is_scalar($item) && (string) $item !== '') {
                    $parts[] = self::clean($field && $field->takesOptions() ? $field->optionLabel((string) $item) : (string) $item, $limit);
                }
            }

            return implode($separator, $parts);
        }

        if (! is_scalar($value) || (string) $value === '') {
            return '';
        }

        $text = (string) $value;

        return match (true) {
            $field?->kind === 'rating' && is_numeric($value) => (int) $value.' / 5',
            $field !== null && $field->takesOptions() => self::clean($field->optionLabel($text), $limit),
            default => self::clean($text, $limit),
        };
    }

    private static function clean(string $text, int $limit): string
    {
        return str(HtmlSanitiser::toText($text))->limit($limit)->value();
    }
}
