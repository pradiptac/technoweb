<?php

namespace App\Support\Chat;

/**
 * A model's reply, read as the JSON object it was asked for.
 *
 * Every caller that wants a shape rather than prose asks for JSON mode
 * (`response_format: json_object`), and JSON mode makes a bare object
 * overwhelmingly likely and never certain. How uncertain depends on the
 * maker, which since OpenRouter (0.116.0) is no longer one company: a GPT
 * model answers with the object and nothing else, while a Gemini model
 * routinely wraps the same object in a ```json fence, and now and then
 * introduces it with a sentence — in JSON mode, with the object intact
 * inside. Telling an editor "the AI service answered in a form we could not
 * read" when the answer is sitting right there, complete, is a failure of
 * this side.
 *
 * So the reading is forgiving about the **wrapping** and not about the
 * **contents**: the text as it stands, then the inside of a code fence, then
 * the run from an opening brace to the last closing one. Whatever is found
 * must still be valid JSON, and every caller still validates it key by key
 * — nothing here repairs a truncated or malformed object, because a
 * repaired answer is one the model did not give.
 */
final class JsonReply
{
    /** How many opening braces to try before giving up on prose that happens to hold some. */
    private const MAX_STARTS = 8;

    /** @return array<mixed>|null */
    public static function decode(string $text): ?array
    {
        // A byte-order mark is not whitespace to `trim()`, and is to a JSON parser an error.
        $text = trim((string) preg_replace('/^\xEF\xBB\xBF/', '', $text));

        if ($text === '') {
            return null;
        }

        $decoded = json_decode($text, true);

        if (is_array($decoded)) {
            return $decoded;
        }

        // ```json … ``` anywhere in the reply, with or without the language
        // tag, with or without a sentence before or after it.
        if (preg_match('/```[a-z0-9_-]*[ \t]*\R?(.*?)```/is', $text, $m) === 1) {
            $decoded = json_decode(trim($m[1]), true);

            if (is_array($decoded)) {
                return $decoded;
            }
        }

        // Prose, then the object, perhaps prose after. From each opening
        // brace in turn to the last closing one: the first that parses is the
        // object, and a brace inside the introduction is only a wasted try.
        $end = strrpos($text, '}');
        $offset = 0;

        for ($i = 0; $i < self::MAX_STARTS && $end !== false; $i++) {
            $start = strpos($text, '{', $offset);

            if ($start === false || $start >= $end) {
                break;
            }

            $decoded = json_decode(substr($text, $start, $end - $start + 1), true);

            if (is_array($decoded)) {
                return $decoded;
            }

            $offset = $start + 1;
        }

        return null;
    }
}
