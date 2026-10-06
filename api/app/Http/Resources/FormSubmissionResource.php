<?php

namespace App\Http\Resources;

use App\Models\FormSubmission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin FormSubmission */
class FormSubmissionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'form_id' => $this->form_id,
            'form_slug' => $this->form_slug,
            // A file answer is its original filename here; the file itself is
            // under `files`.
            'data' => $this->data,
            'files' => $this->uploads(),
            'ip_address' => $this->ip_address,
            'read_at' => $this->read_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * What was uploaded, by field: a name, a size, and where to ask for it.
     *
     * **Never the stored path.** This resource is also the body of the
     * `form.submitted` webhook, and a path on the private disk is nobody's
     * business outside this server. `download_path` is this API's own route
     * under `/api/v1` — `/admin/forms/{form}/submissions/{id}/files/{field}`
     * — which answers only to a signed-in content manager; it is null once
     * the form itself has been deleted, because that route is addressed
     * through the form.
     *
     * An object, never a list: `(object)` so a submission with no uploads is
     * `{}` rather than `[]`, and a client typing it as a map is not handed an
     * array on the common case.
     */
    private function uploads(): object
    {
        $files = [];

        foreach ($this->resource->files ?? [] as $field => $file) {
            $files[$field] = [
                'field' => (string) $field,
                'name' => (string) ($file['name'] ?? 'file'),
                'size' => (int) ($file['size'] ?? 0),
                'mime' => $file['mime'] ?? null,
                'submission_id' => $this->id,
                'download_path' => $this->form_id
                    ? "/admin/forms/{$this->form_id}/submissions/{$this->id}/files/{$field}"
                    : null,
            ];
        }

        return (object) $files;
    }
}
