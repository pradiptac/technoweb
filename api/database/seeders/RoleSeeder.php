<?php

namespace Database\Seeders;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        foreach (RoleEnum::cases() as $role) {
            Role::updateOrCreate(
                ['slug' => $role->value],
                ['name' => $role->label(), 'description' => $role->description()],
            );
        }
    }
}
