<?php

namespace App\Support\Blog;

/**
 * How likely a comment is to be worth reading.
 *
 * ### Scored out of what applies, never out of everything
 *
 * The shape `SeoScore` and `LeadScore` both use: each check declares whether it
 * *applies* before whether it *passed*, and the total divides by the applicable
 * weight. A guest comment cannot earn the "has an account here" check, and
 * marking every guest down for it would park the whole queue in the forties
 * with nothing anybody could do — a score you cannot move is one nobody looks
 * at twice.
 *
 * ### Nothing is filed on it
 *
 * **This never decides anything.** A comment scoring 4 lands in the queue
 * beside one scoring 90, sorted no differently; the number is there so a
 * moderator working through two hundred rows knows which to read first. Auto-
 * filing eventually hides a real reader whose comment was three words, and the
 * failure is silent and permanent — the argument `LeadIntake` already makes
 * about spam, and the reason nothing here returns a "reject" verdict.
 *
 * The reasons are stored beside the number, so a figure never appears without
 * its working and stays explainable after the rubric moves.
 */
class CommentScore
{
    /** More links than this in one comment is the strongest signal there is. */
    private const LINK_CEILING = 2;

    /** Shorter than this is "nice post", which is what a bot writes. */
    private const SUBSTANTIAL = 80;

    /**
     * Words that appear in comment spam and almost nowhere else.
     *
     * Crude, and crude is the point — the same argument `LeadScore` makes for
     * its keyword list: this is inspectable and correctable by whoever moderates,
     * which no classifier trained on a few hundred comments would be.
     */
    private const SPAM_WORDS = [
        'casino', 'viagra', 'crypto', 'forex', 'binary option', 'loan',
        'seo service', 'backlink', 'cheap', 'porn', 'escort', 'betting',
        'earn money', 'work from home', 'click here', 'buy now',
    ];

    /**
     * @param  array{body?:?string,author_email?:?string,seconds_on_page?:?int,returning?:bool,customer?:bool}  $comment
     * @return array{score:int,reasons:array<int,array<string,mixed>>}
     */
    public static function for(array $comment): array
    {
        $body = trim((string) ($comment['body'] ?? ''));
        $dwell = $comment['seconds_on_page'] ?? null;

        $checks = [
            self::check(
                'links', 'Not a link dump', 25,
                applies: true,
                passed: self::linkCount($body) <= self::LINK_CEILING,
                hint: 'More than '.self::LINK_CEILING.' links — usually an advertisement.',
            ),
            self::check(
                'spam_words', 'No spam vocabulary', 20,
                applies: true,
                passed: ! self::mentionsSpam($body),
                hint: 'Contains wording that appears almost only in comment spam.',
            ),
            self::check(
                'substantial', 'Says something', 15,
                applies: true,
                passed: mb_strlen($body) >= self::SUBSTANTIAL,
                hint: 'Under '.self::SUBSTANTIAL.' characters — too short to be a contribution.',
            ),
            self::check(
                'dwell', 'Read the page first', 15,
                // Only when the browser told us, which it does not have to.
                applies: $dwell !== null,
                passed: ($dwell ?? 0) >= 15,
                hint: 'Submitted within seconds of the page loading.',
            ),
            self::check(
                'account', 'Has an account here', 10,
                applies: true,
                passed: (bool) ($comment['customer'] ?? false),
                hint: 'A guest, which most readers are.',
            ),
            self::check(
                'returning', 'Has commented before', 10,
                applies: true,
                passed: (bool) ($comment['returning'] ?? false),
                hint: 'First comment from this address.',
            ),
            self::check(
                'not_shouting', 'Not written in capitals', 5,
                applies: mb_strlen($body) >= 20,
                passed: ! self::isShouting($body),
                hint: 'Mostly capital letters.',
            ),
        ];

        $applicable = array_sum(array_map(fn ($c) => $c['applies'] ? $c['weight'] : 0, $checks));
        $earned = array_sum(array_map(fn ($c) => $c['applies'] && $c['passed'] ? $c['weight'] : 0, $checks));

        return [
            'score' => $applicable > 0 ? (int) round($earned / $applicable * 100) : 0,
            'reasons' => $checks,
        ];
    }

    /** @return array<string, mixed> */
    private static function check(string $key, string $label, int $weight, bool $applies, bool $passed, string $hint): array
    {
        return [
            'key' => $key,
            'label' => $label,
            'weight' => $weight,
            'applies' => $applies,
            'passed' => $passed,
            // Only on a failure: a hint beside a check that passed is noise on a
            // screen somebody is scanning.
            'hint' => $applies && ! $passed ? $hint : null,
        ];
    }

    private static function linkCount(string $body): int
    {
        return preg_match_all('~https?://|www\.~i', $body);
    }

    private static function mentionsSpam(string $body): bool
    {
        $haystack = mb_strtolower($body);

        foreach (self::SPAM_WORDS as $word) {
            /*
             * Word boundaries, not `str_contains`.
             *
             * The trap the chatbot's intent list already sprang twice: "loan"
             * inside "download" and "cheap" inside nothing useful. A substring
             * match on a short word is how a firmware question got routed to the
             * support desk, and here it would score a legitimate comment down
             * for containing an ordinary English word.
             */
            if (preg_match('/\b'.preg_quote($word, '/').'/u', $haystack) === 1) {
                return true;
            }
        }

        return false;
    }

    private static function isShouting(string $body): bool
    {
        $letters = preg_replace('/[^\p{L}]/u', '', $body) ?? '';

        if ($letters === '') {
            return false;
        }

        $upper = preg_replace('/[^\p{Lu}]/u', '', $letters) ?? '';

        return mb_strlen($upper) / mb_strlen($letters) > 0.6;
    }
}
