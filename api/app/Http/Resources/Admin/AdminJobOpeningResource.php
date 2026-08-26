<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminJobOpeningResource extends JsonResource
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
            'openings' => $this->openings,
            'job_experience_level_id' => $this->job_experience_level_id,
            'experience_level' => $this->whenLoaded('experienceLevel',
                fn () => $this->experienceLevel?->name),
            'qualification_ids' => $this->whenLoaded('qualifications',
                fn () => $this->qualifications->pluck('id')->all()),
            'salary_min' => $this->salary_min,
            'salary_max' => $this->salary_max,
            'salary_period' => $this->salary_period,
            'salary_currency' => $this->salary_currency,
            'summary' => $this->summary,
            'description' => $this->description,
            'responsibilities' => $this->responsibilities ?? [],
            'requirements' => $this->requirements ?? [],
            'status' => $this->status->value,
            'published_at' => $this->published_at?->toIso8601String(),
            'closes_at' => $this->closes_at?->toDateString(),
            'sort_order' => (int) $this->sort_order,
            // Whether the public site is actually showing it, which is not the
            // same as `status` once a closing date is involved.
            'is_open' => $this->isOpen(),
            'application_count' => $this->whenCounted('applications'),
            'seo' => $this->whenLoaded('seo', fn () => $this->seo),
            'seo_defaults' => $this->defaultSeo(),
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
