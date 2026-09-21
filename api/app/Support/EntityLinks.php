<?php

namespace App\Support;

use App\Models\BlogPost;
use App\Models\KnowledgeArticle;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

/**
 * What a record is connected to, as names and paths — the `entity` block
 * every public detail resource carries.
 *
 * The relationships already existed in MySQL (`product.brand`,
 * `product_solution`, `solution_industry`, `case_study.industry`, the
 * store's new service pivot); what was missing was that a page never *said*
 * them in one place. This is that place: the one mapping from a loaded
 * relation to `{name, path}`, so the "Related" sections on the page, the
 * `about`/`mentions` stubs in the graph and the GEO score all read one
 * answer.
 *
 * **Loaded relations only.** `preventLazyLoading` is on outside production,
 * so a relation the controller did not load is a 500 here, not a query — and
 * an index row, which loads nothing, gets `[]` everywhere rather than a
 * lookup per row. Every list is `[]` when the relation is absent or empty;
 * `brand` and `category` are absent keys rather than null, the rule
 * `StructuredData::prune()` follows for the same shape.
 *
 * **Paths, never URLs.** The SEO overview's rule: `config('app.frontend_url')`
 * is pinned to the production domain, so a link built on it is right for a
 * crawler and wrong for a person working on localhost. The frontend supplies
 * the origin.
 *
 * `articles` is the supporting content — a post or a knowledge article that
 * links to this page — set on the record as `supportingArticles` by the
 * detail controllers through `supportingArticles()` below, so it reaches
 * here by the same door as everything else.
 */
final class EntityLinks
{
    /** How many supporting articles a page names; more is a list, not a link. */
    public const ARTICLE_LIMIT = 6;

    /**
     * @return array{brand?: array{name: string, path: string}, category?: array{name: string, path: string}, solutions: array<int, array{name: string, path: string}>, services: array<int, array{name: string, path: string}>, industries: array<int, array{name: string, path: string}>, articles: array<int, array{name: string, path: string}>, faq_count: int}
     */
    public static function for(Model $record): array
    {
        $entity = [];

        // `brand` and `category` are singular and absent when there is none.
        // `parent` is a product category's own parent; `category` on a post
        // or an article is its taxonomy — each a real page with a path.
        foreach (['brand' => ['brand'], 'category' => ['category', 'parent']] as $key => $relations) {
            foreach ($relations as $relation) {
                $one = self::one($record, $relation);
                if ($one !== null) {
                    $entity[$key] = $one;
                    break;
                }
            }
        }

        // A post is filed under several categories; the first is the one
        // the page names, and one is what `category` means here.
        if (! isset($entity['category']) && ($first = self::many($record, ['categories'])) !== []) {
            $entity['category'] = $first[0];
        }

        $entity['solutions'] = self::many($record, ['solutions', 'relatedSolutions']);
        $entity['services'] = self::many($record, ['services']);
        // A case study has one industry; a solution has many. Same list.
        $entity['industries'] = array_merge(
            ($one = self::one($record, 'industry')) ? [$one] : [],
            self::many($record, ['industries']),
        );
        $entity['articles'] = self::many($record, ['supportingArticles', 'caseStudies']);
        $entity['faq_count'] = $record->relationLoaded('faqs') ? $record->getRelation('faqs')->count() : 0;

        return $entity;
    }

    /**
     * Published posts and knowledge articles whose body links to this
     * record's page — "supporting content" in the one sense that can be
     * measured: somebody wrote about it and pointed here.
     *
     * A `LIKE` over the bodies rather than a pivot nobody would maintain.
     * The path is matched as an `href` with a closing quote or a following
     * slash, so `/solutions/networking` does not claim
     * `/solutions/networking-audit`. Capped, because six is a set of links
     * and sixty is a list.
     *
     * @return Collection<int, Model>
     */
    public static function supportingArticles(Model $record): Collection
    {
        if (! method_exists($record, 'publicPath')) {
            return new Collection;
        }

        $path = $record->publicPath();
        $needles = ['href="'.$path.'"', "href='".$path."'", 'href="'.$path.'?', 'href="'.$path.'#'];

        $matches = fn ($query) => $query->where(function ($q) use ($needles) {
            foreach ($needles as $needle) {
                $q->orWhere('body', 'like', '%'.self::escapeLike($needle).'%');
            }
        });

        $posts = BlogPost::published()->where($matches)->orderByDesc('published_at')->limit(self::ARTICLE_LIMIT)->get();
        $articles = KnowledgeArticle::published()->where($matches)->orderByDesc('published_at')->limit(self::ARTICLE_LIMIT)->get();

        /** @var Collection<int, Model> $merged */
        $merged = (new Collection)
            ->concat($posts->all())
            ->concat($articles->all())
            ->reject(fn (Model $m) => $m->is($record))
            ->take(self::ARTICLE_LIMIT)
            ->values();

        return $merged;
    }

