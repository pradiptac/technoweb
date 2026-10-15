<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The body of `POST /admin/{entity}/bulk` (0.139.0): which rows, and one thing
 * to do to them.
 *
 * Capped at a hundred — the largest page a console list shows — because a
 * bulk action is a selection from one page, and every record in it is its own
 * transaction. Anything bigger is a script, not a person.
 *
 * `ids` are not checked against the table: an id that does not exist is
 * simply absent from the answer, the way `TicketController::bulk()` treats
 * one, so a row deleted by a colleague between the page load and the press
 * does not turn the whole request into a 422.
 *
 * What an entity may be asked to do is `actions()`. A list with a `status`
 * offers all four; one without (a brand, a category) is `BulkDeleteRequest`,
 * and asking it to publish is a 422 on `action`.
 */
class BulkActionRequest extends FormRequest
{
    /** Every action there is. */
    public const ACTIONS = ['publish', 'draft', 'archive', 'delete'];

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * What this list's entity can do.
     *
     * @return list<string>
     */
    public function actions(): array
    {
        return self::ACTIONS;
    }

    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer', 'min:1', 'distinct'],
            'action' => ['required', 'string', Rule::in($this->actions())],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'ids.required' => 'Tick at least one row.',
            'ids.max' => 'Act on up to 100 rows at a time.',
            'action.in' => 'That action is not available on this list.',
        ];
    }
}
