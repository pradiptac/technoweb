<?php

namespace App\Http\Requests;

use App\Enums\GalleryTransition;
use App\Enums\PublishStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StoreGalleryRequest extends FormRequest
{
    /**
     * A group with no slug gets one derived from its name.
     *
     * In `prepareForValidation` rather than in the controller, for the reason
     * the slider's YouTube parsing is there: nothing unvalidated reaches a
     * controller, and a derived value that fails the rule below then fails
     * with a message about the field rather than being silently stored.
     */
    protected function prepareForValidation(): void
    {
        $groups = $this->input('groups');

        if (! is_array($groups)) {
            return;
        }

        foreach ($groups as $i => $group) {
            if (filled($group['slug'] ?? null)) {
                continue;
            }
            $groups[$i]['slug'] = Str::slug($group['name'] ?? '') ?: 'group-'.($i + 1);
        }

        $this->merge(['groups' => $groups]);
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return array_merge($this->galleryRules(), [
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:150', 'alpha_dash', Rule::unique('galleries', 'slug')],
        ]);
    }

    /**
     * Shared with UpdateGalleryRequest — one definition of a group and an item.
     *
     * Not static, unlike the slider's, because the group rule has to see the
     * record being edited to know which group slugs already exist.
     */
    public function galleryRules(): array
    {
        return [
            'subtitle' => ['nullable', 'string', 'max:300'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            // Validated against the enum rather than falling back to the
            // default on an unknown value, unlike `?sort=`. A sort parameter
            // arrives mangled from an old bookmark; this arrives from a form
            // the console drew from this same list, so a value outside it means
            // the two sides have drifted and silence would hide that.
            'transition' => ['sometimes', Rule::enum(GalleryTransition::class)],
            'autoplay' => ['sometimes', 'boolean'],
            // 2s is the floor for a picture anybody can take in; 60s is a
            // slideshow that has stopped. Both ends stop a typo turning the
            // lightbox into a strobe or a still.
            'interval_ms' => ['sometimes', 'integer', 'min:2000', 'max:60000'],

            'groups' => ['sometimes', 'array', 'max:20'],
            'groups.*.name' => ['required', 'string', 'max:150'],
            'groups.*.slug' => ['required', 'string', 'max:150', 'alpha_dash'],

            'items' => ['sometimes', 'array', 'max:200'],
            'items.*.media_path' => ['required', 'string', 'max:255'],
            'items.*.alt_text' => ['nullable', 'string', 'max:255'],
            'items.*.title' => ['nullable', 'string', 'max:200'],
            'items.*.subtitle' => ['nullable', 'string', 'max:500'],
            'items.*.link_url' => ['nullable', 'string', 'max:255'],
            /*
             * The tab this picture is filed under, named by slug.
             *
             * Refused rather than quietly ungrouped when it names a tab that
             * does not exist. An item filed under a missing group renders in
             * no tab at all — it is in the gallery, it is in the database, and
             * it is on screen nowhere, which is the kind of failure somebody
             * finds months later by counting.
             */
            'items.*.group' => ['nullable', 'string', 'max:150', Rule::in($this->knownGroupSlugs())],
        ];
    }

    /**
     * Which group slugs an item may name.
     *
     * The submitted groups when the payload carries them — groups are replaced
     * wholesale, so those are the ones that will exist after this request — and
     * otherwise the ones already on the record, since omitting the key leaves
     * them alone.
     */
    protected function knownGroupSlugs(): array
    {
        if (is_array($this->input('groups'))) {
            return array_values(array_filter(array_map(
                fn ($g) => is_array($g) ? ($g['slug'] ?? null) : null,
                $this->input('groups'),
            )));
        }

        $gallery = $this->route('gallery');

        return $gallery ? $gallery->groups()->pluck('slug')->all() : [];
    }
}
