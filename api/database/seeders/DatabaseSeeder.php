<?php

namespace Database\Seeders;

use App\Support\System\FirstAdmin;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * A developer's `migrate:fresh --seed`: the install, an administrator, and
 * the sample content.
 *
 * A customer's server never runs this. The setup wizard runs `InstallSeeder`,
 * creates the administrator it was given, and adds `DemoSeeder` only when the
 * customer ticks "load sample content".
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(InstallSeeder::class);

        // After the admin exists — blog posts are attributed to a staff user.
        $this->createFirstAdmin();

        $this->call(DemoSeeder::class);
    }

    /**
     * Creates the first administrator with a generated password printed once to
     * the console. No default credentials are ever committed to the repository.
     */
    private function createFirstAdmin(): void
    {
        $email = env('ADMIN_EMAIL', 'admin@example.com');
        $password = env('ADMIN_PASSWORD') ?: Str::password(16);

        if (FirstAdmin::create(env('ADMIN_NAME', 'Administrator'), $email, $password) === null) {
            $this->command?->warn("Admin {$email} already exists — skipping.");

            return;
        }

        $this->command?->newLine();
        $this->command?->info('Administrator created.');
        $this->command?->line("  Email:    {$email}");
        $this->command?->line("  Password: {$password}");
        $this->command?->warn('  Save this now — it will not be shown again.');
        $this->command?->newLine();
    }
}
