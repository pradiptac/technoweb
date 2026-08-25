<?php

namespace App\Console\Commands;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Creates a portal login.
 *
 * Portal accounts are issued with an AMC contract rather than self-registered,
 * so there is no public sign-up route. Until the admin UI lands in Phase 3,
 * this command is the only way to create one — and it stays useful afterwards
 * for scripted onboarding.
 *
 *   php artisan technoware:customer neil@meridianfoods.in --name="Neil Basu" --company="Meridian Foods"
 */
class MakeCustomer extends Command
{
    protected $signature = 'technoware:customer
                            {email : The customer\'s login email}
                            {--name= : Full name}
                            {--company= : Company name}
                            {--phone= : Contact number}
                            {--password= : Set a specific password instead of generating one}';

    protected $description = 'Create a customer portal login';

    public function handle(): int
    {
        $email = strtolower(trim($this->argument('email')));

        $validator = Validator::make(
            ['email' => $email],
            ['email' => ['required', 'email', 'unique:customers,email']],
            ['email.unique' => 'A portal account already exists for that address.']
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $name = $this->option('name') ?: $this->ask('Full name');
        $password = $this->option('password') ?: Str::password(16);

        if (strlen($password) < 12) {
            $this->error('Password must be at least 12 characters.');

            return self::FAILURE;
        }

        $customer = Customer::create([
            'name' => $name,
            'email' => $email,
            'password' => $password,
            'company' => $this->option('company'),
            'phone' => $this->option('phone'),
            'status' => CustomerStatus::Active,
        ]);

        // Created by a staff member at a terminal: the account is already a
        // decision somebody took, and the address came from them rather than
        // from a stranger filling in a form. Nothing to approve or verify.
        $customer->forceFill([
            'email_verified_at' => now(),
            'approved_at' => now(),
        ])->save();

        $this->newLine();
        $this->info('Portal account created.');
        $this->line("  Name:     {$customer->name}");
        $this->line("  Email:    {$customer->email}");

        if (! $this->option('password')) {
            $this->line("  Password: {$password}");
            $this->warn('  Generated password — copy it now, it is not stored in readable form.');
        }

        $this->newLine();

        return self::SUCCESS;
    }
}
