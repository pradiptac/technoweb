<?php

namespace App\Support\Writing\Surfaces;

use App\Enums\SocialNetwork;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Entry;
use App\Models\Event;
use App\Models\User;
use App\Support\Social\SocialSubjects;
use App\Support\Social\SocialText;
use App\Support\Writing\Prepared;
use App\Support\Writing\Surface;
use App\Support\Writing\Writer;
use App\Support\Writing\WritingInput;
use App\Support\Writing\WritingRefused;

/**
 * The words of a LinkedIn or X post about a published record. Only the system asks
 * for it (Writer::runSystem): there is no endpoint, so authorise() is false.
 * `ref` is {type, id, network}; the model never writes the link, the site appends it.
 */
final class SocialSurface implements Surface
{
    public function key(): string
    {
        return 'social';
    }

    public function authorise(User $user, WritingInput $input): bool
    {
        return false;
    }

    public function prepare(WritingInput $input): Prepared
    {
        $network = SocialNetwork::tryFrom((string) ($input->ref['network'] ?? ''));
        $record = SocialSubjects::find((string) ($input->ref['type'] ?? ''), (int) ($input->ref['id'] ?? 0));
        if ($network === null || ! ($record instanceof BlogPost || $record instanceof CaseStudy || $record instanceof Event || $record instanceof Entry)) {
            throw new WritingRefused('That record is not there any more.', 404);
        }

        $rules = $network === SocialNetwork::LinkedIn
            ? 'at most 1,300 characters, short paragraphs, up to three hashtags'
            : 'at most 230 characters, at most two hashtags';

        return new Prepared(
            content: 'Title: '.SocialSubjects::title($record)."\n".SocialSubjects::kindLabel($record).' text: '.SocialSubjects::bodyText($record),
            context: ['Summary: '.SocialSubjects::summary($record)],
            shape: '{"text": "the '.$network->label().' post, plain text, '.$rules.'; no link or URL; use only facts in the article; never write [CHECK] or placeholders"}',
            maxTokens: 600,
            state: ['network' => $network->value],
        );
    }

    public function rebuild(array $answer, Prepared $prepared, WritingInput $input): string
    {
        $text = trim((string) preg_replace('~https?://\S+~u', '', strip_tags(Writer::text($answer['text'] ?? null))));
        if (str_contains($text, '[CHECK') || str_contains($text, '{{')) {
            throw new WritingRefused('The assistant left a placeholder in the post.');
        }

        // The site appends the link, so X has 280 less a space and 23 for it.
        return $prepared->state['network'] === SocialNetwork::X->value
            ? SummarySurface::cut($text, SocialText::X_LIMIT - 1 - SocialText::X_URL)
            : SummarySurface::cut($text, 3000);
    }
}
