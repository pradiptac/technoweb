<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Role;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A store product's videos (2026-09-26, `docs/store.md`).
 *
 * What a video field can be made to put on a page is the whole of the risk:
 * an iframe `src` built from a lookalike host is somebody else's page inside
 * this origin, and a PDF offered as a video is a broken player. So the tests
 * are about what is refused, and about what is stored — the id, never the
 * link — and about the graph claiming only what it can back.
 */
class StoreProductVideoTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'store-manager@example.test'],
            ['name' => 'Store manager', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::StoreManager->value],
                ['name' => RoleEnum::StoreManager->label()],
            ));
        }

        return $user;
    }

    private function media(string $path, string $mime): Media
    {
        return Media::create([
            'disk' => 'public', 'path' => $path, 'filename' => basename($path), 'mime' => $mime, 'size' => 1024,
        ]);
    }

    private function product(): StoreProduct
    {
        return StoreProduct::create([
            'name' => 'Aruba 6100', 'slug' => 'aruba-6100', 'price_paise' => 5000000, 'stock' => 3,
            'status' => 'published', 'images' => ['media/shop/aruba.jpg'],
        ]);
    }

    private function save(StoreProduct $product, array $videos): TestResponse
    {
        return $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", ['videos' => $videos]);
    }

    public function test_a_youtube_link_is_stored_as_its_id_and_a_file_as_its_path(): void
    {
        $product = $this->product();
        $this->media('media/video/tour.mp4', 'video/mp4');
        $this->media('media/video/poster.jpg', 'image/jpeg');

        $this->save($product, [
            ['kind' => 'youtube', 'youtube_id' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'title' => 'Unboxing'],
            ['kind' => 'file', 'path' => 'media/video/tour.mp4', 'poster_path' => 'media/video/poster.jpg', 'youtube_id' => 'ignored'],
        ])->assertOk();

        // assertEquals: MySQL's JSON type reorders an object's keys, and the
        // order of a video's own keys means nothing.
        $this->assertEquals([
            ['kind' => 'youtube', 'youtube_id' => 'dQw4w9WgXcQ', 'title' => 'Unboxing', 'poster_path' => null],
            ['kind' => 'file', 'path' => 'media/video/tour.mp4', 'title' => null, 'poster_path' => 'media/video/poster.jpg'],
        ], $product->fresh()->videos);

        $videos = $this->getJson('/api/v1/store/products/aruba-6100')->assertOk()->json('data.videos');
        $this->assertSame('dQw4w9WgXcQ', $videos[0]['youtube_id']);
        $this->assertArrayNotHasKey('poster_url', $videos[0]);
        $this->assertStringEndsWith('/storage/media/video/tour.mp4', $videos[1]['url']);
        $this->assertStringNotContainsString('ytimg', json_encode($videos) ?: '');
    }

    public function test_a_lookalike_host_is_refused(): void
    {
        $this->save($this->product(), [
            ['kind' => 'youtube', 'youtube_id' => 'https://youtube.com.attacker.test/watch?v=dQw4w9WgXcQ'],
        ])->assertStatus(422)->assertJsonValidationErrors(['videos.0.youtube_id']);
    }

    public function test_a_file_must_be_a_video_the_library_holds_and_a_poster_a_picture(): void
    {
        $product = $this->product();
        $this->media('media/docs/datasheet.pdf', 'application/pdf');
        $this->media('media/video/tour.webm', 'video/webm');
        $this->media('media/art/logo.svg', 'image/svg+xml');

        $this->save($product, [['kind' => 'file', 'path' => 'media/docs/datasheet.pdf']])
            ->assertStatus(422)->assertJsonValidationErrors(['videos.0.path']);
        $this->save($product, [['kind' => 'file', 'path' => 'media/video/missing.mp4']])
            ->assertStatus(422)->assertJsonValidationErrors(['videos.0.path']);
        $this->save($product, [['kind' => 'file', 'path' => 'media/video/tour.webm', 'poster_path' => 'media/art/logo.svg']])
            ->assertStatus(422)->assertJsonValidationErrors(['videos.0.poster_path']);
        $this->save($product, [['kind' => 'file', 'path' => 'media/video/tour.webm']])->assertOk();
    }

    public function test_at_most_four(): void
    {
        $five = array_fill(0, 5, ['kind' => 'youtube', 'youtube_id' => 'dQw4w9WgXcQ']);

        $this->save($this->product(), $five)->assertStatus(422)->assertJsonValidationErrors(['videos']);
    }

    public function test_the_graph_names_a_youtube_video_only_when_its_poster_was_uploaded(): void
    {
        $product = $this->product();
        $product->update(['videos' => [
            ['kind' => 'youtube', 'youtube_id' => 'dQw4w9WgXcQ', 'title' => 'Unboxing', 'poster_path' => 'media/video/poster.jpg'],
            ['kind' => 'youtube', 'youtube_id' => 'aaaaaaaaaaa', 'title' => 'No poster', 'poster_path' => null],
            ['kind' => 'file', 'path' => 'media/video/tour.mp4', 'title' => 'Tour', 'poster_path' => 'media/video/poster.jpg'],
        ]]);

        $graph = $this->getJson('/api/v1/store/products/aruba-6100')->assertOk()->json('data.schema');

        $this->assertCount(1, $graph['subjectOf']);
        $video = $graph['subjectOf'][0];
        $this->assertSame('VideoObject', $video['@type']);
        $this->assertSame('Unboxing', $video['name']);
        $this->assertStringEndsWith('/storage/media/video/poster.jpg', $video['thumbnailUrl']);
        $this->assertSame('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', $video['embedUrl']);
        $this->assertNotEmpty($video['uploadDate']);
    }
}
