<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SometimesRules;

/**
 * Editing an event.
 *
 * It differs from creating one by nothing but `sometimes` — a `PATCH`
 * mentions only what it changes — so it extends the store request, which is
 * what `SometimesRules` is for. The slug's `unique()->ignore()` and every
 * cross-field check already read the event from the route in the parent, so
 * a partial edit is held to the same invariants as a whole one.
 */
class UpdateEventRequest extends StoreEventRequest
{
    use SometimesRules;

    public function rules(): array
    {
        return $this->sometimes(parent::rules());
    }
}
