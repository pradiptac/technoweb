<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Media;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\MediaMeta;
use App\Support\MediaUrl;
use App\Support\Net\PublicHost;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The media CDN and the versioned URL of an edited file (0.124.0,
 * docs/cdn.md).
 *
 * Off by default and, off, every URL is what it always was. On, the files a
 * browser fetches itself are addressed at the CDN and the photographs the
 * image optimiser fetches are not. And whatever the switch says, a file
 * edited in place gets a new address — its old one is cached for a year.
 */
class MediaCdnTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Storage::fake('public');
        MediaMeta::forget();
    }

    private function admin(): User
    {
        $user = User::create([
            'name' => 'Admin', 'email' => 'cdn-'.uniqid().'@example.test',
            'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true,
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

    private function photo(): UploadedFile
    {
        $image = imagecreatetruecolor(300, 200);
        imagefilledrectangle($image, 0, 0, 150, 200, (int) imagecolorallocate($image, 200, 30, 30));
        $path = tempnam(sys_get_temp_dir(), 'cdn').'.jpg';
        imagejpeg($image, $path, 90);

        return new UploadedFile($path, 'photo.jpg', 'image/jpeg', null, true);
    }

    public function test_off_by_default_and_every_url_is_what_it_was(): void
    {
        $this->assertNull(MediaUrl::cdn());
        $this->assertSame(asset('storage/media/a/logo.svg'), MediaUrl::for('media/a/logo.svg'));
        $this->assertSame(asset('storage/media/a/photo.jpg'), MediaUrl::for('media/a/photo.jpg'));
        $this->assertNull($this->getJson('/api/v1/redirects')->json('meta.media_cdn'));
        // Private: the address is never on the public settings map.
        $this->assertArrayNotHasKey('media_cdn_url', $this->getJson('/api/v1/settings')->json('data'));
    }

    public function test_switched_on_it_serves_what_a_browser_fetches_and_not_what_the_optimiser_does(): void
    {
        $this->save(['media_cdn_url' => 'https://CDN.example.com/', 'media_cdn_enabled' => '1'])->assertOk();

        $this->assertSame('https://cdn.example.com', MediaUrl::cdn());
        $this->assertSame('https://cdn.example.com/storage/media/a/logo.svg', MediaUrl::for('media/a/logo.svg'));
        $this->assertSame('https://cdn.example.com/storage/media/a/loop.mp4', MediaUrl::for('media/a/loop.mp4'));
        $this->assertSame('https://cdn.example.com/storage/media/a/sheet.PDF', MediaUrl::for('media/a/sheet.PDF'));
        // A photograph is fetched by the website's optimiser, server to server.
        $this->assertSame(asset('storage/media/a/photo.jpg'), MediaUrl::for('media/a/photo.jpg'));
        $this->assertSame(asset('storage/media/a/photo.WEBP'), MediaUrl::for('media/a/photo.WEBP'));

        $this->assertSame('https://cdn.example.com', $this->getJson('/api/v1/redirects')->json('meta.media_cdn'));
    }

    public function test_an_address_saved_but_switched_off_changes_nothing(): void
    {
        $this->save(['media_cdn_url' => 'https://cdn.example.com', 'media_cdn_enabled' => '0'])->assertOk();

        $this->assertNull(MediaUrl::cdn());
        $this->assertSame(asset('storage/media/a/logo.svg'), MediaUrl::for('media/a/logo.svg'));
    }

    public function test_the_address_must_be_an_https_origin_on_a_public_host(): void
    {
        foreach (['http://cdn.example.com', 'https://cdn.example.com/files', 'https://user:pw@cdn.example.com', 'cdn.example.com', 'https://127.0.0.1', 'https://localhost', 'javascript:alert(1)'] as $bad) {
            $this->save(['media_cdn_url' => $bad])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        }

        // This server's own address is not a CDN.
        config(['app.url' => 'https://api.example.com']);
        $this->save(['media_cdn_url' => 'https://api.example.com'])->assertStatus(422);
    }

    public function test_a_file_edited_in_place_gets_a_new_address_and_an_untouched_one_does_not(): void
    {
        $user = $this->admin();
        $id = $this->actingAs($user, 'sanctum')
            ->post('/api/v1/admin/media', ['file' => $this->photo()], ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');
        $medium = Media::findOrFail($id);

        BlogPost::create([
            'title' => 'Edited cover', 'slug' => 'edited-cover', 'body' => '<p>Body.</p>',
            'status' => 'published', 'published_at' => now()->subDay(), 'cover_image_path' => $medium->path,
        ]);

        MediaMeta::forget();
        $before = $this->getJson('/api/v1/blog/edited-cover')->json('data.cover_image');
        $this->assertSame(asset('storage/'.$medium->path), $before);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/admin/media/{$medium->id}/transform", ['operation' => 'flip', 'axis' => 'horizontal'])
            ->assertOk();

        $this->assertSame(1, $medium->fresh()->revision);
        $this->assertSame($before.'?v=1', $this->getJson('/api/v1/blog/edited-cover')->json('data.cover_image'));

        // A second edit moves it again: the first versioned address is cached too.
        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/admin/media/{$medium->id}/transform", ['operation' => 'rotate', 'degrees' => 90])
            ->assertOk();
        $this->assertSame($before.'?v=2', $this->getJson('/api/v1/blog/edited-cover')->json('data.cover_image'));
    }

    public function test_the_test_fetches_a_library_file_through_the_cdn_and_compares_it(): void
    {
        $user = $this->admin();
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
        $id = $this->actingAs($user, 'sanctum')
            ->post('/api/v1/admin/media', ['file' => UploadedFile::fake()->createWithContent('logo.svg', $svg)], ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');
        $medium = Media::findOrFail($id);
        $bytes = (string) Storage::disk('public')->get($medium->path);

        // Nothing saved yet: a sentence, not a request.
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/admin/settings/media-cdn/test')
            ->assertStatus(422)->assertJsonValidationErrors('cdn');

        // Works with the switch off — testing comes before switching on.
        Setting::query()->where('key', 'media_cdn_url')->update(['value' => 'https://cdn.example.com']);
        Setting::flushCache();
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['93.184.216.34']);

        // The file itself, then a page that is not the file: a pull zone
        // pointed at the wrong origin answers 200 too.
        Http::fake(['cdn.example.com/*' => Http::sequence()->push($bytes, 200)->push('<html>parked domain</html>', 200)]);
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/admin/settings/media-cdn/test')
            ->assertOk()->assertJsonPath('data.url', 'https://cdn.example.com/storage/'.$medium->path);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/admin/settings/media-cdn/test')
            ->assertStatus(422)->assertJsonValidationErrors('cdn');
    }
}
