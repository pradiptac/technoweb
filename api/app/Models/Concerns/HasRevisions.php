<?php

namespace App\Models\Concerns;

use App\Support\Revisions;

/**
 * Records a revision whenever the record's watched content columns change, and
 * forgets them when the record is deleted (0.145.0).
 *
 * The columns, the owning role and the alias live in `App\Support\Revisions`,
 * the one list; the model only opts in. Capturing here rather than in the
 * controllers means the WordPress import, the AI page draft and the library
 * save are covered with no edit to any of them.
 */
trait HasRevisions
{
    protected static function bootHasRevisions(): void
    {
        static::saved(fn ($model) => Revisions::record($model));
        static::deleted(fn ($model) => Revisions::forget($model));
    }
}
