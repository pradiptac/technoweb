<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\MediaFolder;
use App\Models\Role;
use App\Models\User;
use App\Support\Net\PublicHost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * A pasted link is copied into the library once (0.172.0), so a visitor's
 * browser never fetches from the site it came from. Every refusal is a 422 on
 * `url`, and the temporary file never outlives the request.
 */
class MediaImportUrlTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => $host === 'intranet.test' ? ['10.0.0.5'] : ['93.184.216.34']);
    }

    private function import(string $url, array $extra = [])
    {
        $user = User::create([
            'name' => 'Mia', 'email' => 'import-'.uniqid().'@example.test',
            'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()],
        ));

        return $this->actingAs($user, 'sanctum')->postJson('/api/v1/admin/media/import-url', ['url' => $url] + $extra);
    }

    /** @return list<string> */
    private function tempFiles(): array
    {
        return glob(sys_get_temp_dir().DIRECTORY_SEPARATOR.'imp*') ?: [];
    }

    public function test_a_public_animation_is_copied_into_the_library(): void
    {
        Http::fake(['*' => Http::response(MotionFilesTest::lottieJson(['w' => 200, 'h' => 100]), 200)]);
        $before = $this->tempFiles();

        $this->import('https://lottie.example.test/files/spark%20one.json?token=abc')
            ->assertCreated()
            ->assertJsonPath('data.mime', 'application/lottie+json')
            ->assertJsonPath('data.filename', 'spark one.json')
            ->assertJsonPath('data.width', 200);

        $media = Media::firstOrFail();
        Storage::disk('public')->assertExists($media->path);
        $this->assertSame($before, $this->tempFiles());
    }

    public function test_a_model_is_copied_and_goes_into_the_folder_asked_for(): void
    {
        Http::fake(['*' => Http::response(MotionFilesTest::glb(), 200)]);
        $folder = MediaFolder::create(['name' => 'Models']);

        $this->import('https://models.example.test/chair.glb', ['folder_id' => $folder->id])
            ->assertCreated()->assertJsonPath('data.folder_id', $folder->id);
    }

    public function test_a_private_host_is_refused_and_nothing_is_requested(): void
    {
        Http::fake();

        $this->import('https://intranet.test/a.json')
            ->assertStatus(422)->assertJsonValidationErrors('url');
        $this->import('http://127.0.0.1/a.json')->assertStatus(422)->assertJsonValidationErrors('url');
        $this->import('http://2130706433/a.json')->assertStatus(422)->assertJsonValidationErrors('url');

        Http::assertNothingSent();
    }

    public function test_a_redirect_to_a_private_host_is_refused(): void
    {
        Http::fake(['*' => Http::response('', 302, ['Location' => 'https://intranet.test/a.json'])]);
        $before = $this->tempFiles();

        $this->import('https://lottie.example.test/a.json')
            ->assertStatus(422)->assertJsonValidationErrors('url');

        $this->assertSame($before, $this->tempFiles());
    }

    public function test_a_type_the_library_does_not_take_is_refused(): void
    {
        Http::fake();

        $this->import('https://lottie.example.test/payload.exe')->assertStatus(422)->assertJsonValidationErrors('url');
        $this->import('https://lottie.example.test/no-extension')->assertStatus(422)->assertJsonValidationErrors('url');
        $this->import('ftp://lottie.example.test/a.json')->assertStatus(422)->assertJsonValidationErrors('url');

        Http::assertNothingSent();
    }

    public function test_a_file_that_fails_the_content_check_is_refused_with_its_sentence(): void
    {
        Http::fake(['*' => Http::response(MotionFilesTest::lottieJson(['assets' => [['id' => 'i', 'p' => 'https://x.test/a.png', 'e' => 0]]]), 200)]);
        $before = $this->tempFiles();

        $this->import('https://lottie.example.test/remote.json')
            ->assertStatus(422)
            ->assertJsonPath('errors.url.0', 'This animation loads pictures from another site. Export it with its images embedded.');

        $this->assertSame(0, Media::count());
        $this->assertSame($before, $this->tempFiles());
    }

    public function test_a_failed_download_is_a_refusal(): void
    {
        Http::fake(['*' => Http::response('nope', 404)]);

        $this->import('https://lottie.example.test/gone.json')->assertStatus(422)->assertJsonValidationErrors('url');
    }

    public function test_it_needs_a_content_manager(): void
    {
        $this->postJson('/api/v1/admin/media/import-url', ['url' => 'https://a.example.test/a.json'])->assertUnauthorized();
    }
}
