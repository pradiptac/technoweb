<?php

namespace App\Support\WordPress\Steps;

use App\Models\CustomField;
use App\Models\CustomFieldGroup;
use App\Support\CustomFields\CustomFields;
use App\Support\CustomFields\Targets;
use App\Support\WordPress\AcfValues;
use App\Support\WordPress\Context;
use App\Support\WordPress\Decisions;
use App\Support\WordPress\Outcome;
use Illuminate\Support\Str;

/**
 * One custom field group per kind of record that had ACF values — "Imported
 * from WordPress", holding a field for each ACF field the review kept, of
 * the kind it settled on. Runs before the posts, pages, entries and products
 * whose values fill it.
 *
 * A key already declared on that kind of record by a group made here is
 * reused rather than declared twice (the console refuses a key two groups on
 * one target both declare, because the values are keyed by it).
 */
class FieldGroupsStep extends Step
{
    public function key(): string
    {
        return 'field_groups';
    }

    public function label(): string
    {
        return 'Custom field groups (ACF)';
    }

    public function section(): string
    {
        return 'custom';
    }

    public function mapType(): ?string
    {
        return 'field_group';
    }

    public function records(Context $ctx): iterable
    {
        foreach ((Decisions::options($ctx)['acf'] ?? []) as $target => $fields) {
            yield ['id' => $target, 'target' => $target, 'fields' => $fields];
        }
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $target = $record['target'];
        $label = Targets::exists($target) || str_starts_with($target, 'entry:') ? $this->targetLabel($target) : $target;

        $kept = array_values(array_filter($record['fields'], fn ($f) => AcfValues::chosenKind($ctx, $target, $f['source']) !== null));

        if ($kept === []) {
            return Outcome::skip($label, 'None of its ACF fields can be kept.');
        }

        $existing = $ctx->map->model('field_group', $target, CustomFieldGroup::class);

        return Outcome::upsert($existing !== null, $label.' — '.count($kept).' fields', ['existing' => $existing?->id, 'fields' => $kept]);
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $target = $record['target'];
        $group = $outcome->data['existing'] ? CustomFieldGroup::query()->find($outcome->data['existing']) : null;

        if ($group === null) {
            $base = 'wordpress-'.Str::slug(str_replace(':', '-', $target));
            $slug = $base;
            $i = 2;

            while (CustomFieldGroup::query()->where('slug', $slug)->exists()) {
                $slug = $base.'-'.$i++;
            }

            $group = CustomFieldGroup::query()->create([
                'name' => 'Imported from WordPress',
                'slug' => $slug,
                'targets' => [$target],
                'placement' => 'details',
                'sort_order' => 100,
                'is_active' => true,
            ]);
        }

        $declared = CustomFields::fieldsFor($target);
        $order = (int) $group->fields()->max('sort_order');

        foreach ($outcome->data['fields'] as $field) {
            if (isset($declared[$field['key']])) {
                continue;
            }

            CustomField::query()->create([
                'custom_field_group_id' => $group->id,
                'key' => $field['key'],
                'label' => Str::limit($field['label'], 150, ''),
                'kind' => AcfValues::chosenKind($ctx, $target, $field['source']),
                'required' => false,
                'show_on_page' => true,
                'sort_order' => ++$order,
            ]);
        }

        $ctx->map->put('field_group', $target, $group);
    }

    private function targetLabel(string $target): string
    {
        return str_starts_with($target, 'entry:') ? 'Entries: '.substr($target, 6) : Targets::label($target);
    }
}
