<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Industry;
use App\Models\JobOpening;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Support\SeoScore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A single view of every indexable record's metadata, and how well it is
 * doing. Behind role:seo_manager.
 *
 * Deliberately read-mostly. Each entity's own editor already carries a
 * SeoPanel, and a second editing surface for the same override row would be
 * two implementations of the same rules, free to drift. What is missing
 * without this screen is the overview: which pages are running on derived
 * metadata, which titles are too long to survive a search result, what has
 * been dropped from the sitemap — and, now, which of two hundred records is
 * worth opening first.
 *
 * The one thing it writes is `sitemap_include`, because that is a per-row
 * decision usually taken while looking at the whole list.
 */
class SeoController extends Controller
{
    /**
     * Every model carrying a SEO override.
     *
     * `admin` is the **frontend** route segment, which is not always the API's
     * — the console serves blog posts at /admin/blog and knowledge articles at
     * /admin/knowledge-base. This was spelled with the API's own resource names
     * for both, so two of the nine record types linked to a 404 from the one
     * screen whose whole job is finding records to go and edit.
     *
     * `with` is anything defaultSeo() reaches through a relation.
     * preventLazyLoading is on, and Product builds its default title from its
     * brand, so listing every product's SEO throws without it.
     *
     * `body` names the columns that hold the record's actual content, and
     * `depth` how many words a complete entry of that kind runs to. The
     * targets differ because the pages do: an article that stops at 200 words
     * is thin, and a product category description that reaches 200 is someone
     * padding a taxonomy label.
     */
    private const ENTITIES = [
        'page' => [Page::class, 'title', 'pages', 'Pages', [], ['body'], 300],
        'blog_post' => [BlogPost::class, 'title', 'blog', 'Blog posts', [], ['body'], 300],
        'knowledge_article' => [KnowledgeArticle::class, 'title', 'knowledge-base', 'Knowledge base', [], ['body'], 300],
        'case_study' => [CaseStudy::class, 'title', 'case-studies', 'Case studies', [], ['body'], 250],
        'solution' => [Solution::class, 'title', 'solutions', 'Solutions', [], ['problem_statement', 'overview'], 250],
        'service' => [Service::class, 'title', 'services', 'Services', [], ['body'], 250],
        'industry' => [Industry::class, 'name', 'industries', 'Industries', [], ['body'], 200],
        'product' => [Product::class, 'name', 'products', 'Products', ['brand'], ['description'], 150],
        'product_category' => [ProductCategory::class, 'name', 'product-categories', 'Product categories', [], ['description'], 80],
        /*
         * Programmatic landing pages are indexable records with SEO overrides,
         * and they were missing from the one screen whose job is finding
         * records to go and fix. A family of pages absent from the overview is
         * a family nobody audits.
         */
        'landing_page' => [LandingPage::class, 'title', 'landing-pages', 'Landing pages', [], ['intro', 'body'], 250],
        /*
         * Both carried `HasSeo` and neither was on this list -- the same
         * class of gap `admin_path` was caught by, just further from a
         * screen anybody looks at every day: a vacancy is indexable, in the
         * sitemap, and emits `JobPosting` structured data for Google Jobs,
         * and a store product is indexable, in the sitemap, and is what the
         * shop actually sells. Neither had a score, a duplicate-title check,
         * or a Recheck button until now.
         */
        'job_opening' => [JobOpening::class, 'title', 'jobs', 'Vacancies', [], ['description'], 150],
        'store_product' => [StoreProduct::class, 'name', 'store/products', 'Store products', [], ['description'], 150],
        /*
         * `store_category` joins them for the reason its own model comment
         * now gives: "not a page" was measured against the wrong thing. A
         * category with something in it is a real page at
         * `/store/categories/{slug}`, in the sitemap since the store shipped,
         * and it had no score, no duplicate check and nothing on this screen
         * to open and fix.
         */
        'store_category' => [StoreCategory::class, 'name', 'store/categories', 'Store categories', [], ['description'], 80],
    ];

    public function index(Request $request): JsonResponse
    {
        /*
         * Every record is loaded, whatever the filters say, and the filtering
         * happens below in PHP.
         *
         * That is not laziness about the query — two of the checks are
         * "does another record publish this exact title" and "…this exact
         * description", and a duplicate cannot be seen from inside a filtered
         * subset. Narrow to one type and every cross-type duplicate silently
         * becomes unique; search for a word and the same. The site score has
         * the same requirement for a different reason: it is a fact about the
         * site, not a description of the rows currently on screen.
         *
         * The ceiling is a few thousand records, which is well past what this
         * catalogue is for. Beyond that the duplicate pass wants a
         * GROUP BY on a stored resolved title rather than a full load.
         */
        $rows = $this->scoreRows($this->collectRows());

        $site = $this->siteScore($rows);
        $withIssues = count(array_filter($rows, fn ($r) => $r['issues'] !== []));

        $rows = $this->applyFilters($rows, $request);

        $total = count($rows);
        $perPage = min(max((int) $request->integer('per_page', 50), 1), 200);
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min(max((int) $request->integer('page', 1), 1), $lastPage);

        return response()->json([
            'data' => array_values(array_slice($rows, ($page - 1) * $perPage, $perPage)),
            'meta' => [
                'total' => $total,
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'with_issues' => $withIssues,
                'site_score' => $site,
                'types' => array_map(
                    fn ($type, $entity) => ['value' => $type, 'label' => $entity[3]],
                    array_keys(self::ENTITIES),
                    array_values(self::ENTITIES),
                ),
            ],
        ]);
    }

