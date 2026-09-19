<?php

namespace App\Support\InboundMail;

/**
 * Reading a reply the way a person does: which ticket it is about, and
 * where the new words stop and the quoted ones start.
 *
 * The reference is the `TW-YYYY-NNNNN` every ticket notification puts in
 * its subject, so a reply to any of them carries it back. Quoted text is
 * cut at the markers the common clients write — Gmail's "On … wrote:",
 * Outlook's "-----Original Message-----" and its underscored separator,
 * the French and German equivalents — and then trailing `>` lines go. It
 * is a heuristic and says so: when it would leave nothing, the whole text
 * is kept, because a reply that is only quoted text is still a reply.
 */
final class ReplyParser
{
    private const REFERENCE = '/\bTW-\d{4}-\d{5}\b/i';

    /** @var list<string> */
    private const QUOTE_MARKERS = [
        '/^\s*On .{0,300}?wrote:\s*$/msu',
        '/^\s*-{2,}\s*Original Message\s*-{2,}\s*$/mi',
        '/^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/mi',
        '/^\s*_{5,}\s*$/m',
        '/^\s*From:\s.+\n\s*(Sent|Date):\s/mi',
        '/^\s*Le .{0,200}? a écrit\s*:\s*$/mu',
        '/^\s*Am .{0,200}? schrieb .{0,200}?:\s*$/mu',
        '/^\s*El .{0,200}? escribió:\s*$/mu',
    ];

    /** The ticket a subject names, upper-cased, or null. */
    public static function reference(string $subject): ?string
    {
        return preg_match(self::REFERENCE, $subject, $m) ? strtoupper($m[0]) : null;
    }

    /**
     * The subject without the reference and the reply prefixes, for a mail
     * that becomes a *new* ticket despite naming an old one — otherwise the
     * new ticket's own notifications would carry two references and the
     * next reply would match the wrong one.
     */
    public static function withoutReference(string $subject): string
    {
        $s = preg_replace('/\[\s*TW-\d{4}-\d{5}\s*\]/i', ' ', $subject) ?? $subject;
        $s = preg_replace(self::REFERENCE, ' ', $s) ?? $s;
        $s = preg_replace('/^(\s*(re|fwd?|aw|sv|tr|wg)\s*:\s*)+/i', '', $s) ?? $s;
        $s = preg_replace('/\s+/', ' ', $s) ?? $s;

        return trim($s, " \t\n\r-–:");
    }

    /** The new words in a reply, with the quoted conversation cut off. */
    public static function stripQuoted(string $text): string
    {
        $text = str_replace("\r\n", "\n", $text);
        $cut = $text;

        foreach (self::QUOTE_MARKERS as $marker) {
            if (preg_match($marker, $cut, $m, PREG_OFFSET_CAPTURE)) {
                $cut = substr($cut, 0, $m[0][1]);
            }
        }

        // Trailing quoted lines, and the blank lines above them.
        $lines = explode("\n", rtrim($cut));
        while ($lines !== [] && (trim(end($lines)) === '' || str_starts_with(ltrim(end($lines)), '>'))) {
            array_pop($lines);
        }

        $result = trim(implode("\n", $lines));

        return $result !== '' ? $result : trim($text);
    }
}
