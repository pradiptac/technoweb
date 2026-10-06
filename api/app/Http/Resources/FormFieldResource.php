<?php

namespace App\Http\Resources;

use App\Models\FormField;
use App\Support\Forms\FieldSpec;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin FormField */
class FormFieldResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // The same test `FormResource` gates `notify_email` on: an
        // authenticated request to the console's own routes, rather than
        // remembering to strip something on the public one.
        $console = $request->user() !== null && $request->is('api/v1/admin/*');

        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'name' => $this->name,
            'label' => $this->label,
            'placeholder' => $this->placeholder,
            'help' => $this->help,
            'required' => (bool) $this->required,
            'options' => $this->options ?? [],
            /*
             * What the kind keeps beyond the common columns, or null.
             *
             * The console reads it as stored. A page reads
             * `FieldSpec::publicSettings()`: a hidden field's value is not
             * sent at all — the server fills it from this row whatever is
             * posted, so the browser has no use for it — and a file field's
             * limit is the one in force with its extensions spelled out.
             */
            'settings' => $console ? ($this->settings ?: null) : FieldSpec::publicSettings($this->resource),
            // `{field, op, value?}`, or null for a field that is always shown.
            'show_if' => $this->show_if ?: null,
            'width' => $this->width,
        ];
    }
}
