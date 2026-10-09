<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Store\VideoShelf;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * "Shop the videos" (0.140.0, docs/store.md "Product videos row"): the shop's
 * products that carry a video, one tile each with the product under it, as one
 * list — `VideoShelf` — that `GET /store/videos` and the builder's
 * `product_videos` section both read.
 *
 * What these pin, each with a control run (remove the rule, watch exactly its
 * own test fail): the published filter, the key allowlist on the settings
 * door, and the product-first rule.
 */
class StoreVideosTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            ['name' => 'Test staff', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => $role->value],
                ['name' => $role->label()],
            ));
        }

        return $user;
    }

    private function manager(): User
    {
        return $this->staff(RoleEnum::StoreManager, 'videos-manager@example.test');
    }

    /** @return array<int, array<string, mixed>> */
    private function youtube(string $id = 'aqz-KE-bpKQ', ?string $title = null): array
    {
        return [['kind' => 'youtube', 'youtube_id' => $id, 'title' => $title, 'poster_path' => null]];
    }

    /** @param  array<string, mixed>  $attributes */
    private function product(string $name, ?array $videos, array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => $name,
            'slug' => Str::slug($name),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
            'videos' => $videos,
        ], $attributes));
    }

    /** @return list<string> */
    private function ids(?string $query = ''): array
    {
        return array_column($this->getJson('/api/v1/store/videos'.$query)->assertOk()->json('data'), 'id');
    }

    // ------------------------------------------------------ the list

    public function test_only_published_products_with_a_video_are_listed(): void
    {
        $shown = $this->product('Shown', $this->youtube());
        $this->product('Draft', $this->youtube(), ['status' => PublishStatus::Draft]);
        $this->product('Archived', $this->youtube(), ['status' => PublishStatus::Archived]);
        $this->product('No video', null);
        $this->product('Empty list', []);

        $this->assertSame(["{$shown->id}-0"], $this->ids());
    }

    public function test_a_row_is_the_video_and_the_shop_list_shape_with_no_path_and_no_stock(): void
    {
        $category = StoreCategory::create(['name' => 'Switches', 'slug' => 'switches', 'is_active' => true]);
        $product = $this->product('Tiled', [
            ['kind' => 'file', 'path' => 'media/clip.mp4', 'title' => 'Unboxing', 'poster_path' => null],
        ], ['store_category_id' => $category->id, 'stock' => 7, 'track_stock' => true]);

        $row = $this->getJson('/api/v1/store/videos')->assertOk()->json('data.0');

        $this->assertSame("{$product->id}-0", $row['id']);
        $this->assertSame('file', $row['video']['kind']);
        $this->assertStringEndsWith('/storage/media/clip.mp4', $row['video']['url']);
        $this->assertSame('Unboxing', $row['video']['title']);
        $this->assertArrayNotHasKey('path', $row['video']);
        $this->assertArrayNotHasKey('youtube_id', $row['video']);

        // The product half is the cards' list resource: the cart button's inputs, no detail, no count.
        $this->assertSame('tiled', $row['product']['slug']);
        $this->assertSame(1180000, $row['product']['price_paise']);
        $this->assertTrue($row['product']['in_stock']);
        $this->assertArrayNotHasKey('stock', $row['product']);
        $this->assertArrayNotHasKey('videos', $row['product'], 'The list shape carries no videos; they are the tile.');
        $this->assertArrayNotHasKey('description', $row['product']);
        $this->assertSame('switches', $row['product']['category']['slug']);
    }

    public function test_a_youtube_tile_carries_the_id_and_never_a_thumbnail_address(): void
    {
        $this->product('Tube', $this->youtube('dQw4w9WgXcQ', 'Demo'));

        $video = $this->getJson('/api/v1/store/videos')->assertOk()->json('data.0.video');

        $this->assertSame('youtube', $video['kind']);
        $this->assertSame('dQw4w9WgXcQ', $video['youtube_id']);
        $this->assertArrayNotHasKey('url', $video);
        $this->assertStringNotContainsString('ytimg', json_encode($video));
    }

    public function test_one_tile_per_product_its_first_video(): void
    {
        $two = $this->product('Two videos', [
            ['kind' => 'youtube', 'youtube_id' => 'aqz-KE-bpKQ', 'title' => 'First', 'poster_path' => null],
            ['kind' => 'youtube', 'youtube_id' => 'dQw4w9WgXcQ', 'title' => 'Second', 'poster_path' => null],
        ]);

        $rows = $this->getJson('/api/v1/store/videos')->assertOk()->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame("{$two->id}-0", $rows[0]['id']);
        $this->assertSame('First', $rows[0]['video']['title']);
    }

    public function test_category_limit_and_order(): void
    {
        $a = StoreCategory::create(['name' => 'A', 'slug' => 'cat-a', 'is_active' => true]);
        $b = StoreCategory::create(['name' => 'B', 'slug' => 'cat-b', 'is_active' => true]);
        $one = $this->product('One', $this->youtube(), ['store_category_id' => $a->id]);
        $two = $this->product('Two', $this->youtube(), ['store_category_id' => $b->id, 'is_featured' => true]);
        $three = $this->product('Three', $this->youtube(), ['store_category_id' => $a->id]);

        // Newest first: the highest id leads when the timestamps tie.
        $this->assertSame(["{$three->id}-0", "{$two->id}-0", "{$one->id}-0"], $this->ids());
        $this->assertSame(["{$three->id}-0", "{$one->id}-0"], $this->ids('?category=cat-a'));
        $this->assertSame(["{$three->id}-0"], $this->ids('?limit=1'));
        // Featured first.
        $this->assertSame("{$two->id}-0", $this->ids('?order=featured')[0]);
        // Mangled values fall back rather than answering 422.
        $this->assertCount(3, $this->ids('?order=sideways&limit=abc'));
    }

    public function test_the_products_own_videos_come_first_and_it_never_appears_twice(): void
    {
        $cat = StoreCategory::create(['name' => 'Cat', 'slug' => 'cat', 'is_active' => true]);
        $other = StoreCategory::create(['name' => 'Other', 'slug' => 'other', 'is_active' => true]);

        $mate = $this->product('Mate', $this->youtube(), ['store_category_id' => $cat->id]);
        $self = $this->product('Self', [
            ['kind' => 'youtube', 'youtube_id' => 'aqz-KE-bpKQ', 'title' => 'One', 'poster_path' => null],
            ['kind' => 'youtube', 'youtube_id' => 'dQw4w9WgXcQ', 'title' => 'Two', 'poster_path' => null],
        ], ['store_category_id' => $cat->id]);
        $stranger = $this->product('Stranger', $this->youtube(), ['store_category_id' => $other->id]);
        // Newer than all of them, so "newest" alone would put it first.
        $newest = $this->product('Newest stranger', $this->youtube(), ['store_category_id' => $other->id]);

        $ids = $this->ids('?product=self');

        // All of its own, each its own tile — then its category-mate — then the rest.
        $this->assertSame(
            ["{$self->id}-0", "{$self->id}-1", "{$mate->id}-0", "{$newest->id}-0", "{$stranger->id}-0"],
            $ids,
        );
        $this->assertSame(1, count(array_filter($ids, fn ($id) => str_starts_with($id, "{$self->id}-0"))));
        $this->assertCount(count($ids), array_unique($ids));

        // `others=0` — the website sends it when the shop's setting is off — is only its own.
        $this->assertSame(["{$self->id}-0", "{$self->id}-1"], $this->ids('?product=self&others=0'));
        // The limit counts the head too.
        $this->assertSame(["{$self->id}-0", "{$self->id}-1", "{$mate->id}-0"], $this->ids('?product=self&limit=3'));
        // A product with no video, or that does not exist, simply has no head.
        $this->assertCount(4, $this->ids('?product=nothing-here'));
    }

    public function test_a_draft_with_a_video_is_in_neither_the_plain_list_nor_a_product_request(): void
    {
        $cat = StoreCategory::create(['name' => 'Cat', 'slug' => 'cat', 'is_active' => true]);
        $live = $this->product('Live', $this->youtube(), ['store_category_id' => $cat->id]);
        $draft = $this->product('Hidden draft', $this->youtube(), ['store_category_id' => $cat->id, 'status' => PublishStatus::Draft]);

        // The plain list.
        $this->assertSame(["{$live->id}-0"], $this->ids());
        // Asking for the draft by slug: no head, and it is not in the tail either.
        $this->assertSame(["{$live->id}-0"], $this->ids('?product=hidden-draft'));
        // Asking for a live product: the draft is not among "others".
        $this->assertSame(["{$live->id}-0"], $this->ids('?product=live'));
        $this->assertNotContains("{$draft->id}-0", $this->ids('?product=live&category=cat'));
    }

    public function test_the_admin_product_list_filters_to_products_with_a_video(): void
    {
        $with = $this->product('With', $this->youtube());
        $this->product('Without', null);

        $rows = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/products?video=1')->assertOk()->json('data');

        $this->assertSame([$with->id], array_column($rows, 'id'));
    }

    // ------------------------------------------------------ the settings door

    private function save(array $pairs, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->manager(), 'sanctum')->patchJson('/api/v1/admin/store/videos', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_the_rows_are_seeded_public_and_the_screen_reads_the_eleven_and_the_count(): void
    {
        $this->product('Counted', $this->youtube());
        $this->product('Not counted', null);

        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame('1', $public['store_videos_shop_enabled']);
        $this->assertSame('0', $public['store_videos_autoplay']);
        $this->assertSame('portrait', $public['store_videos_shape']);
        $this->assertSame('Shop the videos', $public['store_videos_heading']);

        $body = $this->actingAs($this->manager(), 'sanctum')->getJson('/api/v1/admin/store/videos')->assertOk()->json();
        $this->assertCount(11, $body['data']);
        $this->assertSame('store_videos_shop_enabled', $body['data'][0]['key']);
        $this->assertSame(1, $body['meta']['products_with_video']);

        $shape = collect($body['data'])->firstWhere('key', 'store_videos_shape');
        $this->assertSame(['portrait', 'square', 'landscape'], array_column($shape['options'], 'value'));
    }

    public function test_a_store_manager_saves_and_the_site_reads_it(): void
    {
        $this->save([
            'store_videos_autoplay' => '1',
            'store_videos_shape' => 'square',
            'store_videos_limit' => '8',
            'store_videos_order' => 'featured',
            'store_videos_heading' => 'Watch and buy',
            'store_videos_lede' => '',
        ])->assertOk()->assertJsonPath('message', 'Product videos saved.');

        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame('1', $public['store_videos_autoplay']);
        $this->assertSame('square', $public['store_videos_shape']);
        $this->assertSame('Watch and buy', $public['store_videos_heading']);
        $this->assertArrayNotHasKey('store_videos_lede', $public, 'A blank row is dropped from the public map.');

        // The shelf reads the same settings: eight is the default count, "featured" its order.
        $this->assertSame('featured', VideoShelf::order());
        $this->assertSame(8, VideoShelf::limit());
    }

    public function test_a_key_outside_the_group_is_refused_not_ignored(): void
    {
        $before = Setting::where('key', 'store_shipping_paise')->value('value');

        $this->save(['store_videos_heading' => 'Fine', 'store_shipping_paise' => '0'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['settings.1.key']);

        $this->assertSame($before, Setting::where('key', 'store_shipping_paise')->value('value'));
        $this->assertSame('Shop the videos', Setting::where('key', 'store_videos_heading')->value('value'), 'A refused request saves nothing.');
    }

    public function test_the_switch_the_shape_the_order_and_the_count_are_held_to_their_lists(): void
    {
        $this->save(['store_videos_autoplay' => 'yes'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_videos_shape' => 'circle'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_videos_order' => 'random'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_videos_limit' => '3'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_videos_limit' => '25'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_videos_limit' => 'many'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_videos_heading' => str_repeat('x', 81)])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_videos_lede' => str_repeat('x', 201)])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);

        $this->save(['store_videos_limit' => '4', 'store_videos_shape' => 'landscape'])->assertOk();
        $this->save(['store_videos_limit' => '24'])->assertOk();
    }

    public function test_other_roles_are_refused_and_an_administrator_still_passes(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager, 'videos-editor@example.test');

        $this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/store/videos')->assertForbidden();
        $this->save(['store_videos_heading' => 'Nope'], $editor)->assertForbidden();

        $admin = $this->staff(RoleEnum::Admin, 'videos-admin@example.test');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/store/videos')->assertOk();
    }

    // ------------------------------------------------------ the builder section

    private function sectionPage(array $data, string $title = 'Videos page')
    {
        $editor = $this->staff(RoleEnum::ContentManager, 'videos-builder@example.test');

        return $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => $title, 'template' => 'builder', 'status' => 'published',
            'blocks' => [[
                'id' => (string) Str::uuid(), 'type' => 'product_videos', 'hidden' => false,
                'background' => null, 'data' => $data,
            ]],
        ]);
    }

    public function test_the_builder_section_is_validated_stored_and_presented_from_the_same_list(): void
    {
        $cat = StoreCategory::create(['name' => 'Cat', 'slug' => 'cat', 'is_active' => true]);
        $in = $this->product('In category', $this->youtube(), ['store_category_id' => $cat->id]);
        $this->product('Elsewhere', $this->youtube());

        $this->sectionPage(['heading' => 'Watch', 'category_id' => $cat->id, 'limit' => 6, 'shape' => 'square'])
            ->assertCreated();

        $section = $this->getJson('/api/v1/pages/videos-page')->assertOk()->json('data.sections.0');

        $this->assertSame('product_videos', $section['type']);
        $this->assertSame('Watch', $section['data']['heading']);
        $this->assertSame('square', $section['data']['shape']);
        $this->assertSame(["{$in->id}-0"], array_column($section['data']['items'], 'id'));
        // The product half is the list shape even though this route is `pages.show`.
        $this->assertArrayNotHasKey('description', $section['data']['items'][0]['product']);
        $this->assertArrayNotHasKey('stock', $section['data']['items'][0]['product']);
    }

    public function test_the_builder_section_refuses_a_bad_shape_count_and_category(): void
    {
        $this->sectionPage(['shape' => 'circle'])->assertStatus(422)->assertJsonValidationErrors(['blocks.0.data.shape']);
        $this->sectionPage(['limit' => 30])->assertStatus(422)->assertJsonValidationErrors(['blocks.0.data.limit']);
        $this->sectionPage(['limit' => 0])->assertStatus(422)->assertJsonValidationErrors(['blocks.0.data.limit']);
        $this->sectionPage(['category_id' => 9999])->assertStatus(422)->assertJsonValidationErrors(['blocks.0.data.category_id']);
    }

    public function test_the_builder_section_is_dropped_when_there_are_no_videos(): void
    {
        $this->product('Silent', null);

        $this->sectionPage(['heading' => 'Nothing to watch'], 'Quiet page')->assertCreated();

        $this->assertSame([], $this->getJson('/api/v1/pages/quiet-page')->assertOk()->json('data.sections'));
    }
}
