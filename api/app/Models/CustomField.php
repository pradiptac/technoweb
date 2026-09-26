<?php

namespace App\Models;

use App\Enums\CustomFieldKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One field in a group: its key, its kind and the rules the kind reads.
 *
 * `options` is a list of `{value, label}` for a dropdown or checkboxes —
 * a whitelist, the `FormField` rule. `settings` holds what a kind reads
 * beyond that: `min`/`max` for a number, `max_items` for a list, `target`
 * for a linked record.
 */
class CustomField extends Model
{
    protected $fillable = [
        'custom_field_group_id', 'key', 'label', 'kind', 'help', 'required',
        'options', 'settings', 'show_on_page', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'kind' => CustomFieldKind::class,
            'required' => 'boolean',
            'show_on_page' => 'boolean',
            'options' => 'array',
            'settings' => 'array',
            'sort_order' => 'integer',
        ];
    }

    /** @return BelongsTo<CustomFieldGroup, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(CustomFieldGroup::class, 'custom_field_group_id');
    }

    /** @return HasMany<CustomFieldValue, $this> */
    public function values(): HasMany
    {
        return $this->hasMany(CustomFieldValue::class);
    }

    /** The permitted values for a dropdown or checkboxes, as plain strings. */
    public function optionValues(): array
    {
        return collect($this->options ?? [])
            ->pluck('value')
            ->filter(fn ($v) => is_string($v) && $v !== '')
            ->values()
            ->all();
    }

    /** The label an option value is shown as, or the value when it has none. */
    public function optionLabel(string $value): string
    {
        foreach ($this->options ?? [] as $option) {
            if (($option['value'] ?? null) === $value) {
                return (string) ($option['label'] ?? $value);
            }
        }

        return $value;
    }

    public function setting(string $key): mixed
    {
        return ($this->settings ?? [])[$key] ?? null;
    }
}
