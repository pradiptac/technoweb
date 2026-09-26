<?php

namespace App\Models\Concerns;

use App\Models\CustomFieldValue;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * The record carries custom field values (docs/custom-content.md).
 *
 * `customValues` is the relation a controller eager-loads — with the field
 * and its group, `customFieldsFor()` names the whole path — because
 * `preventLazyLoading` is on and the resources read all three.
 *
 * `customFieldTarget()` is the key groups are attached by: the morph alias
 * for every existing model, and `entry:<type-slug>` for an entry, which
 * overrides it.
 *
 * Values go with the record. A soft delete keeps them, because a product in
 * the bin is still a product and nothing about deleting it should lose what
 * was typed about it; a real delete removes them, since nothing else would.
 */
trait HasCustomFields
{
    public static function bootHasCustomFields(): void
    {
        static::deleting(function ($model) {
            if (method_exists($model, 'isForceDeleting') && ! $model->isForceDeleting()) {
                return;
            }

            $model->customValues()->delete();
        });
    }

    /** @return MorphMany<CustomFieldValue, $this> */
    public function customValues(): MorphMany
    {
        return $this->morphMany(CustomFieldValue::class, 'fieldable');
    }

    /** The key custom field groups are attached to this record by. */
    public function customFieldTarget(): string
    {
        return $this->getMorphClass();
    }

    /**
     * The relation path a controller eager-loads for the custom fields —
     * `->load([..., ...Model::customFieldsFor()])`.
     *
     * @return array<int, string>
     */
    public static function customFieldsFor(): array
    {
        return ['customValues.field.group'];
    }
}
