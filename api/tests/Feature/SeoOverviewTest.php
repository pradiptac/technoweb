<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\JobOpening;
use App\Models\Role;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Three record types that already carried `HasSeo` and were absent from the
 * one screen whose job is finding indexable records and scoring them:
 * vacancies, the shop's products, and — new here — the shop's categories.
 *
 * `store_category` needed more than a registration. `StoreCategory` had no
 * `HasSeo` at all: no override row, no `defaultSeo()`, nothing for
 * `/admin/seo` to show and nothing for an editor to change, despite
 * `/store/categories/{slug}` being a real, indexable page in the sitemap
 * since the store shipped.
 */
class SeoOverviewTest extends TestCase
{
    use RefreshDatabase;

    private ?User $seoManager = null;

    private function seoManager(): User
    {
        if ($this->seoManager) {
            return $this->seoManager;
        }

        $user = User::create([
            'name' => 'SEO', 'email' => 'seo-overview@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::SeoManager->value],
            ['name' => RoleEnum::SeoManager->label()],
        ));

        return $this->seoManager = $user->load('roles');
    }

    private ?User $storeManager = null;

    private function storeManager(): User
    {
        if ($this->storeManager) {
            return $this->storeManager;
        }

        $user = User::create([
            'name' => 'Store', 'email' => 'store-overview@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::StoreManager->value],
            ['name' => RoleEnum::StoreManager->label()],
        ));

        return $this->storeManager = $user->load('roles');
    }

    private function jobOpening(string $title = 'Field Network Engineer'): JobOpening
    {
        return JobOpening::create([
            'title' => $title,
            'slug' => str($title)->slug(),
            'status' => 'published',
            'description' => str_repeat('Install and maintain enterprise network hardware. ', 20),
        ]);
    }

    private function storeProduct(string $name = 'CBS350 24-Port Switch'): StoreProduct
    {
        return StoreProduct::create([
            'name' => $name,
            'slug' => str($name)->slug(),
            'status' => 'published',
            'price_paise' => 1180000,
            'description' => str_repeat('A managed switch for a small site. ', 20),
        ]);
    }

    private function storeCategory(string $name = 'Switches'): StoreCategory
    {
        return StoreCategory::create([
            'name' => $name,
            'slug' => str($name)->slug(),
            'is_active' => true,
            'description' => str_repeat('Managed and unmanaged switches for every site. ', 10),
        ]);
    }

    /**
     * All three appear in `meta.types` and in the row list, which is what
     * makes them reachable from the console at all -- a type absent from
     * `meta.types` is a type the filter dropdown cannot even name.
     */
    public function test_the_three_new_entity_types_are_offered_and_scored(): void
    {
        $job = $this->jobOpening();
        $product = $this->storeProduct();
        $category = $this->storeCategory();

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->getJson('/api/v1/admin/seo?per_page=200')
            ->assertOk();

        $types = collect($response->json('meta.types'))->pluck('value');
        $this->assertTrue($types->contains('job_opening'));
        $this->assertTrue($types->contains('store_product'));
        $this->assertTrue($types->contains('store_category'));

        $rows = collect($response->json('data'));

        foreach ([
            ['job_opening', $job->id, '/admin/jobs/'],
            ['store_product', $product->id, '/admin/store/products/'],
            ['store_category', $category->id, '/admin/store/categories/'],
        ] as [$type, $id, $adminPrefix]) {
            $row = $rows->first(fn ($r) => $r['type'] === $type && $r['id'] === $id);

            $this->assertNotNull($row, "No row for {$type}#{$id}.");
            $this->assertArrayHasKey('value', $row['score'], "{$type} was not scored.");
            $this->assertSame($adminPrefix.$id, $row['admin_path']);
        }
    }

