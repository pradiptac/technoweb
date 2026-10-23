<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SometimesRules;

/** The store request's rules with `sometimes`; the key itself can only be rolled, never set. */
class UpdateApiKeyRequest extends StoreApiKeyRequest
{
    use SometimesRules;

    public function rules(): array
    {
        return $this->sometimes(parent::rules());
    }
}
