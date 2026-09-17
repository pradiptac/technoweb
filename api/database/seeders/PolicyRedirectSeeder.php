<?php

namespace Database\Seeders;

use App\Models\Redirect;
use Illuminate\Database\Seeder;

/**
 * The policy pages under the names Merchant Center reviewers and most
 * checklists look for.
 *
 * The pages themselves live at `/returns`, `/shipping`, `/privacy` and
 * `/terms` (`PageSeeder`), and Google does not care what a URL is called —
 * only that the policy is reachable and says what the feed declares. But
 * the conventional names are what a reviewer types, what a checklist
 * quotes (the client's, 2026-09-17: `/return-policy`, `/refund-policy`,
 * `/shipping-policy`, `/privacy-policy`, `/terms-and-conditions`), and what
 * a person guesses — so each answers, as a 301 to the page. Rows in the
 * redirects table rather than routes: the console can see them, edit them
 * and read the hit counts, which is where a redirect belongs.
 *
 * Idempotent: an existing row for a path is left as it is, so a redirect
 * an editor re-pointed is not put back.
 */
class PolicyRedirectSeeder extends Seeder
{
    public const ALIASES = [
        '/return-policy' => '/returns',
        '/refund-policy' => '/returns',
        '/returns-policy' => '/returns',
        '/shipping-policy' => '/shipping',
        '/delivery-policy' => '/shipping',
        '/privacy-policy' => '/privacy',
        '/terms-and-conditions' => '/terms',
        '/terms-of-service' => '/terms',
    ];

    public function run(): void
    {
        foreach (self::ALIASES as $from => $to) {
            Redirect::firstOrCreate(['from_path' => $from], ['to_path' => $to, 'status_code' => 301, 'is_active' => true]);
        }
    }
}
