<?php

namespace App\Http\Requests\Ext;

use Illuminate\Foundation\Http\FormRequest;

/** A lead filed by an integration; the route's `api.key:leads:write` is the authorisation. */
class StoreExtLeadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => 'nullable|string|max:120',
            'email' => 'nullable|email:rfc|max:255|required_without:phone',
            'phone' => 'nullable|string|max:40|required_without:email',
            'company' => 'nullable|string|max:160',
            'subject' => 'nullable|string|max:200',
            'message' => 'nullable|string|max:5000',
        ];
    }
}
