<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ThrottlesByEmail;
use App\Support\SignInCodes;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

/**
 * Spending a code.
 *
 * The code is normalised before validation rather than after, because of how
 * it arrives: read off a phone and typed, or copied out of an email where it
 * may well have picked up a space or a line break on the way. Refusing
 * "123 456" as malformed is refusing the code the person is holding, and they
 * have no way to tell that a space is what did it.
 *
 * Everything that is not a digit comes off — including the hyphen a browser or
 * a password manager may insert — and only then is the length checked.
 */
class VerifySignInCodeRequest extends FormRequest
{
    use ThrottlesByEmail;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('code')) {
            $this->merge([
                'code' => Str::of((string) $this->input('code'))->replaceMatches('/\D/', '')->value(),
            ]);
        }
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'code' => ['required', 'string', 'size:'.SignInCodes::LENGTH],
        ];
    }

    public function messages(): array
    {
        return [
            'code.required' => 'Enter the code we sent you.',
            'code.size' => 'A sign-in code is '.SignInCodes::LENGTH.' digits.',
        ];
    }
}
