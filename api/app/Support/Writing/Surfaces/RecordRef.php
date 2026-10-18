<?php

namespace App\Support\Writing\Surfaces;

use App\Models\User;
use App\Support\HtmlSanitiser;
use App\Support\Revisions;
use App\Support\Writing\WritingRefused;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * `ref: {type, id?}` for a body or a summary. `type` is a morph alias the page
 * history knows (Revisions::roleFor gives its owning role); an alias it does not
 * know is refused (403), so writing help only reaches records whose owner is
 * written down. A given id must exist (404).
 */
final class RecordRef
{
    /** @param array<string, mixed> $ref */
    public static function allows(User $user, array $ref): bool
    {
        $type = (string) ($ref['type'] ?? '');

        return $type !== '' && Revisions::allows($user, $type);
    }

    /** @param array<string, mixed> $ref */
    public static function find(array $ref): ?Model
    {
        if (empty($ref['id'])) {
            return null;
        }
        $class = Relation::getMorphedModel((string) $ref['type']);
        $model = $class ? $class::query()->find((int) $ref['id']) : null;
        if ($model === null) {
            throw new WritingRefused('That record is not there any more.', 404);
        }

        return $model;
    }

    public static function title(Model $record): string
    {
        return (string) ($record->getAttribute('title') ?? $record->getAttribute('name') ?? '');
    }

    public static function bodyText(Model $record): string
    {
        foreach (Revisions::bodyColumns($record->getMorphClass()) as $column) {
            $html = (string) ($record->getAttribute($column) ?? '');
            if ($html !== '') {
                return trim(HtmlSanitiser::toText($html));
            }
        }

        return '';
    }
}
