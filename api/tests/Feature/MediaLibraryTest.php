<?php

namespace Tests\Feature;

use App\Enums\ImageQuality;
use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\MediaFolder;
use App\Models\MediaVersion;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\ImageEditor;
use App\Support\MediaHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The media library's metadata and ordering.
 *
 * Both are the kind of thing that looks right in a browser on the day and
 * drifts silently afterwards: an ordering with no tiebreak only misbehaves on
 * a page boundary, and tag normalisation only matters once two people have
 * filed things on different days.
 */
class MediaLibraryTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Idempotent, because more than one test calls it twice.
     *
     * `User::create` with a fixed address throws on the second call, which
     * surfaces as a unique-constraint error in whichever test happened to loop
     * — a failure about the fixture rather than about the thing under test.
     */
    private function staff(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'mia@example.test'],
            ['name' => 'Mia Manager', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count()) {
            return $user;
        }

        $role = Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        );
        $user->roles()->attach($role);

        return $user;
    }

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'ada-media@example.test'],
            ['name' => 'Ada Admin', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count()) {
            return $user;
        }

        $role = Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value],
            ['name' => RoleEnum::Admin->label()],
        );
        $user->roles()->attach($role);

        return $user;
    }

    private function file(array $attributes = []): Media
    {
        return Media::create(array_merge([
            'disk' => 'public',
            'path' => 'media/2026/08/'.uniqid().'.jpg',
            'filename' => 'example.jpg',
            'mime' => 'image/jpeg',
            'size' => 1024,
        ], $attributes));
    }

    /* ------------------------------------------------------------- metadata */

    /**
     * Tags are typed into one field by hand, so they arrive however somebody
     * typed them. "Hero", "hero " and "hero" are one label that would
     * otherwise filter as three and read as a mistake.
     *
     * The **order is kept**, which is the half that is easy to lose to a
     * `sort()` added for tidiness: an editor putting the most important label
     * first meant it. This is also why the column is a JSON *array* — MySQL
     * reorders JSON object keys, which is the bug `App\Casts\SpecSheet` exists
     * for, but arrays are order-preserving.
     */
    public function test_it_normalises_tags_without_reordering_them(): void
    {
        $media = $this->file();

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/media/{$media->id}", [
                'tags' => ['  Zebra ', 'hero', 'HERO', '', 'Networking', 'hero  '],
            ])
            ->assertSuccessful()
            ->assertJsonPath('data.tags', ['zebra', 'hero', 'networking']);
    }

    /**
     * A description is not a second alt text.
     *
     * Alt text is announced in place of the image on every public page; a
     * description is a working note for whoever files assets. Writing one must
     * never touch the other, because the failure is silent and lands on the
     * people least able to report it.
     */
    public function test_a_description_does_not_disturb_the_alt_text(): void
    {
        $media = $this->file(['alt_text' => 'A 24-port switch, front view']);

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/media/{$media->id}", [
                'description' => 'Shot on site in March. Client approved for web.',
            ])
            ->assertSuccessful()
            ->assertJsonPath('data.alt_text', 'A 24-port switch, front view')
            ->assertJsonPath('data.description', 'Shot on site in March. Client approved for web.');
    }

    /** An untagged file answers with an array, never null. */
    public function test_tags_are_always_an_array(): void
    {
        $media = $this->file();

        $this->actingAs($this->staff(), 'sanctum')
            ->getJson('/api/v1/admin/media')
            ->assertSuccessful()
            ->assertJsonPath('data.0.tags', []);

        $this->assertNull($media->fresh()->tags);
    }

    /**
     * The search box is the only way back to a description or a tag once it is
     * written, so a field the search cannot see is a field nobody can use.
     */
    public function test_search_covers_the_description_and_the_tags(): void
    {
        $this->file(['filename' => 'a.jpg', 'description' => 'Taken at the Salt Lake install']);
        $this->file(['filename' => 'b.jpg', 'tags' => ['brochure-2026']]);
        $this->file(['filename' => 'c.jpg']);

        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->getJson('/api/v1/admin/media?q=Salt+Lake')
            ->assertSuccessful()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.filename', 'a.jpg');

        $this->actingAs($staff, 'sanctum')
            ->getJson('/api/v1/admin/media?q=brochure-2026')
            ->assertSuccessful()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.filename', 'b.jpg');
    }

    /* ------------------------------------------------------------- ordering */

    public function test_it_sorts_by_name_and_by_size_in_both_directions(): void
    {
        $this->file(['filename' => 'beta.jpg', 'size' => 300]);
        $this->file(['filename' => 'alpha.jpg', 'size' => 100]);
        $this->file(['filename' => 'gamma.jpg', 'size' => 200]);

        $staff = $this->staff();

        $names = fn (string $qs) => collect(
            $this->actingAs($staff, 'sanctum')->getJson("/api/v1/admin/media?{$qs}")->json('data')
        )->pluck('filename')->all();

        $this->assertSame(['alpha.jpg', 'beta.jpg', 'gamma.jpg'], $names('sort=filename&direction=asc'));
        $this->assertSame(['gamma.jpg', 'beta.jpg', 'alpha.jpg'], $names('sort=filename&direction=desc'));
        $this->assertSame(['beta.jpg', 'gamma.jpg', 'alpha.jpg'], $names('sort=size&direction=desc'));
        $this->assertSame(['alpha.jpg', 'gamma.jpg', 'beta.jpg'], $names('sort=size&direction=asc'));
    }

    /**
     * A name sorts A-Z by default and a date sorts newest-first, because the
     * useful direction is a property of the column rather than a constant.
     */
    public function test_the_default_direction_depends_on_the_column(): void
    {
        $this->file(['filename' => 'beta.jpg']);
        $this->file(['filename' => 'alpha.jpg']);

        $staff = $this->staff();

        $this->assertSame(
            ['alpha.jpg', 'beta.jpg'],
            collect($this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/media?sort=filename')->json('data'))
                ->pluck('filename')->all(),
        );

        // Newest first, which for two rows created in order is the second one.
        $this->assertSame(
            ['alpha.jpg', 'beta.jpg'],
            collect($this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/media?sort=created_at')->json('data'))
                ->pluck('filename')->all(),
        );
    }

    /**
     * An unrecognised ordering falls back rather than returning 422 — the same
     * rule the catalogue's `?sort=` follows. It arrives from a stale bookmark,
     * and an error page is a worse answer than the library's own order.
     */
    public function test_an_unknown_sort_falls_back_instead_of_failing(): void
    {
        $this->file(['filename' => 'only.jpg']);

        $this->actingAs($this->staff(), 'sanctum')
            ->getJson('/api/v1/admin/media?sort=nonsense&direction=sideways')
            ->assertSuccessful()
            ->assertJsonPath('data.0.filename', 'only.jpg');
    }

    /**
     * Every ordering ends on `id`, and without that a page boundary is a
     * lottery.
     *
     * Thirty files uploaded by one seeder share a `created_at` to the second,
     * and MySQL may order equal rows differently between two queries — so one
     * file appears on both pages and another appears on neither. Paging
     * through the whole library must yield every row exactly once.
     */
    public function test_paging_a_tie_never_repeats_or_drops_a_row(): void
    {
        $at = now()->subDay();
        foreach (range(1, 9) as $n) {
            $this->file(['filename' => "tied-{$n}.jpg", 'size' => 500])
                ->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
        }

        $staff = $this->staff();
        $seen = [];

        foreach ([1, 2, 3] as $page) {
            $seen = array_merge($seen, collect(
                $this->actingAs($staff, 'sanctum')
                    ->getJson("/api/v1/admin/media?sort=created_at&per_page=3&page={$page}")
                    ->json('data')
            )->pluck('id')->all());
        }

        $this->assertCount(9, $seen);
        $this->assertCount(9, array_unique($seen), 'a row was served on two pages, or missed entirely');
    }

    /* ---------------------------------------------------------------- bulk */

    /**
     * `media/move` must not be swallowed by `media/{medium:id}`.
     *
     * Laravel matches routes in declaration order, so a bulk route declared
     * after the parameterised one binds `{medium:id}` to the literal string
     * "move" and answers 404 from model binding — which reads as a missing
     * record rather than as the routing mistake it is.
     */
    public function test_the_bulk_routes_are_not_shadowed_by_the_id_route(): void
    {
        $a = $this->file(['filename' => 'a.jpg']);
        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->postJson('/api/v1/admin/media/move', ['ids' => [$a->id], 'folder_id' => null])
            ->assertSuccessful();

        $this->actingAs($staff, 'sanctum')
            ->postJson('/api/v1/admin/media/copy', ['ids' => [$a->id]])
            ->assertStatus(201);
    }

    public function test_moving_out_of_a_folder_is_expressible(): void
    {
        $folder = MediaFolder::create(['name' => 'Brochure']);
        $media = $this->file(['folder_id' => $folder->id]);

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/media/move', ['ids' => [$media->id], 'folder_id' => null])
            ->assertSuccessful();

        $this->assertNull($media->fresh()->folder_id);
    }

    /**
     * A copy is a real second file, not a second row pointing at one path.
     *
     * Two rows sharing a path is a delete that silently breaks the other and a
     * crop that silently edits it. The library has no reference counting and
     * should not grow any for this.
     */
    public function test_a_copy_duplicates_the_bytes_and_keeps_the_metadata(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('media/2026/08/original.jpg', 'the-bytes');

        $original = Media::create([
            'disk' => 'public',
            'path' => 'media/2026/08/original.jpg',
            'filename' => 'photo.jpg',
            'mime' => 'image/jpeg',
            'size' => 9,
            'alt_text' => 'A switch',
            'description' => 'Shot on site',
            'tags' => ['hero'],
        ]);

        $response = $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/media/copy', ['ids' => [$original->id]])
            ->assertStatus(201);

        $copy = Media::where('id', '!=', $original->id)->firstOrFail();

        $this->assertNotSame($original->path, $copy->path, 'the copy shares the original file');
        Storage::disk('public')->assertExists($copy->path);
        $this->assertSame('the-bytes', Storage::disk('public')->get($copy->path));

        $this->assertSame('A switch', $copy->alt_text);
        $this->assertSame('Shot on site', $copy->description);
        $this->assertSame(['hero'], $copy->tags);

        $this->assertSame('photo copy.jpg', $copy->filename);
        $response->assertJsonPath('data.0.filename', 'photo copy.jpg');
    }

    /** A second copy does not collide with the first. */
    public function test_repeated_copies_get_distinct_names(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('media/2026/08/o.jpg', 'x');

        $original = Media::create([
            'disk' => 'public', 'path' => 'media/2026/08/o.jpg',
            'filename' => 'photo.jpg', 'mime' => 'image/jpeg', 'size' => 1,
        ]);

        $staff = $this->staff();
        $this->actingAs($staff, 'sanctum')->postJson('/api/v1/admin/media/copy', ['ids' => [$original->id]]);
        $this->actingAs($staff, 'sanctum')->postJson('/api/v1/admin/media/copy', ['ids' => [$original->id]]);

        $this->assertSame(
            ['photo copy 2.jpg', 'photo copy.jpg', 'photo.jpg'],
            Media::orderBy('filename')->pluck('filename')->all(),
        );
    }

    /**
     * A bulk delete moves files to the bin and **keeps the bytes**.
     *
     * Deleting the files here while only soft-deleting the rows would make
     * every restore bring back a record pointing at nothing — worse than not
     * offering a bin at all. The bytes go when the file is purged.
     */
    public function test_a_bulk_delete_bins_the_rows_and_keeps_the_files(): void
    {
        Storage::fake('public');
        $ids = [];
        foreach (['a', 'b'] as $name) {
            Storage::disk('public')->put("media/{$name}.jpg", 'bytes');
            $ids[] = Media::create([
                'disk' => 'public', 'path' => "media/{$name}.jpg",
                'filename' => "{$name}.jpg", 'mime' => 'image/jpeg', 'size' => 5,
            ])->id;
        }

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/media/delete', ['ids' => $ids])
            ->assertSuccessful()
            ->assertJsonPath('data.deleted', 2);

        // Gone from the library...
        $this->assertSame(0, Media::count());
        // ...and still on disk, which is what makes a restore possible.
        Storage::disk('public')->assertExists('media/a.jpg');
        Storage::disk('public')->assertExists('media/b.jpg');
        $this->assertSame(2, Media::onlyTrashed()->count());
    }

    /** One missing file must not fail the whole batch. */
    public function test_a_copy_skips_a_row_whose_file_has_gone(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('media/present.jpg', 'x');

        $present = Media::create([
            'disk' => 'public', 'path' => 'media/present.jpg',
            'filename' => 'present.jpg', 'mime' => 'image/jpeg', 'size' => 1,
        ]);
        $missing = Media::create([
            'disk' => 'public', 'path' => 'media/gone.jpg',
            'filename' => 'gone.jpg', 'mime' => 'image/jpeg', 'size' => 1,
        ]);

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/media/copy', ['ids' => [$present->id, $missing->id]])
            ->assertStatus(201)
            ->assertJsonCount(1, 'data');
    }

    /* ----------------------------------------------------------- transforms */

    /**
     * Writes a real 4x2 PNG: left half black, right half white.
     *
     * Asymmetric in both axes on purpose. A symmetric test image passes a flip
     * that does nothing, and passes one that flips the wrong way — which is
     * exactly the bug worth catching, since `imagerotate` measures
     * anticlockwise and the API takes clockwise degrees.
     */
    private function realImage(string $path = 'media/edit.png'): Media
    {
        $gd = imagecreatetruecolor(4, 2);
        $black = imagecolorallocate($gd, 0, 0, 0);
        $white = imagecolorallocate($gd, 255, 255, 255);
        imagefilledrectangle($gd, 0, 0, 1, 1, $black);
        imagefilledrectangle($gd, 2, 0, 3, 1, $white);
        // A single grey pixel top-left, so a vertical flip is detectable too.
        imagesetpixel($gd, 0, 0, imagecolorallocate($gd, 128, 128, 128));

        $absolute = Storage::disk('public')->path($path);
        @mkdir(dirname($absolute), 0777, true);
        imagepng($gd, $absolute);
        imagedestroy($gd);

        return Media::create([
            'disk' => 'public', 'path' => $path, 'filename' => 'edit.png',
            'mime' => 'image/png', 'size' => filesize($absolute), 'width' => 4, 'height' => 2,
        ]);
    }

    private function pixel(Media $m, int $x, int $y): array
    {
        $gd = imagecreatefrompng(Storage::disk('public')->path($m->path));
        $rgb = imagecolorat($gd, $x, $y);
        imagedestroy($gd);

        return [($rgb >> 16) & 0xFF, ($rgb >> 8) & 0xFF, $rgb & 0xFF];
    }

    /**
     * A quarter turn clockwise, and the dimensions swap with it.
     *
     * `imagerotate` rotates **anticlockwise**, so the API's clockwise degrees
     * are subtracted from 360. Getting that backwards is invisible at 180 and
     * exactly wrong at the two angles anybody uses — which is why this asserts
     * where a known pixel *lands* rather than only that the size changed.
     */
    public function test_a_quarter_turn_is_clockwise_and_swaps_the_dimensions(): void
    {
        Storage::fake('public');
        $media = $this->realImage();

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                'operation' => 'rotate', 'degrees' => 90,
            ])
            ->assertSuccessful()
            ->assertJsonPath('data.width', 2)
            ->assertJsonPath('data.height', 4);

        /*
         * Clockwise sends the left column to the top row, reversed: original
         * (0,1) lands at (0,0) and original (0,0) — the grey marker — lands at
         * (1,0). The right column, which was white, becomes the bottom row.
         *
         * Asserting the marker's destination is the point: a 90-degree turn
         * the wrong way produces the same 2x4 box, so dimensions alone cannot
         * tell the two apart.
         */
        $this->assertSame([0, 0, 0], $this->pixel($media->fresh(), 0, 0), 'the left column did not become the top row');
        $this->assertSame([128, 128, 128], $this->pixel($media->fresh(), 1, 0), 'the turn went anticlockwise');
        $this->assertSame([255, 255, 255], $this->pixel($media->fresh(), 1, 3));
    }

    public function test_a_horizontal_flip_mirrors_the_image(): void
    {
        Storage::fake('public');
        $media = $this->realImage();

        // Left is black before.
        $this->assertSame([0, 0, 0], $this->pixel($media, 1, 1));

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                'operation' => 'flip', 'axis' => 'horizontal',
            ])
            ->assertSuccessful();

        // White after, and the dimensions are unchanged.
        $this->assertSame([255, 255, 255], $this->pixel($media->fresh(), 1, 1));
        $this->assertSame(4, $media->fresh()->width);
    }

    /**
     * GD's contrast filter is **inverted**: a positive value flattens.
     *
     * So passing a "more contrast" slider straight through produces less, and
     * it reads as a weak filter rather than a backwards one.
     *
     * **The pixel this measures is 180, not mid-grey.** Contrast scales around
     * the midpoint, so 128 is its fixed point — the one value that barely
     * moves however hard the filter is pushed, and therefore the one value
     * that cannot demonstrate the direction. Measured, after a first version
     * of this test asserted on 128 and reported a change of one.
     */
    public function test_more_contrast_pushes_a_light_grey_further_from_the_middle(): void
    {
        Storage::fake('public');
        $media = $this->realImage();

        // A light grey, well off the midpoint the filter pivots around.
        $absolute = Storage::disk('public')->path($media->path);
        $gd = imagecreatefrompng($absolute);
        imagesetpixel($gd, 0, 0, imagecolorallocate($gd, 180, 180, 180));
        imagepng($gd, $absolute);
        imagedestroy($gd);

        $this->assertSame([180, 180, 180], $this->pixel($media, 0, 0));

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                'operation' => 'adjust', 'contrast' => 90,
            ])
            ->assertSuccessful();

        [$r] = $this->pixel($media->fresh(), 0, 0);

        // Further from the midpoint, not nearer. With the sign the wrong way
        // round this flattens towards 128 instead.
        $this->assertGreaterThan(180, $r, "contrast moved 180 to {$r}, which is flattening rather than sharpening");
    }

    /** An SVG has no pixels, and the refusal says so rather than throwing. */
    public function test_an_svg_cannot_be_transformed(): void
    {
        Storage::fake('public');
        $svg = $this->file(['mime' => 'image/svg+xml', 'filename' => 'logo.svg']);

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$svg->id}/transform", [
                'operation' => 'rotate', 'degrees' => 90,
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Only JPG, PNG, GIF and WebP can be edited. An SVG has no pixels to change.');
    }

    /** Arbitrary angles are refused rather than silently rounded. */
    public function test_only_quarter_turns_are_accepted(): void
    {
        Storage::fake('public');
        $media = $this->realImage();

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                'operation' => 'rotate', 'degrees' => 45,
            ])
            ->assertStatus(422);
    }

    /* -------------------------------------------------------------- replace */

    /**
     * Replacing keeps the path, which is the whole point.
     *
     * Records store a path rather than a media id, so every page already using
     * this image keeps working and picks up the new picture. Uploading a
     * replacement as a new file and deleting the old one breaks all of them
     * silently.
     */
    public function test_replacing_keeps_the_path_so_nothing_breaks(): void
    {
        Storage::fake('public');
        $media = $this->realImage();
        $originalPath = $media->path;

        $replacement = UploadedFile::fake()->image('other.png', 10, 10);

        $this->actingAs($this->staff(), 'sanctum')
            ->post("/api/v1/admin/media/{$media->id}/replace", ['file' => $replacement])
            ->assertSuccessful()
            ->assertJsonPath('data.path', $originalPath)
            ->assertJsonPath('data.width', 10);

        $this->assertSame($originalPath, $media->fresh()->path);
    }

    /**
     * The extension cannot change, because it is part of the address every
     * record already points at.
     */
    public function test_a_replacement_must_keep_the_extension(): void
    {
        Storage::fake('public');
        $media = $this->realImage();

        $this->actingAs($this->staff(), 'sanctum')
            ->post("/api/v1/admin/media/{$media->id}/replace", [
                'file' => UploadedFile::fake()->image('other.jpg', 10, 10),
            ])
            ->assertStatus(422);
    }

    /* -------------------------------------------------------------- quality */

    /**
     * The quality preset reaches the encoder.
     *
     * Asserted as a size ordering rather than an exact byte count: GD's output
     * differs by build and version, and a fixed number would be a test about
     * this machine. Lower quality has to produce a smaller JPEG, which is the
     * only claim the setting actually makes.
     */
    public function test_the_image_quality_setting_changes_what_is_written(): void
    {
        Storage::fake('public');

        $sizes = [];

        foreach (['low', 'best'] as $preset) {
            Setting::updateOrCreate(
                ['key' => 'image_quality'],
                ['group' => 'media', 'value' => $preset, 'type' => 'string'],
            );
            // The preset is memoised per request; a test changes it inside one.
            ImageEditor::forgetQuality();

            // A photographic gradient rather than flat colour: a two-tone
            // image compresses to the same size at every quality.
            $gd = imagecreatetruecolor(120, 120);
            for ($x = 0; $x < 120; $x++) {
                for ($y = 0; $y < 120; $y++) {
                    imagesetpixel($gd, $x, $y, imagecolorallocate($gd, ($x * 7) % 256, ($y * 11) % 256, ($x * $y) % 256));
                }
            }
            $path = Storage::disk('public')->path("media/q-{$preset}.jpg");
            @mkdir(dirname($path), 0777, true);
            imagejpeg($gd, $path, 100);
            imagedestroy($gd);

            $media = Media::create([
                'disk' => 'public', 'path' => "media/q-{$preset}.jpg", 'filename' => "q-{$preset}.jpg",
                'mime' => 'image/jpeg', 'size' => filesize($path), 'width' => 120, 'height' => 120,
            ]);

            $this->actingAs($this->staff(), 'sanctum')
                ->postJson("/api/v1/admin/media/{$media->id}/resize", ['width' => 90, 'height' => 90])
                ->assertSuccessful();

            $sizes[$preset] = $media->fresh()->size;
        }

        ImageEditor::forgetQuality();

        $this->assertLessThan(
            $sizes['best'],
            $sizes['low'],
            "low produced {$sizes['low']} bytes and best produced {$sizes['best']} — the preset is not reaching the encoder",
        );
    }

    /** An unknown preset falls back rather than breaking the library. */
    public function test_an_unknown_quality_preset_falls_back(): void
    {
        Setting::updateOrCreate(
            ['key' => 'image_quality'],
            ['group' => 'media', 'value' => 'ludicrous', 'type' => 'string'],
        );
        ImageEditor::forgetQuality();

        $this->assertSame(ImageQuality::Good, ImageQuality::current());
        ImageEditor::forgetQuality();
    }

    /** And it cannot be stored through the settings endpoint in the first place. */
    public function test_an_unknown_quality_preset_is_refused_on_write(): void
    {
        Setting::updateOrCreate(
            ['key' => 'image_quality'],
            ['group' => 'media', 'value' => 'good', 'type' => 'string'],
        );

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson('/api/v1/admin/settings', [
                'settings' => [['key' => 'image_quality', 'value' => 'ludicrous']],
            ])
            ->assertStatus(422);
    }

    /* ------------------------------------------------------- edit or copy */

    /**
     * By default an edit rewrites the file in place, and the path survives.
     *
     * That is what makes a crop reach every page already showing the image:
     * records store a path, not a media id. Losing it would leave every
     * published page on the old picture with nothing saying so.
     */
    public function test_an_edit_rewrites_in_place_by_default(): void
    {
        Storage::fake('public');
        $media = $this->realImage();
        $path = $media->path;

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                'operation' => 'rotate', 'degrees' => 90,
            ])
            ->assertSuccessful()
            ->assertJsonPath('data.id', $media->id)
            ->assertJsonPath('data.path', $path);

        $this->assertSame(1, Media::count(), 'an edit created a second row');
    }

    /**
     * `as_copy` writes to a duplicate and leaves the original untouched.
     *
     * The other intent entirely — "I want the cropped version *as well*" — and
     * each answer silently ruins the other case, which is why the dialog asks
     * rather than assuming.
     */
    public function test_as_copy_leaves_the_original_alone(): void
    {
        Storage::fake('public');
        $media = $this->realImage();

        $copyId = $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                'operation' => 'rotate', 'degrees' => 90, 'as_copy' => true,
            ])
            ->assertSuccessful()
            ->json('data.id');

        $this->assertNotSame($media->id, $copyId, 'the original was edited despite as_copy');
        $this->assertSame(2, Media::count());

        $original = $media->fresh();
        $this->assertSame(4, $original->width, 'the original was rotated');
        $this->assertSame(2, $original->height);

        $copy = Media::find($copyId);
        $this->assertSame(2, $copy->width, 'the copy was not rotated');
        $this->assertSame(4, $copy->height);

        $this->assertNotSame($original->path, $copy->path);
        Storage::disk('public')->assertExists($original->path);
        Storage::disk('public')->assertExists($copy->path);
    }

    /** The same option on resize, which is the dialog that offers it. */
    public function test_resize_can_keep_the_original(): void
    {
        Storage::fake('public');
        $media = $this->realImage();

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/resize", [
                'width' => 2, 'height' => 1, 'as_copy' => true,
            ])
            ->assertSuccessful();

        $this->assertSame(4, $media->fresh()->width, 'the original was resized despite as_copy');
        $this->assertSame(2, Media::count());
    }

    /** And on crop. */
    public function test_crop_can_keep_the_original(): void
    {
        Storage::fake('public');
        $media = $this->realImage();

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/crop", [
                'x' => 0, 'y' => 0, 'width' => 2, 'height' => 2, 'as_copy' => true,
            ])
            ->assertSuccessful();

        $this->assertSame(4, $media->fresh()->width, 'the original was cropped despite as_copy');
        $this->assertSame(2, Media::count());
    }

    /**
     * The URL carries a version that moves when the bytes do.
     *
     * An edit keeps the path — deliberately — so without this the browser goes
     * on serving the copy it already holds and the console shows the *old*
     * picture after a successful resize. It reads as "the gallery does not
     * refresh", which is what it was reported as.
     *
     * The version belongs on `url` and never on `path`: `path` is what a record
     * stores, and a stored path with a query string in it is a filename that
     * does not exist.
     */
    public function test_the_url_is_versioned_so_an_edit_is_visible(): void
    {
        Storage::fake('public');
        $media = $this->realImage();
        $staff = $this->staff();

        $before = $this->actingAs($staff, 'sanctum')
            ->getJson('/api/v1/admin/media')->json('data.0.url');

        // The stamp has one-second resolution, so an edit within the same
        // second would compare equal for reasons unrelated to the fix.
        $this->travel(2)->seconds();

        $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                'operation' => 'flip', 'axis' => 'horizontal',
            ])
            ->assertSuccessful();

        $after = $this->actingAs($staff, 'sanctum')
            ->getJson('/api/v1/admin/media')->json('data.0.url');

        $this->assertNotSame($before, $after, 'the URL did not change, so a browser would show the cached image');
        $this->assertStringContainsString('?v=', (string) $after);
        $this->assertStringNotContainsString('?v=', (string) $media->fresh()->path);
    }

    /* ---------------------------------------------------------------- bin */

    /**
     * A restore puts the file back at **the path it always had**.
     *
     * That is the whole point of keeping the bytes: records store a path, so a
     * restore has to make the already-published URL work again. Re-uploading
     * the same image under a new hashed name would leave every one of those
     * records broken.
     */
    public function test_a_restore_brings_the_file_back_at_its_original_path(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('media/keep.jpg', 'bytes');
        $media = Media::create([
            'disk' => 'public', 'path' => 'media/keep.jpg',
            'filename' => 'keep.jpg', 'mime' => 'image/jpeg', 'size' => 5,
        ]);
        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->deleteJson("/api/v1/admin/media/{$media->id}")
            ->assertSuccessful();

        $this->assertSame(0, Media::count());
        Storage::disk('public')->assertExists('media/keep.jpg');

        $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/restore")
            ->assertSuccessful()
            ->assertJsonPath('data.path', 'media/keep.jpg');

        $this->assertSame(1, Media::count());
    }

    /** `?trashed=1` is the bin; without it the bin is invisible. */
    public function test_the_listing_hides_binned_files_unless_asked(): void
    {
        $live = $this->file(['filename' => 'live.jpg']);
        $binned = $this->file(['filename' => 'binned.jpg']);
        $binned->delete();

        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/media')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.filename', 'live.jpg');

        $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/media?trashed=1')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.filename', 'binned.jpg');

        $this->assertSame($live->id, Media::sole()->id);
    }

    /**
     * Purging removes the row, the bytes and every archived version.
     *
     * The cascade deletes version *rows*; it knows nothing about the disk, so
     * the files behind them have to be removed through the model event that
     * owns that job.
     */
    public function test_purging_removes_the_file_and_its_versions(): void
    {
        Storage::fake('public');
        $media = $this->realImage();
        $staff = $this->staff();

        // Two edits, so there is a history to clean up.
        $this->actingAs($staff, 'sanctum')->postJson("/api/v1/admin/media/{$media->id}/transform", [
            'operation' => 'rotate', 'degrees' => 90,
        ])->assertSuccessful();
        $this->actingAs($staff, 'sanctum')->postJson("/api/v1/admin/media/{$media->id}/transform", [
            'operation' => 'flip', 'axis' => 'horizontal',
        ])->assertSuccessful();

        $versionPaths = MediaVersion::where('media_id', $media->id)->pluck('path');
        $this->assertCount(2, $versionPaths);

        $this->actingAs($staff, 'sanctum')->deleteJson("/api/v1/admin/media/{$media->id}")->assertSuccessful();
        $this->actingAs($staff, 'sanctum')->deleteJson("/api/v1/admin/media/{$media->id}/purge")->assertSuccessful();

        $this->assertSame(0, Media::withTrashed()->count());
        $this->assertSame(0, MediaVersion::count());
        Storage::disk('public')->assertMissing($media->path);
        foreach ($versionPaths as $path) {
            Storage::disk('public')->assertMissing($path);
        }
    }

    /* ----------------------------------------------------------- versions */

    /**
     * An edit archives what was there **before** it.
     *
     * Snapshotting afterwards would look identical from the outside and store
     * the *new* bytes every time — a history of the present, which restores
     * nothing.
     */
    public function test_an_edit_archives_the_previous_bytes(): void
    {
        Storage::fake('public');
        $media = $this->realImage();

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                'operation' => 'rotate', 'degrees' => 90,
            ])
            ->assertSuccessful();

        $version = MediaVersion::where('media_id', $media->id)->sole();

        // The archived copy has the ORIGINAL dimensions, not the rotated ones.
        $this->assertSame(4, $version->width, 'the snapshot was taken after the edit');
        $this->assertSame(2, $version->height);
        $this->assertSame('rotate', $version->operation);
        $this->assertSame(2, $media->fresh()->width);
    }

    /** Restoring a version puts the old bytes back over the live file. */
    public function test_a_version_can_be_restored(): void
    {
        Storage::fake('public');
        $media = $this->realImage();
        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                'operation' => 'rotate', 'degrees' => 90,
            ])->assertSuccessful();

        $this->assertSame(2, $media->fresh()->width);

        $version = MediaVersion::where('media_id', $media->id)->sole();

        $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/versions/{$version->id}/restore")
            ->assertSuccessful()
            ->assertJsonPath('data.width', 4)
            ->assertJsonPath('data.height', 2);

        // The restore is itself an edit, so the rotated state was archived
        // rather than discarded — restoring to compare must not be one-way.
        $this->assertSame(1, MediaVersion::where('media_id', $media->id)->count());
        $this->assertSame('restore', MediaVersion::where('media_id', $media->id)->sole()->operation);
    }

    /**
     * History is capped, and pruning takes the files with it.
     *
     * These are full copies on the public disk — a 4MB photograph edited
     * twenty times would be 80MB of history for one picture.
     */
    public function test_history_is_capped_and_pruned_files_are_removed(): void
    {
        Storage::fake('public');
        $media = $this->realImage();
        $staff = $this->staff();

        foreach (range(1, MediaHistory::KEEP + 3) as $n) {
            $this->actingAs($staff, 'sanctum')
                ->postJson("/api/v1/admin/media/{$media->id}/transform", [
                    'operation' => 'flip', 'axis' => 'horizontal',
                ])->assertSuccessful();
        }

        $this->assertSame(
            MediaHistory::KEEP,
            MediaVersion::where('media_id', $media->id)->count(),
            'history grew past the cap',
        );

        // Every surviving version still has its file; the pruned ones do not
        // leave theirs behind.
        $kept = MediaVersion::where('media_id', $media->id)->pluck('path');
        foreach ($kept as $path) {
            Storage::disk('public')->assertExists($path);
        }

        $onDisk = collect(Storage::disk('public')->allFiles('media/versions'))->count();
        $this->assertSame(MediaHistory::KEEP, $onDisk, 'pruned versions left their files behind');
    }

    /* -------------------------------------------------------- resolution */

    /**
     * An image can sit inside the size limit and still be refused.
     *
     * Size and resolution constrain different resources — the transfer and the
     * decode. A well-compressed image of enormous dimensions costs GD roughly
     * four bytes per pixel once opened, which is past `memory_limit` and ends
     * the request with a fatal error rather than a message. So it is checked
     * from the header, before anything is written.
     */
    public function test_an_oversized_image_is_refused_on_resolution_not_size(): void
    {
        Storage::fake('public');

        Setting::updateOrCreate(
            ['key' => 'media_max_megapixels'],
            ['group' => 'media', 'value' => '2', 'type' => 'string'],
        );

        // 2000x2000 is 4 megapixels, and as a fake it is far inside the size
        // limit — so only the resolution rule can refuse it.
        $big = UploadedFile::fake()->image('huge.jpg', 2000, 2000);

        $this->actingAs($this->staff(), 'sanctum')
            ->post('/api/v1/admin/media', ['file' => $big])
            ->assertStatus(422)
            ->assertJsonValidationErrors('file');

        $this->assertSame(0, Media::count(), 'the file was stored despite being refused');
    }

    /** And one inside the limit still uploads. */
    public function test_an_image_within_the_resolution_limit_uploads(): void
    {
        Storage::fake('public');

        Setting::updateOrCreate(
            ['key' => 'media_max_megapixels'],
            ['group' => 'media', 'value' => '2', 'type' => 'string'],
        );

        $this->actingAs($this->staff(), 'sanctum')
            ->post('/api/v1/admin/media', ['file' => UploadedFile::fake()->image('fine.jpg', 800, 600)])
            ->assertSuccessful();

        $this->assertSame(1, Media::count());
    }
}
