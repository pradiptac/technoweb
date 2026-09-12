<?php

namespace App\Http\Resources\Admin;

use App\Models\Certification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A certification as the console edits it: paths *and* URLs — `CoverField`
 * previews from a URL, the form posts the path back — plus `is_expired`, so
 * the list can flag what the public page has already stopped showing.
 *
 * @mixin Certification
 */
class CertificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $v = '?v='.($this->updated_at?->timestamp ?? 0);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'issuer' => $this->issuer,
            'certificate_number' => $this->certificate_number,
            'image_path' => $this->image_path,
            'image' => filled($this->image_path) ? asset('storage/'.$this->image_path).$v : null,
            'file_path' => $this->file_path,
            'file' => filled($this->file_path) ? asset('storage/'.$this->file_path) : null,
            'issued_on' => $this->issued_on?->toDateString(),
            'valid_until' => $this->valid_until?->toDateString(),
            'is_expired' => $this->isExpired(),
            'description' => $this->description,
            'status' => $this->status?->value,
            'sort_order' => (int) $this->sort_order,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
