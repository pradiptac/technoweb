<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ThrottlesByEmail;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Asking for a code. An address and nothing else.
 *
 * There is no honeypot here and there deliberately is not: this is a sign-in
 * form that people use every day, not a public write endpoint, and the trap
 * would have to be defeated by every password manager and autofill on the way
 * past. The rate limits and the identical answers are what do the work.
 */
class SignInCodeRequest extends FormRequest
{
    use ThrottlesByEmail;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
        ];
    }
}
