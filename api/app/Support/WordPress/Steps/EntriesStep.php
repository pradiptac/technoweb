<?php

namespace App\Support\WordPress\Steps;

use App\Models\ContentType;
use App\Models\Entry;
use App\Support\WordPress\Context;
use App\Support\WordPress\Harvest;
use App\Support\WordPress\Outcome;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * The records of every custom post type, as entries of the content type it
 * became. An entry's slug is unique within its type only, so the free-slug
 * check is scoped to the type; its custom fields target `entry:<type slug>`.
 */
class EntriesStep extends ContentStep
{
    public function key(): string
    {
        return 'entries';
    }

    public function label(): string
    {
        return 'Custom post type entries';
    }

    public function section(): string
    {
        return 'custom';
    }

    public function mapType(): ?string
    {
        return 'entry';
    }

    protected function model(): string
    {
        return Entry::class;
    }

    protected function keepsFeaturedImage(): bool
    {
        return true;
    }

    public function records(Context $ctx): iterable
    {
        foreach (array_keys((array) ($ctx->site()['types'] ?? [])) as $wpSlug) {
            foreach (Harvest::read($ctx->import, 'cpt:'.$wpSlug) as $record) {
                yield $record + ['_type' => $wpSlug];
            }
        }
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        if (! $ctx->map->has('type', $record['_type'])) {
            return Outcome::skip(self::raw($record['title'] ?? '') ?: '(untitled)', 'Its content type is not being imported.');
        }

        return parent::plan($ctx, $record);
    }

    protected function slugQuery(Context $ctx, array $record): Builder
    {
        $type = $ctx->map->targetId('type', $record['_type']);

        // A type that does not exist yet (a dry run) has no entries to collide with.
        return Entry::query()->where('content_type_id', $type ?? 0);
    }

    protected function fields(Context $ctx, array $record, Outcome $outcome): array
    {
        $summary = self::text($record['excerpt'] ?? '', 500);

        return [
            'summary' => $summary !== '' ? $summary : null,
            'image_path' => $ctx->media($record['featured_media'] ?? null, $outcome->label),
        ];
    }

    protected function beforeSave(Context $ctx, Model $model, array $record): void
    {
        /** @var Entry $model */
        if (! $model->exists) {
            $model->content_type_id = (int) $ctx->map->targetId('type', $record['_type']);
        }
    }

    protected function targetKey(Context $ctx, array $record): string
    {
        $id = $ctx->map->targetId('type', $record['_type']);
        $slug = $id !== null ? ContentType::query()->whereKey($id)->value('slug') : null;

        return 'entry:'.($slug ?? ContentTypesStep::slugFor($ctx, (string) $record['_type']));
    }
}
