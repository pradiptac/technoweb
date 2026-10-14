<?php

namespace App\Support\Copilot;

use App\Support\Chat\AiProvider;
use App\Support\Chat\JsonReply;
use App\Support\Seo\Ai\SeoAiSettings;
use App\Support\Seo\Ai\SeoAssistant;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Ask ALTIS: typed question in, one of `Questions` out (0.177.0,
 * `docs/copilot.md`).
 *
 * **The model's entire output is an index.** It is shown the questions this
 * account may ask — their labels, nothing else — and answers with one
 * number or `none`. It never sees a figure, a customer, an order or a word
 * of anybody's data; it cannot compose a query, and nothing it returns is
 * executed, interpolated or rendered. A wrong classification gives the
 * wrong answer, and the wrong answer is still a true figure with the
 * question it answers printed above it, which is a failure a person can
 * see rather than one they cannot.
 *
 * That is the whole design, and it was chosen over the alternative on one
 * argument: a copilot that writes its own queries can answer questions
 * nobody anticipated, and cannot be trusted on any of them — there is no
 * review step between the model and the number somebody acts on.
 *
 * **The rules go first and usually win.** Most questions are matched by
 * their own words with no model involved: the feature works on an install
 * with no OpenRouter key, costs nothing for the common case, and answers
 * in milliseconds. The model is the fallback for a phrasing the words miss,
 * and `source` says which answered so the console can be honest about it.
 */
final class Copilot
{
    /** Below this the rules are guessing, and the model is asked instead. */
    private const SURE = 0.45;

    /** Words that carry no signal — every question is "how many" something. */
    private const NOISE = [
        'how', 'many', 'much', 'what', 'which', 'who', 'is', 'are', 'the', 'a', 'an',
        'do', 'does', 'did', 'we', 'i', 'my', 'me', 'have', 'has', 'there', 'any',
        'of', 'to', 'in', 'on', 'for', 'and', 'or', 'show', 'tell', 'give', 'list',
        'please', 'now', 'currently', 'right',
    ];

    public function __construct(private AiProvider $provider) {}

    /**
     * Answer a typed question, or say plainly that it cannot.
     *
     * @param  list<string>  $roles
     * @return array{
     *     matched: bool, key: ?string, question: ?string, source: string,
     *     figure: mixed, sentence: string, href: ?string,
     *     suggestions: list<array{key: string, label: string}>
     * }
     */
    public function ask(string $asked, array $roles): array
    {
        $available = Questions::for($roles);
        $asked = trim($asked);

        if ($asked === '' || $available === []) {
            return self::unmatched($available);
        }

        [$question, $source] = $this->match($asked, $available);

        if ($question === null) {
            return self::unmatched($available);
        }

        $answer = $question->answer();

        return [
            'matched' => true,
            'key' => $question->key,
            'question' => $question->label,
            'source' => $source,
            'figure' => $answer['figure'],
            'sentence' => $answer['sentence'],
            'href' => $answer['href'],
            'suggestions' => [],
        ];
    }

    /**
     * The question, and how it was found: `words` or `model`.
     *
     * @param  list<Question>  $available
     * @return array{0: ?Question, 1: string}
     */
    private function match(string $asked, array $available): array
    {
        [$best, $score] = self::byWords($asked, $available);

        if ($best !== null && $score >= self::SURE) {
            return [$best, 'words'];
        }

        $chosen = $this->byModel($asked, $available);

        if ($chosen !== null) {
            return [$chosen, 'model'];
        }

        // The model was not available, or did not recognise it. A weak word
        // match is better than nothing — but only a weak one: with no match
        // at all this says so rather than answering a question nobody asked.
        return $best !== null && $score > 0 ? [$best, 'words'] : [null, 'none'];
    }

