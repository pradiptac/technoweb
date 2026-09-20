<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * One request for creating and updating, the `PopupRequest` shape: nothing
 * here means something different on the second write, because there is no
 * slug. The authorisation is the route's `role:content_manager`.
 */
class CertificationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $creating = $this->isMethod('POST');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:150'],
            'issuer' => ['nullable', 'string', 'max:150'],
            'certificate_number' => ['nullable', 'string', 'max:100'],
            'image_path' => ['nullable', 'string', 'max:255'],
            /*
             * A media-library path, and a PDF: the same rule a store product's
             * activation document follows. A path the library does not know
             * is a link that silently 404s on a page whose whole job is being
             * believed.
             */
            'file_path' => [
                'nullable', 'string', 'max:255',
                Rule::exists('media', 'path')->where('mime', 'application/pdf'),
            ],
            'issued_on' => ['nullable', 'date'],
            'valid_until' => ['nullable', 'date'],
            'description' => ['nullable', 'string', 'max:1000'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $data = $v->getData();

            /*
             * Compared here rather than with `after:issued_on`, because that
             * rule passes silently when the field it names is absent — which
             * on a PATCH that sends only `valid_until` is every time. The
             * absent side comes from the record.
             */
            $issued = $data['issued_on'] ?? $this->route('certification')?->issued_on;
            $until = $data['valid_until'] ?? $this->route('certification')?->valid_until;

            if (filled($issued) && filled($until) && strtotime((string) $issued) > strtotime((string) $until)) {
                $v->errors()->add('valid_until', 'The certificate expires before it was issued.');
            }
        });
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Give the certification a name — what the certificate says.',
            'file_path.exists' => 'Choose a PDF from the media library.',
        ];
    }
}
