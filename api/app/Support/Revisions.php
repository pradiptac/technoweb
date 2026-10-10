<?php

namespace App\Support;

use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\ContentRevision;
use App\Models\Entry;
use App\Models\Event;
use App\Models\JobOpening;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Page;
use App\Models\Product;
use App\Models\SavedSection;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

/**
 * Page history (0.145.0, docs/page-builder.md "Page history").
 *
 * **The one list.** Keys are morph-map aliases — the same words `PreviewLinks`
 * uses, so the share-link list and this one cannot drift (`ContentRevisionTest`
 * checks every alias there is either registered here or named in `DEFERRED`).
 * Each entry gives the model, the staff role that owns it and the columns a
 * revision holds.
 *
 * **What is stored.** The post-save state of the content columns, so the newest
 * revision equals "now" and creation is the first. Never `status` or
 * `published_at`: restoring a version must not publish or unpublish anything.
 * Relations (SEO, FAQs, answer blocks, custom fields) are separate tables and
 * are not captured in this release.
 *
 * **On save, not autosave.** `FormDraft` already keeps unsaved work in the
 * browser; a server row per autosave would spend the cap in an hour.
 *
 * **Recording never fails a save.** A history is a convenience; a failure to
 * write one is logged at `warning` and the save goes on.
 */
final class Revisions
{
    /** Versions kept per record; older ones are pruned on insert. */
    public const KEEP = 30;

    /** A save by the same person this soon after the previous revision is folded into it. */
    public const COALESCE_MINUTES = 5;

    /** The nightly prune keeps at least this many of a record's newest, whatever their age. */
    public const KEEP_OLD = 5;

    /** Beyond the newest `KEEP_OLD`, a revision older than this goes. */
    public const MAX_AGE_DAYS = 365;

    /**
     * Kinds that carry share links but whose history is a follow-up. Listed so
     * the test can say "deliberately not yet" rather than "forgotten". Empty
     * since 0.148.0, when the other eleven were registered; a new kind of
     * shareable record is registered or named here before it ships.
     *
     * @var list<string>
     */
    public const DEFERRED = [];

    /**
     * Kinds whose version can be looked at but not put back through the edit
     * form — none: every form holds its content as named controls that
     * `FormDraft` writes. A kind added here gets History with Preview only,
     * and the dialog says why. A method rather than a constant so that the
     * empty list is not read as a fact by the analyser.
     *
     * @return list<string>
     */
    public static function previewOnly(): array
    {
        return [];
    }

    /**
     * Where a column and the edit form's control for it are named differently,
     * `alias => [column => control]`. Empty: every watched column is posted
     * under its own name by every form (checked kind by kind in 0.148.0). It
     * exists so a form that disagrees is mapped here rather than renamed.
     *
     * @return array<string, array<string, string>>
     */
    private static function fieldMaps(): array
    {
        return [];
    }

    /**
     * The columns whose words are the record's written body, in the order the
     * page draws them — what a preview shows when the version has no sections.
     * `description` on a catalogue product, a shop product and a vacancy,
     * `overview` on a solution, `intro` then `body` on a landing page.
     */
    private const BODY_COLUMNS = [
        'page' => ['body'],
        'blog_post' => ['body'],
        'knowledge_article' => ['body'],
        'case_study' => ['body'],
        'solution' => ['overview'],
        'service' => ['body'],
        'product' => ['description'],
        'store_product' => ['description'],
        'event' => ['body'],
        'job_opening' => ['description'],
        'entry' => ['body'],
        'landing_page' => ['intro', 'body'],
    ];

    /** Words for the `changed` list, sent to the console so it lists none itself. */
    private const LABELS = [
        'created' => 'Created',
        'title' => 'Title',
        'slug' => 'Address',
        'body' => 'Written body',
        'blocks' => 'Sections',
        'template' => 'Template',
        'name' => 'Name',
        'description' => 'Description',
        'overview' => 'Overview',
        'heading' => 'Heading',
        'intro' => 'Introduction',
        'body_layout' => 'Body layout',
    ];

