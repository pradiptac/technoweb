<?php

namespace App\Support\Chat;

use App\Enums\PublishStatus;
use App\Models\BlogPost;
use App\Models\Faq;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

/**
 * The small, relevant slice of the website that answers one question.
 *
 * §22 of the specification: do not dump the database into every request. This
 * is the half that decides what goes in — a handful of published records, as
 * short excerpts with their real URLs — and everything the assistant is allowed
 * to assert comes from here. If it is not in this array, the correct answer is
 * that we do not know.
 *
 * ## Published only, every time
 *
 * Each query goes through the model's own published scope rather than a
 * hand-written `where`. A draft is something somebody is still deciding about,
 * and an assistant quoting one has published it on their behalf.
 *
 * ## No customer data, structurally
 *
 * There is no branch here that can reach a customer, an order, a ticket or an
 * activation code — not because the model is asked not to, but because nothing
 * in this class knows how. §15 and §34 are enforced by absence, which is the
 * only enforcement a prompt cannot be talked out of.
 *
 * ## MySQL, not a vector database
 *
 * Rule 6, and it is right for this corpus: a few hundred records, where the
 * questions are overwhelmingly "do you sell X" and "do you do Y". `LIKE`
 * across the columns a person would have typed into answers those. The ceiling
 * is real and is nowhere near.
 */
class Retriever
{
    /** How many records reach the model. More is a longer bill, not a better answer. */
    private const PER_GROUP = 3;

    private const MAX_RECORDS = 8;

    /** How much of a body travels. Enough to answer from, never the article. */
    private const EXCERPT = 320;

    /**
     * @return array<int, array{type: string, label: string, title: string, excerpt: string, url: string, meta: array<string, mixed>}>
     */
    public static function for(string $question): array
    {
        $terms = self::terms($question);

        if ($terms === []) {
            return [];
        }

        // The most distinctive word, for ranking an exact part number first.
        $term = $terms[0];

        // Ordered by how directly each answers the questions this site is
        // actually asked. Products first: "do you have a 24-port switch" is the
        // most common question a hardware catalogue gets.
        $groups = [
            self::products($term, $terms),
            self::solutions($terms),
            self::services($terms),
            self::industries($terms),
            self::faqs($terms),
            self::knowledge($question, $terms),
            self::blog($terms),
            self::pages($terms),
        ];

        return array_slice(array_merge(...$groups), 0, self::MAX_RECORDS);
    }

    /**
     * The words worth searching for.
     *
     * **A question is not a search term.** The first cut matched the whole
     * sentence as one `LIKE`, so "Do you have a 24-port managed switch?" looked
     * for that exact string in a product name and found nothing — every real
     * question fell through to the fallback, which reads as a chatbot that
     * knows nothing about the site it is sitting on. A test caught it; reading
     * the code did not, because the code was perfectly correct about the wrong
     * thing.
     *
     * Stop words go because they match everything: "do you have a" against a
     * body column returns the whole catalogue and ranks it by nothing.
     * Two-character tokens stay, because "24" and "8x" are the questions this
     * catalogue is asked. Longest first, so the ranking hint is the most
     * distinctive word rather than whichever came first in the sentence.
     *
     * @return array<int, string>
     */
    private static function terms(string $question): array
    {
        $stop = [
            'the', 'and', 'for', 'you', 'your', 'our', 'are', 'can', 'does', 'did', 'have', 'has',
            'with', 'what', 'which', 'who', 'how', 'why', 'when', 'where', 'any', 'all', 'that',
            'this', 'there', 'from', 'about', 'into', 'need', 'want', 'looking', 'please', 'tell',
            'give', 'get', 'got', 'would', 'could', 'should', 'will', 'may', 'might', 'must',
            'was', 'were', 'been', 'being', 'not', 'but', 'out', 'its', 'his', 'her', 'their',
            'provide', 'offer', 'sell', 'know', 'find', 'like', 'some', 'more', 'most', 'also',
            // Verbs and pronouns that carry no subject. "Do you sell" is four
            // words of politeness wrapped around nothing searchable.
            'you', 'yours', 'they', 'them', 'able', 'available', 'anything', 'something',
            'many', 'much', 'good', 'best', 'help', 'thanks', 'thank', 'hello', 'hey',
        ];

        $words = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower(trim($question)), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        /*
         * Three letters, or two if it is a number.
         *
         * `LIKE '%do%'` matches London, window and adopt, so a two-letter word
         * is not a search term, it is a wildcard — and the first cut let "do"
         * through, which returned the same eight records for every question
         * asked. Numbers are the exception and the reason the rule is not
         * simply "three": "24" and "48" are most of what this catalogue is
         * asked about.
         */
        $terms = array_values(array_unique(array_filter(
            $words,
            fn (string $w) => ! in_array($w, $stop, true)
                && (mb_strlen($w) >= 3 || (mb_strlen($w) >= 2 && ctype_digit($w))),
        )));

        usort($terms, fn ($a, $b) => mb_strlen($b) <=> mb_strlen($a));

        /*
         * Six is plenty and is also a ceiling on the query. Every term is
         * another `OR ... LIKE` in eight statements, and a visitor who pastes a
         * paragraph should not be able to make this expensive — the same
         * reasoning behind every other limit in this module.
         */
        return array_slice($terms, 0, 6);
    }

