<?php

namespace App\Http\Requests\Store;

use App\Http\Requests\Concerns\SanitisesRichText;
use App\Http\Requests\SeoRules;
use Illuminate\Foundation\Http\FormRequest;

/**
 * `PATCH /admin/store/tags/{id}` (0.157.0): the tag's own fields and its page.
 *
 * The name and the Shown switch were validated inline in the controller
 * before the tag had a page; they are here now so the whole write has one
 * set of rules. `intro` is rich text, so it is named for the sanitiser —
 * a field left out of `richTextFields()` bypasses it entirely.
 */
class TagRequest extends FormRequest
{
    use SanitisesRichText;

    protected function richTextFields(): array
    {
        return ['intro'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string'],
            'is_visible' => ['sometimes', 'boolean'],
            'heading' => ['sometimes', 'nullable', 'string', 'max:160'],
            'intro' => ['sometimes', 'nullable', 'string', 'max:20000'],
            ...SeoRules::rules(),
        ];
    }
}
