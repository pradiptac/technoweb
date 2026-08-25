<?php

namespace App\Http\Requests;

use App\Support\YouTube;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSliderRequest extends FormRequest
{
    /** Same URL-to-id conversion as the store request. */
    protected function prepareForValidation(): void
    {
        $slides = $this->input('slides');
        if (! is_array($slides)) {
            return;
        }

        foreach ($slides as $i => $slide) {
            if (($slide['kind'] ?? null) !== 'youtube') {
                continue;
            }
            $slides[$i]['youtube_id'] = YouTube::id($slide['youtube_url'] ?? $slide['youtube_id'] ?? null);
        }

        $this->merge(['slides' => $slides]);
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return array_merge(StoreSliderRequest::sliderRules(), [
            'name' => ['sometimes', 'string', 'max:150'],
            'slug' => [
                'sometimes', 'string', 'max:150', 'alpha_dash',
                Rule::unique('sliders', 'slug')->ignore($this->route('slider')),
            ],
        ]);
    }
}
