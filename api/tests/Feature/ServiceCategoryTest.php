<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Role;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\User;
use App\Support\MediaMeta;
use Database\Seeders\CatalogueSeeder;
use Database\Seeders\SampleServiceSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Service categories — the tabs the Services section draws — and the
 * category and picture every service now carries (`docs/catalogue.md`).
 */
class ServiceCategoryTest extends TestCase
{
    use RefreshDatabase;

    /** `MediaMeta` memoises its map in a static, which outlives one test. */
    protected function setUp(): void
    {
        parent::setUp();
        MediaMeta::forget();
    }

    private function staff(RoleEnum $role = RoleEnum::ContentManager, string $email = 'cm@example.test'): User
    {
        $user = User::create(['name' => 'Staff', 'email' => $email, 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    private function service(string $slug, ?ServiceCategory $category = null, array $extra = []): Service
    {
        return Service::create([
            'title' => ucfirst(str_replace('-', ' ', $slug)),
            'slug' => $slug,
            'status' => PublishStatus::Published,
            'service_category_id' => $category?->id,
            ...$extra,
        ]);
    }

    public function test_a_content_manager_can_create_read_update_and_list_categories(): void
    {
        $this->actingAs($this->staff(), 'sanctum');

        $created = $this->postJson('/api/v1/admin/service-categories', [
            'name' => 'Hardware services',
            'description' => 'Repairs.',
            'icon' => 'tools',
            'sort_order' => 2,
            'image_background' => true,
        ])->assertCreated()
            ->assertJsonPath('data.slug', 'hardware-services')
            ->assertJsonPath('data.image_background', true)
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.services_count', 0);

        $id = $created->json('data.id');
        $this->service('laptop-repair', ServiceCategory::find($id));

        $this->getJson("/api/v1/admin/service-categories/{$id}")
            ->assertOk()->assertJsonPath('data.services_count', 1);

        $this->patchJson("/api/v1/admin/service-categories/{$id}", ['name' => 'Hardware', 'is_active' => false])
            ->assertOk()
            ->assertJsonPath('data.name', 'Hardware')
            // A rename keeps the slug; only an explicit one moves it.
            ->assertJsonPath('data.slug', 'hardware-services')
            ->assertJsonPath('data.is_active', false);

        ServiceCategory::create(['name' => 'Web services', 'sort_order' => 1]);

        $this->getJson('/api/v1/admin/service-categories')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Web services')
            ->assertJsonPath('data.1.name', 'Hardware')
            ->assertJsonPath('data.1.services_count', 1);

        $this->getJson('/api/v1/admin/service-categories?active=0')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Hardware');

        $this->getJson('/api/v1/admin/service-categories?q=web')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Web services');
    }

    public function test_validation_refuses_a_nameless_category_and_a_taken_slug(): void
    {
        $this->actingAs($this->staff(), 'sanctum');
        ServiceCategory::create(['name' => 'Web services']);

        $this->postJson('/api/v1/admin/service-categories', ['slug' => 'web-services'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'slug']);

        $this->postJson('/api/v1/admin/service-categories', ['name' => 'X', 'description' => str_repeat('a', 1001)])
            ->assertUnprocessable()->assertJsonValidationErrors(['description']);
    }

    public function test_a_support_engineer_is_refused(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer, 'se@example.test'), 'sanctum');

        $this->getJson('/api/v1/admin/service-categories')->assertForbidden();
        $this->postJson('/api/v1/admin/service-categories', ['name' => 'X'])->assertForbidden();
    }

    public function test_deleting_a_category_leaves_its_services_uncategorised(): void
    {
        $this->actingAs($this->staff(), 'sanctum');
        $category = ServiceCategory::create(['name' => 'Hardware services']);
        $service = $this->service('laptop-repair', $category);

        $this->deleteJson("/api/v1/admin/service-categories/{$category->id}")->assertNoContent();

        $this->assertDatabaseMissing('service_categories', ['id' => $category->id]);
        $this->assertNull($service->fresh()->service_category_id);
    }

    public function test_the_public_list_is_active_categories_in_order(): void
    {
        ServiceCategory::create(['name' => 'Installation', 'sort_order' => 2]);
        ServiceCategory::create(['name' => 'Web', 'sort_order' => 0, 'image_background' => true]);
        ServiceCategory::create(['name' => 'Hidden', 'sort_order' => 1, 'is_active' => false]);
        ServiceCategory::create(['name' => 'Hardware', 'sort_order' => 2]);

        $this->getJson('/api/v1/service-categories')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.name', 'Web')
            ->assertJsonPath('data.0.image_background', true)
            ->assertJsonPath('data.1.name', 'Hardware')
            ->assertJsonPath('data.2.name', 'Installation')
            ->assertJsonMissingPath('data.0.is_active')
            ->assertJsonStructure(['data' => [['id', 'name', 'slug', 'description', 'icon', 'image_background']]]);
    }

    public function test_public_services_carry_their_category_and_picture(): void
    {
        Storage::fake('public');
        Media::create(['disk' => 'public', 'path' => 'media/laptop.jpg', 'filename' => 'laptop.jpg', 'mime' => 'image/jpeg', 'size' => 20, 'alt_text' => 'A laptop on a bench']);

        $category = ServiceCategory::create(['name' => 'Hardware services']);
        $this->service('laptop-repair', $category, ['image_path' => 'media/laptop.jpg']);
        $this->service('uncategorised');

        $list = $this->getJson('/api/v1/services')->assertOk();
        $rows = collect($list->json('data'))->keyBy('slug');

        $this->assertSame(['id' => $category->id, 'name' => 'Hardware services', 'slug' => 'hardware-services'], $rows['laptop-repair']['category']);
        $this->assertStringEndsWith('/storage/media/laptop.jpg', $rows['laptop-repair']['image']);
        $this->assertSame('A laptop on a bench', $rows['laptop-repair']['image_alt']);
        $this->assertArrayHasKey('image_focus', $rows['laptop-repair']);
        $this->assertNull($rows['uncategorised']['category']);
        $this->assertNull($rows['uncategorised']['image']);

        $this->getJson('/api/v1/services/laptop-repair')
            ->assertOk()
            ->assertJsonPath('data.category.slug', 'hardware-services')
            ->assertJsonPath('data.image_alt', 'A laptop on a bench');
    }

    public function test_a_service_takes_a_category_and_a_library_picture(): void
    {
        $this->actingAs($this->staff(), 'sanctum');
        Media::create(['disk' => 'public', 'path' => 'media/rack.jpg', 'filename' => 'rack.jpg', 'mime' => 'image/jpeg', 'size' => 20]);
        $category = ServiceCategory::create(['name' => 'Installation services']);

        $id = $this->postJson('/api/v1/admin/services', [
            'title' => 'Rack installation',
            'status' => 'published',
            'service_category_id' => $category->id,
            'image_path' => 'media/rack.jpg',
        ])->assertCreated()
            ->assertJsonPath('data.service_category_id', $category->id)
            ->assertJsonPath('data.category_name', 'Installation services')
            ->assertJsonPath('data.image_path', 'media/rack.jpg')
            ->json('data.id');

        $this->assertStringEndsWith('/storage/media/rack.jpg', (string) Service::find($id)?->resolvedSeo()['og_image']);

        $this->patchJson("/api/v1/admin/services/{$id}", ['image_path' => 'media/not-there.jpg', 'service_category_id' => 9999])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['image_path', 'service_category_id']);

        $this->patchJson("/api/v1/admin/services/{$id}", ['service_category_id' => null, 'image_path' => null])
            ->assertOk()
            ->assertJsonPath('data.service_category_id', null)
            ->assertJsonPath('data.image', null);
    }

