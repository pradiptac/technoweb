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
use App\Models\Tender;
use App\Support\Analytics\Conversions;
use App\Support\Events\EventText;
use App\Support\HtmlSanitiser;
use App\Support\Search\Indexable;
use App\Support\Search\Semantic;
use App\Support\Tenders\TenderText;
use App\Support\Tenders\TenderWindow;
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
    /** Meaning matches by morph alias, set once per request in __invoke. @var array<string, list<int>> */
    private array $meaning = [];

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

        try {
            $this->meaning = collect(Semantic::match($term, Indexable::aliases(), 60))
                ->groupBy('subject_type')->map(fn ($g) => $g->pluck('subject_id')->all())->all();
        } catch (\Throwable $e) {
            report($e); // the site search never breaks because of meaning
            $this->meaning = [];
        }

        $like = '%'.addcslashes($term, '%_\\').'%';

        $groups = collect([
            $this->products($term, $like),
            $this->storeProducts($term, $like),
            $this->group('solution', 'solution', 'Solutions', '/solutions', Solution::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('summary', 'like', $like)
                    ->orWhere('problem_statement', 'like', $like)
                    ->orWhere('overview', 'like', $like)),
                'title', 'summary'),
            $this->group('service', 'service', 'Services', '/services', Service::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('summary', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'title', 'summary'),
            $this->group('industry', 'industry', 'Industries', '/industries', Industry::query()
                ->where(fn ($q) => $q->where('name', 'like', $like)
                    ->orWhere('summary', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'name', 'summary'),
            $this->group('product_category', 'category', 'Product categories', '/products', ProductCategory::query()
                ->where(fn ($q) => $q->where('name', 'like', $like)
                    ->orWhere('description', 'like', $like)),
                'name', 'description'),
            // The knowledge base brings its own scope, which also matches tags
            // and a punctuation-stripped title so "wifi" finds "Wi-Fi".
            $this->group('knowledge_article', 'article', 'Knowledge base', '/knowledge-base',
                KnowledgeArticle::query()->published()->search($term), 'title', 'excerpt'),
            $this->group('blog_post', 'post', 'Blog', '/blog', BlogPost::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('excerpt', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'title', 'excerpt'),
            $this->group('case_study', 'case_study', 'Case studies', '/case-studies', CaseStudy::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('summary', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'title', 'summary'),
            $this->group('page', 'page', 'Pages', '', Page::query()->published()
                ->where(fn ($q) => $q->where('title', 'like', $like)
                    ->orWhere('body', 'like', $like)),
                'title', 'body'),
            $this->events($term),
            $this->tenders($term),
            $this->downloads($term),
            $this->entries($like),
        ])->filter(fn (?array $g) => $g !== null)->values();

        Conversions::search($request, 'site', $term, (int) $groups->sum('total'));

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

        return $this->build('product', 'product', 'Products', '/products', $query, function ($p) {
            return [
                'title' => trim(($p->brand?->name ? $p->brand->name.' ' : '').$p->name),
                'excerpt' => $p->sku ? $p->sku.' — '.$this->trim($p->short_description) : $this->trim($p->short_description),
                'path' => '/products/'.$p->slug,
            ];
        }, ['brand']);
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

        return $this->build('store_product', 'store_product', 'In the shop', '/store/products', $query, function ($p) {
            return [
                'title' => trim(($p->brand?->name ? $p->brand->name.' ' : '').$p->name),
                'excerpt' => $p->sku ? $p->sku.' — '.$this->trim($p->short_description) : $this->trim($p->short_description),
                'path' => '/store/products/'.$p->slug,
            ];
        }, ['brand']);
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

        return $this->build('event', 'event', 'Events', '/events', $query, fn (Event $e) => [
            'title' => (string) $e->title,
            'excerpt' => $this->trim($e->summary ?: $e->body),
            'path' => $e->publicPath(),
            'kicker' => EventText::dateLabel($e),
        ]);
    }

    /**
     * Tender notices (docs/tenders.md).
     *
     * Open ones first and closing soonest, then closed ones most recently
     * first — the events' ordering, for the events' reason: a deadline is
     * only useful in that order, and a tender that shut last spring is not
     * what somebody searching for one wants at the top.
     *
     * The kicker is the state and the closing date, because two tenders for
     * the same work a year apart are told apart by nothing else — and
     * because "Closed" is the first thing a searcher needs to know.
     */
    private function tenders(string $term): ?array
    {
        $now = now()->toDateTimeString();

        $query = Tender::query()->published()->with('category')->search($term)
            ->orderByRaw('CASE WHEN tenders.closes_at > ? THEN 0 ELSE 1 END', [$now])
            ->orderByRaw('CASE WHEN tenders.closes_at > ? THEN tenders.closes_at END ASC', [$now])
            ->orderByRaw('CASE WHEN tenders.closes_at <= ? THEN tenders.closes_at END DESC', [$now]);

        return $this->build('tender', 'tender', 'Tenders', '/tenders', $query, fn (Tender $t) => [
            'title' => (string) $t->title,
            'excerpt' => $this->trim($t->summary ?: $t->description),
            'path' => $t->publicPath(),
            'kicker' => TenderWindow::for($t)->label().' · '.TenderText::dateLabel($t->closes_at),
        ], ['category']);
    }

    /**
     * Files of the downloads centre (docs/downloads.md). A download has no
     * page of its own, so its result opens the centre searched for it; the
     * shelf it sits on is the kicker.
     */
    private function downloads(string $term): ?array
    {
        $query = Download::query()->published()->with('category')->search($term)->shelved();

        return $this->build('download', 'download', 'Downloads', '/downloads', $query, fn (Download $d) => [
            'title' => (string) $d->title,
            'excerpt' => $this->trim($d->summary),
            'path' => $d->publicPath(),
            'kicker' => $d->category?->name,
        ], ['category']);
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

        return $this->build('entry', 'entry', 'More from the site', '', $query, fn (Entry $e) => [
            'title' => (string) $e->title,
            'excerpt' => $this->trim($e->summary ?: $e->body),
            'path' => $e->publicPath(),
            'kicker' => $e->contentType?->name,
        ], ['contentType']);
    }

    /** @param  \Illuminate\Database\Eloquent\Builder<*>  $query */
    private function group(string $alias, string $type, string $label, string $prefix, $query, string $titleColumn, string $bodyColumn): ?array
    {
        return $this->build($alias, $type, $label, $prefix, $query, fn ($r) => [
            'title' => (string) $r->{$titleColumn},
            'excerpt' => $this->trim($r->{$bodyColumn}),
            'path' => ($prefix === '' ? '' : $prefix).'/'.$r->slug,
        ]);
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<*>  $query
     * @param  list<string>  $with  relations the shape closure reads
     */
    private function build(string $alias, string $type, string $label, string $prefix, $query, callable $shape, array $with = []): ?array
    {
        $rows = (clone $query)->limit(self::PER_GROUP)->get();

        /*
         * "Showing 5 of 23" is a different message from "5 results", and the
         * second one is a lie when there are 23 — so the total is real. But it
         * is only *asked for* when the page came back full: a group that
         * returned three rows against a limit of five has already said how
         * many there are. Counting first, for every group, made this endpoint
         * twenty queries for ten groups on every search, and most groups match
         * nothing.
         */
        $wordTotal = $rows->count() < self::PER_GROUP ? $rows->count() : (clone $query)->count();

        // Records meaning found that the word query does not also match (on any page).
        $meaningOnly = [];
        $ids = $this->meaning[$alias] ?? [];
        if ($ids !== [] && ($base = Indexable::query($alias)) !== null) {
            $alsoWords = (clone $query)->whereKey($ids)->pluck($base->getModel()->getKeyName())->all();
            $candidates = array_values(array_diff($ids, $alsoWords)); // still in score order
            // Only what is published now: the file can be a minute behind an unpublish.
            $published = $candidates === [] ? [] : (clone $base)->whereKey($candidates)->pluck($base->getModel()->getKeyName())->all();
            $meaningOnly = array_values(array_intersect($candidates, $published));

            if ($rows->count() < self::PER_GROUP && $meaningOnly !== []) {
                $take = array_slice($meaningOnly, 0, self::PER_GROUP - $rows->count());
                $extra = $base->with($with)->whereKey($take)->get()
                    ->sortBy(fn ($m) => array_search($m->getKey(), $take, true))->values();
                $rows = $rows->concat($extra);
            }
        }

        if ($rows->isEmpty()) {
            return null;
        }

        return [
            'type' => $type,
            'label' => $label,
            'total' => $wordTotal + count($meaningOnly),
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
