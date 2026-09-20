<?php

namespace App\Http\Requests;

use App\Enums\LocationLevel;
use App\Models\Location;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * A place the company works in, and where it sits in the tree.
 *
 * Nothing here requires the local detail — a location can be created with a
 * name and filled in later, because somebody has to be able to start. The
 * requirement lives in `LandingPageQuality`, which refuses to *publish* a page
 * about a place nothing is recorded for. Validation says what a row may be; the
 * gate says what may be claimed publicly, and those are different questions.
 *
 * What validation does own is the shape of the tree, because a broken tree is
 * the kind of damage that is invisible: a cycle still resolves from inside
 * itself and is simply unreachable from a root, so a branch disappears from the
 * navigation with nothing reporting an error.
 */
class LocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('name') && ! $this->filled('slug')) {
            $this->merge(['slug' => Str::slug($this->string('name')->value())]);
        }
    }

    public function rules(): array
    {
        $id = $this->route('location')?->id;
        $required = $id ? 'sometimes' : 'required';

        return [
            'name' => [$required, 'string', 'max:120'],
            /*
             * Part of the URL of every page about this place, so it is checked
             * for shape as well as uniqueness — a slug with a slash in it would
             * invent a path segment. Unique across the whole tree, not per
             * parent, because the URL is flat: `/locations/kolkata` has no room
             * for two Kolkatas however differently they are filed.
             */
            'slug' => [$required, 'string', 'max:120', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('locations', 'slug')->ignore($id)],
            'level' => [$required, Rule::in(LocationLevel::values())],
            'parent_id' => ['nullable', 'integer', Rule::exists('locations', 'id')],
            'country' => ['sometimes', 'string', 'max:120'],
            'office_address' => ['nullable', 'string', 'max:255'],
            'response_time' => ['nullable', 'string', 'max:120'],
            'summary' => ['nullable', 'string', 'max:2000'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['sometimes', 'boolean'],

            // Replaced wholesale, the rule every relation here follows: omit the
            // key to leave them alone, send [] to clear them.
            'service_ids' => ['sometimes', 'array'],
            'service_ids.*' => ['integer', Rule::exists('services', 'id')],
            'solution_ids' => ['sometimes', 'array'],
            'solution_ids.*' => ['integer', Rule::exists('solutions', 'id')],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $location = $this->route('location') ?? new Location;

            /*
             * The effective values, not the submitted ones.
             *
             * A PATCH carries only what changed, and the first cut of this
             * returned early unless `parent_id` was present — so a request
             * sending nothing but `level` was never checked against the parent
             * already on the row. A city under a state could be promoted to
             * `country` and the tree would contradict itself with nothing
             * reporting it. Both fields are read from the request when it
             * carries them and from the record when it does not, so the check
             * asks about the tree that will exist rather than about the
             * payload.
             */
            $parentId = $this->has('parent_id')
                ? ($this->input('parent_id') ? (int) $this->input('parent_id') : null)
                : $location->parent_id;

            $level = $this->has('level')
                ? LocationLevel::tryFrom((string) $this->input('level'))
                : $location->level;

            if ($this->has('parent_id') && $location->wouldCycle($parentId)) {
                $validator->errors()->add('parent_id',
                    'That would put this place inside itself. The branch would still work from the inside and be unreachable from the top, which is the kind of break nothing reports.');

                return;
            }

            $parent = $parentId ? Location::find($parentId) : null;

            if ($level && ! $level->canSitUnder($parent?->level)) {
                $validator->errors()->add(
                    $this->has('level') ? 'level' : 'parent_id',
                    "A {$level->label()} cannot sit inside a {$parent?->level?->label()}. Pick a broader parent, or a narrower level for this one.",
                );

                return;
            }

            /*
             * And the same question asked downwards.
             *
             * Widening a node breaks its children rather than itself: turning
             * West Bengal from a state into an area leaves Kolkata, a city,
             * inside something narrower than it is. Nothing on this row is
             * wrong — the row below it is — which is why validating only the
             * record being edited misses it entirely.
             */
            if ($level && $location->exists && $this->has('level')) {
                $offending = $location->children()
                    ->get()
                    ->first(fn (Location $child) => $child->level && ! $child->level->canSitUnder($level));

                if ($offending) {
                    $validator->errors()->add('level',
                        "{$offending->name} is a {$offending->level->label()} inside this, and cannot sit inside a {$level->label()}. Move it out first, or pick a broader level here.");
                }
            }
        });
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'Use lower-case letters, numbers and hyphens only — this becomes part of the web address.',
        ];
    }
}
