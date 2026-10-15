<?php

namespace App\Models;

use App\Support\DetailTemplates;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * How every page of one kind of record is arranged (0.161.0, docs/page-builder.md
 * "Detail templates"): the section builder's stack, mixed with record blocks
 * that draw the record's own content. `type` is a morph alias and is fixed
 * once saved. At most one template per type is active.
 *
 * @property int $id
 * @property string $type
 * @property string $name
 * @property list<array<string, mixed>> $blocks
 * @property bool $is_active
 * @property int|null $created_by
 */
class DetailTemplate extends Model
{
    protected $fillable = ['type', 'name', 'blocks', 'is_active', 'created_by'];

    protected function casts(): array
    {
        return ['blocks' => 'array', 'is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        // The public reads ask for the active template of a type on every
        // detail request; it is held briefly and forgotten on any change.
        static::saved(fn (self $t) => DetailTemplates::forget($t->type));
        static::deleted(fn (self $t) => DetailTemplates::forget($t->type));
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Make this the template its type's pages use, and any other of that type
     * not — in one transaction, row by row so the model events (and with them
     * the cache) fire.
     */
    public function activate(): void
    {
        DB::transaction(function () {
            self::query()->where('type', $this->type)->where('is_active', true)->whereKeyNot($this->id)
                ->lockForUpdate()->get()
                ->each(fn (self $other) => $other->update(['is_active' => false]));

            $this->update(['is_active' => true]);
        });
    }

    public function deactivate(): void
    {
        $this->update(['is_active' => false]);
    }
}
