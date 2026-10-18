<?php

namespace App\Support\Writing\Surfaces;

use App\Models\User;
use App\Support\Writing\Prepared;
use App\Support\Writing\Surface;
use App\Support\Writing\Writer;
use App\Support\Writing\WritingInput;

/** An excerpt, summary or short description: plain text, cut to the field's own length. */
final class SummarySurface implements Surface
{
    public const MAX = 600;

    public function key(): string
    {
        return 'summary';
    }

    public function authorise(User $user, WritingInput $input): bool
    {
        return RecordRef::allows($user, $input->ref);
    }

    public function prepare(WritingInput $input): Prepared
    {
        $record = RecordRef::find($input->ref); // throws WritingRefused(…, 404) for a given id that is not there
        $context = [];
        if ($record !== null) {
            $context[] = 'Title: '.RecordRef::title($record);
            $body = RecordRef::bodyText($record);
            if ($body !== '') {
                $context[] = 'The page it summarises: '.mb_substr($body, 0, 3000);
            }
        }

        return new Prepared(
            content: trim(strip_tags($input->text)),
            context: $context,
            shape: '{"text": "the new text, plain, no markup, at most '.$this->max($input).' characters"}',
            maxTokens: 500,
        );
    }

    public function rebuild(array $answer, Prepared $prepared, WritingInput $input): string
    {
        $text = trim(strip_tags(Writer::text($answer['text'] ?? null)));
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';

        return self::cut($text, $this->max($input));
    }

    private function max(WritingInput $input): int
    {
        return max(20, min(self::MAX, $input->max ?? self::MAX));
    }

    public static function cut(string $text, int $max): string
    {
        if (mb_strlen($text) <= $max) {
            return $text;
        }
        $cut = mb_substr($text, 0, $max);
        $space = mb_strrpos($cut, ' ');

        return rtrim($space !== false && $space > $max * 0.6 ? mb_substr($cut, 0, $space) : $cut, ' ,;:-');
    }
}