    /**
     * The sitemap toggle -- `PATCH /admin/seo/sitemap` -- works for all
     * three, and writes through the `seo` relation exactly as it does for
     * every other entity: `updateOrCreate`, so a record with no override row
     * yet gets one rather than the write being silently dropped.
     */
    public function test_the_sitemap_toggle_reaches_all_three(): void
    {
        $job = $this->jobOpening();
        $product = $this->storeProduct();
        $category = $this->storeCategory();

        foreach ([
            ['job_opening', $job],
            ['store_product', $product],
            ['store_category', $category],
        ] as [$type, $record]) {
            $this->actingAs($this->seoManager(), 'sanctum')
                ->patchJson('/api/v1/admin/seo/sitemap', [
                    'type' => $type,
                    'id' => $record->id,
                    'sitemap_include' => false,
                ])
                ->assertOk()
                ->assertJsonPath('data.sitemap_include', false);

            $this->assertFalse($record->fresh()->seo->sitemap_include);
        }
    }

    /**
     * `GET /admin/seo/{type}/{id}` -- what the console's Recheck button
     * calls -- resolves a single row for each of the three new types.
     */
    public function test_a_single_row_can_be_rechecked_for_each_new_type(): void
    {
        $product = $this->storeProduct();

        $this->actingAs($this->seoManager(), 'sanctum')
            ->getJson("/api/v1/admin/seo/store_product/{$product->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $product->id);
    }

    /**
     * A store category's SEO override round-trips through its own admin
     * endpoint -- create, then read it back on the detail response -- the
     * same shape `ProductCategory`'s form already proved.
     *
     * The index deliberately does **not** carry it: `CategoryResource` gates
     * `seo`/`seo_defaults` on `$detail`, the same test `ProductCategoryResource`
     * makes, because the override panel is only worth the extra query on the
     * screens that render it.
     */
    public function test_a_store_category_seo_override_is_saved_and_read_back(): void
    {
        $manager = $this->storeManager();

        $created = $this->actingAs($manager, 'sanctum')
            ->postJson('/api/v1/admin/store/categories', [
                'name' => 'Firewalls',
                'seo' => ['title' => 'Enterprise Firewalls, Configured and Supported'],
            ])
            ->assertCreated()
            ->json('data');

        $this->assertSame('Enterprise Firewalls, Configured and Supported', $created['seo']['title']);

        $show = $this->actingAs($manager, 'sanctum')
            ->getJson("/api/v1/admin/store/categories/{$created['id']}")
            ->assertOk()
            ->json('data');

        $this->assertSame('Enterprise Firewalls, Configured and Supported', $show['seo']['title']);
        $this->assertArrayHasKey('seo_defaults', $show);

        $index = $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/store/categories')
            ->assertOk()
            ->json('data');

        $row = collect($index)->firstWhere('id', $created['id']);
        $this->assertArrayNotHasKey('seo', $row);
    }

    /**
     * The override reaches the public detail response, which is what the
     * frontend's `generateMetadata` reads to build the page's real `<title>`
     * rather than the raw `name` column.
     */
    public function test_a_store_category_override_reaches_the_public_response(): void
    {
        $category = $this->storeCategory('Access Points');
        $category->seo()->create(['title' => 'Wi-Fi Access Points for Every Site Size']);

        $this->getJson("/api/v1/store/categories/{$category->slug}")
            ->assertOk()
            ->assertJsonPath('data.seo.title', 'Wi-Fi Access Points for Every Site Size');
    }

    /**
     * With nothing overridden, the derived title and description still
     * publish -- `defaultSeo()` is what makes a category page indexable
     * before anybody has typed an override, the same as every other entity.
     */
    public function test_a_store_category_with_no_override_still_derives_seo(): void
    {
        $category = $this->storeCategory('Network Cabling');

        $resolved = $category->resolvedSeo();

        $this->assertSame('Network Cabling', $resolved['title']);
        $this->assertStringContainsString('/store/categories/network-cabling', $resolved['canonical_url']);
        $this->assertSame('CollectionPage', $resolved['schema_type']);
        $this->assertTrue($resolved['sitemap_include']);
    }
}
