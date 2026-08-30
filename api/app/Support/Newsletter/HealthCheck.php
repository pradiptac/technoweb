<?php

namespace App\Support\Newsletter;

use App\Models\NewsletterCampaign;
use App\Models\Setting;

/**
 * A deliverability score for a campaign, out of what applies to it.
 *
 * **This is a heuristic and says so.** Nothing here fetches a spam filter's
 * opinion, because there is no such thing to fetch: inbox placement depends on
 * the sending domain's reputation, its SPF and DKIM records, the recipient's
 * own history with the sender, and rules no provider publishes. What this can
 * do is catch the things that are *reliably* held against a message and are
 * entirely within the sender's control — a missing unsubscribe link, no text
 * part, a wall of capitals — and it must not imply more than that. A score
 * presented as a guarantee is worse than no score, because somebody stops
 * looking at the things it cannot see.
 *
 * Scored out of the weight that **applies**, the same rule `SeoScore` follows:
 * a campaign with no images cannot earn or lose the alt-text check, and
 * dividing by the full set would park every plain-text-ish mailing in the
 * seventies with nothing anybody could do about it.
 */
class HealthCheck
{
    /** Above this, the send button stops warning. */
    public const GOOD = 80;

    /**
     * @return array{score: int, band: string, checks: array<int, array<string, mixed>>, failed: array<int, array<string, mixed>>}
     */
    public static function run(NewsletterCampaign $campaign): array
    {
        $html = (string) $campaign->html_content;
        $text = (string) $campaign->text_content;
        $visible = trim(preg_replace('/\s+/', ' ', strip_tags($html)) ?? '');

        $checks = [];

        /*
         * The three that are not really deliverability advice at all — they
         * are the legal minimum for a marketing email in most of the world,
         * and each is weighted so that failing one alone takes the score out
         * of the "good" band on its own.
         */
        $checks[] = self::check(
            'unsubscribe', 'An unsubscribe link', 20,
            str_contains($html, '{{unsubscribe_url}}') || str_contains($html, '/newsletter/unsubscribe/'),
            'Every marketing email must offer a way out. Add the footer block, which carries one.',
            true,
        );

        $checks[] = self::check(
            'sender', 'Sender identity', 10,
            filled($campaign->from_name) && filled($campaign->from_email),
            'Set a from name and address in Settings, so the message says who it is from.',
            true,
        );

        $checks[] = self::check(
            'address', 'A postal address', 8,
            filled(Setting::get('newsletter_address')),
            'A physical address in the footer is required by anti-spam law in several countries and is read as a trust signal everywhere else.',
            true,
        );

        $checks[] = self::check(
            'text_part', 'A plain-text version', 12,
            strlen(trim($text)) > 40,
            'A message with no text alternative is one of the strongest spam signals there is.',
            true,
        );

        $checks[] = self::check(
            'subject_length', 'Subject length', 6,
            mb_strlen((string) $campaign->subject) >= 10 && mb_strlen((string) $campaign->subject) <= 70,
            'Between 10 and 70 characters. Longer is truncated in most clients, and on a phone it is nearer 35.',
        );

        $checks[] = self::check(
            'preheader', 'A preheader', 5,
            filled($campaign->preheader),
            'Without one the client invents a preview from the first words of the body.',
        );

        // Capitals, measured over the visible text only — a base64 image or a
        // long URL in the markup would otherwise swamp the ratio.
        $letters = preg_match_all('/[A-Za-z]/', $visible);
        $capitals = preg_match_all('/[A-Z]/', $visible);
        $checks[] = self::check(
            'capitals', 'Capitals in moderation', 6,
            $letters < 40 || ($capitals / max(1, $letters)) < 0.35,
            'Long runs of capitals are the oldest spam signal there is.',
        );

        $checks[] = self::check(
            'punctuation', 'Punctuation in moderation', 4,
            ! preg_match('/[!?]{3,}|!{2,}\s*$/m', $visible),
            'Repeated exclamation marks read as shouting to a filter as well as to a person.',
        );

        // Phrases, kept short and boring on purpose: a long list produces
        // false positives on legitimate hardware marketing ("free delivery"
        // is a real offer), and a score that flags everything points nowhere.
        $spammy = self::phrases($visible);
        $checks[] = self::check(
            'phrases', 'No spam-trigger phrases', 6,
            $spammy === [],
            $spammy === [] ? null : 'Found: '.implode(', ', $spammy).'. Consider rewording.',
        );

        $links = self::links($html);
        $checks[] = self::check(
            'link_count', 'A sensible number of links', 6,
            count($links) <= 25,
            'A message with more than about 25 links reads as a link farm.',
        );

        $checks[] = self::check(
            'link_scheme', 'Links are absolute and safe', 8,
            self::allLinksAbsolute($links),
            'Every link must be a full https:// address — a relative one has nothing to resolve against in an inbox.',
            true,
        );

        $images = preg_match_all('/<img\b/i', $html);
        $checks[] = self::check(
            'image_ratio', 'Enough text for the images', 6,
            $images === 0 || mb_strlen($visible) >= 200,
            'An email that is mostly picture is a shape filters distrust, and it is unreadable with images off.',
            true,
            $images > 0,
        );

        $missingAlt = preg_match_all('/<img\b(?![^>]*\balt=)[^>]*>/i', $html);
        $checks[] = self::check(
            'alt_text', 'Every image has alt text', 5,
            $missingAlt === 0,
            $missingAlt.' image(s) have no alt text. Most clients block images by default, and the alt text is what is read instead.',
            false,
            $images > 0,
        );

        $bytes = strlen($html);
        $checks[] = self::check(
            'size', 'Message size', 6,
            $bytes < 102_400,
            'Gmail clips a message over about 102KB and hides the rest behind a link — including the unsubscribe footer.',
            true,
        );

        /*
         * An attachment is scored, not refused.
         *
         * It is a real spam signal — filters weight an unsolicited attachment
         * heavily, and every megabyte is multiplied by the size of the list —
         * but a price list or a brochure is a legitimate thing to send, and
         * blocking it would be this module deciding a business question. So it
         * warns, with the number, and only applies when there is one.
         */
        $attachment = (int) $campaign->attachment_bytes;
        $checks[] = self::check(
            'attachment_size', 'A modest attachment', 6,
            $attachment > 0 && $attachment <= 2_097_152,
            'This attachment is '.round($attachment / 1048576, 1).' MB. Filters weigh a large '
            .'attachment heavily, and it is sent once per recipient — a link to it on the site '
            .'is usually delivered better and tells you who opened it.',
            false,
            $attachment > 0,
        );

        $checks[] = self::check(
            'content', 'Something to read', 8,
            mb_strlen($visible) >= 120,
            'There is almost no text in this campaign.',
            true,
        );

        // Only the checks that apply are counted, so the denominator moves
        // with the message rather than being a constant.
        $applicable = array_values(array_filter($checks, fn ($c) => $c['applies']));
        $weight = array_sum(array_column($applicable, 'weight'));
        $earned = array_sum(array_map(fn ($c) => $c['passed'] ? $c['weight'] : 0, $applicable));

        $score = $weight === 0 ? 100 : (int) round($earned / $weight * 100);

        return [
            'score' => $score,
            'band' => $score >= self::GOOD ? 'good' : ($score >= 60 ? 'fair' : 'poor'),
            'checks' => $applicable,
            'failed' => array_values(array_filter($applicable, fn ($c) => ! $c['passed'])),
            /*
             * The blockers, separately from the score.
             *
             * A 78 that is missing an unsubscribe link is not "nearly good" —
             * it is a message that must not be sent. The send endpoint refuses
             * on this list rather than on the number, which is why the two are
             * reported separately.
             */
            'blocking' => array_values(array_map(
                fn ($c) => $c['label'],
                array_filter($applicable, fn ($c) => ! $c['passed'] && $c['blocking']),
            )),
        ];
    }

