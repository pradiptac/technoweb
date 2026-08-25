<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FormField extends Model
{
    /** The kinds a form can be built from. Anything else is refused on write. */
    public const KINDS = ['text', 'email', 'tel', 'number', 'textarea', 'select', 'checkbox'];

    protected $fillable = [
        'form_id', 'kind', 'name', 'label', 'placeholder', 'help',
        'required', 'options', 'width', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'required' => 'boolean',
            'options' => 'array',
            'sort_order' => 'integer',
        ];
    }

    public function form(): BelongsTo
    {
        return $this->belongsTo(Form::class);
    }

    /** The permitted values for a select, as plain strings. */
    public function optionValues(): array
    {
        return collect($this->options ?? [])
            ->pluck('value')
            ->filter(fn ($v) => is_string($v) && $v !== '')
            ->values()
            ->all();
    }
}