    public function test_the_admin_service_list_filters_by_category(): void
    {
        $this->actingAs($this->staff(), 'sanctum');
        $web = ServiceCategory::create(['name' => 'Web', 'sort_order' => 0]);
        $hardware = ServiceCategory::create(['name' => 'Hardware', 'sort_order' => 1]);
        $this->service('hosting', $web);
        $this->service('repair', $hardware);
        $this->service('loose');

        $this->getJson("/api/v1/admin/services?category={$hardware->id}")
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.slug', 'repair')
            ->assertJsonPath('data.0.category_name', 'Hardware');

        $this->getJson('/api/v1/admin/services?category=none')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'loose');

        $slugs = collect($this->getJson('/api/v1/admin/services?sort=category&dir=asc')->json('data'))->pluck('slug')->all();
        $this->assertSame(['hosting', 'repair', 'loose'], $slugs);
    }

    public function test_the_seeders_are_create_only_and_keep_a_chosen_category(): void
    {
        Storage::fake('public');
        $this->seed(CatalogueSeeder::class);
        $this->seed(SampleServiceSeeder::class);

        $this->assertSame(
            ['web-services', 'hardware-services', 'installation-services'],
            ServiceCategory::query()->ordered()->pluck('slug')->all(),
        );
        $this->assertSame(6, Service::whereHas('category', fn ($q) => $q->where('slug', 'web-services'))->count());
        $this->assertSame(3, Service::whereHas('category', fn ($q) => $q->where('slug', 'hardware-services'))->count());
        $this->assertSame(4, Service::whereHas('category', fn ($q) => $q->where('slug', 'installation-services'))->count());

        // An editor's choices: a renamed category with pictures on, a web
        // service moved to Hardware, a sample moved to Web and rewritten.
        $hardware = ServiceCategory::where('slug', 'hardware-services')->firstOrFail();
        $hardware->update(['name' => 'Repairs', 'image_background' => true]);
        Service::where('slug', 'vps')->update(['service_category_id' => $hardware->id]);
        $web = ServiceCategory::where('slug', 'web-services')->value('id');
        Service::where('slug', 'cctv-installation')->update(['service_category_id' => $web, 'summary' => 'Ours now.']);

        $this->seed(CatalogueSeeder::class);
        $this->seed(SampleServiceSeeder::class);

        $this->assertSame(3, ServiceCategory::count());
        $this->assertSame(13, Service::count());
        $this->assertSame('Repairs', $hardware->fresh()->name);
        $this->assertTrue($hardware->fresh()->image_background);
        $this->assertSame($hardware->id, Service::where('slug', 'vps')->value('service_category_id'));
        $cctv = Service::where('slug', 'cctv-installation')->firstOrFail();
        $this->assertSame($web, $cctv->service_category_id);
        $this->assertSame('Ours now.', $cctv->summary);
    }

    public function test_a_service_keeps_tidy_highlights_and_its_card_reads_them(): void
    {
        $this->actingAs($this->staff(), 'sanctum');

        $id = $this->postJson('/api/v1/admin/services', [
            'title' => 'Domain registration',
            'status' => 'published',
            'highlights' => ['  .com ', '', '.COM', '.in', '.co.in'],
        ])->assertCreated()
            ->assertJsonPath('data.highlights', ['.com', '.in', '.co.in'])
            ->json('data.id');

        $this->getJson('/api/v1/services')->assertOk()
            ->assertJsonPath('data.0.highlights', ['.com', '.in', '.co.in']);

        // Six chips at most, forty characters each.
        $this->patchJson("/api/v1/admin/services/{$id}", ['highlights' => ['a', 'b', 'c', 'd', 'e', 'f', 'g']])
            ->assertUnprocessable()->assertJsonValidationErrors('highlights');
        $this->patchJson("/api/v1/admin/services/{$id}", ['highlights' => [str_repeat('x', 41)]])
            ->assertUnprocessable()->assertJsonValidationErrors('highlights.0');

        // Absent leaves them alone; [] clears them.
        $this->patchJson("/api/v1/admin/services/{$id}", ['summary' => 'Names on the internet.'])
            ->assertOk()->assertJsonPath('data.highlights', ['.com', '.in', '.co.in']);
        $this->patchJson("/api/v1/admin/services/{$id}", ['highlights' => []])
            ->assertOk()->assertJsonPath('data.highlights', []);
        $this->assertNull(Service::find($id)?->getRawOriginal('highlights'));
    }

    public function test_the_seeders_give_highlights_and_pictures_and_keep_an_editors_own(): void
    {
        Storage::fake('public');
        $this->seed(CatalogueSeeder::class);
        $this->seed(SampleServiceSeeder::class);

        $domains = Service::where('slug', 'domains')->firstOrFail();
        $this->assertSame(['.com', '.in', '.co.in', '.org'], $domains->highlights);
        $this->assertSame('media/seed/services/domains.jpg', $domains->image_path);
        Storage::disk('public')->assertExists('media/seed/services/domains.jpg');
        $this->assertSame(13, Service::whereNotNull('highlights')->whereNotNull('image_path')->count());
        $this->assertSame(1600, Media::where('path', 'media/seed/services/cctv-installation.jpg')->value('width'));

        // An editor's own chips and picture survive a re-seed.
        Media::create(['disk' => 'public', 'path' => 'media/ours.jpg', 'filename' => 'ours.jpg', 'mime' => 'image/jpeg', 'size' => 20]);
        $domains->highlights = ['.in only'];
        $domains->image_path = 'media/ours.jpg';
        $domains->save();

        $this->seed(CatalogueSeeder::class);
        $this->seed(SampleServiceSeeder::class);

        $domains->refresh();
        $this->assertSame(['.in only'], $domains->highlights);
        $this->assertSame('media/ours.jpg', $domains->image_path);
    }
}
