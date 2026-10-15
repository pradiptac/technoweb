<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SometimesRules;

/**
 * Editing a tender.
 *
 * It differs from posting one by nothing but `sometimes` — a `PATCH`
 * mentions only what it changes — so it extends the store request, which is
 * what `SometimesRules` is for. The reference and slug `unique()->ignore()`
 * and every cross-field check already read the tender from the route in the
 * parent, so a partial edit is held to the same invariants as a whole one.
 */
class UpdateTenderRequest extends StoreTenderRequest
{
    use SometimesRules;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return $this->sometimes(parent::rules());
    }
}