    /**
     * alias => [model, owning role, watched columns].
     *
     * @return array<string, array{0: class-string<Model>, 1: string, 2: list<string>}>
     */
    private static function types(): array
    {
        return [
            'page' => [Page::class, 'content_manager', ['title', 'slug', 'body', 'blocks', 'template']],
            'saved_section' => [SavedSection::class, 'content_manager', ['name', 'description', 'blocks']],
            // Roles as `PreviewLinks`; the title and address, the written body
            // and the sections. Never the status or a date.
            'blog_post' => [BlogPost::class, 'content_manager', ['title', 'slug', 'body', 'body_layout', 'blocks']],
            'knowledge_article' => [KnowledgeArticle::class, 'content_manager', ['title', 'slug', 'body', 'body_layout', 'blocks']],
            'case_study' => [CaseStudy::class, 'content_manager', ['title', 'slug', 'body', 'body_layout', 'blocks']],
            'solution' => [Solution::class, 'content_manager', ['title', 'slug', 'overview', 'body_layout', 'blocks']],
            'service' => [Service::class, 'content_manager', ['title', 'slug', 'body', 'body_layout', 'blocks']],
            'product' => [Product::class, 'content_manager', ['name', 'slug', 'description', 'body_layout', 'blocks']],
            'store_product' => [StoreProduct::class, 'store_manager', ['name', 'slug', 'description', 'body_layout', 'blocks']],
            'event' => [Event::class, 'content_manager', ['title', 'slug', 'body', 'body_layout', 'blocks']],
            'job_opening' => [JobOpening::class, 'content_manager', ['title', 'slug', 'description', 'body_layout', 'blocks']],
            'entry' => [Entry::class, 'content_manager', ['title', 'slug', 'body', 'body_layout', 'blocks']],
            // No slug (its address is derived) and no sections: the heading and the two written passages.
            'landing_page' => [LandingPage::class, 'seo_manager', ['title', 'heading', 'intro', 'body']],
        ];
    }

    /** @return list<string> */
    public static function aliases(): array
    {
        return array_keys(self::types());
    }

    public static function knows(string $alias): bool
    {
        return isset(self::types()[$alias]);
    }

    public static function roleFor(string $alias): ?string
    {
        return self::types()[$alias][1] ?? null;
    }

    /** Whether this staff member may read this kind of record's history — `EnsureUserHasRole`'s rule. */
    public static function allows(User $user, string $alias): bool
    {
        $role = self::roleFor($alias);

        return $role !== null && ($user->isAdmin() || $user->hasRole($role));
    }

    /** @return list<string> */
    public static function columns(string $alias): array
    {
        return self::types()[$alias][2] ?? [];
    }

    /** @return array<string, string> column => the edit form's control, only where they differ. */
    public static function fieldMap(string $alias): array
    {
        return self::fieldMaps()[$alias] ?? [];
    }

    /** @return list<string> the columns that are the written body, for a preview. */
    public static function bodyColumns(string $alias): array
    {
        return self::BODY_COLUMNS[$alias] ?? [];
    }

    /** Whether Restore is offered: the form can take the version. */
    public static function restorable(string $alias): bool
    {
        return ! in_array($alias, self::previewOnly(), true);
    }

    /** @return array<string, string> key => words, for the kind. */
    public static function labels(string $alias): array
    {
        $labels = ['created' => self::LABELS['created']];

        foreach (self::columns($alias) as $column) {
            $labels[$column] = self::LABELS[$column] ?? $column;
        }

        return $labels;
    }

    /** The alias the model is registered under, if it is. */
    public static function aliasFor(Model $model): ?string
    {
        foreach (self::types() as $alias => [$class]) {
            if ($model instanceof $class) {
                return $alias;
            }
        }

        return null;
    }

    /**
     * Record the model's state after a save. Called from the `saved` hook.
     */
    public static function record(Model $model): void
    {
        try {
            $alias = self::aliasFor($model);

            if ($alias === null) {
                return;
            }

            $columns = self::columns($alias);

            // Nothing a revision holds moved (a status change, a touch): no row.
            if (! $model->wasRecentlyCreated && ! $model->wasChanged($columns)) {
                return;
            }

            $snapshot = [];
            foreach ($columns as $column) {
                $snapshot[$column] = $model->getAttribute($column);
            }
            $snapshot = self::canonical($snapshot);
            $hash = sha1((string) json_encode($snapshot));

            $latest = ContentRevision::query()
                ->where('subject_type', $alias)
                ->where('subject_id', $model->getKey())
                ->orderByDesc('id')
                ->first();

            // Identical content adds nothing — a save that changed only what a
            // revision does not hold, or re-saved the same words.
            if ($latest !== null && $latest->hash === $hash) {
                return;
            }

            $user = self::actor();
            $blocks = $snapshot['blocks'] ?? null;
            $count = is_array($blocks) ? count($blocks) : 0;

            if ($latest !== null && self::coalesces($latest, $user)) {
                // Folded into the previous revision: its state becomes this
                // one, and `changed` is read against the revision before it, so
                // the list still says what the folded saves did together.
                $before = ContentRevision::query()
                    ->where('subject_type', $alias)
                    ->where('subject_id', $model->getKey())
                    ->where('id', '<', $latest->id)
                    ->orderByDesc('id')
                    ->first();

                $latest->forceFill([
                    'snapshot' => $snapshot,
                    'hash' => $hash,
                    'changed' => self::diff($columns, $snapshot, $before?->snapshot),
                    'blocks_count' => $count,
                ])->save();

                return;
            }

            ContentRevision::create([
                'subject_type' => $alias,
                'subject_id' => $model->getKey(),
                'user_id' => $user?->getKey(),
                'actor_name' => $user?->name,
                'snapshot' => $snapshot,
                'changed' => self::diff($columns, $snapshot, $latest?->snapshot),
                'blocks_count' => $count,
                'hash' => $hash,
            ]);

            self::trim($alias, (int) $model->getKey());
        } catch (\Throwable $e) {
            Log::warning('Could not record a revision: '.$e->getMessage());
        }
    }

