<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A vacancy as the public site sees it.
 *
 * Salary is omitted entirely when the range is blank, rather than sent as
 * nulls: the frontend then has nothing to render, which is the difference
 * between a page that says nothing about pay and one that says "Salary: —".
 */
class JobOpeningResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'department' => $this->department,
            'location' => $this->location,
            'employment_type' => $this->employment_type->value,
            'employment_type_label' => $this->employment_type->label(),
            'employment_type_schema' => $this->employment_type->schemaValue(),
            'openings' => $this->openings,
            'summary' => $this->summary,
            'description' => $this->when($request->routeIs('*.show'), $this->description),
            'responsibilities' => $this->responsibilities ?? [],
            'requirements' => $this->requirements ?? [],
            'experience' => $this->whenLoaded('experienceLevel', fn () => $this->experienceLevel ? [
                'name' => $this->experienceLevel->name,
                'range' => $this->experienceLevel->range(),
                'min_years' => $this->experienceLevel->min_years,
                'max_years' => $this->experienceLevel->max_years,
            ] : null),
            'qualifications' => $this->whenLoaded('qualifications',
                fn () => $this->qualifications->pluck('name')->all()),
            'salary' => $this->salaryRange() ? [
                'min' => $this->salary_min,
                'max' => $this->salary_max,
                'period' => $this->salary_period,
                'currency' => $this->salary_currency,
                'label' => $this->salaryRange(),
            ] : null,
            'published_at' => $this->published_at?->toIso8601String(),
            'closes_at' => $this->closes_at?->toDateString(),
            /*
             * Through `SeoResource` like every other public resource, rather
             * than the raw resolved array this used to send.
             *
             * The keys are identical bar one: `resolvedSeo()` now also carries
             * `schema_type_options`, which is what the console builds its
             * dropdown from and has no business on an unauthenticated
             * endpoint. Whitelisting the public shape is the same rule
             * `/settings` follows — a field added later is private until
             * somebody makes it public on purpose.
             */
            'seo' => new SeoResource($this->resolvedSeo()),
        ];
    }
}
