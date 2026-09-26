<?php

namespace App\Http\Requests;

use App\Enums\CustomFieldKind;
use App\Models\CustomField;
use App\Models\CustomFieldGroup;
use App\Support\CustomFields\CustomFields;
use App\Support\CustomFields\Targets;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A custom field group and its fields, written together.
 *
 * One class for create and update — the `ContentBlockRequest` shape — because
 * the rules differ only in whether `name` and `targets` are required, and two
 * copies of the field rules would be two definitions of a field.
 *
 * The field rules mirror `StoreFormRequest`'s (the editor-built forms are the
 * pattern), plus the three things a value table adds: a field's key must be
 * unique across every group that shares a target (the value payload is keyed
 * by it), a field's kind may not change once it holds values (they would be
 * re-read as something else), and a field row naming an `id` must be one of
 * this group's own.
 */
class CustomFieldGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $group = $this->route('custom_field_group');
        $creating = ! $group instanceof CustomFieldGroup;
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:150'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:150', 'alpha_dash',
                Rule::unique('custom_field_groups', 'slug')->ignore($group instanceof CustomFieldGroup ? $group->id : null)],
            'targets' => [$required, 'array', 'min:1'],
            'targets.*' => ['string', 'distinct', Rule::in(Targets::keys())],
            'placement' => ['sometimes', Rule::in(CustomFieldGroup::PLACEMENTS)],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['sometimes', 'boolean'],

            'fields' => ['sometimes', 'array', 'max:50'],
            'fields.*.id' => ['nullable', 'integer'],
            /*
             * The key a value is stored and read under. Slug characters only,
             * because it becomes an array key, a validation attribute and a
             * property a template reads — and a few are reserved because they
             * would be a second answer to a question the record already
             * answers (`CustomFields::RESERVED_KEYS`).
             */
            'fields.*.key' => ['required', 'string', 'max:60', 'regex:/^[a-z][a-z0-9_]*$/', 'distinct',
                Rule::notIn(CustomFields::RESERVED_KEYS)],
            'fields.*.label' => ['required', 'string', 'max:150'],
            'fields.*.kind' => ['required', Rule::enum(CustomFieldKind::class)],
            'fields.*.help' => ['nullable', 'string', 'max:255'],
            'fields.*.required' => ['sometimes', 'boolean'],
            'fields.*.show_on_page' => ['sometimes', 'boolean'],
            'fields.*.options' => ['nullable', 'array', 'max:100'],
            'fields.*.options.*.value' => ['required', 'string', 'max:150'],
            'fields.*.options.*.label' => ['required', 'string', 'max:150'],
            'fields.*.settings' => ['nullable', 'array'],
            'fields.*.settings.min' => ['nullable', 'numeric'],
            'fields.*.settings.max' => ['nullable', 'numeric'],
            'fields.*.settings.max_length' => ['nullable', 'integer', 'min:1', 'max:255'],
            'fields.*.settings.max_items' => ['nullable', 'integer', 'min:1', 'max:100'],
            'fields.*.settings.target' => ['nullable', 'string', Rule::in(Targets::keys())],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            if ($v->errors()->isNotEmpty()) {
                return;
            }

            $group = $this->route('custom_field_group');
            $group = $group instanceof CustomFieldGroup ? $group : null;
            $fields = $this->input('fields');

            if (is_array($fields)) {
                $this->checkFields($v, array_values($fields), $group);
            }

            $this->checkKeyCollisions($v, $group);
        });
    }

    /** @param array<int, array<string, mixed>> $fields */
    private function checkFields(Validator $v, array $fields, ?CustomFieldGroup $group): void
    {
        $own = $group?->fields()->withCount('values')->get()->keyBy('id');

        foreach ($fields as $i => $field) {
            $kind = CustomFieldKind::from($field['kind']);
            $path = "fields.$i";

            if ($kind->hasOptions()) {
                $values = array_map(fn ($o) => (string) ($o['value'] ?? ''), $field['options'] ?? []);
                if ($values === []) {
                    $v->errors()->add("$path.options", 'A '.strtolower($kind->label()).' field needs at least one option.');
                } elseif (count($values) !== count(array_unique($values))) {
                    $v->errors()->add("$path.options", 'Two options share a value; each must be different.');
                }
            }

            $settings = $field['settings'] ?? [];

            if ($kind === CustomFieldKind::Relation && blank($settings['target'] ?? null)) {
                $v->errors()->add("$path.settings.target", 'Choose which kind of record this field links to.');
            }

            if (is_numeric($settings['min'] ?? null) && is_numeric($settings['max'] ?? null)
                && (float) $settings['min'] > (float) $settings['max']) {
                $v->errors()->add("$path.settings.max", 'The maximum is below the minimum.');
            }

            if (filled($field['id'] ?? null)) {
                /** @var CustomField|null $existing */
                $existing = $own?->get((int) $field['id']);

                if ($existing === null) {
                    $v->errors()->add("$path.id", 'That field is not part of this group.');

                    continue;
                }

                /*
                 * A field's kind is fixed once it holds values. A date read
                 * back as a number, or a path as a link, is a page drawing
                 * something nobody typed — add a new field instead.
                 */
                if ($existing->kind !== $kind && (int) $existing->getAttribute('values_count') > 0) {
                    $v->errors()->add("$path.kind", "\"{$existing->label}\" already holds values on "
                        .$existing->getAttribute('values_count').' record(s), so its type cannot change. Add a new field instead.');
                }
            }
        }
    }

    /**
     * A key two groups on one target both declare would make the value
     * payload — an object keyed by field key — ambiguous. Refused at the
     * second group, naming the first.
     */
    private function checkKeyCollisions(Validator $v, ?CustomFieldGroup $group): void
    {
        $targets = $this->has('targets') ? (array) $this->input('targets') : ($group->targets ?? []);
        $fields = $this->has('fields')
            ? array_values((array) $this->input('fields'))
            : ($group?->fields()->get(['key'])->map(fn ($f) => ['key' => $f->key])->all() ?? []);

        $keys = array_column($fields, 'key');

        if ($targets === [] || $keys === []) {
            return;
        }

        $others = CustomFieldGroup::query()
            ->when($group, fn ($q) => $q->whereKeyNot($group->id))
            ->where(function ($q) use ($targets) {
                foreach ($targets as $target) {
                    $q->orWhereJsonContains('targets', $target);
                }
            })
            ->with('fields:id,custom_field_group_id,key')
            ->get();

        foreach ($others as $other) {
            foreach ($other->fields as $field) {
                $i = array_search($field->key, $keys, true);
                if ($i !== false) {
                    $v->errors()->add("fields.$i.key", "\"{$other->name}\" already uses the key \"{$field->key}\" on a record type this group is attached to. Choose another key.");
                }
            }
        }
    }

    public function messages(): array
    {
        return [
            'targets.required' => 'Attach the group to at least one kind of record.',
            'targets.min' => 'Attach the group to at least one kind of record.',
            'targets.*.in' => 'That is not a kind of record custom fields can be attached to.',
            'fields.*.key.regex' => 'A field key must start with a letter and use only lowercase letters, numbers and underscores.',
            'fields.*.key.not_in' => 'That key is reserved — the record already has a field by that name.',
            'fields.*.key.distinct' => 'Two fields in this group share a key.',
            'fields.*.label.required' => 'Every field needs a label.',
        ];
    }
}
