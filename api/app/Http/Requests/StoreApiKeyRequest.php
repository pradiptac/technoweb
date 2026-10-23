<?php

namespace App\Http\Requests;

use App\Enums\ApiScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A new API key. No field here is called `key`: that name is on the activity
 * log's context allowlist, and the plain key must only ever travel *out*.
 */
class StoreApiKeyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'scopes' => ['required', 'array', 'min:1'],
            'scopes.*' => ['string', Rule::in(ApiScope::values())],
            'expires_at' => ['nullable', 'date', 'after:now'],
            'allowed_ips' => ['nullable', 'string', 'max:2000', function (string $attribute, mixed $value, \Closure $fail) {
                foreach (self::lines((string) $value) as $line) {
                    if (! self::validAddress($line)) {
                        $fail("“{$line}” is not an address or a range.");

                        return;
                    }
                }
            }],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the key a name — it is how the list tells them apart.',
            'scopes.required' => 'Tick at least one thing the key may do.',
            'scopes.min' => 'Tick at least one thing the key may do.',
            'scopes.*.in' => 'That is not something a key can be allowed to do.',
            'expires_at.after' => 'The expiry must be in the future.',
        ];
    }

    /** Duplicate ticks collapse to one, and the order is the enum's. */
    public function validatedScopes(): array
    {
        $chosen = (array) ($this->validated()['scopes'] ?? []);

        return array_values(array_filter(ApiScope::values(), fn ($v) => in_array($v, $chosen, true)));
    }

    /** @return array<int, string> the allowlist as a list, [] for none */
    public function validatedIps(): array
    {
        return array_values(array_unique(self::lines((string) ($this->validated()['allowed_ips'] ?? ''))));
    }

    /** @return array<int, string> */
    private static function lines(string $text): array
    {
        return array_values(array_filter(array_map('trim', preg_split('/[\r\n,]+/', $text) ?: []), fn ($l) => $l !== ''));
    }

    private static function validAddress(string $line): bool
    {
        [$ip, $bits] = array_pad(explode('/', $line, 2), 2, null);

        if (! filter_var($ip, FILTER_VALIDATE_IP)) {
            return false;
        }

        if ($bits === null) {
            return true;
        }

        $max = str_contains($ip, ':') ? 128 : 32;

        return ctype_digit($bits) && (int) $bits <= $max;
    }
}
