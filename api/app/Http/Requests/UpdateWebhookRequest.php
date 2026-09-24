<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SometimesRules;

/**
 * The store request's rules with `sometimes` in front of each, plus
 * `rotate_secret`: true mints a new secret, which the response then carries
 * once, exactly as a create does. There is no way to *set* a secret — a
 * secret somebody typed is one that exists in a chat window somewhere.
 */
class UpdateWebhookRequest extends StoreWebhookRequest
{
    use SometimesRules;

    public function rules(): array
    {
        return $this->sometimes(parent::rules()) + [
            'rotate_secret' => ['sometimes', 'boolean'],
        ];
    }
}
