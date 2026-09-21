<?php

namespace App\Http\Requests;

use App\Enums\TicketPriority;
use App\Support\Tickets\AttachmentStore;
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
        $maxKb = AttachmentStore::maxKb();

        return [
            'subject' => ['required', 'string', 'min:5', 'max:180'],
            'description' => ['required', 'string', 'min:20', 'max:20000'],
            // "This contains sensitive data": the description stored encrypted,
            // kept out of the desk's email and redacted in the webhooks.
            'is_sensitive' => ['sometimes', 'boolean'],
            'ticket_category_id' => ['nullable', 'integer', Rule::exists('ticket_categories', 'id')->where('is_active', true)],
            'priority' => ['required', Rule::enum(TicketPriority::class)],
            'attachments' => ['nullable', 'array', 'max:'.AttachmentStore::MAX_FILES],
            // Deliberately narrow: no archives, no executables, no office macros.
            // The list is AttachmentStore's, shared with the mailbox piper.
            'attachments.*' => ['file', "max:{$maxKb}", AttachmentStore::mimesRule()],
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
