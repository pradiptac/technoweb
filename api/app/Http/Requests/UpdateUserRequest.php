<?php

namespace App\Http\Requests;

use App\Enums\Role as RoleEnum;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Validator;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $target = $this->route('user');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => [
                'sometimes', 'required', 'string', 'email', 'max:255',
                Rule::unique('users', 'email')->ignore($target),
            ],
            'password' => ['sometimes', 'nullable', 'string', Password::min(12)],
            'is_active' => ['sometimes', 'boolean'],
            'roles' => ['sometimes', 'array', 'min:1'],
            'roles.*' => ['string', Rule::in(array_column(RoleEnum::cases(), 'value'))],
        ];
    }

    /**
     * The lockout guards.
     *
     * They live here rather than in the controller so the message lands on the
     * field that caused it, and so every one of them is refused before
     * anything is written. Without the last-administrator rule, two admins can
     * each demote the other and the install is left with no way in short of a
     * database edit.
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                /** @var User $target */
                $target = $this->route('user');
                $actor = $this->user();
                $isSelf = $target->id === $actor->id;

                if ($isSelf && $this->has('is_active') && ! $this->boolean('is_active')) {
                    $validator->errors()->add('is_active', 'You cannot deactivate your own account.');
                }

                if (! $this->has('roles')) {
                    return;
                }

                $roles = (array) $this->input('roles', []);
                $keepsAdmin = in_array(RoleEnum::Admin->value, $roles, true);

                if ($isSelf && $target->hasRole(RoleEnum::Admin) && ! $keepsAdmin) {
                    $validator->errors()->add('roles', 'You cannot remove your own administrator role.');
                }

                if (! $keepsAdmin && $this->isLastAdministrator($target)) {
                    $validator->errors()->add('roles', 'This is the last administrator — promote someone else first.');
                }
            },
            function (Validator $validator) {
                /** @var User $target */
                $target = $this->route('user');

                if ($this->has('is_active')
                    && ! $this->boolean('is_active')
                    && $this->isLastAdministrator($target)) {
                    $validator->errors()->add('is_active', 'This is the last administrator — promote someone else first.');
                }
            },
        ];
    }

    private function isLastAdministrator(User $target): bool
    {
        if (! $target->hasRole(RoleEnum::Admin) || ! $target->is_active) {
            return false;
        }

        return User::where('is_active', true)
            ->where('id', '!=', $target->id)
            ->whereHas('roles', fn ($r) => $r->where('slug', RoleEnum::Admin->value))
            ->doesntExist();
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the staff member a name.',
            'email.unique' => 'That email address already has an account.',
            'roles.min' => 'Give the account at least one role, or it can sign in and see nothing.',
        ];
    }
}
