<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\CustomFieldKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\CustomFieldGroupRequest;
use App\Http\Resources\Admin\CustomFieldGroupResource;
use App\Models\CustomFieldGroup;
use App\Support\CustomFields\Targets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Custom field groups. Behind role:content_manager — deciding what a
 * solution or an entry records is editorial work, the same role that owns
 * the records.
 *
 * **Fields are synced by id, never replaced wholesale.** The editor-built
 * forms delete and recreate their fields on every save, which is right there
 * because a submission keeps its own copy of what was sent. Here the values
 * hang off the field row (`custom_field_values.custom_field_id`, cascading),
 * so recreating the fields would silently empty every record — a row that
 * comes back with its `id` is updated, a row without one is created, and only
 * a row nobody sent is deleted, which the console warns about with a count.
 */
class CustomFieldGroupController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $groups = CustomFieldGroup::query()
            ->withCount('fields')
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->string('q')->value().'%'))
            ->when($request->filled('target'), fn ($q) => $q->forTarget($request->string('target')->value()))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        return CustomFieldGroupResource::collection($groups)->additional(['meta' => self::meta()]);
    }

    public function store(CustomFieldGroupRequest $request): JsonResponse
    {
        $group = DB::transaction(function () use ($request) {
            $data = $request->validated();
            $fields = $data['fields'] ?? [];
            unset($data['fields']);

            $data['slug'] = filled($data['slug'] ?? null) ? $data['slug'] : $this->uniqueSlug((string) $data['name']);

            $group = CustomFieldGroup::create($data);
            $this->syncFields($group, $fields);

            return $group;
        });

        // `->response()`, not `response()->json($resource)`: the second drops
        // the `data` wrapper (CLAUDE.md, Laravel conventions).
        return (new CustomFieldGroupResource($this->detail($group)))->additional(['meta' => self::meta()])
            ->response()->setStatusCode(201);
    }

    public function show(CustomFieldGroup $customFieldGroup): JsonResource
    {
        return (new CustomFieldGroupResource($this->detail($customFieldGroup)))->additional(['meta' => self::meta()]);
    }

    public function update(CustomFieldGroupRequest $request, CustomFieldGroup $customFieldGroup): JsonResource
    {
        DB::transaction(function () use ($request, $customFieldGroup) {
            $data = $request->validated();
            $fields = array_key_exists('fields', $data) ? ($data['fields'] ?? []) : null;
            unset($data['fields']);

            if (array_key_exists('slug', $data) && blank($data['slug'])) {
                unset($data['slug']);
            }

            $customFieldGroup->update($data);

            if ($fields !== null) {
                $this->syncFields($customFieldGroup, $fields);
            }
        });

        return (new CustomFieldGroupResource($this->detail($customFieldGroup->fresh() ?? $customFieldGroup)))
            ->additional(['meta' => self::meta()]);
    }

    /**
     * Deleting a group deletes its fields and every value typed into them —
     * the foreign keys cascade. The console names the count before it asks.
     */
    public function destroy(CustomFieldGroup $customFieldGroup): JsonResponse
    {
        $customFieldGroup->delete();

        return response()->json(null, 204);
    }

    /**
     * The kinds, the targets and the placements — sent by the API, never
     * listed in TypeScript.
     *
     * @return array<string, mixed>
     */
    public static function meta(): array
    {
        return [
            'kinds' => CustomFieldKind::options(),
            'targets' => Targets::options(),
            'placements' => [
                ['value' => 'details', 'label' => 'Drawn on the page', 'blurb' => 'A "Details" section after the body, holding every field marked to show.'],
                ['value' => 'hidden', 'label' => 'Data only', 'blurb' => 'Not drawn, but still in the public API for templates and integrations — never put anything private here.'],
            ],
        ];
    }

    private function detail(CustomFieldGroup $group): CustomFieldGroup
    {
        return $group->load(['fields' => fn ($q) => $q->withCount('values')]);
    }

    /** @param array<int, array<string, mixed>> $fields */
    private function syncFields(CustomFieldGroup $group, array $fields): void
    {
        $sent = array_values(array_filter(array_map(fn ($f) => (int) ($f['id'] ?? 0), $fields)));

        // Rows nobody sent go first — nothing listens to a field's deletion;
        // the values follow by foreign key — so a new row may reuse a key a
        // deleted one held without tripping the (group, key) unique index.
        $group->fields()->whereNotIn('id', $sent ?: [0])->delete();

        // And the kept rows step aside for a moment, so two fields swapping
        // keys in one save cannot collide half way through.
        foreach ($sent as $id) {
            $group->fields()->whereKey($id)->update(['key' => '~'.$id]);
        }

        foreach (array_values($fields) as $i => $field) {
            $attributes = [
                'key' => $field['key'],
                'label' => $field['label'],
                'kind' => $field['kind'],
                'help' => filled($field['help'] ?? null) ? $field['help'] : null,
                'required' => (bool) ($field['required'] ?? false),
                'show_on_page' => (bool) ($field['show_on_page'] ?? true),
                'options' => CustomFieldKind::from($field['kind'])->hasOptions() ? array_values($field['options'] ?? []) : null,
                'settings' => $this->settings($field),
                'sort_order' => $i,
            ];

            $existing = filled($field['id'] ?? null) ? $group->fields()->whereKey((int) $field['id'])->first() : null;

            if ($existing) {
                $existing->update($attributes);
            } else {
                $group->fields()->create($attributes);
            }
        }
    }

    /**
     * Only the settings a kind reads are stored, so a field switched from a
     * number to text does not carry a stale `min` it never checks.
     *
     * @param  array<string, mixed>  $field
     * @return array<string, mixed>|null
     */
    private function settings(array $field): ?array
    {
        $settings = (array) ($field['settings'] ?? []);

        $keep = match (CustomFieldKind::from($field['kind'])) {
            CustomFieldKind::Number => ['min', 'max'],
            CustomFieldKind::Text => ['max_length'],
            CustomFieldKind::List => ['max_items'],
            CustomFieldKind::Relation => ['target'],
            default => [],
        };

        $out = array_filter(
            array_intersect_key($settings, array_flip($keep)),
            fn ($v) => $v !== null && $v !== '',
        );

        return $out === [] ? null : $out;
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'fields';
        $slug = $base;
        $i = 2;

        while (CustomFieldGroup::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }
}
