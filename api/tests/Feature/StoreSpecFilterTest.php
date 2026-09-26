<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Store\SpecFilter;
use App\Support\Store\SpecIndex;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Specification filters (2026-09-26, `docs/store.md`).
 *
 * The index is derived, so the tests that matter are that it follows the
 * product — the sheet *and* the variations' options, through the real admin
 * endpoint that saves both in one transaction — and that the filter and the
 * counts mean what a shopper reads them as: either of two port counts, and
 * PoE as well; a count that is what ticking it would leave.
 */
class StoreSpecFilterTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        $user = User::create([
            'name' => 'Store manager', 'email' => 'store-manager@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::StoreManager->value],
            ['name' => RoleEnum::StoreManager->label()],
        ));

        return $user;
    }

    private function category(array $attributes = []): StoreCategory
    {
        return StoreCategory::create(['name' => 'Switches', 'slug' => 'switches', 'is_active' => true, ...$attributes]);
    }

    private function product(StoreCategory $category, string $slug, array $specs, array $attributes = []): StoreProduct
    {
        return StoreProduct::create([
            'name' => ucfirst($slug), 'slug' => $slug, 'price_paise' => 100000, 'stock' => 3,
            'status' => 'published', 'store_category_id' => $category->id,
            'specifications' => $specs, ...$attributes,
        ]);
    }

    /** @return array<int, string> */
    private function slugs(string $query): array
    {
        return collect($this->getJson('/api/v1/store/products?'.$query)->assertOk()->json('data'))
            ->pluck('slug')->sort()->values()->all();
    }

    public function test_the_index_follows_the_sheet_and_the_variations_through_the_admin_endpoint(): void
    {
        $category = $this->category();

        $id = $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', [
                'name' => 'Aruba 6100', 'type' => 'physical', 'status' => 'published', 'price_paise' => 5000000,
                'store_category_id' => $category->id,
                'specifications' => ['PoE' => 'Yes', 'Rack  units' => '1U'],
                'variations' => [
                    ['name' => '24-port', 'options' => ['Ports' => '24 ports'], 'stock' => 2],
                    ['name' => '48-port', 'options' => ['Ports' => '48 Ports'], 'stock' => 1],
                    ['name' => '8-port', 'options' => ['Ports' => '8 ports'], 'stock' => 1, 'is_active' => false],
                ],
            ])->assertCreated()->json('data.id');

        $rows = DB::table('store_product_specs')->where('store_product_id', $id)
            ->orderBy('label_key')->orderBy('value_key')->get(['label_key', 'value_key'])
            ->map(fn ($r) => $r->label_key.'='.$r->value_key)->all();

        // The inactive 8-port offers nothing; whitespace and case are keys only.
        $this->assertSame(['poe=yes', 'ports=24 ports', 'ports=48 ports', 'rack units=1u'], $rows);

        // Dropping a variation (a mass delete, which fires no event) and
        // changing the sheet are both followed.
        $this->patchJson("/api/v1/admin/store/products/{$id}", [
            'specifications' => ['PoE' => 'No'],
            'variations' => [['name' => '24-port', 'options' => ['Ports' => '24 ports'], 'stock' => 2]],
        ])->assertOk();

        $this->assertSame(
            ['poe=no', 'ports=24 ports'],
            DB::table('store_product_specs')->where('store_product_id', $id)->orderBy('label_key')
                ->get()->map(fn ($r) => $r->label_key.'='.$r->value_key)->all(),
        );
    }

    public function test_or_within_a_label_and_across_labels(): void
    {
        $category = $this->category();
        $this->product($category, 'a', ['Ports' => '24 ports', 'PoE' => 'Yes']);
        $this->product($category, 'b', ['Ports' => '48 ports', 'PoE' => 'No']);
        $this->product($category, 'c', ['Ports' => '8 ports', 'PoE' => 'Yes']);
        $this->product($category, 'd', ['Ports' => '48 ports', 'PoE' => 'Yes']);

        $this->assertSame(['a', 'b', 'd'], $this->slugs('spec[Ports][]=24 ports&spec[Ports][]=48 ports'));
        $this->assertSame(['a', 'd'], $this->slugs('spec[Ports][]=24 ports&spec[Ports][]=48 ports&spec[PoE][]=yes'));
        // Matched on the keys: case and spacing an editor typed never decide it.
        $this->assertSame(['b', 'd'], $this->slugs('spec[ports][]=48%20%20PORTS'));
    }

    public function test_a_label_nothing_carries_is_ignored_rather_than_emptying_the_page(): void
    {
        $category = $this->category();
        $this->product($category, 'a', ['Ports' => '24 ports']);
        $this->product($category, 'b', ['Ports' => '48 ports']);

        $this->assertSame(['a', 'b'], $this->slugs('spec[Colour][]=red'));
        $this->assertSame(['a'], $this->slugs('spec[Colour][]=red&spec[Ports][]=24 ports'));
        // A value nothing carries under a known label is a real filter.
        $this->assertSame([], $this->slugs('spec[Ports][]=96 ports'));
        // Garbage is not a filter at all.
        $this->assertSame(['a', 'b'], $this->slugs('spec=ports'));
    }

    public function test_facets_count_each_label_under_the_other_selections_in_a_natural_order(): void
    {
        $category = $this->category(['filter_specs' => ['Ports', 'PoE', 'Nothing carries this']]);
        $this->product($category, 'a', ['Ports' => '24 ports', 'PoE' => 'Yes']);
        $this->product($category, 'b', ['Ports' => '48 ports', 'PoE' => 'No']);
        $this->product($category, 'c', ['Ports' => '8 ports', 'PoE' => 'Yes']);
        $this->product($category, 'd', ['Ports' => '48 ports', 'PoE' => 'Yes']);
        $this->product($category, 'draft', ['Ports' => '96 ports', 'PoE' => 'Yes'], ['status' => 'draft']);

        $facets = $this->getJson('/api/v1/store/categories/switches/facets')->assertOk()->json('data');

        $this->assertSame(['Ports', 'PoE'], array_column($facets, 'label'));
        // "8" before "24" before "48", and the draft's 96 is nowhere.
        $this->assertSame(['8 ports', '24 ports', '48 ports'], array_column($facets[0]['values'], 'value'));
        $this->assertSame([1, 1, 2], array_column($facets[0]['values'], 'count'));

        $filtered = $this->getJson('/api/v1/store/categories/switches/facets?spec[PoE][]=no&spec[Ports][]=24 ports')
            ->assertOk()->json();
        $this->assertTrue($filtered['meta']['filtered']);

        [$ports, $poe] = $filtered['data'];
        // Ports counted under PoE=No alone: only the 48-port "b". The ticked
        // 24 ports stays at zero so it can be unticked.
        $this->assertSame(['24 ports' => 0, '48 ports' => 1], array_column($ports['values'], 'count', 'value'));
        $this->assertTrue($ports['values'][0]['selected']);
        // PoE counted under Ports=24 alone: "a", which is Yes.
        $this->assertSame(['No' => 0, 'Yes' => 1], array_column($poe['values'], 'count', 'value'));
    }

    public function test_the_unfiltered_facets_are_cached_and_a_changed_sheet_moves_them(): void
    {
        $category = $this->category(['filter_specs' => ['Ports']]);
        $product = $this->product($category, 'a', ['Ports' => '24 ports']);

        $this->assertSame(['24 ports'], array_column($this->getJson('/api/v1/store/categories/switches/facets')->json('data.0.values'), 'value'));

        $product->update(['specifications' => ['Ports' => '48 ports']]);

        $this->assertSame(['48 ports'], array_column($this->getJson('/api/v1/store/categories/switches/facets')->json('data.0.values'), 'value'));
    }

    public function test_a_category_without_filters_answers_an_empty_list_and_an_inactive_one_404s(): void
    {
        $this->category();
        $this->getJson('/api/v1/store/categories/switches/facets')->assertOk()->assertExactJson([
            'data' => [], 'meta' => ['category' => 'switches', 'filtered' => false],
        ]);

        $this->category(['slug' => 'hidden', 'name' => 'Hidden', 'is_active' => false]);
        $this->getJson('/api/v1/store/categories/hidden/facets')->assertNotFound();
    }

    public function test_filter_labels_must_be_carried_by_the_categorys_products(): void
    {
        $category = $this->category();
        $this->product($category, 'a', ['Ports' => '24 ports', 'PoE' => 'Yes']);
        $manager = $this->manager();

        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/admin/store/categories/{$category->id}", ['filter_specs' => ['Ports', 'Colour']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['filter_specs.1'])
            ->assertJsonMissingValidationErrors(['filter_specs.0']);

        $this->patchJson("/api/v1/admin/store/categories/{$category->id}", ['filter_specs' => ['Ports', 'ports']])
            ->assertStatus(422)->assertJsonValidationErrors(['filter_specs.1']);

        $saved = $this->patchJson("/api/v1/admin/store/categories/{$category->id}", ['filter_specs' => ['PoE', ' Ports ']])
            ->assertOk()->json('data');
        $this->assertSame(['PoE', 'Ports'], $saved['filter_specs']);
        $this->assertSame(['PoE', 'Ports'], array_column(array_filter($saved['spec_labels'], fn ($l) => $l['chosen']), 'label'));

        // A new category has no products, so it can offer no filter yet.
        $this->postJson('/api/v1/admin/store/categories', ['name' => 'Routers', 'filter_specs' => ['Ports']])
            ->assertStatus(422)->assertJsonValidationErrors(['filter_specs.0']);

        // A saved filter whose last product lost the label does not block an
        // unrelated edit.
        StoreProduct::sole()->update(['specifications' => ['Ports' => '24 ports']]);
        $this->patchJson("/api/v1/admin/store/categories/{$category->id}", ['filter_specs' => ['PoE', 'Ports'], 'description' => 'Managed and unmanaged.'])
            ->assertOk();

        // And the public category says which filters it offers.
        $this->getJson('/api/v1/store/categories/switches')->assertOk()->assertJsonPath('data.filter_specs', ['PoE', 'Ports']);
    }

    public function test_the_rebuild_command_fills_the_index_for_rows_written_around_the_models(): void
    {
        $category = $this->category();
        $product = $this->product($category, 'a', ['Ports' => '24 ports']);
        DB::table('store_product_specs')->delete();

        $this->artisan('technoware:rebuild-store-specs')->assertSuccessful();

        $this->assertSame(1, DB::table('store_product_specs')->where('store_product_id', $product->id)->count());
    }

    public function test_the_natural_order_reads_numbers_as_numbers(): void
    {
        $values = ['1.5 GHz', '1,000 Mbps', '1.25 GHz', 'Fanless', '100 Mbps', 'active'];
        usort($values, SpecFilter::compare(...));

        $this->assertSame(['1.25 GHz', '1.5 GHz', '100 Mbps', '1,000 Mbps', 'active', 'Fanless'], $values);
        $this->assertSame('24 ports', SpecIndex::key("  24 \t PORTS "));
    }
}
