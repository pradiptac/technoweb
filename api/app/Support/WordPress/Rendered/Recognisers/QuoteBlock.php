<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;
use Illuminate\Support\Str;

/**
 * A quotation with somebody named, drawn without a plugin's classes: a
 * `<figure>` holding a `<blockquote>` and a `<figcaption>` (Bootstrap's and
 * Tailwind's), or a `<blockquote>` with a `<footer>`. (A blockquote with a
 * `<cite>` is `TestimonialRecogniser`'s.) Neighbours become one testimonials
 * section.
 */
final class QuoteBlock implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        $tag = strtolower($el->tagName);

        if ($tag === 'figure') {
            $quote = Dom::firstTag($el, 'blockquote');
            $caption = Dom::firstTag($el, 'figcaption');
        } elseif ($tag === 'blockquote') {
            $quote = $el;
            $caption = Dom::firstTag($el, 'footer', 'figcaption');

            if (Dom::firstTag($el, 'cite') !== null) {
                return null;
            }
        } else {
            return null;
        }

        if ($quote === null || $caption === null) {
            return null;
        }

        $copy = $quote->cloneNode(true);
        $body = $copy instanceof DOMElement ? $copy : $quote;

        foreach (Dom::tags($body, 'footer', 'figcaption') as $drop) {
            $drop->parentNode?->removeChild($drop);
        }

        $text = trim(Dom::text($body), " \t\n\"“”'");
        [$name, $role] = $this->whoSaidIt($caption);

        if ($text === '' || $name === '' || mb_strlen($text) < 20 || $text === $name) {
            return null;
        }

        $img = Dom::firstTag($el, 'img');

        return new Piece('testimonial', [array_filter([
            'quote' => Str::limit($text, 799, '…'),
            'name' => Str::limit($name, 119, '…'),
            'role' => $role !== '' ? Str::limit($role, 159, '…') : null,
            'photo' => $img ? Dom::src($img) : null,
        ])], html: Dom::html($el));
    }

    /** @return array{0: string, 1: string} the name, and the role or company after it */
    private function whoSaidIt(DOMElement $caption): array
    {
        $cite = Dom::firstTag($caption, 'cite', 'strong', 'b');

        if ($cite !== null) {
            $inside = Dom::text($cite);
            $before = trim(substr(Dom::text($caption), 0, (int) strpos(Dom::text($caption), $inside)), " \t,—–-|·");

            // "Meera Nair, <cite>Operations Head</cite>": the name is what comes before the citation.
            if ($before !== '' && strtolower($cite->tagName) === 'cite') {
                return [$before, $inside];
            }

            return [$inside, trim(str_replace($inside, '', Dom::text($caption)), " \t,—–-|·")];
        }

        $text = ltrim(Dom::text($caption), '—–- ');
        $parts = preg_split('/\s*[,—–|·]\s*|\s+-\s+/u', $text, 2) ?: [$text];

        return [trim($parts[0]), trim($parts[1] ?? '')];
    }
}
