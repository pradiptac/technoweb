<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A named set of custom fields attached to one or more kinds of record.
 *
 * `targets` is a list of target keys (`App\Support\CustomFields\Targets`):
 * the morph alias of an existing model, or `entry:<type-slug>` for a custom
 * content type. `placement` decides whether the public page draws the group
 * (`details`) or only carries it in the API (`hidden`).
 */
class CustomFieldGroup extends Model
{
    public const PLACEMENTS = ['details', 'hidden'];

    protected $fillable = ['name', 'slug', 'targets', 'placement', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return [
            'targets' => 'array',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** @return HasMany<CustomField, $this> */
    public function fields(): HasMany
    {
        return $this->hasMany(CustomField::class)->orderBy('sort_order')->orderBy('id');
    }

    /**
     * The groups that apply to a target key.
     *
     * `whereJsonContains` on the list, which MySQL answers with
     * `JSON_CONTAINS` — a scan of a table that holds tens of rows, not
     * thousands, so no index is wanted.
     *
     * @param  Builder<CustomFieldGroup>  $query
     * @return Builder<CustomFieldGroup>
     */
    public function scopeForTarget(Builder $query, string $target): Builder
    {
        return $query->whereJsonContains('targets', $target);
    }

    /**
     * @param  Builder<CustomFieldGroup>  $query
     * @return Builder<CustomFieldGroup>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function appliesTo(string $target): bool
    {
        return in_array($target, $this->targets ?? [], true);
    }
}
