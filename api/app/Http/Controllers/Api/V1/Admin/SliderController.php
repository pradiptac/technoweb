<?php

namespace App\Http\Controllers\Api\V1\Admin;

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

        return SliderResource::collection($sliders);
    }

    public function store(StoreSliderRequest $request): JsonResponse
    {
        $data = $request->validated();
        $slides = $data['slides'] ?? null;
        unset($data['slides']);

        $slider = Slider::create($data);
        $this->syncSlides($slider, $slides);

        return (new SliderResource($slider->load('slides')))->response()->setStatusCode(201);
    }

    public function show(Slider $slider): JsonResource
    {
        return new SliderResource($slider->load('slides'));
    }

    public function update(UpdateSliderRequest $request, Slider $slider): JsonResource
    {
        $data = $request->validated();
        $slides = array_key_exists('slides', $data) ? ($data['slides'] ?? []) : null;
        unset($data['slides']);

        $slider->update($data);
        $this->syncSlides($slider, $slides);

        return new SliderResource($slider->load('slides'));
    }

    public function destroy(Slider $slider): JsonResponse
    {
        $slider->delete();

        return response()->json(null, 204);
    }

    /**
     * Replaced wholesale, like `faqs` and the other repeaters.
     *
     * `null` means the key was absent — leave the slides alone. An empty array
     * means the editor removed them all, which has to be a real instruction or
     * the last slide could never be deleted.
     */
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
                // The order the editor submitted, not a number they maintain.
                'sort_order' => $i,
            ]);
        }
    }
}
