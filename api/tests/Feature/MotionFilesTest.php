<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use App\Support\Media\MotionFiles;
use App\Support\UploadLimits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

/**
 * Lottie animations and 3D models in the media library (0.172.0).
 *
 * The three formats are read by `MotionFiles` instead of `mimes:`, and the
 * rule is that nothing in them may make a visitor's browser reach for another
 * host or for a decoder.
 */
class MotionFilesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function staff(): User
    {
        $user = User::create([
            'name' => 'Mia', 'email' => 'motion-'.uniqid().'@example.test',
            'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()],
        ));

        return $user;
    }

    /** @param  array<string, mixed>  $over */
    public static function lottieJson(array $over = []): string
    {
        return json_encode($over + [
            'v' => '5.7.0', 'fr' => 30, 'ip' => 0, 'op' => 60, 'w' => 400, 'h' => 300,
            'layers' => [], 'assets' => [],
        ]);
    }

    public static function glb(array $json = []): string
    {
        $chunk = json_encode($json + ['asset' => ['version' => '2.0']]);
        $chunk .= str_repeat(' ', (4 - strlen($chunk) % 4) % 4);

        return 'glTF'.pack('V', 2).pack('V', 20 + strlen($chunk)).pack('V', strlen($chunk)).'JSON'.$chunk;
    }

    /** @param  array<string, string>  $entries */
    private function zip(array $entries): string
    {
        $path = tempnam(sys_get_temp_dir(), 'lot');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);

        foreach ($entries as $name => $body) {
            $zip->addFromString($name, $body);
        }

        $zip->close();
        $bytes = (string) file_get_contents($path);
        @unlink($path);

        return $bytes;
    }

    private function upload(string $name, string $bytes)
    {
        return $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/media', [
            'file' => UploadedFile::fake()->createWithContent($name, $bytes),
        ]);
    }

    public function test_a_lottie_json_is_stored_with_its_size(): void
    {
        $response = $this->upload('spark.json', self::lottieJson())->assertCreated();

        $response->assertJsonPath('data.mime', 'application/lottie+json')
            ->assertJsonPath('data.width', 400)
            ->assertJsonPath('data.height', 300);

        $media = Media::firstOrFail();
        $this->assertStringEndsWith('.json', $media->path);
        Storage::disk('public')->assertExists($media->path);
    }

    public function test_a_json_that_is_not_lottie_is_refused(): void
    {
        $this->upload('data.json', '{"hello":"world"}')
            ->assertStatus(422)->assertJsonValidationErrors('file');
        $this->upload('broken.json', '{nope')
            ->assertStatus(422)->assertJsonValidationErrors('file');
        $this->assertSame(0, Media::count());
    }

    public function test_an_animation_that_loads_pictures_from_another_site_is_refused(): void
    {
        $bad = self::lottieJson(['assets' => [['id' => 'i', 'u' => '', 'p' => 'https://cdn.example.test/a.png', 'e' => 0]]]);

        $this->upload('remote.json', $bad)
            ->assertStatus(422)
            ->assertJsonPath('errors.file.0', 'This animation loads pictures from another site. Export it with its images embedded.');
    }

    public function test_embedded_pictures_pass(): void
    {
        $ok = self::lottieJson(['assets' => [
            ['id' => 'a', 'p' => 'data:image/png;base64,AAAA', 'e' => 1],
            ['id' => 'b', 'u' => '', 'p' => 'data:image/png;base64,AAAA', 'e' => 0],
            ['id' => 'pre', 'layers' => []],
        ]]);

        $this->upload('embedded.json', $ok)->assertCreated();
    }

    public function test_a_packed_lottie_is_stored_and_its_images_may_live_in_the_zip(): void
    {
        $anim = self::lottieJson(['w' => 640, 'h' => 480, 'assets' => [['id' => 'i', 'u' => 'images/', 'p' => 'pic.png', 'e' => 0]]]);
        $bytes = $this->zip([
            'manifest.json' => json_encode(['version' => '1', 'animations' => [['id' => 'main']]]),
            'animations/main.json' => $anim,
            'images/pic.png' => 'x',
        ]);

        $this->upload('pack.lottie', $bytes)->assertCreated()
            ->assertJsonPath('data.mime', 'application/lottie+zip')
            ->assertJsonPath('data.width', 640);
    }

    public function test_a_packed_lottie_naming_a_missing_image_or_animation_is_refused(): void
    {
        $anim = self::lottieJson(['assets' => [['id' => 'i', 'u' => 'images/', 'p' => 'gone.png', 'e' => 0]]]);
        $this->upload('a.lottie', $this->zip([
            'manifest.json' => json_encode(['animations' => [['id' => 'main']]]),
            'animations/main.json' => $anim,
        ]))->assertStatus(422)->assertJsonValidationErrors('file');

        $this->upload('b.lottie', $this->zip(['manifest.json' => json_encode(['animations' => []])]))
            ->assertStatus(422)->assertJsonValidationErrors('file');

        $this->upload('c.lottie', 'not a zip')->assertStatus(422)->assertJsonValidationErrors('file');
    }

    public function test_a_glb_is_stored(): void
    {
        $this->upload('chair.glb', self::glb(['meshes' => []]))->assertCreated()
            ->assertJsonPath('data.mime', 'model/gltf-binary')
            ->assertJsonPath('data.width', null);
    }

    public function test_a_glb_with_embedded_data_uris_passes_and_external_ones_do_not(): void
    {
        $this->upload('ok.glb', self::glb(['buffers' => [['byteLength' => 1, 'uri' => 'data:application/octet-stream;base64,AA==']]]))
            ->assertCreated();

        $this->upload('ext.glb', self::glb(['buffers' => [['byteLength' => 1, 'uri' => 'https://cdn.example.test/m.bin']]]))
            ->assertStatus(422)
            ->assertJsonPath('errors.file.0', 'This model loads files from another site. Export it as a single self-contained .glb.');

        $this->upload('img.glb', self::glb(['images' => [['uri' => 'texture.png']]]))
            ->assertStatus(422)->assertJsonValidationErrors('file');
    }

    public function test_a_compressed_glb_is_refused(): void
    {
        foreach (['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'] as $ext) {
            $this->upload('c.glb', self::glb(['extensionsUsed' => [$ext]]))
                ->assertStatus(422)
                ->assertJsonPath('errors.file.0', fn ($m) => str_contains($m, 'no Draco'));
        }
    }

    public function test_a_file_that_is_not_a_glb_is_refused(): void
    {
        $this->upload('a.glb', 'hello')->assertStatus(422);
        // Version 1 and a declared length longer than the file.
        $this->upload('b.glb', 'glTF'.pack('V', 1).pack('V', 99).pack('V', 2).'JSON{}')->assertStatus(422);
        $this->upload('c.glb', 'glTF'.pack('V', 2).pack('V', 9999).pack('V', 2).'JSON{}')->assertStatus(422);
    }

    public function test_the_size_caps_are_the_documented_ones(): void
    {
        $this->assertSame(5120, MotionFiles::MAX_LOTTIE_KB);
        $this->assertSame(25600, MotionFiles::MAX_MODEL_KB);
        $this->assertLessThanOrEqual(UploadLimits::phpCeilingKb(), MotionFiles::maxKb('glb'));
    }

    public function test_the_listing_filters_and_reports_the_new_types(): void
    {
        $this->upload('s.json', self::lottieJson())->assertCreated();
        $this->upload('m.glb', self::glb())->assertCreated();
        Media::create(['disk' => 'public', 'path' => 'media/x.png', 'filename' => 'x.png', 'mime' => 'image/png', 'size' => 1]);

        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/media?kind=lottie')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.mime', 'application/lottie+json');
        $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/media?kind=model')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.mime', 'model/gltf-binary');
        $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/media?kind=file')
            ->assertOk()->assertJsonCount(2, 'data');

        $library = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/media')->json('meta.library');
        $this->assertEqualsCanonicalizing(['json', 'lottie', 'glb'], array_values(array_intersect(['json', 'lottie', 'glb'], $library['extensions'])));
        $this->assertSame(MotionFiles::maxKb('json'), $library['max_lottie_kb']);
        $this->assertSame(MotionFiles::maxKb('glb'), $library['max_model_kb']);
    }

    public function test_a_replacement_is_checked_the_same_way(): void
    {
        $id = $this->upload('s.json', self::lottieJson())->json('data.id');
        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')->post("/api/v1/admin/media/{$id}/replace", [
            'file' => UploadedFile::fake()->createWithContent('s.json', '{"hello":"world"}'),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('file');

        $this->actingAs($staff, 'sanctum')->post("/api/v1/admin/media/{$id}/replace", [
            'file' => UploadedFile::fake()->createWithContent('s.json', self::lottieJson(['w' => 10, 'h' => 20])),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.width', 10)->assertJsonPath('data.mime', 'application/lottie+json');
    }
}
