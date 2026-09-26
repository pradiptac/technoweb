<?php

namespace App\Support\CustomFields;

use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Product;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreProduct;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * The kinds of record a custom field group can be attached to, and a linked
 * record field can point at.
 *
 * **The one list.** A group's `targets`, a relation field's `settings.target`,
 * the console's checklist and the picker behind a linked-record field are all
 * read from here — a second copy of "which records take custom fields" is the
 * drift `SeoController::ENTITIES` and `FaqController::OWNERS` were each
 * caught by.
 *
 * The key is the **morph alias** for every existing model — one vocabulary
 * for "which kind of record", the rule `MenuItemType` follows — and
 * `entry:<type-slug>` for a custom content type, whose entries share one
 * table and are told apart by their type.
 */
final class Targets
{
    /**
     * key => [model, title column, label]. Products, industries and the
     * store's products are titled `name`; the rest `title`.
     *
     * @var array<string, array{0: class-string<Model>, 1: string, 2: string}>
     */
    public const MODELS = [
        'page' => [Page::class, 'title', 'Pages'],
        'blog_post' => [BlogPost::class, 'title', 'Blog posts'],
        'knowledge_article' => [KnowledgeArticle::class, 'title', 'Knowledge base'],
        'case_study' => [CaseStudy::class, 'title', 'Case studies'],
        'solution' => [Solution::class, 'title', 'Solutions'],
        'service' => [Service::class, 'title', 'Services'],
        'industry' => [Industry::class, 'name', 'Industries'],
        'product' => [Product::class, 'name', 'Products'],
        'store_product' => [StoreProduct::class, 'name', 'Store products'],
    ];

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_column(self::options(), 'value');
    }

    public static function exists(string $key): bool
    {
        return in_array($key, self::keys(), true);
    }

    /**
     * What the console's checklist and the relation target select show.
     *
     * @return array<int, array{value: string, label: string}>
     */
    public static function options(): array
    {
        $out = [];

        foreach (self::MODELS as $key => [, , $label]) {
            $out[] = ['value' => $key, 'label' => $label];
        }

        return array_merge($out, EntryTargets::options());
    }

    public static function label(string $key): string
    {
        foreach (self::options() as $option) {
            if ($option['value'] === $key) {
                return $option['label'];
            }
        }

        return $key;
    }

    /**
     * Every record of a target, whatever its status — what the console's
     * picker lists and what a linked-record value may name.
     *
     * @return Builder<Model>|null
     */
    public static function query(string $key): ?Builder
    {
        if (isset(self::MODELS[$key])) {
            return self::MODELS[$key][0]::query();
        }

        return EntryTargets::query($key);
    }

    /**
     * The records of a target the public site may link to.
     *
     * An industry has no status — it is reference data the catalogue points
     * at — so every one is linkable. Everything else answers through its own
     * `published()` scope, and an entry also needs its type switched on.
     *
     * @return Builder<Model>|null
     */
    public static function publicQuery(string $key): ?Builder
    {
        if (isset(self::MODELS[$key])) {
            $query = self::MODELS[$key][0]::query();

            return method_exists(self::MODELS[$key][0], 'scopePublished') ? $query->published() : $query;
        }

        return EntryTargets::publicQuery($key);
    }

    public static function titleColumn(string $key): string
    {
        return self::MODELS[$key][1] ?? 'title';
    }

    /** The validation rule for "an id of a record of this target". */
    public static function existsRule(string $key): ?Exists
    {
        if (isset(self::MODELS[$key])) {
            [$class] = self::MODELS[$key];
            $model = new $class;
            $rule = Rule::exists($model->getTable(), 'id');

            // A product in the bin is not something to link to.
            return method_exists($model, 'getDeletedAtColumn')
                ? $rule->whereNull($model->getDeletedAtColumn())
                : $rule;
        }

        return EntryTargets::existsRule($key);
    }

    /**
     * id => {title, path} for the linkable records among `$ids`.
     *
     * One query per target on a detail read, never one per value. A record
     * that is no longer public is absent, so the caller drops the value
     * rather than linking to a 404.
     *
     * @param  array<int, int>  $ids
     * @return array<int, array{title: string, path: string}>
     */
    public static function resolve(string $key, array $ids): array
    {
        $query = self::publicQuery($key);

        if ($query === null || $ids === []) {
            return [];
        }

        $title = self::titleColumn($key);
        $out = [];

        foreach (EntryTargets::withType($key, $query)->whereKey($ids)->get() as $record) {
            $out[(int) $record->getKey()] = [
                'title' => (string) $record->getAttribute($title),
                'path' => method_exists($record, 'publicPath') ? $record->publicPath() : '/',
            ];
        }

        return $out;
    }

    /**
     * Up to 200 choices for the console's linked-record select.
     *
     * Capped rather than dumped, the menu builder's reasoning: a select of
     * a thousand products is one nobody can find anything in. The cap is
     * stated in the field's hint.
     *
     * @return array<int, array{value: int, label: string}>
     */
    public static function choices(string $key, int $limit = 200): array
    {
        $query = self::query($key);

        if ($query === null) {
            return [];
        }

        $title = self::titleColumn($key);

        return $query->orderBy($title)->limit($limit)->get()
            ->map(fn (Model $m) => ['value' => (int) $m->getKey(), 'label' => (string) $m->getAttribute($title)])
            ->values()
            ->all();
    }
}