    /**
     * What a detail controller calls after its `load()`: the supporting
     * articles set on the record as a relation, so `for()` and the graph
     * read them through the same door as every loaded relation.
     */
    public static function attach(Model $record): Model
    {
        return $record->setRelation('supportingArticles', self::supportingArticles($record));
    }

    /**
     * The same answer for every record at once, for the SEO overview.
     *
     * The overview scores every record, and a `LIKE` per record over every
     * article body is the N+1 that file already refuses for its duplicate
     * checks. One pass instead: each published post and article is read once,
     * every internal `href` in it is lifted out, and the result is a map from
     * path to the articles that link there. `attachFrom()` sets it on a
     * record the way `attach()` does.
     *
     * @return array<string, Collection<int, Model>>
     */
    public static function supportingArticlesIndex(): array
    {
        $index = [];

        $articles = (new Collection)
            ->concat(BlogPost::published()->orderByDesc('published_at')->get(['id', 'title', 'slug', 'body', 'status'])->all())
            ->concat(KnowledgeArticle::published()->orderByDesc('published_at')->get(['id', 'title', 'slug', 'body', 'status'])->all());

        foreach ($articles as $article) {
            if (! preg_match_all('#href=["\'](/[^"\'?\#]*)#i', (string) $article->getAttribute('body'), $found)) {
                continue;
            }

            foreach (array_unique($found[1]) as $path) {
                $path = rtrim($path, '/') ?: '/';
                $index[$path] ??= new Collection;

                if ($index[$path]->count() < self::ARTICLE_LIMIT) {
                    $index[$path]->push($article);
                }
            }
        }

        return $index;
    }

    /**
     * @param  array<string, Collection<int, Model>>  $index
     */
    public static function attachFrom(Model $record, array $index): Model
    {
        $path = method_exists($record, 'publicPath') ? rtrim($record->publicPath(), '/') : '';

        /** @var Collection<int, Model> $articles */
        $articles = ($index[$path] ?? new Collection)
            ->reject(fn (Model $m) => $m->is($record))
            ->values();

        return $record->setRelation('supportingArticles', $articles);
    }

    /** @return array{name: string, path: string}|null */
    private static function one(Model $record, string $relation): ?array
    {
        if (! $record->relationLoaded($relation)) {
            return null;
        }

        $related = $record->getRelation($relation);

        return $related instanceof Model ? self::link($related) : null;
    }

    /**
     * @param  array<int, string>  $relations
     * @return array<int, array{name: string, path: string}>
     */
    private static function many(Model $record, array $relations): array
    {
        $out = [];

        foreach ($relations as $relation) {
            if (! $record->relationLoaded($relation)) {
                continue;
            }

            foreach ($record->getRelation($relation) ?? [] as $related) {
                if ($related instanceof Model && ($link = self::link($related)) !== null) {
                    $out[$link['path']] = $link;
                }
            }
        }

        return array_values($out);
    }

    /** @return array{name: string, path: string}|null */
    private static function link(Model $related): ?array
    {
        if (! method_exists($related, 'publicPath')) {
            return null;
        }

        // A draft is not a page anybody can be sent to.
        $status = $related->getAttribute('status');
        $status = $status instanceof \BackedEnum ? $status->value : $status;
        if ($status !== null && $status !== 'published') {
            return null;
        }

        $name = $related->getAttribute('title') ?? $related->getAttribute('name');

        if (! is_string($name) || $name === '') {
            return null;
        }

        return ['name' => $name, 'path' => $related->publicPath()];
    }

    private static function escapeLike(string $value): string
    {
        return addcslashes($value, '%_\\');
    }
}
