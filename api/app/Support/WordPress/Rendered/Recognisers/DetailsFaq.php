<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;
use Illuminate\Support\Str;

/**
 * Questions and answers that are not a plugin's accordion: a definition list
 * (`<dl><dt>Question<dd>Answer`), or a run of headings that ask something
 * (`<h3>Do you ship abroad?</h3><p>…`) each followed by its answer.
 * (`<details>` is `FaqRecogniser`'s.) Becomes a questions section.
 */
final class DetailsFaq implements Recogniser
{
    private const HEADINGS = ['h2', 'h3', 'h4', 'h5', 'h6'];

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        $items = strtolower($el->tagName) === 'dl' ? $this->definitions($el) : $this->asked($el);

        return count($items) >= 2 ? new Piece('faq', $items, html: Dom::html($el)) : null;
    }

    /** @return list<array{question: string, answer: string}> */
    private function definitions(DOMElement $dl): array
    {
        $items = [];
        $question = null;

        foreach (Dom::children($dl) as $child) {
            $tag = strtolower($child->tagName);

            if ($tag === 'dt') {
                $question = Dom::text($child);
            } elseif ($tag === 'dd' && $question !== null) {
                $answer = Dom::text($child);

                if ($question !== '' && $answer !== '' && mb_strlen($question) <= 300) {
                    $items[] = ['question' => Str::limit($question, 299, '…'), 'answer' => Str::limit($answer, 1999, '…')];
                }
            }
        }

        return $items;
    }

    /** @return list<array{question: string, answer: string}> */
    private function asked(DOMElement $el): array
    {
        $items = [];
        $current = null;
        $asking = 0;

        foreach (Structure::kids($el) as $kid) {
            $tag = strtolower($kid->tagName);
            $text = Dom::text($kid);

            if (in_array($tag, self::HEADINGS, true) && str_ends_with($text, '?') && mb_strlen($text) <= 300) {
                if ($current !== null) {
                    $items[] = $current;
                }
                $current = ['question' => Str::limit($text, 299, '…'), 'answer' => ''];
                $asking++;
            } elseif (in_array($tag, self::HEADINGS, true)) {
                // A heading that is not a question ends the run — what follows is not an answer.
                if ($current !== null) {
                    $items[] = $current;
                }
                $current = null;
            } elseif ($current !== null && $text !== '') {
                $current['answer'] = trim($current['answer'].' '.$text);
            }
        }

        if ($current !== null) {
            $items[] = $current;
        }

        $items = array_values(array_filter($items, fn (array $i) => $i['answer'] !== ''));

        return $asking >= 3 ? array_map(fn (array $i) => ['question' => $i['question'], 'answer' => Str::limit($i['answer'], 1999, '…')], $items) : [];
    }
}
