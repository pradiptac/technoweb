<?php

namespace App\Http\Resources\Admin;

use App\Models\CustomField;
use App\Models\CustomFieldGroup;
use App\Support\CustomFields\Targets;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin CustomFieldGroup */
class CustomFieldGroupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'targets' => $this->targets ?? [],
            // Labels resolved here, so the list reads "Solutions, Pages"
            // without the console holding a second copy of the target list.
            'target_labels' => array_map(fn (string $t) => Targets::label($t), $this->targets ?? []),
            'placement' => $this->placement,
            'sort_order' => (int) $this->sort_order,
            'is_active' => (bool) $this->is_active,
            'fields_count' => $this->whenCounted('fields'),
            'fields' => $this->whenLoaded('fields', fn () => $this->fields->map(fn (CustomField $f) => [
                'id' => $f->id,
                'key' => $f->key,
                'label' => $f->label,
                'kind' => $f->kind->value,
                'help' => $f->help,
                'required' => $f->required,
                'show_on_page' => $f->show_on_page,
                'options' => $f->options ?? [],
                'settings' => (object) ($f->settings ?? []),
                'sort_order' => (int) $f->sort_order,
                // How many records hold a value, so the console can say what
                // deleting the field or changing its type would cost.
                'values_count' => (int) ($f->getAttribute('values_count') ?? 0),
            ])->values()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
