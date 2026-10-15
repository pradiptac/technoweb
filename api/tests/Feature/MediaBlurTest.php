<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use App\Support\Media\Placeholder;
use App\Support\MediaMeta;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The blurred preview a picture loads over (0.123.0, docs/media.md).
 *
 * Made when a library row is created and again whenever its bytes change,
 * small enough to ride in every response, published beside the focal point
 * as `*_blur`, and absent — never an empty string — where there is none.
 */
class MediaBlurTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        MediaMeta::forget();
    }

    private function editor(): User
    {
        $user = User::create([
            'name' => 'Editor', 'email' => 'blur-'.uniqid().'@example.test',
            'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()],
        ));

        return $user;
    }

    /** A real JPEG: left half red, right half blue, so a flip is visible in twelve pixels. */
    private function photo(int $w = 400, int $h = 300): UploadedFile
    {
        $image = imagecreatetruecolor($w, $h);
        imagefilledrectangle($image, 0, 0, intdiv($w, 2), $h, (int) imagecolorallocate($image, 220, 20, 20));
        imagefilledrectangle($image, intdiv($w, 2), 0, $w, $h, (int) imagecolorallocate($image, 20, 20, 220));
        $path = tempnam(sys_get_temp_dir(), 'blur').'.jpg';
        imagejpeg($image, $path, 90);

        return new UploadedFile($path, 'photo.jpg', 'image/jpeg', null, true);
    }

    private function upload(User $user, UploadedFile $file): Media
    {
        $id = $this->actingAs($user, 'sanctum')
            ->post('/api/v1/admin/media', ['file' => $file], ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');

        return Media::findOrFail($id);
    }

    /** The preview decoded: [width, height, red of the left-most pixel, red of the right-most]. */
    private function decode(string $blur): array
    {
        $this->assertStringStartsWith('data:image/webp;base64,', $blur);
        $image = imagecreatefromstring((string) base64_decode(substr($blur, strlen('data:image/webp;base64,'))));
        $w = imagesx($image);
        $h = imagesy($image);

        return [$w, $h, (imagecolorat($image, 0, intdiv($h, 2)) >> 16) & 0xFF, (imagecolorat($image, $w - 1, intdiv($h, 2)) >> 16) & 0xFF];
    }

    public function test_an_upload_gets_a_small_preview_in_its_own_proportions(): void
    {
        $medium = $this->upload($this->editor(), $this->photo());

        [$w, $h, $left, $right] = $this->decode((string) $medium->blur);

        $this->assertSame([12, 9], [$w, $h]);
        $this->assertGreaterThan(150, $left);
        $this->assertLessThan(90, $right);
        // The whole point of twelve pixels: it rides in every response.
        $this->assertLessThan(600, strlen((string) $medium->blur));
    }

    public function test_an_edit_in_place_re_makes_it(): void
    {
        $user = $this->editor();
        $medium = $this->upload($user, $this->photo());

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/admin/media/{$medium->id}/transform", ['operation' => 'flip', 'axis' => 'horizontal'])
            ->assertOk();

        [, , $left, $right] = $this->decode((string) $medium->fresh()->blur);

        $this->assertLessThan(90, $left);
        $this->assertGreaterThan(150, $right);
    }

    public function test_a_vector_and_a_document_have_none(): void
    {
        $svg = UploadedFile::fake()->createWithContent('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
        $medium = $this->upload($this->editor(), $svg);

        $this->assertSame('', $medium->blur);
        $this->assertNull(MediaMeta::blur($medium->path));
        $this->assertNull(Placeholder::make(__FILE__));
    }

    public function test_a_public_resource_publishes_it_beside_the_focal_point(): void
    {
        $medium = $this->upload($this->editor(), $this->photo());
        MediaMeta::forget();

        BlogPost::create([
            'title' => 'A post with a cover', 'slug' => 'a-post-with-a-cover', 'body' => '<p>Body.</p>',
            'status' => 'published', 'published_at' => now()->subDay(), 'cover_image_path' => $medium->path,
        ]);
        BlogPost::create([
            'title' => 'A post without', 'slug' => 'a-post-without', 'body' => '<p>Body.</p>',
            'status' => 'published', 'published_at' => now()->subDays(2), 'cover_image_path' => 'media/typed-by-hand.jpg',
        ]);

        $this->assertSame($medium->blur, $this->getJson('/api/v1/blog/a-post-with-a-cover')->assertOk()->json('data.cover_image_blur'));
        // No library row: the key is there and null, never an empty string.
        $this->assertNull($this->getJson('/api/v1/blog/a-post-without')->assertOk()->json('data.cover_image_blur'));
    }

    public function test_the_backfill_makes_what_is_missing_and_never_retries_what_it_cannot(): void
    {
        $user = $this->editor();
        $photo = $this->upload($user, $this->photo());
        $svg = $this->upload($user, UploadedFile::fake()->createWithContent('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>'));
        Media::query()->toBase()->update(['blur' => null]);

        $this->artisan('technoware:backfill-media-blur')->assertSuccessful();

        $this->assertStringStartsWith('data:image/webp', (string) $photo->fresh()->blur);
        $this->assertSame('', $svg->fresh()->blur);
        $this->assertSame(0, Media::whereNull('blur')->count());
    }

    /**
     * Every place a focal point is published publishes the preview too.
     * Read from the source, like `AdminNavRolesTest`: a resource that gains
     * a picture and only the first of the two keys would otherwise be found
     * by somebody noticing one tile that pops in.
     */
    public function test_every_resource_publishing_a_focal_point_publishes_the_preview(): void
    {
        $files = array_merge(
            glob(app_path('Http/Resources/*.php')) ?: [],
            glob(app_path('Http/Resources/Store/*.php')) ?: [],
            [app_path('Support/Blocks/BlockPresenter.php'), app_path('Support/CustomFields/CustomFields.php')],
        );

        foreach ($files as $file) {
            $source = (string) file_get_contents($file);
            $this->assertSame(
                preg_match_all('/MediaMeta::focus(es)?\(/', $source),
                preg_match_all('/MediaMeta::blurs?\(/', $source),
                basename($file).' publishes a focal point without the blurred preview beside it.',
            );
        }
    }
}
