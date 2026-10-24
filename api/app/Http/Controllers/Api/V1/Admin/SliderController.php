<?php

namespace App\Http\Controllers\Api\V1\Admin;

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
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSliderRequest;
use App\Http\Requests\UpdateSliderRequest;
use App\Http\Resources\SliderResource;
use App\Models\Slider;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

class SliderController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $sliders = Slider::query()
            ->withCount('slides')
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->string('q')->value().'%'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        // `meta.transitions` rides on the index because the console's *new*
        // slider screen has no record to read it from â€” the same reason
        // `GalleryController` and `/admin/menus/new` carry their own meta this
        // way, rather than a second, hand-typed copy of the list in TypeScript.
        return SliderResource::collection($sliders)
            ->additional(['meta' => self::meta()]);
    }

    public function store(StoreSliderRequest $request): JsonResponse
    {
        $data = $request->validated();
        $slides = $data['slides'] ?? null;
        unset($data['slides']);

        $slider = Slider::create(self::heightSteps($data));
        $this->syncSlides($slider, $slides);

        return (new SliderResource($slider->load('slides')))->response()->setStatusCode(201);
    }

    public function show(Slider $slider): JsonResource
    {
        return (new SliderResource($slider->load('slides')))
            ->additional(['meta' => self::meta()]);
    }

    public function update(UpdateSliderRequest $request, Slider $slider): JsonResource
    {
        $data = $request->validated();
        $slides = array_key_exists('slides', $data) ? ($data['slides'] ?? []) : null;
        unset($data['slides']);

        $slider->update(self::heightSteps($data));
        $this->syncSlides($slider, $slides);

        return new SliderResource($slider->load('slides'));
    }

    public function destroy(Request $request, Slider $slider): JsonResponse
    {
        // The API is the boundary, not the dialog: a console that asks twice
        // is one screen, and this is every caller. `Slider::RESERVED` says
        // why a reserved slider wants a request that has read the warning.
        if ($slider->isReserved() && ! $request->boolean('confirm')) {
            return response()->json([
                'message' => "This slider draws {$slider->reservedFor()}. Deleting it needs a confirmed request.",
                'reserved_for' => $slider->reservedFor(),
            ], 422);
        }

        $slider->delete();

        return response()->json(null, 204);
    }

    /**
     * Replaced wholesale, like `faqs` and the other repeaters.
     *
     * `null` means the key was absent â€” leave the slides alone. An empty array
     * means the editor removed them all, which has to be a real instruction or
     * the last slide could never be deleted.
     */
    /**
     * The three lists the console builds its selects from.
     *
     * On the index as well as the record, because the *new* screen has no
     * record to read them off — the same reason `GalleryController` and
     * `/admin/menus/new` carry their own meta.
     *
     * @return array{transitions: list<array<string, string>>, caption_animations: list<array<string, string>>, layouts: list<array<string, string>>, caption_positions: list<array<string, string>>, media_effects: list<array<string, string>>, navigations: list<array<string, string>>, heights: list<array<string, string>>, height_steps: list<array<string, string>>, text_tones: list<array<string, string>>, overlays: list<array<string, string>>, fits: list<array<string, string>>}
     */
    private static function meta(): array
    {
        return [
            'transitions' => SliderTransition::options(),
            'caption_animations' => SlideCaptionAnimation::options(),
            'layouts' => SliderLayout::options(),
            'caption_positions' => SlideCaptionPosition::options(),
            'media_effects' => SlideMediaEffect::options(),
            'navigations' => SliderNavigation::options(),
            'heights' => SliderHeight::options(),
            'height_steps' => SliderHeight::steps(),
            'text_tones' => SlideTextTone::options(),
            'overlays' => SlideOverlay::options(),
            'fits' => SlideFit::options(),
        ];
    }

    /** The phone and desktop steps mean something only for a fixed height. */
    private static function heightSteps(array $data): array
    {
        if (isset($data['height']) && $data['height'] !== 'fixed') {
            $data['height_mobile'] = $data['height_desktop'] = null;
        }

        return $data;
    }

    private function syncSlides(Slider $slider, ?array $slides): void
    {
        if ($slides === null) {
            return;
        }

        $slider->slides()->delete();

        foreach (array_values($slides) as $i => $slide) {
            $slider->slides()->create([
                'kind' => $slide['kind'] ?? 'image',
                'media_path' => $slide['media_path'] ?? null,
                'poster_path' => $slide['poster_path'] ?? null,
                'youtube_id' => $slide['youtube_id'] ?? null,
                'alt_text' => $slide['alt_text'] ?? null,
                'heading' => $slide['heading'] ?? null,
                'caption' => $slide['caption'] ?? null,
                'link_url' => $slide['link_url'] ?? null,
                'link_label' => $slide['link_label'] ?? null,
                // `?:`, not `??`: the console posts an empty string for a
                // row that predates the column, and an empty string is not
                // a position — it would fail the cast on the way back out.
                'caption_position' => ($slide['caption_position'] ?? null) ?: 'bottom-left',
                'kicker' => $slide['kicker'] ?? null,
                'link2_url' => $slide['link2_url'] ?? null,
                'link2_label' => $slide['link2_label'] ?? null,
                'mobile_media_path' => $slide['mobile_media_path'] ?? null,
                'duration_ms' => $slide['duration_ms'] ?? null,
                'text_tone' => ($slide['text_tone'] ?? null) ?: 'light',
                'overlay' => ($slide['overlay'] ?? null) ?: 'standard',
                'fit' => ($slide['fit'] ?? null) ?: 'cover',
                // The order the editor submitted, not a number they maintain.
                'sort_order' => $i,
            ]);
        }
    }
}
