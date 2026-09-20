<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

/**
 * The same rules, with the identity fields relaxed to `sometimes`.
 *
 * Extends the store request rather than restating it, so `galleryRules()` and
 * the group-slug resolution have one definition — and `prepareForValidation`
 * comes with it, which is what derives a slug for a tab the editor named and
 * did not slug.
 */
class UpdateGalleryRequest extends StoreGalleryRequest
{
    public function rules(): array
    {
        return array_merge($this->galleryRules(), [
            'name' => ['sometimes', 'string', 'max:150'],
            'slug' => [
                'sometimes', 'string', 'max:150', 'alpha_dash',
                Rule::unique('galleries', 'slug')->ignore($this->route('gallery')),
            ],
        ]);
    }
}
