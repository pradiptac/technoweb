<?php

namespace App\Http\Requests;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The same fields `UpdateTicketRequest` takes, over `ids[]`.
 *
 * Capped at fifty: a queue page is at most a hundred rows and a bulk action
 * is a selection from one page, so a larger batch is a script rather than a
 * person — and every ticket in it is its own transaction and its own event.
 */
class BulkTicketRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1', 'max:50'],
            'ids.*' => ['integer', Rule::exists('tickets', 'id')],
            'status' => ['sometimes', Rule::enum(TicketStatus::class)],
            'priority' => ['sometimes', Rule::enum(TicketPriority::class)],
            'ticket_category_id' => ['sometimes', 'nullable', 'integer', Rule::exists('ticket_categories', 'id')],
            'assigned_to' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')->where('is_active', true)],
        ];
    }
}
