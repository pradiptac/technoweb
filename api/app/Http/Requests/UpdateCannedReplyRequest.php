<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SometimesRules;

/** The store request's rules with `sometimes` in front of each. */
class UpdateCannedReplyRequest extends StoreCannedReplyRequest
{
    use SometimesRules;

    public function rules(): array
    {
        return $this->sometimes(parent::rules());
    }
}
