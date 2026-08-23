<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A single view of every indexable record's metadata. Behind role:seo_manager.
 *
 * Deliberately read-mostly. Each entity's own editor already carries a
 * SeoPanel, and a second editing surface for the same override row would be
 * two implementations of the same rules, free to drift. What is missing
 * without this screen is the overview: which pages are running on derived
 * metadata, which titles are too long to survive a search result, and what has
 * been dropped from the sitemap.
 *
 * The one thing it does write is `sitemap_include`, because that is a per-row
 * decision usually taken while looking at the whole list.
 */
class SeoController extends Controller
{
    /**
     * Every model with a SEO override: class, title column, admin path,
     * label, and anything defaultSeo() reads through a relation.
     *
     * That last item matters — preventLazyLoading is on, and Product builds
     * its default title from its brand, so listing the SEO of every product
     * throws unless the relation comes with it.
     */
    private const ENTITIES = [
        'page' => [Page::class, 'title', 'pages', 'Pages', []],
        'blog_post' => [BlogPost::class, 'title', 'blog-posts', 'Blog posts', []],
        'knowledge_article' => [KnowledgeArticle::class, 'title', 'knowledge-articles', 'Knowledge base', []],
        'case_study' => [CaseStudy::class, 'title', 'case-studies', 'Case studies', []],
        'solution' => [Solution::class, 'title', 'solutions', 'Solutions', []],
        'service' => [Service::class, 'title', 'services', 'Services', []],
        'industry' => [Industry::class, 'name', 'industries', 'Industries', []],
        'product' => [Product::class, 'name', 'products', 'Products', ['brand']],
        'product_category' => [ProductCategory::class, 'name', 'product-categories', 'Product categories', []],
    ];

    /** Google truncates around here; these are guidance, not validation. */
    private const TITLE_MAX = 60;

    private const DESCRIPTION_MIN = 70;

    private const DESCRIPTION_MAX = 160;

    public function index(Request $request): JsonResponse
    {
        $only = $request->string('type')->value();
        $term = $request->string('q')->value();
        $rows = [];

        foreach (self::ENTITIES as $type => [$class, $titleColumn, $adminPath, $label, $relations]) {
            if ($only && $only !== $type) {
                continue;
            }

            $records = $class::query()
                ->with(['seo', ...$relations])
                ->when($term !== '', fn ($q) => $q->where($titleColumn, 'like', "%{$term}%"))
                ->orderBy($titleColumn)
                ->get();

            foreach ($records as $record) {
                $resolved = $record->resolvedSeo();
                $override = $record->seo;

                $rows[] = [
                    'type' => $type,
                    'type_label' => $label,
                    'id' => $record->id,
                    'name' => $record->{$titleColumn},
                    'slug' => $record->slug,
                    'admin_path' => "/admin/{$adminPath}/{$record->id}",
                    'url' => $resolved['canonical_url'],
                    'title' => $resolved['title'],
                    'description' => $resolved['description'],
                    // Which fields the editor actually typed, as against what
                    // the model derived. This is the whole point of the screen:
                    // a derived title is fine until it is not, and you cannot
                    // tell which is which from the record's own edit form.
                    'has_override' => (bool) $override?->exists,
                    'overridden' => array_values(array_filter(
                        ['title', 'description', 'og_title', 'og_description', 'canonical_url', 'robots'],
                        fn ($f) => filled($override?->{$f}),
                    )),
                    'sitemap_include' => (bool) ($override?->sitemap_include ?? true),
                    'issues' => $this->issues($resolved),
                ];
            }
        }

        /*
         * Paginated, and the issues filter applied here rather than in the
         * browser.
         *
         * The two go together and cannot be separated: filtering a page of
         * results client-side hides only the rows that happen to be on the
         * page you are looking at, which is worse than not filtering. This
         * screen was the one admin list with no pagination at all — it
         * reported 53 records and rendered all 53, and that number grows with
         * the catalogue.
         *
         * with_issues counts the whole matching set, not the page, because it
         * is a headline figure rather than a description of what is on screen.
         */
        $withIssues = count(array_filter($rows, fn ($r) => $r['issues'] !== []));

        if ($request->boolean('issues')) {
            $rows = array_values(array_filter($rows, fn ($r) => $r['issues'] !== []));
        }

        $total = count($rows);
        $perPage = min(max((int) $request->integer('per_page', 50), 1), 200);
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min(max((int) $request->integer('page', 1), 1), $lastPage);

        return response()->json([
            'data' => array_slice($rows, ($page - 1) * $perPage, $perPage),
            'meta' => [
                'total' => $total,
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'with_issues' => $withIssues,
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
     * override row yet gets one rather than the change being dropped — which
     * is the bug this project already shipped once with this exact flag.
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

    /** @return array<int, string> */
    private function issues(array $resolved): array
    {
        $issues = [];
        $title = (string) ($resolved['title'] ?? '');
        $description = (string) ($resolved['description'] ?? '');

        if (trim($title) === '') {
            $issues[] = 'No title';
        } elseif (mb_strlen($title) > self::TITLE_MAX) {
            $issues[] = 'Title over '.self::TITLE_MAX.' characters';
        }

        if (trim($description) === '') {
            $issues[] = 'No description';
        } elseif (mb_strlen($description) < self::DESCRIPTION_MIN) {
            $issues[] = 'Description under '.self::DESCRIPTION_MIN.' characters';
        } elseif (mb_strlen($description) > self::DESCRIPTION_MAX) {
            $issues[] = 'Description over '.self::DESCRIPTION_MAX.' characters';
        }

        if (str_contains((string) ($resolved['robots'] ?? ''), 'noindex')) {
            $issues[] = 'Set to noindex';
        }

        return $issues;
    }
}
