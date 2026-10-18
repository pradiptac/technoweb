<?php

namespace App\Support\Writing\Surfaces;

use App\Models\User;
use App\Support\HtmlSanitiser;
use App\Support\Writing\Outline;
use App\Support\Writing\Prepared;
use App\Support\Writing\Surface;
use App\Support\Writing\WritingInput;
use App\Support\Writing\WritingRefused;

/** A rich-text body, or the selection in one. */
final class BodySurface implements Surface
{
    public const MAX_OUTPUT = 40000;

    public function key(): string
    {
        return 'body';
    }

    public function authorise(User $user, WritingInput $input): bool
    {
        return RecordRef::allows($user, $input->ref);
    }

    public function prepare(WritingInput $input): Prepared
    {
        $record = RecordRef::find($input->ref);
        $outline = Outline::fromHtml($input->text);
        $context = $record !== null ? ['Title: '.RecordRef::title($record)] : [];
        $context[] = 'Kind of page: '.str_replace('_', ' ', (string) ($input->ref['type'] ?? 'page'));

        return new Prepared(
            content: $outline->toPrompt(),
            context: $context,
            shape: '{"lines": [{"kind": "h2|h3|h4|p|ul|ol|ul2|ol2|quote|locked", "text": "…"}]} — one object per line, in order; a locked line\'s text is its [Kn] token alone; **bold** and *italic* allowed.',
            maxTokens: 6000,
            state: ['outline' => $outline],
        );
    }

    public function rebuild(array $answer, Prepared $prepared, WritingInput $input): string
    {
        $lines = array_values(array_filter((array) ($answer['lines'] ?? []), 'is_array'));
        $html = Outline::rebuild($lines, $prepared->state['outline']);
        $clean = (string) HtmlSanitiser::clean($html, HtmlSanitiser::PROFILE);

        if (mb_strlen($clean) > self::MAX_OUTPUT) {
            throw new WritingRefused('The assistant\'s answer was too long. Try Shorten, or a smaller selection.');
        }

        return $clean;
    }
}
