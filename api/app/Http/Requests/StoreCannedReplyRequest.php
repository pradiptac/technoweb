<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A saved reply: a title for the picker, a plain-text body, an order.
 *
 * The body is plain text because the reply box it is inserted into is a
 * `Textarea` — no sanitiser, no rich text, and the console renders it
 * escaped. Placeholders are left as typed; they are filled per ticket.
 */
class StoreCannedReplyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:160'],
            'body' => ['required', 'string', 'max:10000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Give the reply a title — it is what the picker lists.',
            'body.required' => 'Write the reply.',
        ];
    }
}
