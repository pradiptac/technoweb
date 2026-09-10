<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Models\Media;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Notifications\TicketCreated;
use App\Support\Mail\Shell;
use App\Support\Newsletter\Branding;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The shell every transactional email is wrapped in.
 *
 * Before it, all 22 notifications went out in Laravel's stock theme: no logo,
 * no colour, a hosted PNG from laravel.com in the header, and a footer reading
 * "© 2026 Laravel". A campaign and a receipt from this business looked like
 * they came from two different companies.
 */
class MailShellTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A ticket, built by hand.
     *
     * There are no model factories in this project — every test constructs its
     * records, the way `TicketNotificationTest` does — so this mirrors that
     * rather than introducing the first factory for one file.
     */
    private function ticket(): Ticket
    {
        $customer = Customer::create([
            'name' => 'Neil Basu',
            'email' => 'neil@example.test',
            'password' => 'password-for-tests',
            'status' => CustomerStatus::Active,
        ]);

        $category = TicketCategory::create([
            'name' => 'Network', 'slug' => 'network', 'is_active' => true,
        ]);

        $ticket = $customer->tickets()->make([
            'subject' => 'Switch keeps dropping',
            'description' => 'The uplink drops every afternoon, since the last firmware update.',
            'ticket_category_id' => $category->id,
            'priority' => 'normal',
            'status' => 'open',
        ]);
        $ticket->save();

        return $ticket->load(['customer', 'category']);
    }

    /**
     * Write a setting, creating the row.
     *
     * `Setting::put()` **only writes a key that already exists** — it logs
     * "Ignored a write to an unknown setting" and returns false otherwise —
     * and `RefreshDatabase` re-migrates without seeding, so the settings table
     * is empty here. Using `put()` in a test is therefore a silent no-op, and
     * an assertion after one passes or fails for reasons that have nothing to
     * do with the setting. That is how the brand-palette test below briefly
     * passed while writing nothing: `Shell::company()` falls back to
     * `config('app.name')`, which is also "Technoware".
     */
    private function setting(string $group, string $key, ?string $value): void
    {
        Setting::create(['group' => $group, 'key' => $key, 'value' => $value, 'type' => 'string']);
    }

    private function render(): string
    {
        return (string) (new TicketCreated($this->ticket()))->toMail((object) [])->render();
    }

    public function test_a_transactional_email_never_carries_an_unsubscribe_line(): void
    {
        $this->setting('general', 'company_name', 'Technoware');
        $this->setting('contact', 'address', 'Unit 4, Mumbai 400093');

        $html = $this->render();

        /*
         * The rule this whole file exists to protect. `EmailRenderer::footer()`
         * hard-codes an unsubscribe link because a campaign is legally obliged
         * to carry one — and a receipt is not a campaign. Nobody can opt out of
         * being told their order has shipped, so offering it is a promise the
         * system cannot keep and a support ticket when somebody clicks it.
         *
         * Case-insensitive, because the failure would arrive as somebody
         * reusing the newsletter's footer block and its wording is Title Case.
         */
        $this->assertStringNotContainsStringIgnoringCase('unsubscribe', $html);
    }

    public function test_the_stock_laravel_branding_is_gone(): void
    {
        $html = $this->render();

        // A third-party request in every email this business sends, pointing at
        // somebody else's logo. Laravel's own header emits it whenever the
        // slot happens to read "Laravel".
        $this->assertStringNotContainsString('laravel.com', $html);

        // The stock near-black. Its absence is what says the theme was
        // actually recoloured rather than merely published.
        $this->assertStringNotContainsString('#18181b', $html);
    }

    public function test_it_carries_the_brand_palette_and_the_company(): void
    {
        $this->setting('general', 'company_name', 'Meridian Foods Ltd');

        $html = $this->render();

        // The same button fill `EmailRenderer` writes into a campaign, which is
        // the whole point: one business, one look.
        $this->assertStringContainsString('#4a5a2a', $html);
        // A name that is *not* `config('app.name')`, so the assertion proves
        // the setting was read rather than the fallback.
        $this->assertStringContainsString('Meridian Foods Ltd', $html);
    }

    public function test_the_header_links_to_the_site_and_not_the_api(): void
    {
        /*
         * Laravel's stock header points at `config('app.url')`, which on this
         * deployment is the API — JSON, and no page to open. Every recipient
         * pressing the logo would land on an endpoint listing.
         */
        $this->assertSame(
            rtrim((string) config('app.frontend_url'), '/'),
            Shell::siteUrl(),
        );

        $this->assertStringContainsString(Shell::siteUrl(), $this->render());
    }

    public function test_the_logo_url_is_versioned_so_a_replacement_is_not_served_stale(): void
    {
        $media = Media::create([
            'disk' => 'public',
            'path' => 'media/test/logo.png',
            'filename' => 'logo.png',
            'mime' => 'image/png',
            'size' => 4096,
        ]);
        $this->setting('general', 'logo_path', 'media/test/logo.png');

        $url = Branding::logoUrl();

        /*
         * A logo is a stored path edited *in place* — a resize, a crop or a
         * replace rewrites the same file at the same address, which is what
         * lets an edit reach every page already using it. Without a version an
         * email client that cached the old bytes goes on showing them, and
         * unlike a browser there is no reload to press.
         */
        $this->assertStringContainsString('?v='.$media->updated_at->timestamp, (string) $url);
    }

    public function test_the_company_is_named_once_in_the_footer(): void
    {
        Setting::put('company_name', 'Technoware');
        // As somebody actually writes an address: with the company on the front.
        Setting::put('address', "Technoware\nUnit 4, Mumbai 400093");

        $html = $this->render();
        $footer = substr($html, (int) strrpos($html, 'All rights reserved') - 400);

        /*
         * The first cut printed the company on its own line *as well as* in the
         * copyright line, which read as "Technoware / Technoware Unit 4… /
         * © 2026 Technoware." Whether the stored address opens with the company
         * is a property of what a client typed, so the footer prints the
         * address as given and names the company exactly once itself.
         */
        $this->assertSame(1, substr_count($footer, '© '.date('Y').' Technoware'));
    }
}
