<?php

namespace App\Http\Resources;

use App\Models\Certification;
use App\Support\MediaAlt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A company certification as the public site lists it. URLs, never paths —
 * the path is what a record stores and a browser has no use for it.
 *
 * @mixin Certification
 */
class CertificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'issuer' => $this->issuer,
            'certificate_number' => $this->certificate_number,
            'issued_on' => $this->issued_on?->toDateString(),
            'valid_until' => $this->valid_until?->toDateString(),
            'description' => $this->description,
            'image' => filled($this->image_path) ? asset('storage/'.$this->image_path) : null,
            // Falls back to the name: a badge is the certificate, not decoration.
            'image_alt' => MediaAlt::for($this->image_path) ?: $this->name,
            'file' => filled($this->file_path) ? asset('storage/'.$this->file_path) : null,
        ];
    }
}
