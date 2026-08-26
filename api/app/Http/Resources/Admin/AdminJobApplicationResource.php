<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A candidate as staff see them.
 *
 * `cv_path` and `cv_disk` are absent and must stay absent. The file is reached
 * through the download route and nowhere else; putting its storage path in a
 * response is the first half of making it fetchable.
 */
class AdminJobApplicationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'current_company' => $this->current_company,
            'experience_years' => $this->experience_years,
            'cover_letter' => $this->cover_letter,
            'portfolio_url' => $this->portfolio_url,

            'job' => [
                'id' => $this->job_opening_id,
                // The title copied at the time, so the row still reads after
                // the vacancy is gone.
                'title' => $this->job_title,
                'slug' => $this->whenLoaded('opening', fn () => $this->opening?->slug),
                'exists' => $this->job_opening_id !== null,
            ],

            'cv' => $this->hasCv() ? [
                'filename' => $this->cv_filename,
                'mime' => $this->cv_mime,
                'size' => $this->cv_size,
            ] : null,

            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'status_note' => $this->status_note,
            'reviewed_by' => $this->whenLoaded('reviewer', fn () => $this->reviewer?->name),
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
