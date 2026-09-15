<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Announcement;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The announcement bar's settings: nine keys, one derived bit, and the one
 * rich-text setting that is rendered on every public page.
 *
 * Three things are pinned that reading the controller would not settle.
 * The message goes through the `inline` purifier profile on write — a
 * `<script>`, an `<img>`, a heading and an inline colour all come off, and
 * a `<b>` and a link survive. `activation_procedure` is sanitised too, which
 * it had never been. And `announcement_live` is decided here against the
 * server's clock, so the frontend never combines a switch, two dates and a
 * message itself.
 */
class AnnouncementSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private ?User $admin = null;

    private function admin(): User
    {
        if ($this->admin) {
            return $this->admin;
        }

        $user = $this->admin = User::create([
            'name' => 'Admin', 'email' => 'announcement-admin@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()],
        ));

        return $user;
    }

    private function save(array $pairs)
    {
        return $this->actingAs($this->admin(), 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_the_keys_are_seeded_public_and_off_by_default(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame('0', $public['announcement_enabled']);
        $this->assertSame('solid', $public['announcement_style']);
        $this->assertSame('fixed', $public['announcement_mode']);
        $this->assertSame('1', $public['announcement_closable']);
        $this->assertSame('#12140d', $public['announcement_colour']);
        // Derived, never stored: off means not live whatever else is set.
        $this->assertSame('0', $public['announcement_live']);
        $this->assertNull(Setting::query()->where('key', 'announcement_live')->first());

        $groups = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/settings')->assertOk()->json('data');
        $this->assertArrayHasKey('announcement', $groups);
    }

    public function test_the_message_is_sanitised_on_write_through_the_inline_profile(): void
    {
        $this->save([
            'announcement_message' => '<p onclick="x">Sale <script>a()</script><a href="javascript:alert(1)">now</a> '
                .'<img src="x"> <span style="color:red">red</span> <b>bold</b><h2>big</h2><a href="/store">shop</a></p>',
        ])->assertOk();

        $stored = (string) Setting::get('announcement_message');

        $this->assertStringContainsString('<b>bold</b>', $stored);
        $this->assertStringContainsString('<a href="/store">shop</a>', $stored);
        $this->assertStringContainsString('big', $stored, 'a pasted heading keeps its words');
        foreach (['<script', '<img', '<h2', 'onclick', 'javascript:', 'style='] as $gone) {
            $this->assertStringNotContainsString($gone, $stored);
        }
    }

    public function test_the_activation_procedure_is_sanitised_too(): void
    {
        $this->save(['activation_procedure' => '<p>Step one</p><script>alert(1)</script>'])->assertOk();

        $this->assertSame('<p>Step one</p>', Setting::get('activation_procedure'));
    }

    public function test_style_mode_and_switches_are_refused_at_their_box(): void
    {
        $this->save(['announcement_style' => 'diagonal'])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $this->save(['announcement_mode' => 'crawl'])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $this->save(['announcement_colour' => '#2563eb', 'announcement_enabled' => '2'])
            ->assertStatus(422)->assertJsonValidationErrors('settings.1.value');

        // A refused request writes nothing, the good row included.
        $this->assertSame('#12140d', Setting::get('announcement_colour'));

        $this->save(['announcement_style' => 'gradient', 'announcement_mode' => 'ticker', 'announcement_closable' => '0'])->assertOk();
        $this->assertSame('gradient', Setting::get('announcement_style'));
        $this->assertSame('ticker', Setting::get('announcement_mode'));
        // `Setting::get()` casts a `boolean` row; the public map still says '0'.
        $this->assertFalse(Setting::get('announcement_closable'));
        $this->assertSame('0', $this->getJson('/api/v1/settings')->json('data.announcement_closable'));
    }

    public function test_colours_are_hex_and_lower_cased(): void
    {
        $this->save(['announcement_colour' => 'red'])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $this->save(['announcement_colour_2' => '#2563EB'])->assertOk();

        $this->assertSame('#2563eb', Setting::get('announcement_colour_2'));
    }

    public function test_the_window_must_be_well_formed_and_the_right_way_round(): void
    {
        $this->save(['announcement_starts_at' => '20/09/2026'])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $this->save(['announcement_starts_at' => '2026-09-20T09:00', 'announcement_ends_at' => '2026-09-19T09:00'])
            ->assertStatus(422)->assertJsonValidationErrors('settings.1.value');

        // Only the end sent, against a stored start: still checked.
        $this->save(['announcement_starts_at' => '2026-09-20T09:00'])->assertOk();
        $this->save(['announcement_ends_at' => '2026-09-19T09:00'])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');

        $this->save(['announcement_ends_at' => '2026-09-25T18:00'])->assertOk();
        $this->save(['announcement_starts_at' => '', 'announcement_ends_at' => ''])->assertOk();
        $this->assertNull(Setting::get('announcement_starts_at'));
    }

    public function test_live_follows_the_switch_the_window_and_the_message(): void
    {
        Carbon::setTestNow('2026-09-20 12:00:00');

        $live = fn () => $this->getJson('/api/v1/settings')->json('data.announcement_live');

        $this->save(['announcement_enabled' => '1', 'announcement_message' => '<p>Prices slashed</p>'])->assertOk();
        $this->assertSame('1', $live());

        $this->save(['announcement_ends_at' => '2026-09-19T00:00'])->assertOk();
        $this->assertSame('0', $live(), 'a window that has ended');

        $this->save(['announcement_ends_at' => '', 'announcement_starts_at' => '2026-09-21T00:00'])->assertOk();
        $this->assertSame('0', $live(), 'a window that has not started');

        $this->save(['announcement_starts_at' => '2026-09-20T00:00', 'announcement_ends_at' => '2026-09-21T00:00'])->assertOk();
        $this->assertSame('1', $live(), 'inside the window');

        $this->save(['announcement_message' => '<p>&nbsp;</p>'])->assertOk();
        $this->assertSame('0', $live(), 'an empty message');

        // The pure helper, with the clock injected.
        $this->assertTrue(Announcement::isLive(['announcement_enabled' => '1', 'announcement_message' => 'x'], Carbon::parse('2030-01-01')));
        $this->assertTrue(Announcement::isLive(['announcement_enabled' => '1', 'announcement_message' => 'x', 'announcement_starts_at' => 'garbage-but'], Carbon::parse('2030-01-01')), 'an unparseable date counts as blank');

        Carbon::setTestNow();
    }
}
