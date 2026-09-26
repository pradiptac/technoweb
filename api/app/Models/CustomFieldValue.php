<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * What one record holds for one custom field. The value is JSON because the
 * field's kind decides its shape; `CustomFields::save()` is the only writer.
 */
class CustomFieldValue extends Model
{
    protected $fillable = ['fieldable_type', 'fieldable_id', 'custom_field_id', 'value'];

    protected function casts(): array
    {
        return ['value' => 'json'];
    }

    /** @return BelongsTo<CustomField, $this> */
    public function field(): BelongsTo
    {
        return $this->belongsTo(CustomField::class, 'custom_field_id');
    }

    /** @return MorphTo<Model, $this> */
    public function fieldable(): MorphTo
    {
        return $this->morphTo();
    }
}