    /** Delete a record's history with it. */
    public static function forget(Model $model): void
    {
        try {
            $alias = self::aliasFor($model);

            if ($alias !== null) {
                ContentRevision::query()
                    ->where('subject_type', $alias)
                    ->where('subject_id', $model->getKey())
                    ->delete();
            }
        } catch (\Throwable $e) {
            Log::warning('Could not delete the revisions of a deleted record: '.$e->getMessage());
        }
    }

    /**
     * The nightly sweep: history whose record has gone, and old revisions past
     * the newest few. Returns [orphans deleted, aged deleted].
     *
     * @return array{0: int, 1: int}
     */
    public static function prune(): array
    {
        $orphans = 0;
        $aged = 0;

        foreach (self::types() as $alias => [$class]) {
            $key = (new $class)->getKeyName();

            $orphans += ContentRevision::query()
                ->where('subject_type', $alias)
                ->whereNotIn('subject_id', $class::query()->select($key))
                ->delete();
        }

        // Rows older than the age limit, except each record's newest KEEP_OLD.
        $old = ContentRevision::query()
            ->where('updated_at', '<', now()->subDays(self::MAX_AGE_DAYS))
            ->get(['id', 'subject_type', 'subject_id']);

        foreach ($old->groupBy(fn ($r) => $r->subject_type.':'.$r->subject_id) as $group) {
            $first = $group->first();
            $protected = ContentRevision::query()
                ->where('subject_type', $first->subject_type)
                ->where('subject_id', $first->subject_id)
                ->orderByDesc('id')
                ->limit(self::KEEP_OLD)
                ->pluck('id');

            $aged += ContentRevision::query()
                ->whereIn('id', $group->pluck('id'))
                ->whereNotIn('id', $protected)
                ->delete();
        }

        return [$orphans, $aged];
    }

    // ------------------------------------------------------------- internals

    private static function actor(): ?User
    {
        /*
         * Read who signed in only where something already asked: a console
         * save has been through `auth:sanctum`, so its guard is resolved.
         * Resolving one here — from a seeder, a job, an import, or a model
         * saved while a public request is being answered — would build a
         * guard around whatever request is current and cache its user for
         * the rest of the process (found by `CartReminderTest`, whose
         * "View as" request was answered as the portal session before it).
         */
        $auth = app('auth');

        if (! $auth->hasResolvedGuards()) {
            return null;
        }

        $request = request();
        $user = $request->user('sanctum') ?? $request->user();

        return $user instanceof User ? $user : null;
    }

    private static function coalesces(ContentRevision $latest, ?User $user): bool
    {
        // A null actor (artisan, an import) never folds: nobody to be "the same".
        return $user !== null
            && $latest->user_id === $user->getKey()
            && $latest->created_at !== null
            && $latest->created_at->gt(now()->subMinutes(self::COALESCE_MINUTES));
    }

    /** Keep only the newest `KEEP` of a record's revisions. */
    private static function trim(string $alias, int $id): void
    {
        $stale = ContentRevision::query()
            ->where('subject_type', $alias)
            ->where('subject_id', $id)
            ->orderByDesc('id')
            ->offset(self::KEEP)
            ->limit(PHP_INT_MAX)
            ->pluck('id');

        if ($stale->isNotEmpty()) {
            ContentRevision::query()->whereIn('id', $stale->all())->delete();
        }
    }

    /**
     * @param  list<string>  $columns
     * @param  array<string, mixed>  $snapshot
     * @param  array<string, mixed>|null  $previous
     * @return list<string>
     */
    private static function diff(array $columns, array $snapshot, ?array $previous): array
    {
        if ($previous === null) {
            return ['created'];
        }

        $previous = self::canonical($previous);

        return array_values(array_filter(
            $columns,
            fn ($c) => json_encode($snapshot[$c] ?? null) !== json_encode($previous[$c] ?? null),
        ));
    }

    /**
     * Associative arrays sorted by key, lists left in order: the same content
     * hashes the same whether it came from the model or from MySQL's JSON type,
     * which reorders object keys.
     */
    private static function canonical(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        $value = array_map(fn ($v) => self::canonical($v), $value);

        if (! array_is_list($value)) {
            ksort($value);
        }

        return $value;
    }
}
