<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * What every install needs, and nothing invented.
 *
 * The setup wizard runs this on a customer's server; `DemoSeeder` is the
 * sample content it offers as a separate choice, off by default. Everything
 * here is either structure the code expects (roles, settings rows, careers
 * lookups, the ticket categories) or a starting point the customer edits in
 * the console (the catalogue skeleton the navigation is built from, the
 * contact form, the newsletter templates, an empty hero slider) — plus the
 * policy pages, whose copy is a placeholder the manual says to replace before
 * launch.
 *
 * Safe to run once on an empty database. Do not re-run it on a live install:
 * `PageSeeder` and `CatalogueSeeder` rewrite their own rows. An update runs
 * only `SettingsSeeder` and `RoleSeeder`, which never overwrite a value.
 */
class InstallSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            TicketCategorySeeder::class,
            CatalogueSeeder::class,
            SettingsSeeder::class,
            CareersSeeder::class,
            PageSeeder::class,
            PolicyRedirectSeeder::class,
            SliderSeeder::class,
            FormSeeder::class,
            /*
             * Never registered until 2026-09, so a fresh install had an empty
             * template gallery and no standing customers group — and the
             * newsletter's first screen is the one that offers to start a
             * campaign from a template. It seeds no subscribers: an address on
             * a mailing list is a claim about somebody's consent.
             */
            NewsletterTemplateSeeder::class,
        ]);
    }
}