    /**
     * Toggle a record's presence in the sitemap.
     *
     * Writes through the seo relation with updateOrCreate, so a record with no
     * override row yet gets one rather than the change being dropped — the bug
     * this project already shipped once with this exact flag.
     */
    public function updateSitemap(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', 'in:'.implode(',', array_keys(self::ENTITIES))],
            'id' => ['required', 'integer', 'min:1'],
            'sitemap_include' => ['required', 'boolean'],
        ]);

        [$class] = self::ENTITIES[$data['type']];
        $record = $class::findOrFail($data['id']);

        $record->seo()->updateOrCreate([], ['sitemap_include' => $data['sitemap_include']]);

        return response()->json([
            'data' => ['type' => $data['type'], 'id' => $record->id, 'sitemap_include' => $data['sitemap_include']],
        ]);
    }

    /** Every record, unfiltered, with the working fields scoring needs. */
    /**
     * One record, re-scored on demand.
     *
     * What the console's Recheck button calls. The record's own edit form
     * opens in a new tab — deliberately, so working down a filtered list does
     * not spend your place in it — which leaves the list holding a score from
     * before the edit. Reloading would answer that and lose the filters and
     * the scroll position, which is the thing the new tab was protecting.
     *
     * **It still collects every record**, and that is not a missed
     * optimisation. Two of the thirteen checks are "does another record
     * publish this exact title" and the same for the description, so a record
     * scored in isolation cannot see a duplicate and comes back with a score
     * that is *too high*. A recheck that quietly reports better news than the
     * list is worse than no recheck at all. It costs one collection pass and
     * returns one row rather than the fifty the index sends.
     */
    public function show(Request $request, string $type, string $id): JsonResponse
    {
        $rows = $this->scoreRows($this->collectRows());

        $row = collect($rows)->first(
            fn (array $r) => $r['type'] === $type && (string) $r['id'] === $id,
        );

        // 404 rather than an empty 200: a record deleted in the other tab is
        // the ordinary way to arrive here, and the console needs to be able to
        // tell that apart from "nothing changed".
        abort_if(! $row, 404, 'That record no longer exists.');

        return response()->json(['data' => $row]);
    }

    /**
     * Score every row, in place.
     *
     * Extracted from `index()` so the single-record endpoint runs the *same*
     * pass rather than a second implementation of it — including the duplicate
     * counts, which are the part that cannot be computed per record.
     */
    private function scoreRows(array $rows): array
    {
        $titleCounts = $this->countNormalised(array_column($rows, 'title'));
        $descriptionCounts = $this->countNormalised(array_column($rows, 'description'));

        foreach ($rows as $i => $row) {
            $score = SeoScore::for([
                'resolved' => $row['_resolved'],
                'slug' => $row['slug'],
                'body' => $row['_body'],
                'has_body' => $row['_has_body'],
                'depth_target' => $row['_depth'],
                'duplicate_title' => ($titleCounts[$this->normalise($row['title'])] ?? 0) > 1,
                'duplicate_description' => ($descriptionCounts[$this->normalise($row['description'])] ?? 0) > 1,
            ]);

            $rows[$i]['score'] = [
                'value' => $score['value'],
                'band' => $score['band'],
                'passed' => $score['passed'],
                'checked' => $score['checked'],
                'failed' => $score['failed'],
            ];
            // Kept exactly as it was: the same five conditions the screen has
            // always called an issue, so "with issues" and its filter go on
            // counting what they counted.
            $rows[$i]['issues'] = $score['issues'];

            unset($rows[$i]['_resolved'], $rows[$i]['_body'], $rows[$i]['_has_body'], $rows[$i]['_depth']);
        }

        return $rows;
    }

    private function collectRows(): array
    {
        $rows = [];

        foreach (self::ENTITIES as $type => [$class, $titleColumn, $adminPath, $label, $relations, $bodyColumns, $depth]) {
            $records = $class::query()
                ->with(['seo', ...$relations])
                ->orderBy($titleColumn)
                ->get();

            foreach ($records as $record) {
                $resolved = $record->resolvedSeo();
                $override = $record->seo;

                $body = trim(implode("\n", array_filter(array_map(
                    fn ($column) => (string) ($record->{$column} ?? ''),
                    $bodyColumns,
                ))));

                $overridden = array_values(array_filter(
                    ['title', 'description', 'og_title', 'og_description', 'canonical_url', 'robots'],
                    fn ($f) => filled($override?->{$f}),
                ));

                $rows[] = [
                    'type' => $type,
                    'type_label' => $label,
                    'id' => $record->id,
                    'name' => $record->{$titleColumn},
                    // A landing page has no slug of its own — its address is
                    // composed from two or three other records and stored whole.
                    'slug' => $record->slug ?? ltrim($record->publicPath(), '/'),
                    'admin_path' => "/admin/{$adminPath}/{$record->id}",
                    'url' => $resolved['canonical_url'],
                    /*
                     * Where the record lives, as a **path** and not a URL.
                     *
                     * Deliberately origin-less. `config('app.frontend_url')` is
                     * pinned to the production domain because canonicals and
                     * the sitemap are built from it, so a link built on it sent
                     * an editor working on localhost to the live site. The
                     * console and the public site are one Next application on
                     * one origin, so a path resolves against whatever origin
                     * the person is actually on and is right everywhere.
                     *
                     * Built from the record's own prefix and slug rather than
                     * read off the canonical. The two agree on almost every
                     * record and diverge on exactly the ones that matter: a
                     * canonical is an override, and aiming one at another page
                     * is a legitimate thing to do with duplicate content.
                     * "Open the page" following it would open somebody else's.
                     */
                    'public_path' => $record->publicPath(),
                    'title' => $resolved['title'],
                    'description' => $resolved['description'],
                    'focus_keyword' => $resolved['focus_keyword'],
                    // Which fields the editor actually typed, as against what
                    // the model derived. A derived title is fine until it is
                    // not, and the record's own form cannot tell you which.
                    //
                    // Read from the fields rather than from the row existing:
                    // toggling a record out of the sitemap creates an override
                    // row with nothing in it, and every record that had ever
                    // been toggled was reporting "Overridden" followed by an
                    // empty list of what.
                    'has_override' => $overridden !== [],
                    'overridden' => $overridden,
                    'sitemap_include' => (bool) ($override?->sitemap_include ?? true),
                    '_resolved' => $resolved,
                    '_body' => $body,
                    '_has_body' => $bodyColumns !== [],
                    '_depth' => $depth,
                ];
            }
        }

        return $rows;
    }

    /**
     * The site's score, and what is dragging it down.
     *
     * A mean of the record scores rather than total earned over total
     * applicable: the second lets one long product description outweigh six
     * neglected pages, and the question being asked is "how are my pages
     * doing", where every page is one page.
     *
     * `top_issues` is the half that can be acted on. A score alone tells an
     * editor they have a problem and not one thing to do about it; the ranked
     * failures say which single fix moves the most records, and each is a
     * filter the screen can apply.
     */
    private function siteScore(array $rows): array
    {
        $values = array_map(fn ($r) => $r['score']['value'], $rows);
        $count = count($values);
        $value = $count > 0 ? (int) round(array_sum($values) / $count) : 100;

        $failures = [];
        foreach ($rows as $row) {
            foreach ($row['score']['failed'] as $check) {
                $failures[$check['key']] ??= [
                    'key' => $check['key'],
                    'label' => $check['label'],
                    'group' => $check['group'],
                    'weight' => $check['weight'],
                    'count' => 0,
                ];
                $failures[$check['key']]['count']++;
            }
        }

        // By how much each is costing — a heavy check failing on ten records
        // is a bigger hole than a light one failing on twenty.
        usort($failures, fn ($a, $b) => ($b['count'] * $b['weight']) <=> ($a['count'] * $a['weight']));

        return [
            'value' => $value,
            'band' => SeoScore::band($value),
            'records' => $count,
            'distribution' => [
                'good' => count(array_filter($values, fn ($v) => $v >= 80)),
                'fair' => count(array_filter($values, fn ($v) => $v >= 50 && $v < 80)),
                'poor' => count(array_filter($values, fn ($v) => $v < 50)),
            ],
            'top_issues' => array_slice(array_values($failures), 0, 6),
            'groups' => SeoScore::GROUPS,
        ];
    }

    private function applyFilters(array $rows, Request $request): array
    {
        $type = $request->string('type')->value();
        $term = mb_strtolower(trim($request->string('q')->value()));
        $check = $request->string('check')->value();

        if ($type !== '') {
            $rows = array_filter($rows, fn ($r) => $r['type'] === $type);
        }

        if ($term !== '') {
            $rows = array_filter($rows, fn ($r) => str_contains(mb_strtolower((string) $r['name']), $term));
        }

        if ($request->boolean('issues')) {
            $rows = array_filter($rows, fn ($r) => $r['issues'] !== []);
        }

        // Straight from a figure on the score card to the records behind it.
        // A headline nobody can open is a headline nobody can act on.
        if ($check !== '') {
            $rows = array_filter(
                $rows,
                fn ($r) => in_array($check, array_column($r['score']['failed'], 'key'), true),
            );
        }

        return array_values($rows);
    }

    /** @param  array<int, string|null>  $values */
    private function countNormalised(array $values): array
    {
        $counts = [];

        foreach ($values as $value) {
            $key = $this->normalise($value);
            if ($key === '') {
                continue;
            }
            $counts[$key] = ($counts[$key] ?? 0) + 1;
        }

        return $counts;
    }

    private function normalise(?string $value): string
    {
        return trim(preg_replace('/\s+/u', ' ', mb_strtolower((string) $value)) ?? '');
    }
}
