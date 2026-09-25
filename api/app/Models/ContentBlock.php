<?php

namespace App\Models;

use App\Enums\ContentBlockType;
use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A content block — a CTA banner, a stat bar, a pricing table or a
 * technology stack (the client, 2026-09-24).
 *
 * **No `Sluggable`**, the rule `Slider`, `Gallery` and `Popup` already state:
 * that trait writes a 301 into `redirects` when a slug changes, and a block
 * has no URL — it is embedded by shortcode — so the redirect would send one
 * path that never existed to another. The slug is the shortcode's contract
 * and the form says renaming it breaks every body that embeds it.
 *
 * `data` is the layout's content as JSON, **lists wherever order matters**:
 * MySQL reorders JSON object keys by length (the reason `SpecSheet` exists),
 * so plans, rows, items and groups are arrays and nothing depends on the
 * order of an object's keys. What each layout may hold is
 * `App\Support\Blocks\BlockRules`.
 *
 * One CTA may be the site default: saving one with `is_default` clears the
 * flag on every other row in the same transaction (`makeDefault()`).
 *
 * @property ContentBlockType $type
 * @property PublishStatus $status
 * @property array<string, mixed>|null $data
 */
class ContentBlock extends Model
{
    protected $fillable = ['type', 'layout', 'name', 'slug', 'status', 'is_default', 'data'];

    /** The column defaults, so an unsaved model serialises the way a saved one reads back. */
    protected $attributes = [
        'status' => 'draft',
        'is_default' => false,
    ];

    protected function casts(): array
    {
        return [
            'type' => ContentBlockType::class,
            'status' => PublishStatus::class,
            'is_default' => 'boolean',
            'data' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $block) {
            if (blank($block->slug)) {
                $block->slug = $block->uniqueSlug($block->name);
            }
        });
    }

    /** Appends -2, -3 … until the slug is free, ignoring this record's own row. */
    public function uniqueSlug(string $source): string
    {
        $base = Str::slug($source) ?: 'block';
        $slug = $base;

        for ($n = 2; self::where('slug', $slug)->whereKeyNot($this->getKey())->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }

    /** @param  Builder<self>  $query */
    public function scopePublished(Builder $query): void
    {
        $query->where('status', PublishStatus::Published);
    }

    /**
     * The one default CTA. Clears the flag everywhere else first, in one
     * transaction, so two defaults cannot exist even for a moment a
     * concurrent read could see.
     */
    public function makeDefault(): void
    {
        DB::transaction(function () {
            self::query()->where('type', ContentBlockType::Cta)->whereKeyNot($this->getKey())
                ->where('is_default', true)->update(['is_default' => false]);
            $this->forceFill(['is_default' => true])->save();
        });
    }

    /** A value from `data`, by dotted path. */
    public function datum(string $key, mixed $default = null): mixed
    {
        return data_get($this->data ?? [], $key, $default);
    }
}
