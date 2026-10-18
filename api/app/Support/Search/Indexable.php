<?php

namespace App\Support\Search;

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
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * The one list of kinds semantic search indexes (docs/semantic-search.md), and
 * the published query for each — the same scope each kind's public read uses,
 * never a second definition. FAQs are not a kind: they are read into their
 * owner's document, so a draft owner's questions are never searchable.
 * Industries and product categories have no status and are always public.
 */
final class Indexable
{
    /** alias => [class, label, title column, summary column|null, body columns, has a published scope?] */
    private const KINDS = [
        'solution' => [Solution::class, 'Solutions', 'title', 'summary', ['problem_statement', 'overview'], true],
        'service' => [Service::class, 'Services', 'title', 'summary', ['body'], true],
        'industry' => [Industry::class, 'Industries', 'name', 'summary', ['body'], false],
        'product_category' => [ProductCategory::class, 'Product categories', 'name', 'description', [], false],
        'product' => [Product::class, 'Products', 'name', 'short_description', ['description'], true],
        'store_product' => [StoreProduct::class, 'In the shop', 'name', 'short_description', ['description'], true],
        'knowledge_article' => [KnowledgeArticle::class, 'Knowledge base', 'title', 'excerpt', ['body'], true],
        'blog_post' => [BlogPost::class, 'Blog', 'title', 'excerpt', ['body'], true],
        'case_study' => [CaseStudy::class, 'Case studies', 'title', 'summary', ['body'], true],
        'page' => [Page::class, 'Pages', 'title', null, ['body'], true],
        'event' => [Event::class, 'Events', 'title', 'summary', ['body'], true],
        'tender' => [Tender::class, 'Tenders', 'title', 'summary', ['description'], true],
        'download' => [Download::class, 'Downloads', 'title', 'summary', [], true],
        'entry' => [Entry::class, 'More from the site', 'title', 'summary', ['body'], true],
    ];

    /** @return list<string> */
    public static function aliases(): array
    {
        return array_keys(self::KINDS);
    }

    /** @return class-string<Model>|null */
    public static function classFor(string $alias): ?string
    {
        return self::KINDS[$alias][0] ?? null;
    }

    public static function query(string $alias): ?Builder
    {
        if (! isset(self::KINDS[$alias])) {
            return null;
        }

        [$class, , , , , $scoped] = self::KINDS[$alias];

        return $scoped ? $class::query()->published() : $class::query();
    }

    public static function isIndexed(Model $model): bool
    {
        $query = self::query($model->getMorphClass());

        return $query !== null && $query->whereKey($model->getKey())->exists();
    }

    public static function label(string $alias): string
    {
        return self::KINDS[$alias][1] ?? $alias;
    }

    public static function title(Model $model): string
    {
        return (string) $model->getAttribute(self::KINDS[$model->getMorphClass()][2] ?? 'title');
    }

    public static function summaryColumn(string $alias): ?string
    {
        return self::KINDS[$alias][3] ?? null;
    }

    /** @return list<string> */
    public static function bodyColumns(string $alias): array
    {
        return self::KINDS[$alias][4] ?? [];
    }
}