    /** @return array<int, string> */
    private static function phrases(string $text): array
    {
        $phrases = [
            'act now', 'buy direct', 'cash bonus', 'click here now', 'congratulations you',
            'earn extra cash', 'guaranteed income', 'limited time only', 'make money fast',
            'no credit check', 'once in a lifetime', 'risk free', 'this is not spam',
            'winner', 'you have been selected', '100% free',
        ];

        $lower = mb_strtolower($text);

        return array_values(array_filter($phrases, fn ($p) => str_contains($lower, $p)));
    }

    /** @return array<int, string> */
    private static function links(string $html): array
    {
        preg_match_all('/<a\b[^>]*\bhref=["\']([^"\']+)["\']/i', $html, $matches);

        return $matches[1] ?? [];
    }

    private static function allLinksAbsolute(array $links): bool
    {
        foreach ($links as $href) {
            // The placeholder is filled per recipient with an absolute URL, so
            // it is not a relative link — flagging it would make the footer
            // block fail a check it is the reason for.
            if (str_contains($href, '{{')) {
                continue;
            }

            if (! preg_match('#^(https?://|mailto:|tel:)#i', $href)) {
                return false;
            }
        }

        return true;
    }

    private static function check(
        string $key,
        string $label,
        int $weight,
        bool $passed,
        ?string $hint = null,
        bool $blocking = false,
        bool $applies = true,
    ): array {
        return [
            'key' => $key,
            'label' => $label,
            'weight' => $weight,
            'passed' => $passed,
            'hint' => $passed ? null : $hint,
            'blocking' => $blocking,
            'applies' => $applies,
        ];
    }
}
