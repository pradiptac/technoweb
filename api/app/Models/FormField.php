<?php

namespace App\Models;

use App\Support\Forms\FieldSpec;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property array<string, mixed>|null $settings
 * @property array{field: string, op: string, value?: string}|null $show_if
 */
class FormField extends Model
{
    /**
     * The kinds a form can be built from. Anything else is refused on write.
     *
     * The first seven are the builder as it shipped; the rest arrived with
     * 0.117.0. `App\Support\Forms\FieldSpec` says what each one means — which
     * take options, which collect nothing, what each keeps in `settings`.
     */
    public const KINDS = [
        'text', 'email', 'tel', 'number', 'textarea', 'select', 'checkbox',
        'url', 'date', 'radio', 'checkboxes', 'rating', 'file', 'hidden', 'heading', 'step',
    ];

    protected $fillable = [
        'form_id', 'kind', 'name', 'label', 'placeholder', 'help',
        'required', 'options', 'settings', 'show_if', 'width', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'required' => 'boolean',
            'options' => 'array',
            'settings' => 'array',
            'show_if' => 'array',
            'sort_order' => 'integer',
        ];
    }

    /** @return BelongsTo<Form, $this> */
    public function form(): BelongsTo
    {
        return $this->belongsTo(Form::class);
    }

    /** A heading or a step break: it lays the form out and collects nothing. */
    public function isLayout(): bool
    {
        return FieldSpec::isLayout($this->kind);
    }

    public function isFile(): bool
    {
        return $this->kind === 'file';
    }

    public function takesOptions(): bool
    {
        return in_array($this->kind, FieldSpec::WITH_OPTIONS, true);
    }

    /** The permitted values for a select, a radio group or a set of checkboxes, as plain strings. */
    public function optionValues(): array
    {
        return collect($this->options ?? [])
            ->pluck('value')
            ->filter(fn ($v) => is_string($v) && $v !== '')
            ->values()
            ->all();
    }

    /** What the visitor read beside a stored option value; the value itself when it is no longer an option. */
    public function optionLabel(string $value): string
    {
        foreach ($this->options ?? [] as $option) {
            if (($option['value'] ?? null) === $value && filled($option['label'] ?? null)) {
                return (string) $option['label'];
            }
        }

        return $value;
    }
}