    /**
     * Score each question by how much of its vocabulary the asking uses.
     *
     * Divided by the *asking's* length, not the question's: a question
     * carries twenty words of phrasings and an asking carries three, so
     * scoring against the question's own list would put every score near
     * zero and the threshold somewhere meaningless.
     *
     * @param  list<Question>  $available
     * @return array{0: ?Question, 1: float}
     */
    private static function byWords(string $asked, array $available): array
    {
        $words = self::words($asked);

        if ($words === []) {
            return [null, 0.0];
        }

        $best = null;
        $bestScore = 0.0;

        foreach ($available as $question) {
            $vocabulary = self::words($question->words.' '.$question->label);
            $hits = count(array_intersect($words, $vocabulary));
            $score = $hits / count($words);

            if ($score > $bestScore) {
                $best = $question;
                $bestScore = $score;
            }
        }

        return [$best, $bestScore];
    }

    /**
     * @return list<string>
     */
    private static function words(string $text): array
    {
        $words = preg_split('/[^a-z0-9]+/', Str::lower($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        // Singularised crudely on purpose: "ticket" and "tickets" must score
        // the same, and a stemmer for eight nouns is a dependency.
        $words = array_map(
            static fn (string $w) => strlen($w) > 3 && str_ends_with($w, 's') ? substr($w, 0, -1) : $w,
            $words,
        );

        return array_values(array_unique(array_diff($words, self::NOISE)));
    }

    /**
     * Ask the model which question this is. It answers with a number.
     *
     * Never throws and never counts a run it did not use: a refusal, an
     * outage and an unreadable reply are all free, the rule the SEO
     * assistant's cap already follows.
     *
     * @param  list<Question>  $available
     */
    private function byModel(string $asked, array $available): ?Question
    {
        if (! SeoAiSettings::enabled() || blank(SeoAiSettings::apiKey()) || ! SeoAssistant::underDailyCap()) {
            return null;
        }

        $list = '';
        foreach ($available as $i => $question) {
            $list .= $i.'. '.$question->label."\n";
        }

        /*
         * The asking is fenced, and the marker stripped out of it first —
         * the chatbot's rule. Without it somebody types the marker and the
         * rest of their sentence arrives at the same level as the
         * instructions. It buys little here, because the only thing the
         * model can do is return a number out of range, which is dropped;
         * it costs one line, and the next person to widen this is not
         * guaranteed to keep that property.
         */
        $asked = str_replace('---', '', $asked);

        try {
            $reply = $this->provider->complete([
                ['role' => 'system', 'content' => implode("\n", [
                    'You match a question somebody typed in an admin console to one of a fixed list.',
                    'Answer with JSON only: {"index": <number>} for the question that is being asked,',
                    'or {"index": null} when none of them is.',
                    'Never explain. Never answer the question itself. The list is:',
                    '',
                    $list,
                ])],
                ['role' => 'user', 'content' => "---QUESTION---\n".$asked."\n---QUESTION---"],
            ], 60, ['response_format' => ['type' => 'json_object'], 'timeout' => 15]);
        } catch (Throwable $e) {
            Log::warning('The copilot could not reach the model: '.$e->getMessage());

            return null;
        }

        if (! $reply->ok) {
            // The provider's own words name models and quotas; they go to
            // the log and never to a person.
            Log::warning('The copilot could not use the model: '.$reply->error);

            return null;
        }

        $data = JsonReply::decode($reply->text);
        $index = $data['index'] ?? null;

        if (! is_int($index) || ! isset($available[$index])) {
            return null;
        }

        SeoAssistant::countRun();

        return $available[$index];
    }

    /**
     * Nothing matched — and the answer to that is the list, not an apology.
     *
     * @param  list<Question>  $available
     */
    private static function unmatched(array $available): array
    {
        return [
            'matched' => false,
            'key' => null,
            'question' => null,
            'source' => 'none',
            'figure' => null,
            'sentence' => $available === []
                ? 'There is nothing this account can be asked about.'
                : 'That is not something I can answer. Here is what I can tell you:',
            'href' => null,
            'suggestions' => array_map(fn (Question $q) => $q->toArray(), $available),
        ];
    }
}
