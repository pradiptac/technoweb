<?php

namespace App\Http\Requests;

use App\Support\Tickets\AttachmentStore;
use Illuminate\Foundation\Http\FormRequest;

class StoreTicketMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $maxKb = AttachmentStore::maxKb();

        return [
            'body' => ['required', 'string', 'min:2', 'max:20000'],
            // Only staff may post an internal note; the controller enforces the
            // guard, this just keeps the field out of a customer's payload shape.
            'is_internal' => ['sometimes', 'boolean'],
            'attachments' => ['nullable', 'array', 'max:'.AttachmentStore::MAX_FILES],
            'attachments.*' => ['file', "max:{$maxKb}", AttachmentStore::mimesRule()],
        ];
    }
}
