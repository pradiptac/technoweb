<?php

namespace App\Support\Writing\Surfaces;

use App\Enums\Role;
use App\Models\NewsletterCampaign;
use App\Models\User;
use App\Support\HtmlSanitiser;
use App\Support\Writing\Outline;
use App\Support\Writing\Prepared;
use App\Support\Writing\Surface;
use App\Support\Writing\Writer;
use App\Support\Writing\WritingInput;
use App\Support\Writing\WritingRefused;

/** One block of a newsletter campaign, sent as JSON; only its words change. */
final class CampaignBlockSurface implements Surface
{
    public function key(): string
    {
        return 'campaign_block';
    }

    public function authorise(User $user, WritingInput $input): bool
    {
        return $user->isAdmin() || $user->hasRole(Role::CampaignManager);
    }

    public function prepare(WritingInput $input): Prepared
    {
        $campaign = NewsletterCampaign::query()->find((int) ($input->ref['campaign_id'] ?? 0));
        if ($campaign === null) {
            throw new WritingRefused('That campaign is not there.', 404);
        }
        $block = json_decode($input->text, true);
        if (! is_array($block) || ! in_array($block['type'] ?? null, ['heading', 'text', 'button', 'columns'], true)) {
            throw new WritingRefused('This kind of block has no words to write.');
        }

        $context = [
            'Campaign subject: '.(string) $campaign->subject,
            'The rest of the email: '.mb_substr(self::otherWords($campaign), 0, 2000),
        ];

        $state = ['block' => $block];
        switch ($block['type']) {
            case 'heading':
                [$content, $shape] = [(string) ($block['text'] ?? ''), '{"block": {"text": "at most 200 characters"}}'];
                break;
            case 'button':
                [$content, $shape] = [(string) ($block['label'] ?? ''), '{"block": {"label": "at most 60 characters"}}'];
                break;
            case 'columns':
                [$content, $shape] = [self::columnsPrompt($block), '{"block": {"columns": [{"heading": "…", "text": "…"}]}} — the same number of columns, in the same order'];
                break;
            default:
                $outline = Outline::fromHtml((string) ($block['html'] ?? ''), true);
                [$content, $shape] = [$outline->toPrompt(), '{"block": {"lines": [{"kind": "h2|h3|p|ul|ol|quote|locked", "text": "…"}]}}'];
                $state['outline'] = $outline;
        }

        return new Prepared($content, $context, $shape, 2000, $state);
    }

    public function rebuild(array $answer, Prepared $prepared, WritingInput $input): string
    {
        $block = $prepared->state['block'];
        $out = (array) ($answer['block'] ?? []);

        switch ($block['type']) {
            case 'heading':
                $block['text'] = self::words($out['text'] ?? '', 200, (string) ($block['text'] ?? ''));
                break;
            case 'button':
                $block['label'] = self::words($out['label'] ?? '', 60, (string) ($block['label'] ?? ''));
                break;
            case 'columns':
                $cols = array_values((array) ($out['columns'] ?? []));
                $before = $after = '';
                foreach ((array) ($block['columns'] ?? []) as $i => $col) {
                    $new = (array) ($cols[$i] ?? []);
                    $before .= ' '.($col['heading'] ?? '').' '.($col['text'] ?? '');
                    $block['columns'][$i]['heading'] = self::cutWords($new['heading'] ?? $col['heading'] ?? '', 120);
                    $block['columns'][$i]['text'] = self::cutWords($new['text'] ?? $col['text'] ?? '', 600);
                    $after .= ' '.$block['columns'][$i]['heading'].' '.$block['columns'][$i]['text'];
                }
                self::keepsPlaceholders($before, $after);
                break;
            default:
                $lines = array_values(array_filter((array) ($out['lines'] ?? []), 'is_array'));
                $block['html'] = HtmlSanitiser::clean(Outline::rebuild($lines, $prepared->state['outline']));
        }

        return (string) json_encode($block, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private static function cutWords(mixed $value, int $max): string
    {
        return SummarySurface::cut(trim(strip_tags(Writer::text($value))), $max);
    }

    private static function words(mixed $value, int $max, string $original): string
    {
        $text = self::cutWords($value, $max);
        self::keepsPlaceholders($original, $text);

        return $text;
    }

    /** @throws WritingRefused */
    private static function keepsPlaceholders(string $in, string $out): void
    {
        $found = Outline::placeholdersIn($out);
        $had = Outline::placeholdersIn($in);
        foreach ($had as $name) {
            if (! in_array($name, $found, true)) {
                throw new WritingRefused('The assistant dropped the {{'.$name.'}} placeholder. Try again.');
            }
        }
        // EmailRenderer strips an unknown {{name}} at send, which would leave a gap in a real mailing.
        foreach ($found as $name) {
            if (! in_array($name, $had, true)) {
                throw new WritingRefused('The assistant used {{'.$name.'}}, which this block does not have. Try again.');
            }
        }
    }

    /** @param array<string, mixed> $block */
    private static function columnsPrompt(array $block): string
    {
        $lines = [];
        foreach (array_values((array) ($block['columns'] ?? [])) as $i => $c) {
            $lines[] = ($i + 1).'. heading: '.($c['heading'] ?? '').' | text: '.($c['text'] ?? '');
        }

        return implode("\n", $lines);
    }

    private static function otherWords(NewsletterCampaign $campaign): string
    {
        $words = [];
        foreach ((array) $campaign->blocks as $b) {
            $words[] = trim(strip_tags((string) ($b['text'] ?? $b['html'] ?? $b['label'] ?? '')));
        }

        return implode(' ', array_filter($words));
    }
}
