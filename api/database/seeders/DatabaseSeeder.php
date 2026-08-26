<?php

namespace Database\Seeders;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            TicketCategorySeeder::class,
            CatalogueSeeder::class,
            SettingsSeeder::class,
            CareersSeeder::class,
        ]);

        // After the admin exists — blog posts are attributed to a staff user.
        $this->createFirstAdmin();

        $this->call([
            BlogPostSeeder::class,
            KnowledgeBaseSeeder::class,
            CaseStudySeeder::class,
            ProductSeeder::class,
            PageSeeder::class,
            // Last — it fills gaps left by everything above.
            DemoContentSeeder::class,
            SliderSeeder::class,
            FormSeeder::class,
            // A worked support desk: a portal login, tickets across every
            // status and a couple of enquiries. Demo data — see CLAUDE.md.
            DemoSupportSeeder::class,
        ]);
    }

    /**
     * Creates the first administrator with a generated password printed once to
     * the console. No default credentials are ever committed to the repository.
     */
    private function createFirstAdmin(): void
    {
        $email = env('ADMIN_EMAIL', 'admin@technoware.in');

        if (User::where('email', $email)->exists()) {
            $this->command?->warn("Admin {$email} already exists — skipping.");

            return;
        }

        $password = env('ADMIN_PASSWORD') ?: Str::password(16);

        $user = User::create([
            'name' => env('ADMIN_NAME', 'Administrator'),
            'email' => $email,
            'password' => $password,
            'is_active' => true,
        ]);

        $user->roles()->sync(Role::where('slug', RoleEnum::Admin->value)->pluck('id'));

        $this->command?->newLine();
        $this->command?->info('Administrator created.');
        $this->command?->line("  Email:    {$email}");
        $this->command?->line("  Password: {$password}");
        $this->command?->warn('  Save this now — it will not be shown again.');
        $this->command?->newLine();
    }
}
