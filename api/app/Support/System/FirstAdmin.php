<?php

namespace App\Support\System;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;

/**
 * The first administrator of an install.
 *
 * Shared by `DatabaseSeeder` (a developer's `migrate:fresh --seed`, which
 * prints a generated password once) and the setup wizard (which takes the
 * name, address, mobile and password the customer typed). There are no
 * default credentials anywhere: the password is either chosen by the person
 * who will use it or generated and shown once.
 */
final class FirstAdmin
{
    /**
     * Create the account, or return null when the address already has one —
     * a re-run must never reset somebody's password.
     */
    public static function create(string $name, string $email, string $password, ?string $phone = null): ?User
    {
        if (User::where('email', $email)->exists()) {
            return null;
        }

        $user = User::create([
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'password' => $password,
            'is_active' => true,
        ]);

        $user->roles()->sync(Role::where('slug', RoleEnum::Admin->value)->pluck('id'));

        return $user;
    }
}
