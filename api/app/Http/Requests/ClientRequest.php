<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * One request for creating and updating — the `PopupRequest` shape; there is
 * no slug to treat differently on the second write.
 */
class ClientRequest extends FormRequest
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
            'logo_path' => ['nullable', 'string', 'max:255'],
            /*
             * It becomes an outbound `href` on a live page, so only http(s):
             * a `javascript:` value cannot be stored. Absolute only — a path
             * would point back into this site, which is not what a client's
             * website is.
             */
            'website_url' => ['nullable', 'string', 'max:2048', 'url:http,https'],
            'industry_id' => ['nullable', 'integer', Rule::exists('industries', 'id')],
            'note' => ['nullable', 'string', 'max:200'],
            'is_featured' => ['sometimes', 'boolean'],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Give the client a name.',
            'website_url.url' => 'The website needs to be a full http(s) address.',
            'industry_id.exists' => 'That industry does not exist.',
        ];
    }
}
