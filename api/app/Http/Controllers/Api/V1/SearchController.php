<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Download;
use App\Models\Entry;
use App\Models\Event;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Support\Events\EventText;
use App\Support\HtmlSanitiser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Search across everything the public site publishes.
 *
 * LIKE against a handful of columns, not a search engine, and that is a
 * deliberate ceiling rather than an oversight: this catalogue is in the
 * hundreds, the database is already there, and a Scout driver plus a
 * Meilisearch container is a large amount of operational surface to take on
 * for a corpus this size. It will need replacing if the catalogue reaches
 * five figures. The shape of this endpoint would not change if it did.
 *
 * The one thing it must get right is part numbers. This audience searches
 * "CBS350-24T" far more often than it searches prose, so an exact SKU match
 * outranks everything else on the page.
 */
class SearchController extends Controller
{
    /** Below this a term matches most of the catalogue and helps nobody. */
    private const MIN_TERM = 2;

    /** Above this a term is not a search, it is load. */
    private const MAX_TERM = 100;

    /** Per group, so one crowded type cannot fill the page. */
    private const PER_GROUP = 5;

    public function __invoke(Request $request): JsonResponse
    {
        /*
         * A ceiling on the term, and LIKE's own metacharacters escaped.
         *
         * Each request is a dozen `%term%` scans over body columns, public
         * and unauthenticated, so a 5,000-character term is work nobody
         * asked for; nobody searches a hardware catalogue with more than a
         * sentence. And a bare `%` or `_` is a wildcard to MySQL — `%%` is
         * two characters, clears the floor below and returns the head of
         * every table. Escaped, it searches for a percent sign.
         */
        $request->validate(['q' => ['nullable', 'string', 'max:'.self::MAX_TERM]]);

        $term = trim((string) $request->string('q')->value());

        if (mb_strlen($term) < self::MIN_TERM) {
            return response()->json([
                'data' => ['groups' => [], 'total' => 0],
                'meta' => ['q' => $term, 'min_length' => self::MIN_TERM],
            ]);
        }

        $like = '%'.addcslashes($term, '%_\\').'%';

        $groups = collect([
            $this->products($term, $like),
            $this->storeProducts($term, $like),
            $this->group('solution', 'Solutions', '/solutions', Solution::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('summary', 'like', $like)
                    ->orWhere('problem_statement', 'like', $like)
                    ->orWhere('overview', 'like', $like)),
                'title', 'summary'),
            $this->group('service', 'Services', '/services', Service::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('summary', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'title', 'summary'),
            $this->group('industry', 'Industries', '/industries', Industry::query()
                ->where(fn ($q) => $q->where('name', 'like', $like)
                    ->orWhere('summary', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'name', 'summary'),
            $this->group('category', 'Product categories', '/products', ProductCategory::query()
                ->where(fn ($q) => $q->where('name', 'like', $like)
                    ->orWhere('description', 'like', $like)),
                'name', 'description'),
            // The knowledge base brings its own scope, which also matches tags
            // and a punctuation-stripped title so "wifi" finds "Wi-Fi".
            $this->group('article', 'Knowledge base', '/knowledge-base',
                KnowledgeArticle::query()->published()->search($term), 'title', 'excerpt'),
            $this->group('post', 'Blog', '/blog', BlogPost::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('excerpt', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'title', 'excerpt'),
            $this->group('case_study', 'Case studies', '/case-studies', CaseStudy::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('summary', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'title', 'summary'),
            $this->group('page', 'Pages', '', Page::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'title', 'body'),
            $this->events($term),
            $this->downloads($term),
            $this->entries($like),
        ])->filter(fn (?array $g) => $g !== null)->values();

        return response()->json([
            'data' => [
                'groups' => $groups->all(),
                'total' => $groups->sum('total'),
            ],
            'meta' => ['q' => $term, 'min_length' => self::MIN_TERM],
        ]);
    }

    /**
     * Products, with exact part numbers first.
     *
     * Someone typing a SKU has one result in mind and knows it exists. Ranking
     * that below a product whose description happens to contain the string is
     * the difference between a search that works and one people stop using.
     */
    private function products(string $term, string $like): ?array
    {
        $query = Product::query()
            ->published()
            ->with('brand')
            ->where(fn ($q) => $q->where('name', 'like', $like)
                ->orWhere('sku', 'like', $like)
                ->orWhere('short_description', 'like', $like))
            ->orderByRaw('CASE WHEN LOWER(sku) = ? THEN 0 WHEN sku LIKE ? THEN 1 ELSE 2 END', [
                mb_strtolower($term), $like,
            ])
            ->orderByDesc('is_featured');

        return $this->build('product', 'Products', '/products', $query, function ($p) {
            return [
                'title' => trim(($p->brand?->name ? $p->brand->name.' ' : '').$p->name),
                'excerpt' => $p->sku ? $p->sku.' — '.$this->trim($p->short_description) : $this->trim($p->short_description),
                'path' => '/products/'.$p->slug,
            ];
        });
    }

    /**
     * The shop's catalogue, which is a different table from the one above.
     *
     * `store_products` is maintained separately from `products` on purpose —
     * what the site advertises and what the shop sells are two lists with two
     * lifecycles — and the consequence nobody had drawn was that the header's
     * search box could not find anything the business actually sells. Someone
     * searching for a part they could have bought in two clicks got nothing.
     *
     * A separate group rather than merged into Products, for the same reason
     * the tables are separate: these results lead somewhere you can buy, and
     * running them together would make "Products" mean two things in one list.
     *
     * Same exact-SKU-first ordering as the marketing catalogue, because this
     * audience searches part numbers far more often than prose.
     */
    private function storeProducts(string $term, string $like): ?array
    {
        $query = StoreProduct::query()
            ->published()
            ->with('brand')
            ->where(fn ($q) => $q->where('name', 'like', $like)
                ->orWhere('sku', 'like', $like)
                ->orWhere('short_description', 'like', $like))
            ->orderByRaw('CASE WHEN LOWER(sku) = ? THEN 0 WHEN sku LIKE ? THEN 1 ELSE 2 END', [
                mb_strtolower($term), $like,
            ]);

        return $this->build('store_product', 'In the shop', '/store/products', $query, function ($p) {
            return [
                'title' => trim(($p->brand?->name ? $p->brand->name.' ' : '').$p->name),
                'excerpt' => $p->sku ? $p->sku.' — '.$this->trim($p->short_description) : $this->trim($p->short_description),
                'path' => '/store/products/'.$p->slug,
            ];
        });
    }

    /**
     * Events (docs/events.md): published ones, what is still to come ahead
     * of what has been — somebody searching "wifi seminar" wants the one
     * they can go to. Each result carries its date as the kicker, because
     * two seminars with one title a year apart are told apart by nothing
     * else.
     */
    private function events(string $term): ?array
    {
        $today = now()->startOfDay();

        $query = Event::query()->published()->search($term)
            ->orderByRaw('CASE WHEN starts_at >= ? THEN 0 ELSE 1 END', [$today])
            ->orderByRaw('CASE WHEN starts_at >= ? THEN starts_at END ASC', [$today])
            ->orderByDesc('starts_at');

        return $this->build('event', 'Events', '/events', $query, fn (Event $e) => [
            'title' => (string) $e->title,
            'excerpt' => $this->trim($e->summary ?: $e->body),
            'path' => $e->publicPath(),
            'kicker' => EventText::dateLabel($e),
        ]);
    }

    /**
     * Files of the downloads centre (docs/downloads.md). A download has no
     * page of its own, so its result opens the centre searched for it; the
     * shelf it sits on is the kicker.
     */
    private function downloads(string $term): ?array
    {
        $query = Download::query()->published()->with('category')->search($term)->shelved();

        return $this->build('download', 'Downloads', '/downloads', $query, fn (Download $d) => [
            'title' => (string) $d->title,
            'excerpt' => $this->trim($d->summary),
            'path' => '/downloads?q='.rawurlencode((string) $d->title),
            'kicker' => $d->category?->name,
        ]);
    }

    /**
     * Entries of the custom content types (docs/custom-content.md), in one
     * group whatever their type — each result names its type and carries its
     * own path, since `/events/…` and `/downloads/…` share no prefix.
     */
    private function entries(string $like): ?array
    {
        $query = Entry::query()->published()
            ->with('contentType')
            ->where(fn ($q) => $q->where('title', 'like', $like)
                ->orWhere('summary', 'like', $like)
                ->orWhere('body', 'like', $like))
            ->orderByDesc('published_at');

        return $this->build('entry', 'More from the site', '', $query, fn (Entry $e) => [
            'title' => (string) $e->title,
            'excerpt' => $this->trim($e->summary ?: $e->body),
            'path' => $e->publicPath(),
            'kicker' => $e->contentType?->name,
        ]);
    }

    /** @param  \Illuminate\Database\Eloquent\Builder<*>  $query */
    private function group(string $type, string $label, string $prefix, $query, string $titleColumn, string $bodyColumn): ?array
    {
        return $this->build($type, $label, $prefix, $query, fn ($r) => [
            'title' => (string) $r->{$titleColumn},
            'excerpt' => $this->trim($r->{$bodyColumn}),
            'path' => ($prefix === '' ? '' : $prefix).'/'.$r->slug,
        ]);
    }

    /** @param  \Illuminate\Database\Eloquent\Builder<*>  $query */
    private function build(string $type, string $label, string $prefix, $query, callable $shape): ?array
    {
        $rows = $query->limit(self::PER_GROUP)->get();

        if ($rows->isEmpty()) {
            return null;
        }

        /*
         * "Showing 5 of 23" is a different message from "5 results", and the
         * second one is a lie when there are 23 — so the total is real. But it
         * is only *asked for* when the page came back full: a group that
         * returned three rows against a limit of five has already said how
         * many there are. Counting first, for every group, made this endpoint
         * twenty queries for ten groups on every search, and most groups match
         * nothing.
         */
        $total = $rows->count() < self::PER_GROUP ? $rows->count() : (clone $query)->count();

        return [
            'type' => $type,
            'label' => $label,
            'total' => $total,
            'results' => Collection::make($rows)->map($shape)->values()->all(),
        ];
    }

    /** A one-line summary from whatever column was handed over. */
    private function trim(?string $value): ?string
    {
        $text = HtmlSanitiser::toText($value);

        return $text === '' ? null : mb_substr($text, 0, 160);
    }
}