    /**
     * `column LIKE %term%` for each term, OR'd.
     *
     * OR rather than AND: somebody asking for a "24 port poe managed switch"
     * will not have every one of those words in one product's name, and
     * requiring them all returns nothing for the most specific questions —
     * which are the ones most worth answering.
     *
     * **Titles and summaries, never bodies.** A body is long enough to contain
     * almost any word, so matching one finds everything and ranks it by
     * nothing: with bodies in, every question in a six-question probe came back
     * with the same eight records, including one about software this company
     * has never heard of. A summary is what the record is *about*, which is
     * the question being asked. FAQs and the knowledge base are the deliberate
     * exceptions — their body **is** the answer.
     *
     * @param  array<int, string>  $terms
     * @param  array<int, string>  $columns
     */
    private static function match(Builder $query, array $terms, array $columns): Builder
    {
        return $query->where(function (Builder $q) use ($terms, $columns) {
            foreach ($terms as $term) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $term).'%';

                foreach ($columns as $column) {
                    $q->orWhere($column, 'like', $like);
                }
            }
        });
    }

    /**
     * The shop's catalogue, which is not the site's catalogue.
     *
     * `store_products` is what can be bought and `products` is what is
     * advertised — two tables on purpose. This searches the shop, because
     * price and availability are what somebody asking about a product wants,
     * and only the shop has them.
     *
     * **Neither is ever invented.** The price travels as the paise integer the
     * database holds and the availability as the bit `inStock()` answers, both
     * labelled, so the model is repeating a figure rather than composing one.
     */
    private static function products(string $term, array $terms): array
    {
        $query = StoreProduct::query()->published()->with(['brand', 'category', 'variations']);

        $products = self::match($query, $terms, ['name', 'sku', 'short_description'])
            // The manufacturer is rarely in the product's own name — "6100 48G
            // Switch" is an Aruba and nothing in that string says so. The site
            // search had to learn this too.
            ->orWhereHas('brand', fn (Builder $b) => self::match($b, $terms, ['name']))
            ->where('status', PublishStatus::Published)
            ->orderByRaw('CASE WHEN sku = ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END', [$term, '%'.$term.'%'])
            ->limit(self::PER_GROUP)
            ->get();

        return $products->map(fn (StoreProduct $p) => [
            'type' => 'product',
            'label' => 'Store product',
            'title' => $p->name,
            'excerpt' => self::excerpt($p->short_description ?? $p->description),
            'url' => '/store/products/'.$p->slug,
            'meta' => array_filter([
                'brand' => $p->brand?->name,
                'category' => $p->category?->name,
                'sku' => $p->sku,
                'price_inr' => $p->price_paise !== null ? number_format($p->price_paise / 100, 2, '.', '') : null,
                'in_stock' => $p->inStock() ? 'yes' : 'no',
                'returnable' => $p->returnable ? 'yes' : 'no',
                'type' => $p->type?->value,
                'variations' => $p->variations->isEmpty() ? null
                    : $p->variations->where('is_active', true)->pluck('name')->implode(', '),
                // The specification is explicit that specifications are never
                // invented; the way to guarantee that is to send the real ones.
                'specifications' => self::specs($p),
            ], fn ($v) => filled($v)),
        ])->all();
    }

    /** @return string|null */
    private static function specs(StoreProduct $product)
    {
        $sheet = $product->specifications;

        if (! is_array($sheet) || $sheet === []) {
            return null;
        }

        return collect($sheet)
            ->take(8)
            ->map(fn ($value, $key) => "{$key}: {$value}")
            ->implode('; ');
    }

    private static function solutions(array $terms): array
    {
        return self::content(
            self::match(Solution::query()->published(), $terms, ['title', 'summary']),
            'solution', 'Solution', '/solutions/', 'title', ['summary', 'problem_statement', 'overview'],
        );
    }

    private static function services(array $terms): array
    {
        return self::content(
            self::match(Service::query()->published(), $terms, ['title', 'summary']),
            'service', 'Service', '/services/', 'title', ['summary', 'body'],
        );
    }

    private static function industries(array $terms): array
    {
        return self::content(
            self::match(Industry::query(), $terms, ['name', 'summary']),
            'industry', 'Industry', '/industries/', 'name', ['summary', 'body'],
        );
    }

    /**
     * FAQs, which are the highest-value rows in the whole corpus.
     *
     * Somebody already wrote the question and the answer, in the company's own
     * words, and approved it. It goes to the model close to verbatim.
     */
    private static function faqs(array $terms): array
    {
        return self::match(Faq::query(), $terms, ['question', 'answer'])
            ->limit(self::PER_GROUP)
            ->get()
            ->map(fn (Faq $f) => [
                'type' => 'faq',
                'label' => 'FAQ',
                'title' => $f->question,
                'excerpt' => self::excerpt($f->answer, 400),
                // An FAQ hangs off whatever owns it and has no page of its own,
                // so it carries no link rather than a link to nowhere.
                'url' => '',
                'meta' => [],
            ])->all();
    }

    private static function knowledge(string $question, array $terms): array
    {
        /*
         * The knowledge base's own scope, which matches tags and a
         * punctuation-stripped title — so "wifi" finds "Wi-Fi". People do not
         * type hyphens, and this is where they are least likely to. It takes
         * the question as typed, because that scope does its own tokenising;
         * the plain term match is the fallback when it finds nothing.
         */
        $found = self::content(
            KnowledgeArticle::query()->published()->search($question),
            'knowledge', 'Knowledge base', '/knowledge-base/', 'title', ['excerpt', 'body'],
        );

        return $found !== [] ? $found : self::content(
            self::match(KnowledgeArticle::query()->published(), $terms, ['title', 'excerpt']),
            'knowledge', 'Knowledge base', '/knowledge-base/', 'title', ['excerpt', 'body'],
        );
    }

    private static function blog(array $terms): array
    {
        return self::content(
            self::match(BlogPost::query()->published(), $terms, ['title', 'excerpt']),
            'blog', 'Article', '/blog/', 'title', ['excerpt', 'body'],
        );
    }

    private static function pages(array $terms): array
    {
        return self::content(
            self::match(Page::query()->published(), $terms, ['title']),
            'page', 'Page', '/', 'title', ['body'],
        );
    }

    /**
     * One shape for every CMS record, so the model sees a consistent context.
     *
     * @param  array<int, string>  $bodyColumns
     */
    private static function content(Builder $query, string $type, string $label, string $prefix, string $titleColumn, array $bodyColumns): array
    {
        return $query->limit(self::PER_GROUP)->get()
            ->map(function ($record) use ($type, $label, $prefix, $titleColumn, $bodyColumns) {
                $body = null;

                foreach ($bodyColumns as $column) {
                    if (filled($record->{$column} ?? null)) {
                        $body = $record->{$column};
                        break;
                    }
                }

                return [
                    'type' => $type,
                    'label' => $label,
                    'title' => (string) $record->{$titleColumn},
                    'excerpt' => self::excerpt($body),
                    'url' => $prefix.$record->slug,
                    'meta' => [],
                ];
            })->all();
    }

    /**
     * A body, as text, short.
     *
     * `HtmlSanitiser::toText()` and never `strip_tags`: that deletes a tag
     * without leaving anything in its place, so the end of one paragraph runs
     * into the start of the next — which once published
     * "…asked for.Remote supportWhen an engineer…" as a meta description. Here
     * it would be worse than ugly: two sentences welded together are two facts
     * the model may read as one.
     */
    private static function excerpt(?string $body, int $length = self::EXCERPT): string
    {
        if (blank($body)) {
            return '';
        }

        return Str::limit(trim(HtmlSanitiser::toText($body)), $length);
    }
}
