<?php

namespace App\Support;

use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Model;

/**
 * Publishing without a date means "now" — the one definition.
 *
 * Without this an editor hits Publish, the record is status=published with a
 * null published_at, and `scopePublished` filters it straight back out —
 * publishing looks like it silently failed. Only meaningful for entities
 * that have a `published_at` column.
 *
 * It lived in `WritesCmsEntities::withPublishedAt()` until 0.139.0, and the
 * bulk actions needed the same answer for records written outside that trait
 * (vacancies, entries, landing pages) — so the rule moved here and the trait
 * delegates, rather than the bulk path growing a second copy.
 */
final class PublishStamp
{
    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    public static function apply(array $attributes, ?Model $existing = null): array
    {
        $current = $existing?->getAttribute('status');
        $status = $attributes['status'] ?? ($current instanceof PublishStatus ? $current->value : $current);

        $becomingPublished = $status instanceof PublishStatus
            ? $status === PublishStatus::Published
            : $status === PublishStatus::Published->value;

        if ($becomingPublished
            && empty($attributes['published_at'])
            && $existing?->getAttribute('published_at') === null) {
            $attributes['published_at'] = now();
        }

        return $attributes;
    }
}
