<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\SliderResource;
use App\Models\Slider;
use Illuminate\Http\Resources\Json\JsonResource;

class SliderController extends Controller
{
    /**
     * One slider by slug, for a shortcode or the hero.
     *
     * A slider with no slides returns 404 rather than an empty carousel: the
     * frontend's fallback is "render nothing", and an empty track with two
     * arrows that do nothing is worse than an absent section.
     */
    public function show(string $slug): JsonResource
    {
        $slider = Slider::query()
            ->published()
            ->where('slug', $slug)
            ->with('slides')
            ->first();

        abort_if(! $slider || $slider->slides->isEmpty(), 404);

        return new SliderResource($slider);
    }
}
