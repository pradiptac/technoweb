<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTicketMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $maxKb = (int) config('support.attachment_max_kb', 10240);

        return [
            'body' => ['required', 'string', 'min:2', 'max:20000'],
            // Only staff may post an internal note; the controller enforces the
            // guard, this just keeps the field out of a customer's payload shape.
            'is_internal' => ['sometimes', 'boolean'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => ['file', "max:{$maxKb}", 'mimes:png,jpg,jpeg,gif,webp,pdf,txt,log,csv'],
        ];
    }
}
