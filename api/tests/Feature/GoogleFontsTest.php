<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\GoogleFont;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Fonts\GoogleFontCatalogue;
use App\Support\Net\PublicHost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class GoogleFontsTest extends TestCase
{
    use RefreshDatabase;

    private const WOFF2 = "wOF2\x00\x01\x00\x00fake-font-bytes";

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['142.250.183.10']);
    }

    private function admin(): User
    {
        $u = User::create(['name' => 'Ada', 'email' => 'ada-fonts@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $u->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => 'Administrator']));

        return $u;
    }

    private function css(array $weights): string
    {
        $out = '';
        foreach ($weights as $i => $w) {
            $out .= "/* latin */\n@font-face {\n  font-family: 'Poppins';\n  font-style: normal;\n  font-weight: {$w};\n  font-display: swap;\n  src: url(https://fonts.gstatic.com/s/poppins/v1/f{$i}.woff2) format('woff2');\n  unicode-range: U+0000-00FF, U+0131;\n}\n";
        }

        return $out;
    }

    private function fakeGoogle(array $weights, ?string $file = null): void
    {
        Http::fake([
            'fonts.googleapis.com/*' => Http::response($this->css($weights), 200, ['Content-Type' => 'text/css']),
            'fonts.gstatic.com/*' => Http::response($file ?? self::WOFF2, 200, ['Content-Type' => 'font/woff2']),
        ]);
    }

    public function test_installing_a_family_stores_its_faces_and_publishes_them(): void
    {
        $this->fakeGoogle([400, 600, 700]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins'])
            ->assertCreated()
            ->assertJsonPath('data.id', 'g-poppins')
            ->assertJsonPath('data.faces', 3);

        $font = GoogleFont::firstOrFail();
        $this->assertSame([400, 600, 700], array_column($font->faces, 'weight'));
        Storage::disk('public')->assertExists($font->faces[0]['path']);
        $this->assertMatchesRegularExpression('#^fonts/google/poppins/\d+\.woff2$#', $font->faces[0]['path']);

        $published = json_decode($this->getJson('/api/v1/settings')->json('data.google_fonts'), true);
        $this->assertSame('g-poppins', $published[0]['id']);
        $this->assertSame('U+0000-00FF, U+0131', $published[0]['faces'][0]['range']);
    }

    public function test_a_slug_not_in_the_catalogue_is_refused(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'nope-not-a-font'])
            ->assertUnprocessable()->assertJsonValidationErrors('slug');
    }

    public function test_a_file_url_off_gstatic_is_refused_and_nothing_is_left(): void
    {
        Http::fake(['fonts.googleapis.com/*' => Http::response(str_replace('fonts.gstatic.com', 'evil.example', $this->css([400])), 200)]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins'])
            ->assertUnprocessable()->assertJsonValidationErrors('slug');

        $this->assertSame(0, GoogleFont::count());
        $this->assertSame([], Storage::disk('public')->allFiles('fonts/google'));
    }

    public function test_a_file_that_is_not_woff2_is_refused_and_nothing_is_left(): void
    {
        $this->fakeGoogle([400, 700], '<html>quota</html>');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins'])
            ->assertUnprocessable();

        $this->assertSame([], Storage::disk('public')->allFiles('fonts/google'));
    }

    public function test_a_refusal_from_google_is_one_sentence(): void
    {
        Http::fake(['fonts.googleapis.com/*' => Http::response('Too many', 429)]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.slug.0', 'Google refused the request (429). Try again shortly.');
    }

    public function test_a_family_without_400_600_or_700_takes_the_nearest_weight(): void
    {
        $this->fakeGoogle([300]);
        $slug = collect(GoogleFontCatalogue::all())
            ->first(fn ($f) => array_intersect([400, 600, 700], $f['weights']) === [])['slug'];

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => $slug])
            ->assertCreated();

        Http::assertSent(fn ($r) => str_contains($r->url(), 'fonts.googleapis.com') && preg_match('/wght@\d+&/', urldecode($r->url())));
    }

    public function test_a_family_in_too_many_pieces_is_refused_before_any_download(): void
    {
        // Large families (Japanese, Chinese) come as hundreds of unicode-range
        // slices; copying them in one request overruns the time limit.
        Http::fake([
            'fonts.googleapis.com/*' => Http::response($this->css(range(0, 60)), 200),
            'fonts.gstatic.com/*' => Http::response(self::WOFF2, 200),
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.slug.0', 'That font comes in 61 pieces and is too big to copy here. Choose a lighter one.');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'fonts.gstatic.com'));
        $this->assertSame(0, GoogleFont::count());
    }

    public function test_two_installs_at_once_leave_one_row_and_no_error(): void
    {
        $css = $this->css([400]);
        $made = false;
        Http::fake([
            'fonts.googleapis.com/*' => Http::response($css, 200),
            // The other request finishes while this one is still downloading.
            'fonts.gstatic.com/*' => function () use (&$made) {
                if (! $made) {
                    $made = true;
                    GoogleFont::create(['slug' => 'poppins', 'family' => 'Poppins', 'category' => 'sans-serif', 'faces' => [['weight' => 400, 'range' => 'U+0000', 'path' => 'fonts/google/poppins/0.woff2']], 'bytes' => 1]);
                }

                return Http::response(self::WOFF2, 200);
            },
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins'])
            ->assertOk()
            ->assertJsonPath('data.id', 'g-poppins');

        $this->assertSame(1, GoogleFont::count());
    }

    public function test_installing_twice_downloads_nothing_new(): void
    {
        $this->fakeGoogle([400]);
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins'])->assertCreated();
        Http::fake();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins'])->assertOk();
        Http::assertNothingSent();
    }

    public function test_a_font_in_use_cannot_be_removed(): void
    {
        $this->fakeGoogle([400]);
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins']);
        Setting::updateOrCreate(['key' => 'theme_font_body'], ['group' => 'appearance', 'value' => 'g-poppins', 'type' => 'string']);
        Setting::flushCache();

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/v1/admin/settings/google-fonts/poppins')
            ->assertUnprocessable()->assertJsonPath('errors.slug.0', 'The body font uses this. Choose another first.');

        Setting::where('key', 'theme_font_body')->update(['value' => 'inter']);
        Setting::flushCache();
        $this->actingAs($admin, 'sanctum')->deleteJson('/api/v1/admin/settings/google-fonts/poppins')->assertNoContent();
        $this->assertSame([], Storage::disk('public')->allFiles('fonts/google'));
    }

    public function test_the_settings_save_refuses_a_google_id_not_installed(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'theme_font_display', 'value' => 'g-roboto']]])
            ->assertUnprocessable()->assertJsonPath('errors', ['settings.0.value' => ['Install that font first.']]);
    }

    public function test_the_catalogue_search_marks_what_is_installed(): void
    {
        $this->fakeGoogle([400]);
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'poppins']);

        $row = collect($this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/settings/google-fonts/catalogue?q=poppi')->json('data'))
            ->firstWhere('slug', 'poppins');
        $this->assertTrue($row['installed']);
    }

    public function test_only_an_administrator_may_install(): void
    {
        $editor = User::create(['name' => 'Ed', 'email' => 'ed-fonts@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $editor->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'Content manager']));
        $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'roboto'])->assertForbidden();
    }

    public function test_old_previews_are_pruned(): void
    {
        Storage::disk('local')->put('font-previews/old.woff2', 'x');
        touch(Storage::disk('local')->path('font-previews/old.woff2'), now()->subDays(8)->getTimestamp());
        Storage::disk('local')->put('font-previews/new.woff2', 'x');

        $this->artisan('technoware:prune-font-previews')->assertSuccessful();

        Storage::disk('local')->assertMissing('font-previews/old.woff2');
        Storage::disk('local')->assertExists('font-previews/new.woff2');
    }
}
