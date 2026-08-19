<?php

namespace App\Http\Requests;

use App\Enums\TicketPriority;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTicketRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $maxKb = (int) config('support.attachment_max_kb', 10240);

        return [
            'subject' => ['required', 'string', 'min:5', 'max:180'],
            'description' => ['required', 'string', 'min:20', 'max:20000'],
            'ticket_category_id' => ['nullable', 'integer', Rule::exists('ticket_categories', 'id')->where('is_active', true)],
            'priority' => ['required', Rule::enum(TicketPriority::class)],
            'attachments' => ['nullable', 'array', 'max:5'],
            // Deliberately narrow: no archives, no executables, no office macros.
            'attachments.*' => ['file', "max:{$maxKb}", 'mimes:png,jpg,jpeg,gif,webp,pdf,txt,log,csv'],
        ];
    }

    public function messages(): array
    {
        return [
            'description.min' => 'Please describe the issue in a little more detail — what changed, when it started, and who is affected.',
            'attachments.*.mimes' => 'Attachments must be an image, PDF, or a plain text/log/CSV file.',
        ];
    }
}
