<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PaletteFromLogoTest extends TestCase
{
    use RefreshDatabase;

    private const TWO_COLOURS = '<path d="M0 0h60v60H0z" fill="#1d4ed8"/><path d="M70 0h30v30H70z" fill="#e11d48"/>';

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            ['name' => 'Test Staff', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));
        }

        return $user;
    }

    private function admin(): User
    {
        return $this->staff(RoleEnum::Admin, 'ada-palette@example.test');
    }

    private function logo(string $body = self::TWO_COLOURS, string $extension = 'svg'): Media
    {
        Storage::fake('public');
        $path = 'media/2026/10/'.uniqid().'.'.$extension;
        Storage::disk('public')->put(
            $path,
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'.$body.'</svg>',
        );

        return Media::create([
            'disk' => 'public',
            'path' => $path,
            'filename' => 'logo.'.$extension,
            'mime' => $extension === 'svg' ? 'image/svg+xml' : 'image/png',
            'size' => 512,
        ]);
    }

    private function setLogo(string $path): void
    {
        Setting::query()->updateOrCreate(
            ['key' => 'logo_path'],
            ['value' => $path, 'group' => 'general', 'type' => 'media'],
        );
        Setting::flushCache();
    }

    public function test_it_answers_the_readings_for_the_sites_logo(): void
    {
        $logo = $this->logo();
        $this->setLogo($logo->path);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo');

        $response->assertOk()
            ->assertJsonPath('data.from.path', $logo->path)
            ->assertJsonPath('data.readings.0.primary', '#1d4ed8');

        $this->assertNotEmpty($response->json('data.colours'));
        $this->assertNotEmpty($response->json('data.from.url'));
    }

    public function test_it_reads_the_file_a_caller_names(): void
    {
        $logo = $this->logo();
        $this->setLogo('media/2026/10/something-else.svg');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertOk()
            ->assertJsonPath('data.from.path', $logo->path);
    }

    public function test_it_writes_nothing(): void
    {
        $logo = $this->logo();
        $keys = ['theme', 'theme_primary', 'theme_secondary', 'theme_accent', 'theme_topbar'];
        $before = Setting::query()->whereIn('key', $keys)->pluck('value', 'key')->all();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertOk();

        $this->assertSame($before, Setting::query()->whereIn('key', $keys)->pluck('value', 'key')->all());
    }

    public function test_a_logo_with_no_colour_is_refused_in_one_sentence(): void
    {
        $logo = $this->logo('<path d="M0 0h60v60H0z" fill="#ffffff"/><path d="M70 0h10v10H70z" fill="#111111"/>');

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertStatus(422)
            ->assertJsonValidationErrors('path');

        $this->assertStringContainsString('grey', strtolower((string) $response->json('errors.path.0')));
    }

    public function test_it_refuses_when_no_logo_is_set(): void
    {
        Storage::fake('public');
        $this->setLogo('');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo')
            ->assertStatus(422)
            ->assertJsonValidationErrors('path');
    }

    public function test_it_refuses_a_path_the_library_does_not_hold(): void
    {
        Storage::fake('public');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => 'media/2026/10/nobody.svg'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('path');
    }

    public function test_it_refuses_a_library_row_that_is_not_a_picture(): void
    {
        Storage::fake('public');
        $pdf = Media::create([
            'disk' => 'public',
            'path' => 'media/2026/10/brochure.pdf',
            'filename' => 'brochure.pdf',
            'mime' => 'application/pdf',
            'size' => 2048,
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $pdf->path])
            ->assertStatus(422)
            ->assertJsonValidationErrors('path');
    }

    public function test_it_refuses_a_picture_whose_file_has_gone(): void
    {
        Storage::fake('public');
        $gone = Media::create([
            'disk' => 'public',
            'path' => 'media/2026/10/vanished.svg',
            'filename' => 'vanished.svg',
            'mime' => 'image/svg+xml',
            'size' => 512,
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $gone->path])
            ->assertStatus(422)
            ->assertJsonValidationErrors('path');
    }

    public function test_only_an_administrator_may_ask(): void
    {
        $logo = $this->logo();

        $this->actingAs($this->staff(RoleEnum::ContentManager, 'mia-palette@example.test'), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertForbidden();

        // `actingAs` and the guard it resolved are sticky across requests in
        // one test, so without this the call below still arrives as the
        // content manager and answers 403 where it should answer 401.
        $this->app['auth']->forgetGuards();

        $this->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertUnauthorized();
    }
}
