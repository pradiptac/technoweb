<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One saved state of a record's content (0.145.0, docs/page-builder.md "Page
 * history"). Written by `App\Support\Revisions` from the `HasRevisions`
 * trait's model events; never by a controller.
 *
 * @property int $id
 * @property string $subject_type
 * @property int $subject_id
 * @property int|null $user_id
 * @property string|null $actor_name
 * @property array<string, mixed> $snapshot
 * @property list<string>|null $changed
 * @property int $blocks_count
 * @property string $hash
 */
class ContentRevision extends Model
{
    protected $fillable = [
        'subject_type', 'subject_id', 'user_id', 'actor_name',
        'snapshot', 'changed', 'blocks_count', 'hash',
    ];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'changed' => 'array', 'blocks_count' => 'integer'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
