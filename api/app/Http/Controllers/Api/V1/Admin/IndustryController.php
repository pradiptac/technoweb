<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreIndustryRequest;
use App\Http\Requests\UpdateIndustryRequest;
use App\Http\Resources\Admin\IndustryResource;
use App\Models\Industry;
use App\Support\CustomFields\CustomFields;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Industry CRUD. Behind auth:sanctum + role:content_manager.
 *
 * No publish status — see IndustryResource. Deleting one is the only way to
 * take it off the site, and case studies reference it, so the count is
 * surfaced in the list to make that consequence visible before someone does.
 */
class IndustryController extends Controller
{
    use WritesCmsEntities;

    public function index(Request $request): AnonymousResourceCollection
    {
        $industries = Industry::query()
            ->withCount('caseStudies')
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('summary', 'like', "%{$term}%"));
            })
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        // Sent by the API, never listed in TypeScript: the console's kind
        // select is built from this, the `meta.transitions` rule.
        return IndustryResource::collection($industries)->additional(['meta' => [
            'answer_block_kinds' => AnswerBlockKind::options(),
            // The custom field groups that apply, for the console's Fields tab.
            'custom_field_groups' => CustomFields::definitions('industry'),
        ]]);
    }

    public function show(Industry $industry): JsonResource
    {
        return new IndustryResource($industry->load(['solutions', 'faqs', 'answerBlocks', 'seo', 'customValues.field.group']));
    }

    public function store(StoreIndustryRequest $request): JsonResponse
    {
        $industry = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $solutionIds = $attributes['solution_ids'] ?? null;
            unset($attributes['solution_ids']);
            $content = $this->pullAnswerContent($attributes);

            $industry = Industry::create($attributes);
            $this->saveAnswerContent($industry, $content);

            if ($solutionIds !== null) {
                $industry->solutions()->sync($solutionIds);
            }
            $this->saveSeo($industry, $seo);
            $this->saveCustomFields($industry, $custom);

            return $industry;
        });

        return response()->json(['data' => new IndustryResource($industry->load(['solutions', 'faqs', 'answerBlocks', 'seo', 'customValues.field.group']))], 201);
    }

    public function update(UpdateIndustryRequest $request, Industry $industry): JsonResource
    {
        DB::transaction(function () use ($request, $industry) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $hasSolutions = array_key_exists('solution_ids', $attributes);
            $solutionIds = $attributes['solution_ids'] ?? [];
            unset($attributes['solution_ids']);
            $content = $this->pullAnswerContent($attributes);

            $industry->update($attributes);
            $this->saveAnswerContent($industry, $content);

            // An absent key leaves the relation alone; an empty array clears it.
            if ($hasSolutions) {
                $industry->solutions()->sync($solutionIds);
            }
            $this->saveSeo($industry, $seo);
            $this->saveCustomFields($industry, $custom);
        });

        return new IndustryResource($industry->fresh(['solutions', 'faqs', 'answerBlocks', 'seo', 'customValues.field.group']));
    }

    public function destroy(Industry $industry): JsonResponse
    {
        DB::transaction(function () use ($industry) {
            // case_studies.industry_id is nullOnDelete, so studies survive
            // with no sector rather than disappearing with it.
            $industry->solutions()->detach();
            $industry->seo()->delete();
            $industry->faqs()->delete();
            $industry->answerBlocks()->delete();
            $industry->delete();
        });

        return response()->json(['message' => 'Industry deleted.']);
    }
}
