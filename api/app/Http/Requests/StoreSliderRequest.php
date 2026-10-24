<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Enums\SlideCaptionAnimation;
use App\Enums\SlideCaptionPosition;
use App\Enums\SlideFit;
use App\Enums\SlideMediaEffect;
use App\Enums\SlideOverlay;
use App\Enums\SliderHeight;
use App\Enums\SliderLayout;
use App\Enums\SliderNavigation;
use App\Enums\SliderTransition;
use App\Enums\SlideTextTone;
use App\Support\LinkPattern;
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
            'layout' => ['sometimes', Rule::enum(SliderLayout::class)],
            'transition' => ['sometimes', Rule::enum(SliderTransition::class)],
            // How the words arrive — refused outside the list, the `transition` rule.
            'caption_animation' => ['sometimes', Rule::enum(SlideCaptionAnimation::class)],
            'autoplay' => ['sometimes', 'boolean'],
            // 2s is about the floor for anything readable; 60s is a slideshow
            // that has effectively stopped, and both ends stop a typo turning
            // the carousel into a strobe or a still.
            'interval_ms' => ['sometimes', 'integer', 'min:2000', 'max:60000'],

            // The hero features: refused outside the list, the `transition` rule.
            'media_effect' => ['sometimes', Rule::enum(SlideMediaEffect::class)],
            'navigation' => ['sometimes', Rule::enum(SliderNavigation::class)],
            'height' => ['sometimes', Rule::enum(SliderHeight::class)],
            // Needed only for a fixed height; the controller stores null otherwise.
            'height_mobile' => ['nullable', 'required_if:height,fixed', Rule::in(SliderHeight::STEPS)],
            'height_desktop' => ['nullable', 'required_if:height,fixed', Rule::in(SliderHeight::STEPS)],

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
            // An `href` on the page: held to the menu's shape, or `javascript:`
            // saved on a slide and ran for whoever pressed it.
            'slides.*.link_url' => ['nullable', 'string', 'max:255', LinkPattern::RULE],
            'slides.*.link_label' => ['nullable', 'string', 'max:60'],
            // Refused outside the list rather than falling back to the
            // default, the rule `transition` follows: this arrives from a
            // select the console drew from `meta.caption_positions`, so a
            // value outside it means the two sides have drifted and
            // silently correcting it would hide that.
            'slides.*.caption_position' => ['nullable', Rule::enum(SlideCaptionPosition::class)],
            'slides.*.kicker' => ['nullable', 'string', 'max:60'],
            // The second button: both halves or neither.
            'slides.*.link2_url' => ['nullable', 'required_with:slides.*.link2_label', 'string', 'max:2048', LinkPattern::RULE],
            'slides.*.link2_label' => ['nullable', 'required_with:slides.*.link2_url', 'string', 'max:60'],
            // The phone picture: a library image, not a document and not a file in the bin.
            'slides.*.mobile_media_path' => [
                'nullable', 'string', 'max:255',
                Rule::exists('media', 'path')->whereNull('deleted_at')->where(fn ($q) => $q->where('mime', 'like', 'image/%')),
            ],
            'slides.*.text_tone' => ['nullable', Rule::enum(SlideTextTone::class)],
            'slides.*.overlay' => ['nullable', Rule::enum(SlideOverlay::class)],
            'slides.*.fit' => ['nullable', Rule::enum(SlideFit::class)],
            'slides.*.duration_ms' => ['nullable', 'integer', 'min:2000', 'max:60000'],
            // Null here means the URL was not a YouTube video link — the
            // parser refuses anything else, including a lookalike host.
            'slides.*.youtube_id' => ['nullable', 'required_if:slides.*.kind,youtube', 'string', 'max:20'],
        ];
    }
}
