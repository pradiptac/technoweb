<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Store\Fulfilment;
use Database\Seeders\PolicyRedirectSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The `embeds` group (2026-09-17): the reviews widget and the "before
 * </body>" snippet, public so the site can render them, written by an
 * administrator alone, and — the point of the group — stored **as
 * pasted**: a snippet the sanitiser had been through could not carry a
 * script, and carrying a script is all it is for. Beside it, the
 * Merchant Center shipping window and the policy-page aliases from the
 * same day's list.
 */
class EmbedSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function admin(): User
    {
        $user = User::create(['name' => 'Admin', 'email' => 'embeds-admin@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]));

        return $user;
    }

    public function test_the_embeds_are_public_and_stored_as_pasted(): void
    {
        $snippet = '<script src="https://elfsightcdn.com/platform.js" async></script><div class="elfsight-app-abc" data-elfsight-app-lazy></div>';
        $body = '<script>window.vendorWidget = 1;</script>';

        $this->actingAs($this->admin(), 'sanctum')->patchJson('/api/v1/admin/settings', ['settings' => [
            ['key' => 'reviews_embed', 'value' => $snippet],
            ['key' => 'body_code', 'value' => $body],
        ]])->assertOk();

        $this->assertSame($snippet, Setting::get('reviews_embed'), 'The script tag survives: this is the one setting the sanitiser must not touch.');
        $this->assertSame($body, Setting::get('body_code'));

        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame($snippet, $public['reviews_embed']);
        $this->assertSame($body, $public['body_code']);
        $this->assertSame('What our customers say', $public['reviews_heading']);
    }

    public function test_the_shipping_window_is_declared_and_never_runs_backwards(): void
    {
        $this->assertSame(['min' => 3, 'max' => 7], Fulfilment::transitDays());
        $this->assertSame('Standard Shipping', Fulfilment::shippingService());

        $this->actingAs($this->admin(), 'sanctum')->patchJson('/api/v1/admin/settings', ['settings' => [
            ['key' => 'store_transit_days_min', 'value' => '9'],
            ['key' => 'store_transit_days_max', 'value' => '4'],
        ]])->assertOk();

        $this->assertSame(['min' => 9, 'max' => 9], Fulfilment::transitDays(), 'A window typed backwards is corrected, not declared.');

        $row = $this->getJson('/api/v1/store/feed')->assertOk()->json('data.0');
        if ($row !== null) {
            $this->assertSame('Standard Shipping', $row['shipping_service']);
            $this->assertSame(9, $row['min_transit_time']);
        }
    }

    public function test_the_policy_pages_answer_under_the_conventional_names(): void
    {
        $this->seed(PolicyRedirectSeeder::class);

        $this->getJson('/api/v1/redirects/lookup?path=/refund-policy')->assertOk()->assertJsonPath('data.to', '/returns');
        $this->getJson('/api/v1/redirects/lookup?path=/terms-and-conditions')->assertOk()->assertJsonPath('data.to', '/terms');

        // Re-running leaves an edited row alone.
        Redirect::where('from_path', '/privacy-policy')->update(['to_path' => '/privacy?v=2']);
        $this->seed(PolicyRedirectSeeder::class);
        $this->assertSame('/privacy?v=2', Redirect::where('from_path', '/privacy-policy')->value('to_path'));
    }
}
