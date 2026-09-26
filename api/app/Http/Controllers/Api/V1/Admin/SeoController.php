<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Enums\PublishStatus;
use App\Enums\SeoSuggestionStatus;
use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Certification;
use App\Models\Entry;
use App\Models\Industry;
use App\Models\JobOpening;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\SeoSuggestion;
use App\Models\Service;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Support\AeoScore;
use App\Support\EntityLinks;
use App\Support\GeoScore;
use App\Support\ListSort;
use App\Support\Seo\GoogleAnalytics;
use App\Support\Seo\SearchConsole;
use App\Support\SeoScore;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
        'page' => [Page::class, 'title', 'pages', 'Pages', ['faqs', 'answerBlocks'], ['body'], 300],
        'blog_post' => [BlogPost::class, 'title', 'blog', 'Blog posts', ['author', 'categories', 'faqs', 'answerBlocks'], ['body'], 300],
        'knowledge_article' => [KnowledgeArticle::class, 'title', 'knowledge-base', 'Knowledge base', ['category', 'faqs', 'answerBlocks'], ['body'], 300],
        'case_study' => [CaseStudy::class, 'title', 'case-studies', 'Case studies', ['industry'], ['body'], 250],
        'solution' => [Solution::class, 'title', 'solutions', 'Solutions', ['industries', 'faqs', 'answerBlocks'], ['problem_statement', 'overview'], 250],
        'service' => [Service::class, 'title', 'services', 'Services', ['faqs', 'answerBlocks'], ['body'], 250],
        'industry' => [Industry::class, 'name', 'industries', 'Industries', ['solutions', 'faqs', 'answerBlocks'], ['body'], 200],
        'product' => [Product::class, 'name', 'products', 'Products', ['brand', 'category', 'solutions', 'faqs', 'answerBlocks'], ['description'], 150],
        'product_category' => [ProductCategory::class, 'name', 'product-categories', 'Product categories', ['parent', 'faqs', 'answerBlocks'], ['description'], 80],
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
        'store_product' => [StoreProduct::class, 'name', 'store/products', 'Store products', ['brand', 'category', 'services', 'faqs', 'answerBlocks'], ['description'], 150],
        /*
         * `store_category` joins them for the reason its own model comment
         * now gives: "not a page" was measured against the wrong thing. A
         * category with something in it is a real page at
         * `/store/categories/{slug}`, in the sitemap since the store shipped,
         * and it had no score, no duplicate check and nothing on this screen
         * to open and fix.
         */
        'store_category' => [StoreCategory::class, 'name', 'store/categories', 'Store categories', ['faqs', 'answerBlocks'], ['description'], 80],
        /*
         * Entries of the custom content types (docs/custom-content.md) — one
         * row per entry. The console route is per type
         * (`/admin/content/{type}/{id}`), so the record answers `adminPath()`
         * itself rather than taking the segment here.
         */
        'entry' => [Entry::class, 'title', 'content', 'Custom content', ['contentType', 'faqs', 'answerBlocks'], ['body'], 250],
    ];

    /** The bands `?aeo=` and `?geo=` may ask for. */
    private const BAND_FILTERS = ['poor', 'fair', 'good'];

    /**
     * The record a `type` and `id` name, or null.
     *
     * Public because the AI assistant addresses records the same way this
     * screen does, and **the map above must stay the only one**. A second copy
     * of "which thirteen models carry SEO" is the drift that produced
     * `admin_path` spelled with the API's resource names and
     * `schema_type_options` written out twice — and here it would be worse than
     * cosmetic: a type missing from one list is a record the assistant silently
     * cannot work on, with nothing reporting a difference.
     */
    public static function locate(string $type, int|string $id): ?Model
    {
        if (! isset(self::ENTITIES[$type])) {
            return null;
        }

        [$class] = self::ENTITIES[$type];

        return $class::find($id);
    }

    /** @return array<int, string> */
    public static function types(): array
    {
        return array_keys(self::ENTITIES);
    }

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
        $rows = $this->withAnalytics($this->withSearch($this->withPendingSuggestions($this->scoreRows($this->collectRows()))));

        $site = $this->siteScore($rows);
        $withIssues = count(array_filter($rows, fn ($r) => $r['issues'] !== []));

        $rows = $this->applyFilters($rows, $request);

        // `?sort=aeo|geo` with `?dir=`; anything else keeps the type-then-title
        // order the rows were collected in.
        $rows = ListSort::applyToRows($rows, $request, [
            'aeo' => fn (array $r) => $r['aeo']['value'],
            'geo' => fn (array $r) => $r['geo']['value'],
            'score' => fn (array $r) => $r['score']['value'],
        ]);

        $total = count($rows);
        $perPage = min(max((int) $request->integer('per_page', 50), 1), 200);
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min(max((int) $request->integer('page', 1), 1), $lastPage);

        // The list carries the figure and the band; the checks behind them
        // come from the single-record read, which is where somebody opens a
        // row to act on it. Fifty rows of twenty-two hints each is bytes
        // over the wire for text nobody is looking at.
        $data = array_map(function (array $row) {
            foreach (['aeo', 'geo'] as $key) {
                $row[$key] = ['value' => $row[$key]['value'], 'band' => $row[$key]['band']];
            }

            return $row;
        }, array_slice($rows, ($page - 1) * $perPage, $perPage));

        return response()->json([
            'data' => $data,
            'meta' => [
                'total' => $total,
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'with_issues' => $withIssues,
                'site_score' => $site,
                // The assistant's state, for the overview's bulk control — the
                // same block the SEO panel reads from `seo/ai/suggestions`.
                'ai' => SeoAiController::meta(),
                // Search Console: whether the column is there, over how many days, and the last refusal.
                'search' => [
                    'configured' => SearchConsole::configured(),
                    'days' => SearchConsole::DAYS,
                    'error' => SearchConsole::lastError(),
                ],
                // Google Analytics: the same three answers about the other column.
                'analytics' => [
                    'configured' => GoogleAnalytics::configured(),
                    'days' => GoogleAnalytics::DAYS,
                    'error' => GoogleAnalytics::lastError(),
                ],
                'types' => array_map(
                    fn ($type, $entity) => ['value' => $type, 'label' => $entity[3]],
                    array_keys(self::ENTITIES),
                    array_values(self::ENTITIES),
                ),
                'sorts' => ['aeo', 'geo', 'score'],
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
        $site = $this->siteFacts();

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

            /*
             * The two newer questions, scored from the same collection pass.
             * `internal_links` is the regex `SeoScore` uses for its own check,
             * so the two scores cannot disagree about whether a body links
             * anywhere. Every site-wide fact comes from `siteFacts()`, read
             * once for the whole overview.
             */
            $rows[$i]['aeo'] = AeoScore::publish(AeoScore::for([
                'type' => $row['type'],
                'title' => $row['name'],
                'body' => $row['_body'],
                'has_body' => $row['_has_body'],
                'answer_blocks' => $row['_kinds'],
                'overlong_answers' => $row['_overlong'],
                'faq_count' => $row['entity']['faq_count'],
                'has_specs' => $row['_has_specs'],
                'internal_links' => (bool) preg_match('#<a\b[^>]*href=["\']/(?!/)#i', $row['_body']),
                // Every page carries the layout's Organization, WebSite and
                // BreadcrumbList nodes whatever the record emits of its own,
                // so this is true for all of them today.
                'structured' => true,
            ]));

            $rows[$i]['geo'] = GeoScore::publish(GeoScore::for([
                'type' => $row['type'],
                'entity' => $row['entity'],
                'answer_blocks' => $row['_kinds'],
                'author' => $row['_author'],
            ] + $site));

            unset(
                $rows[$i]['_resolved'], $rows[$i]['_body'], $rows[$i]['_has_body'], $rows[$i]['_depth'],
                $rows[$i]['_kinds'], $rows[$i]['_overlong'], $rows[$i]['_has_specs'], $rows[$i]['_author'],
            );
        }

        return $rows;
    }

    /**
     * What is true of the site rather than of any record, read once.
     *
     * `organization_complete` is the five facts an `Organization` node needs
     * to resolve to one company; `nap_consistent` is the name, address and
     * phone being set *and* the one other stored postal address — the
     * newsletter footer's — agreeing with the site's, whitespace aside.
     * `certifications` is a live, published credential on file.
     *
     * @return array{certifications: bool, organization_complete: bool, nap_consistent: bool}
     */
    private function siteFacts(): array
    {
        $name = trim((string) Setting::get('company_name'));
        $address = trim((string) Setting::get('address'));
        $phone = trim((string) Setting::get('phone'));
        $email = trim((string) Setting::get('support_email'));
        $logo = trim((string) Setting::get('logo_path'));
        $newsletterAddress = trim((string) Setting::get('newsletter_address'));

        $squash = fn (string $s) => preg_replace('/\s+/u', ' ', mb_strtolower($s)) ?? '';

        return [
            'certifications' => Certification::query()->live()->exists(),
            'organization_complete' => $name !== '' && $address !== '' && $phone !== '' && $email !== '' && $logo !== '',
            'nap_consistent' => $name !== '' && $address !== '' && $phone !== ''
                && ($newsletterAddress === '' || $squash($newsletterAddress) === $squash($address)),
        ];
    }

    /**
     * Product categories have no relation to solutions of their own — the
     * link lives on the product — so the public read computes "the solutions
     * this category's hardware is deployed in" per category. The overview
     * needs the same answer for every category at once: one query over the
     * pivot, grouped in PHP, set on each record as `relatedSolutions` so
     * `EntityLinks` reads it like any loaded relation.
     *
     * @return array<int, Collection<int, Solution>>
     */
    private function solutionsByCategory(): array
    {
        $pairs = DB::table('product_solution')
            ->join('products', 'products.id', '=', 'product_solution.product_id')
            ->join('solutions', 'solutions.id', '=', 'product_solution.solution_id')
            ->whereNull('products.deleted_at')
            ->where('products.status', 'published')
            ->where('solutions.status', 'published')
            ->whereNotNull('products.product_category_id')
            ->distinct()
            ->get(['products.product_category_id as category_id', 'solutions.id as solution_id']);

        $solutions = Solution::query()->whereIn('id', $pairs->pluck('solution_id')->unique())->get()->keyBy('id');

        $byCategory = [];
        foreach ($pairs as $pair) {
            $solution = $solutions->get($pair->solution_id);
            if ($solution !== null) {
                $byCategory[(int) $pair->category_id] ??= new Collection;
                $byCategory[(int) $pair->category_id]->push($solution);
            }
        }

        return $byCategory;
    }

    private function collectRows(): array
    {
        $rows = [];
        $articles = EntityLinks::supportingArticlesIndex();
        $solutionsByCategory = $this->solutionsByCategory();

        foreach (self::ENTITIES as $type => [$class, $titleColumn, $adminPath, $label, $relations, $bodyColumns, $depth]) {
            $records = $class::query()
                ->with(['seo', ...$relations])
                ->orderBy($titleColumn)
                ->get();

            foreach ($records as $record) {
                $resolved = $record->resolvedSeo();
                $override = $record->seo;

                // The relationships the record states, the way its page
                // states them. The supporting articles and a category's
                // solutions are set from the two one-pass lookups above.
                EntityLinks::attachFrom($record, $articles);
                if ($type === 'product_category') {
                    $record->setRelation('relatedSolutions', $solutionsByCategory[$record->id] ?? new Collection);
                }
                $entity = EntityLinks::for($record);

                $blocks = $record->relationLoaded('answerBlocks')
                    ? $record->getRelation('answerBlocks')->where('status', PublishStatus::Published)
                    : new Collection;

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
                    'admin_path' => method_exists($record, 'adminPath') ? $record->adminPath() : "/admin/{$adminPath}/{$record->id}",
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
                    // What the page says it is connected to — the same block
                    // the public resource carries, so the console can show
                    // the relationships as chips without a second fetch.
                    'entity' => $entity,
                    '_resolved' => $resolved,
                    '_body' => $body,
                    '_has_body' => $bodyColumns !== [],
                    '_depth' => $depth,
                    '_kinds' => $blocks->map(fn ($b) => $b->kind->value)->values()->all(),
                    '_overlong' => $blocks
                        ->filter(fn ($b) => $b->kind === AnswerBlockKind::Question && mb_strlen((string) $b->answer) > AeoScore::ANSWER_MAX)
                        ->count(),
                    '_has_specs' => in_array($type, ['product', 'store_product'], true)
                        && filled($record->getAttribute('specifications')),
                    '_author' => $type === 'blog_post'
                        && $record->relationLoaded('author') && $record->getRelation('author') !== null,
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
            // The other two questions, averaged the same way — a mean of the
            // record scores, every page one page — with their own ranked
            // failures and group names for the console's card.
            'aeo' => $this->averageOf($rows, 'aeo', AeoScore::GROUPS),
            'geo' => $this->averageOf($rows, 'geo', GeoScore::GROUPS),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<string, string>  $groups
     * @return array{value: int, band: string, top_issues: array<int, array<string, mixed>>, groups: array<string, string>}
     */
    private function averageOf(array $rows, string $key, array $groups): array
    {
        $values = array_map(fn ($r) => $r[$key]['value'], $rows);
        $count = count($values);
        $value = $count > 0 ? (int) round(array_sum($values) / $count) : 100;

        $failures = [];
        foreach ($rows as $row) {
            foreach ($row[$key]['failed'] as $check) {
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

        usort($failures, fn ($a, $b) => ($b['count'] * $b['weight']) <=> ($a['count'] * $a['weight']));

        return [
            'value' => $value,
            'band' => SeoScore::band($value),
            'top_issues' => array_slice($failures, 0, 6),
            'groups' => $groups,
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

        // The AI review queue: records holding a suggestion nobody has read.
        if ($request->string('ai')->value() === 'pending') {
            $rows = array_filter($rows, fn ($r) => $r['ai_pending'] > 0);
        }

        // Shown and never opened: impressions with no clicks over the window —
        // the pages worth rewriting first. Twenty impressions, so one stray
        // showing does not put a page on the list.
        if ($request->string('search')->value() === 'no_clicks') {
            $rows = array_filter($rows, fn ($r) => ($r['search']['impressions'] ?? 0) >= 20 && ($r['search']['clicks'] ?? 0) === 0);
        }

        // Shown by Google, opened by nobody: a page with search figures and
        // no analytics row at all. Without Search Console there is no "shown"
        // to test against, so it is every page nobody opened; without GA4
        // there is nothing to say, and the filter yields nothing rather than
        // everything.
        if ($request->string('analytics')->value() === 'no_views') {
            $rows = ! GoogleAnalytics::configured()
                ? []
                : array_filter($rows, fn ($r) => $r['analytics'] === null && (! SearchConsole::configured() || $r['search'] !== null));
        }

        // `?aeo=poor` and `?geo=fair`: the records in a band of one of the
        // two newer scores. An unknown band is ignored rather than refused,
        // the `?check=` rule — it arrives from a link.
        foreach (['aeo', 'geo'] as $score) {
            $band = $request->string($score)->value();

            if (in_array($band, self::BAND_FILTERS, true)) {
                $rows = array_filter($rows, fn ($r) => $r[$score]['band'] === $band);
            }
        }

        // Straight from a figure on the score card to the records behind it.
        // A headline nobody can open is a headline nobody can act on.
        if ($check !== '') {
            $rows = array_filter(
                $rows,
                fn ($r) => in_array($check, array_column($r['score']['failed'], 'key'), true),
            );
        }

        // The same door for the two readiness scores: `?aeo_check=definition`
        // is the records failing that one AEO check, from the site card's
        // "biggest wins" for AEO and GEO (2026-09-21). Their own parameters
        // rather than `?check=`, because the three rubrics share a key —
        // `internal_links` is a check on all of them — and one parameter
        // could not say which score's failure is meant.
        foreach (['aeo', 'geo'] as $score) {
            $key = $request->string($score.'_check')->value();

            if ($key !== '') {
                $rows = array_filter(
                    $rows,
                    fn ($r) => in_array($key, array_column($r[$score]['failed'], 'key'), true),
                );
            }
        }

        return array_values($rows);
    }

    /**
     * How many AI suggestions each record holds that nobody has decided on.
     *
     * One grouped query over `seo_suggestions` for the whole overview, keyed
     * by morph type and id, rather than a count per row — the overview loads
     * every record, and a query per record is the N+1 this file already
     * refuses for the duplicate checks. `ai_pending` is what the console
     * badges, and `?ai=pending` is the review queue a bulk run produces.
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function withPendingSuggestions(array $rows): array
    {
        $pending = SeoSuggestion::query()
            ->where('status', SeoSuggestionStatus::Pending)
            ->selectRaw('seoable_type, seoable_id, count(*) as n')
            ->groupBy('seoable_type', 'seoable_id')
            ->get()
            ->mapWithKeys(fn ($r) => [$r->seoable_type.':'.$r->seoable_id => (int) $r->getAttribute('n')])
            ->all();

        foreach ($rows as $i => $row) {
            $rows[$i]['ai_pending'] = $pending[$row['type'].':'.$row['id']] ?? 0;
        }

        return $rows;
    }

    /**
     * Search Console's figures for each record, matched on the record's own
     * public path — clicks, impressions, CTR and position over the window —
     * or null where the property is not configured or the page had no
     * impressions. One cached table for the whole overview
     * (`SearchConsole::pages()`), never a call per row.
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function withSearch(array $rows): array
    {
        $pages = SearchConsole::pages();

        foreach ($rows as $i => $row) {
            $path = '/'.trim((string) $row['public_path'], '/');
            $rows[$i]['search'] = $pages[$path === '/' ? '/' : $path] ?? null;
        }

        return $rows;
    }

    /**
     * Google Analytics' figures for each record on the same match — views
     * and users over the window — or null where GA4 is not configured or
     * nobody opened the page. One cached report for the whole overview
     * (`GoogleAnalytics::pages()`), never a call per row.
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function withAnalytics(array $rows): array
    {
        $pages = GoogleAnalytics::pages();

        foreach ($rows as $i => $row) {
            $path = '/'.trim((string) $row['public_path'], '/');
            $rows[$i]['analytics'] = $pages[$path === '/' ? '/' : $path] ?? null;
        }

        return $rows;
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
