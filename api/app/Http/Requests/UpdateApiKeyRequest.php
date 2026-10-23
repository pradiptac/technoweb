<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SometimesRules;
use App\Models\ApiKey;
use Illuminate\Support\Carbon;

/**
 * The store request's rules with `sometimes`; the key itself can only be
 * rolled, never set. The console form posts every field on save, so an expiry
 * that has already passed and is sent back unchanged is accepted; a *changed*
 * expiry must still be in the future.
 */
class UpdateApiKeyRequest extends StoreApiKeyRequest
{
    use SometimesRules;

    public function rules(): array
    {
        $rules = parent::rules();
        $rules['expires_at'] = ['nullable', 'date', function (string $attribute, mixed $value, \Closure $fail) {
            if ($value === null || $value === '') {
                return;
            }
            $stored = $this->route('apiKey');
            $at = Carbon::parse($value);
            if ($stored instanceof ApiKey && $stored->expires_at?->timestamp === $at->timestamp) {
                return;
            }
            if ($at->isPast()) {
                $fail('The expiry must be in the future.');
            }
        }];

        return $this->sometimes($rules);
    }
}
