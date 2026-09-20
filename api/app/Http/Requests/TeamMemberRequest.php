<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * One request for creating and updating, the `PopupRequest` shape.
 *
 * `certifications` is a repeating field replaced wholesale, the rule `slides`
 * and `faqs` follow: omitting the key leaves them alone, sending `[]` clears
 * them — which has to be possible, or the last one could never be removed.
 */
class TeamMemberRequest extends FormRequest
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
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:120'],
            'designation' => ['nullable', 'string', 'max:120'],
            'department' => ['nullable', 'string', 'max:80'],
            'photo_path' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string', 'max:1000'],
            // Public when filled, and the form says so. `email:rfc`, never
            // `email:dns` — a DNS lookup on the request path.
            'email' => ['nullable', 'string', 'email:rfc', 'max:255'],
            /*
             * An outbound link on a public page, so https and on LinkedIn —
             * the host compared as a host, not with a substring, the rule
             * `App\Support\YouTube` records for `youtube.com.attacker.test`.
             */
            'linkedin_url' => [
                'nullable', 'string', 'max:255',
                'regex:#^https://([a-z0-9-]+\.)?linkedin\.com/[^\s]*$#i',
            ],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],

            'certifications' => ['sometimes', 'array', 'max:20'],
            'certifications.*.name' => ['required', 'string', 'max:150'],
            'certifications.*.issuer' => ['nullable', 'string', 'max:150'],
            'certifications.*.credential_id' => ['nullable', 'string', 'max:100'],
            'certifications.*.issued_on' => ['nullable', 'date'],
            'certifications.*.expires_on' => ['nullable', 'date'],
        ];
    }

    /**
     * A row with no name is a row somebody left behind, not a certification.
     * The repeater already drops them; the form is not the boundary.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('certifications') && is_array($this->input('certifications'))) {
            $rows = array_values(array_filter(
                $this->input('certifications'),
                fn ($row) => is_array($row) && trim((string) ($row['name'] ?? '')) !== '',
            ));

            $this->merge(['certifications' => $rows]);
        }
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Give the team member a name.',
            'linkedin_url.regex' => 'A LinkedIn profile address, starting https://www.linkedin.com/.',
            'certifications.*.name.required' => 'Every certification needs a name.',
        ];
    }
}
