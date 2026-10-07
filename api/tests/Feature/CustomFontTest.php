<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * A company's own typefaces (0.125.0, docs/theming.md).
 *
 * Two slots, WOFF2 only and checked by its bytes, written by their own
 * endpoints and never by the settings form, and a slot that is emptied takes
 * the site off it.
 */
class CustomFontTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Storage::fake('public');
    }

    private function staff(RoleEnum $role = RoleEnum::Admin): User
    {
        $user = User::create([
            'name' => 'Staff', 'email' => 'font-'.uniqid().'@example.test',
            'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    /** Not a real font — the check is the signature every WOFF2 file opens with. */
    private function woff2(string $name = 'acme.woff2', string $body = 'x'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, 'wOF2'.str_repeat($body, 400));
    }

    private function upload(User $user, int $slot, array $fields)
    {
        return $this->actingAs($user, 'sanctum')
            ->post("/api/v1/admin/settings/fonts/{$slot}", $fields, ['Accept' => 'application/json']);
    }

    public function test_a_font_fills_a_slot_and_is_published(): void
    {
        $admin = $this->staff();

        $slot = $this->upload($admin, 1, ['name' => 'Acme Sans', 'regular' => $this->woff2(), 'bold' => $this->woff2('acme-bold.woff2', 'b')])
            ->assertOk()->json('data');

        $this->assertSame('custom-1', $slot['id']);
        $this->assertSame('Acme Sans', $slot['name']);
        $this->assertMatchesRegularExpression('#^fonts/[A-Za-z0-9]{40}\.woff2$#', $slot['regular']);
        $this->assertNotSame($slot['regular'], $slot['bold']);
        Storage::disk('public')->assertExists($slot['regular']);
        Storage::disk('public')->assertExists($slot['bold']);

        $public = $this->getJson('/api/v1/settings')->json('data');
        $this->assertSame($slot['regular'], $public['custom_font_1_regular']);
        $this->assertSame('Acme Sans', $public['custom_font_1_name']);

        // And the site may now be set in it.
        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => [['key' => 'theme_font_display', 'value' => 'custom-1']],
        ])->assertOk();
    }

    public function test_only_a_real_woff2_is_accepted(): void
    {
        $admin = $this->staff();

        // A TrueType file under the right extension.
        $this->upload($admin, 1, ['name' => 'Acme', 'regular' => UploadedFile::fake()->createWithContent('acme.woff2', "\x00\x01\x00\x00".str_repeat('x', 400))])
            ->assertStatus(422)->assertJsonValidationErrors('regular');
        // The right bytes under the wrong one.
        $this->upload($admin, 1, ['name' => 'Acme', 'regular' => $this->woff2('acme.ttf')])
            ->assertStatus(422)->assertJsonValidationErrors('regular');
        // No file for a slot that has none.
        $this->upload($admin, 1, ['name' => 'Acme'])->assertStatus(422)->assertJsonValidationErrors('regular');
        // A name that is not one.
        $this->upload($admin, 1, ['name' => '"; } body { display:none', 'regular' => $this->woff2()])
            ->assertStatus(422)->assertJsonValidationErrors('name');
        // A variable font is one file.
        $this->upload($admin, 1, ['name' => 'Acme', 'regular' => $this->woff2(), 'bold' => $this->woff2('b.woff2'), 'variable' => '1'])
            ->assertStatus(422)->assertJsonValidationErrors('bold');

        $this->assertSame([], Storage::disk('public')->allFiles('fonts'));
        // A third slot does not exist.
        $this->upload($admin, 3, ['name' => 'Acme', 'regular' => $this->woff2()])->assertNotFound();
    }

    public function test_a_replaced_file_is_deleted_and_an_unsent_one_is_kept(): void
    {
        $admin = $this->staff();
        $first = $this->upload($admin, 2, ['name' => 'Acme', 'regular' => $this->woff2(), 'bold' => $this->woff2('b.woff2', 'b')])->json('data');

        // Only the name and the regular file this time.
        $second = $this->upload($admin, 2, ['name' => 'Acme Text', 'regular' => $this->woff2('new.woff2', 'n')])->assertOk()->json('data');

        $this->assertSame('Acme Text', $second['name']);
        $this->assertNotSame($first['regular'], $second['regular']);
        $this->assertSame($first['bold'], $second['bold']);
        Storage::disk('public')->assertMissing($first['regular']);
        Storage::disk('public')->assertExists($second['bold']);

        // Marked variable, the bold beside it goes.
        $third = $this->upload($admin, 2, ['name' => 'Acme Text', 'variable' => '1'])->assertOk()->json('data');
        $this->assertTrue($third['variable']);
        $this->assertNull($third['bold']);
        Storage::disk('public')->assertMissing($second['bold']);
    }

    public function test_emptying_a_slot_deletes_its_files_and_takes_the_site_off_it(): void
    {
        $admin = $this->staff();
        $slot = $this->upload($admin, 1, ['name' => 'Acme', 'regular' => $this->woff2()])->json('data');
        Setting::put('theme_font_display', 'custom-1');
        Setting::put('theme_font_body', 'sora');
        Setting::flushCache();

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/v1/admin/settings/fonts/1')
            ->assertOk()->assertJsonPath('data.regular', null)->assertJsonPath('data.name', null);

        Storage::disk('public')->assertMissing($slot['regular']);
        $public = $this->getJson('/api/v1/settings')->json('data');
        $this->assertArrayNotHasKey('custom_font_1_regular', $public);
        $this->assertSame('instrument', $public['theme_font_display']);
        // A font that was not this slot's is left alone.
        $this->assertSame('sora', $public['theme_font_body']);
    }

    public function test_the_settings_form_cannot_write_a_font_and_only_an_administrator_can_upload_one(): void
    {
        $this->actingAs($this->staff(), 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => [['key' => 'custom_font_1_regular', 'value' => 'fonts/'.str_repeat('a', 40).'.woff2']],
        ])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');

        $this->upload($this->staff(RoleEnum::ContentManager), 1, ['name' => 'Acme', 'regular' => $this->woff2()])->assertForbidden();
    }
}
