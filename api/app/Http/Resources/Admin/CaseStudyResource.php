<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CaseStudyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show', '*.store', '*.update');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'client_name' => $this->client_name,
            'summary' => $this->summary,
            'body' => $this->when($detail, $this->body),
            // Always a list, never null — the form renders rows from it and
            // would otherwise have to special-case "never filled in".
            'results' => $this->results ?? [],
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'cover_image_path' => $this->cover_image_path,
            'cover_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'industry_id' => $this->industry_id,
            'industry' => $this->whenLoaded('industry', fn () => $this->industry ? [
                'id' => $this->industry->id,
                'name' => $this->industry->name,
            ] : null),
            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($this->seo)),
            'seo_defaults' => $this->when($detail, fn () => $this->resolvedSeo()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
