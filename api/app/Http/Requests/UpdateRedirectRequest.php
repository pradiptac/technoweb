<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SometimesRules;
use Illuminate\Validation\Rules\Unique;

/**
 * The store request's rules with `sometimes` in front of each, and the
 * uniqueness check told which row it is looking at. Everything else — the
 * path normalisation, the messages — is inherited.
 */
class UpdateRedirectRequest extends StoreRedirectRequest
{
    use SometimesRules;

    protected function uniqueFrom(): Unique
    {
        return parent::uniqueFrom()->ignore($this->route('redirect'));
    }

    public function rules(): array
    {
        return $this->sometimes(parent::rules());
    }
}
