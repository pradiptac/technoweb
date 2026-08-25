<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Support\YouTube;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSliderRequest extends FormRequest
{
    /**
     * A pasted YouTube URL becomes an id before validation sees it.
     *
     * In prepareForValidation for the same reason the rich-text sanitiser
     * lives there: nothing unvalidated should reach a controller, and an
     * unparseable URL then fails the rule below with a message about the URL
     * rather than silently storing null.
     */
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
        return array_merge(self::sliderRules(), [
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:150', 'alpha_dash', Rule::unique('sliders', 'slug')],
        ]);
    }

    /** Shared with UpdateSliderRequest — one definition of a slide. */
    public static function sliderRules(): array
    {
        return [
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'autoplay' => ['sometimes', 'boolean'],
            // 2s is about the floor for anything readable; 60s is a slideshow
            // that has effectively stopped, and both ends stop a typo turning
            // the carousel into a strobe or a still.
            'interval_ms' => ['sometimes', 'integer', 'min:2000', 'max:60000'],

            'slides' => ['sometimes', 'array', 'max:20'],
            'slides.*.kind' => ['required', 'in:image,video,youtube'],
            // Required for the two kinds that are a file; a YouTube slide has
            // no file of its own, only a poster.
            'slides.*.media_path' => ['nullable', 'required_unless:slides.*.kind,youtube', 'string', 'max:255'],
            'slides.*.poster_path' => ['nullable', 'string', 'max:255'],
            'slides.*.youtube_url' => ['nullable', 'required_if:slides.*.kind,youtube', 'string', 'max:255'],
            'slides.*.alt_text' => ['nullable', 'string', 'max:255'],
            'slides.*.heading' => ['nullable', 'string', 'max:150'],
            'slides.*.caption' => ['nullable', 'string', 'max:500'],
            'slides.*.link_url' => ['nullable', 'string', 'max:255'],
            'slides.*.link_label' => ['nullable', 'string', 'max:60'],
            // Null here means the URL was not a YouTube video link — the
            // parser refuses anything else, including a lookalike host.
            'slides.*.youtube_id' => ['nullable', 'required_if:slides.*.kind,youtube', 'string', 'max:20'],
        ];
    }
}
