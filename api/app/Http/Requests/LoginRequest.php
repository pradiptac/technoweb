<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ThrottlesByEmail;
use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    /** Per email+IP throttle, so one attacker cannot lock out a whole office. */
    use ThrottlesByEmail;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
        ];
    }
}
