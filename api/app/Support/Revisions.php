<?php

namespace App\Support;

use App\Models\ContentRevision;
use App\Models\Page;
use App\Models\SavedSection;
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
     * the test can say "deliberately not yet" rather than "forgotten".
     */
    public const DEFERRED = [
        'blog_post', 'knowledge_article', 'case_study', 'solution', 'service',
        'product', 'store_product', 'event', 'job_opening', 'entry', 'landing_page',
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
