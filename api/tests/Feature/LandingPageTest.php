<?php

namespace Tests\Feature;

use App\Enums\LandingPageKind;
use App\Enums\LocationLevel;
use App\Enums\Role as RoleEnum;
use App\Models\Brand;
use App\Models\LandingPage;
use App\Models\Location;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Role;
use App\Models\Service;
use App\Models\Setting;
use App\Models\User;
use App\Support\LandingPageOpportunities;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The rules that stop this module producing doorway pages.
 *
 * Every test here is about a *refusal*. The happy path — a page with evidence
 * behind it and an introduction somebody wrote goes live — is one test at the
 * end, because it is the easy half: anything can publish a page. What decides
 * whether this feature helps the site or costs it its ranking is what happens
 * to the four hundred pages that should not exist, and each of the ways one of
 * those can be reached has a test of its own.
 */
class LandingPageTest extends TestCase
{
    use RefreshDatabase;

    private ?User $seoManager = null;

    /**
     * Memoised: a test that acts as this role twice — publish is refused, fix
     * the cause, publish again — would otherwise create the account twice and
     * fail on the email unique index rather than on anything it was testing.
     */
    private function seoManager(): User
    {
        if ($this->seoManager) {
            return $this->seoManager;
        }

        $user = User::create([
            'name' => 'SEO', 'email' => 'seo@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::SeoManager->value],
            ['name' => RoleEnum::SeoManager->label()],
        ));

        return $this->seoManager = $user->load('roles');
    }

    private ?User $contentManager = null;

    private function contentManager(): User
    {
        if ($this->contentManager) {
            return $this->contentManager;
        }

        $user = User::create([
            'name' => 'Editor', 'email' => 'editor@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        return $this->contentManager = $user->load('roles');
    }

    /** A brand with `$count` published products in one category. */
    private function stockedBrand(int $count = 3): array
    {
        $brand = Brand::create(['name' => 'Cisco', 'slug' => 'cisco']);
        $category = ProductCategory::create(['name' => 'Network Switches', 'slug' => 'switches']);

        for ($i = 1; $i <= $count; $i++) {
            Product::create([
                'name' => "Catalyst {$i}", 'slug' => "catalyst-{$i}", 'sku' => "SKU{$i}",
                'brand_id' => $brand->id, 'product_category_id' => $category->id,
                'status' => 'published',
            ]);
        }

        return [$brand, $category];
    }

    private function draft(Brand $brand, ProductCategory $category, array $overrides = []): LandingPage
    {
        return LandingPage::create(array_merge([
            'kind' => LandingPageKind::BrandCategory,
            'brand_id' => $brand->id,
            'product_category_id' => $category->id,
            'title' => 'Cisco Network Switches',
            'heading' => 'Cisco network switches we supply and support',
            'status' => 'draft',
        ], $overrides));
    }

    /** Long enough to clear the word floor, specific enough to be real copy. */
    private function realIntro(string $subject = 'switching'): string
    {
        return "<p>We have fitted Cisco {$subject} in eleven buildings across the region in the last three years, "
            .'so the parts we hold on the van are the ones these sites actually fail on. '
            .'Every unit listed below is one an engineer here has configured, racked and handed over, '
            .'and the configuration templates we start from came out of those jobs rather than out of a datasheet.</p>';
    }

    /* ------------------------------------------------- the cross product */

    /**
     * The premise of the whole module, asserted as a number.
     *
     * A generator that enumerates brands against categories produces a page for
     * every cell whether or not anything is in it. This one asks the catalogue,
     * so a brand holding stock in one category yields exactly the pages that
     * category can support — and the eight empty cells beside it yield nothing.
     */
    public function test_only_combinations_the_catalogue_supports_are_proposed(): void
    {
        [$brand] = $this->stockedBrand(3);

        // Eight more categories with nothing in them: 9 cells, 1 justified.
        foreach (range(1, 8) as $i) {
            ProductCategory::create(['name' => "Empty {$i}", 'slug' => "empty-{$i}"]);
        }

        $found = collect(LandingPageOpportunities::find());

        $this->assertSame(9, ProductCategory::count());
        $this->assertSame(
            ['brand', 'brand_category'],
            $found->pluck('kind')->unique()->sort()->values()->all(),
            'only the stocked category and the brand itself should be proposed',
        );
        $this->assertSame(1, $found->where('kind', 'brand_category')->count());
        $this->assertSame($brand->id, $found->firstWhere('kind', 'brand_category')['brand_id']);
    }

    public function test_a_thin_intersection_is_not_proposed_at_all(): void
    {
        $this->stockedBrand(2);   // one short of the floor

        $this->assertSame(
            [],
            collect(LandingPageOpportunities::find())->where('kind', 'brand_category')->values()->all(),
        );
    }

    public function test_a_pair_that_already_has_a_page_is_not_proposed_again(): void
    {
        [$brand, $category] = $this->stockedBrand(3);
        $this->draft($brand, $category);

        $this->assertSame(
            [],
            collect(LandingPageOpportunities::find())->where('kind', 'brand_category')->values()->all(),
        );
    }

    /* ------------------------------------------------------- the refusals */

    public function test_publishing_without_a_written_intro_is_refused(): void
    {
        $this->seed(SettingsSeeder::class);
        [$brand, $category] = $this->stockedBrand(3);
        $page = $this->draft($brand, $category);

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$page->id}", ['status' => 'published'])
            ->assertStatus(422);

        $this->assertStringContainsString('Introduction', implode(' ', $response->json('errors.status')));
        $this->assertSame('draft', $page->fresh()->status->value);
    }

    public function test_publishing_a_thin_combination_is_refused(): void
    {
        $this->seed(SettingsSeeder::class);
        [$brand, $category] = $this->stockedBrand(2);
        $page = $this->draft($brand, $category, ['intro' => $this->realIntro()]);

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$page->id}", ['status' => 'published'])
            ->assertStatus(422);

        $this->assertStringContainsString('Evidence', implode(' ', $response->json('errors.status')));
    }

    /**
     * The one that matters.
     *
     * Everything else in this class can be satisfied by a determined person
     * with a template: give the second page evidence, four hundred words and
     * its own title and it passes every other check while being the first page
     * with a noun changed. A hundred of those is what a manual action is for.
     */
    public function test_a_second_page_written_from_the_first_is_refused(): void
    {
        $this->seed(SettingsSeeder::class);
        [$brand, $category] = $this->stockedBrand(3);

        $original = $this->draft($brand, $category, [
            'intro' => $this->realIntro('switching'),
            'status' => 'published', 'published_at' => now(),
        ]);

        $second = ProductCategory::create(['name' => 'Firewalls', 'slug' => 'firewalls']);
        foreach (range(1, 3) as $i) {
            Product::create([
                'name' => "Firepower {$i}", 'slug' => "firepower-{$i}", 'sku' => "FW{$i}",
                'brand_id' => $brand->id, 'product_category_id' => $second->id, 'status' => 'published',
            ]);
        }

        $copy = LandingPage::create([
            'kind' => LandingPageKind::BrandCategory,
            'brand_id' => $brand->id, 'product_category_id' => $second->id,
            'title' => 'Cisco Firewalls', 'heading' => 'Cisco firewalls',
            // The template, with the one word changed.
            'intro' => $this->realIntro('firewalls'),
            'status' => 'draft',
        ]);

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$copy->id}", ['status' => 'published'])
            ->assertStatus(422);

        $said = implode(' ', $response->json('errors.status'));
        $this->assertStringContainsString('Written separately', $said);
        $this->assertStringContainsString($original->title, $said, 'it must name the page being duplicated');
    }

    public function test_the_same_page_written_separately_is_allowed(): void
    {
        $this->seed(SettingsSeeder::class);
        [$brand, $category] = $this->stockedBrand(3);

        $this->draft($brand, $category, [
            'intro' => $this->realIntro('switching'),
            'status' => 'published', 'published_at' => now(),
        ]);

        $second = ProductCategory::create(['name' => 'Firewalls', 'slug' => 'firewalls']);
        foreach (range(1, 3) as $i) {
            Product::create([
                'name' => "Firepower {$i}", 'slug' => "firepower-{$i}", 'sku' => "FW{$i}",
                'brand_id' => $brand->id, 'product_category_id' => $second->id, 'status' => 'published',
            ]);
        }

        $fresh = LandingPage::create([
            'kind' => LandingPageKind::BrandCategory,
            'brand_id' => $brand->id, 'product_category_id' => $second->id,
            'title' => 'Cisco Firewalls', 'heading' => 'Cisco firewalls',
            'intro' => '<p>Firewall work is mostly policy rather than hardware: the box takes an afternoon and '
                .'the rule set takes a fortnight of watching what actually crosses it. What we fit here is sized '
                .'for inspection throughput with TLS on, which is the number vendors quote least often and the one '
                .'that decides whether the thing is still usable in three years.</p>',
            'status' => 'draft',
        ]);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$fresh->id}", ['status' => 'published'])
            ->assertOk();

        $this->assertSame('published', $fresh->fresh()->status->value);
    }

    public function test_the_published_cap_refuses_the_next_one(): void
    {
        $this->seed(SettingsSeeder::class);
        Setting::put('landing_page_cap', '1');

        [$brand, $category] = $this->stockedBrand(3);
        $this->draft($brand, $category, [
            'intro' => $this->realIntro('switching'), 'status' => 'published', 'published_at' => now(),
        ]);

        $second = ProductCategory::create(['name' => 'Firewalls', 'slug' => 'firewalls']);
        foreach (range(1, 3) as $i) {
            Product::create([
                'name' => "Firepower {$i}", 'slug' => "firepower-{$i}", 'sku' => "FW{$i}",
                'brand_id' => $brand->id, 'product_category_id' => $second->id, 'status' => 'published',
            ]);
        }

        $next = LandingPage::create([
            'kind' => LandingPageKind::BrandCategory,
            'brand_id' => $brand->id, 'product_category_id' => $second->id,
            'title' => 'Cisco Firewalls', 'heading' => 'Cisco firewalls',
            'intro' => '<p>Firewall work is mostly policy rather than hardware: the box takes an afternoon and '
                .'the rule set takes a fortnight of watching what actually crosses it. What we fit here is sized '
                .'for inspection throughput with TLS on, which is the number vendors quote least often.</p>',
            'status' => 'draft',
        ]);

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$next->id}", ['status' => 'published'])
            ->assertStatus(422);

        $this->assertStringContainsString('limit', implode(' ', $response->json('errors.status')));
    }

    /* ---------------------------------------------------------- locations */

    /**
     * A city nobody has written anything about cannot be claimed.
     *
     * The location half of this feature is the half that is not merely thin
     * when it goes wrong — it is a statement that engineers attend sites in a
     * place, made in order to rank for that place.
     */
    public function test_a_location_page_needs_local_detail_before_it_can_publish(): void
    {
        $this->seed(SettingsSeeder::class);
        $location = Location::create(['name' => 'Kolkata', 'slug' => 'kolkata', 'is_active' => true]);

        $page = LandingPage::create([
            'kind' => LandingPageKind::Location, 'location_id' => $location->id,
            'title' => 'IT Infrastructure Support in Kolkata',
            'heading' => 'What we do in Kolkata',
            'intro' => '<p>We look after networks in Kolkata for manufacturers and hospitals, which between them '
                .'account for most of what our engineers do in the city. The work is usually a mix of scheduled '
                .'maintenance and the occasional emergency, and both are handled by the same two people so nothing '
                .'has to be explained twice.</p>',
            'status' => 'draft',
        ]);

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$page->id}", ['status' => 'published'])
            ->assertStatus(422);

        $this->assertStringContainsString('Nothing is recorded about working in Kolkata', implode(' ', $response->json('errors.status')));

        // Record something true about the place, and the same page is fine.
        $location->update(['response_time' => 'Same-day on site, weekdays']);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$page->id}", ['status' => 'published'])
            ->assertOk();
    }

    public function test_a_location_with_nothing_recorded_is_not_offered_and_says_why(): void
    {
        Location::create(['name' => 'Kolkata', 'slug' => 'kolkata', 'is_active' => true]);

        $this->assertSame([], collect(LandingPageOpportunities::find())->where('kind', 'location')->values()->all());
        $this->assertStringContainsString('nothing recorded', LandingPageOpportunities::skippedLocations()[0]);
    }

    /* ------------------------------------------------------- the plumbing */

    public function test_a_draft_is_not_reachable_publicly(): void
    {
        [$brand, $category] = $this->stockedBrand(3);
        $page = $this->draft($brand, $category, ['intro' => $this->realIntro()]);

        $this->getJson('/api/v1/landing-pages/lookup?path='.urlencode($page->path))
            ->assertNotFound();
    }

    public function test_a_published_page_resolves_by_path_and_carries_its_products(): void
    {
        $this->seed(SettingsSeeder::class);
        [$brand, $category] = $this->stockedBrand(3);
        $page = $this->draft($brand, $category, [
            'intro' => $this->realIntro(), 'status' => 'published', 'published_at' => now(),
        ]);

        $this->assertSame('/brands/cisco/switches', $page->path);

        $this->getJson('/api/v1/landing-pages/lookup?path=/brands/cisco/switches')
            ->assertOk()
            ->assertJsonPath('data.title', 'Cisco Network Switches')
            // The reason the page is worth indexing at all.
            ->assertJsonCount(3, 'data.products');
    }

    /**
     * The URL follows what the page is about, and the old one keeps working.
     *
     * A landing page's path is built from records it does not own, so renaming
     * a brand moves it. Without the redirect that is a live URL turning into a
     * 404 because somebody fixed a typo on a different screen.
     */
    public function test_renaming_a_brand_moves_the_page_and_leaves_a_redirect(): void
    {
        [$brand, $category] = $this->stockedBrand(3);
        $page = $this->draft($brand, $category);

        $this->assertSame('/brands/cisco/switches', $page->path);

        // Nothing touches the page. That is the assertion: the first cut of
        // this test called `$page->touch()` here, which proved the model event
        // fired and proved nothing whatever about anything firing it. The path
        // stayed stale in production for every rename.
        $brand->update(['slug' => 'cisco-systems']);

        $this->assertSame('/brands/cisco-systems/switches', $page->fresh()->path);
        $this->assertDatabaseHas('redirects', [
            'from_path' => '/brands/cisco/switches',
            'to_path' => '/brands/cisco-systems/switches',
            'status_code' => 301,
        ]);
    }

    /**
     * The other half of a composed path, renamed through the API.
     *
     * A brand rename and a category rename move the same URL, and only one of
     * them was ever exercised. This one goes through the endpoint rather than
     * the model, because the bug was never in the model.
     */
    public function test_renaming_a_category_through_the_api_moves_the_page(): void
    {
        [$brand, $category] = $this->stockedBrand(3);
        $page = $this->draft($brand, $category);

        $this->actingAs($this->contentManager(), 'sanctum')
            ->patchJson("/api/v1/admin/product-categories/{$category->id}", ['slug' => 'ethernet-switches'])
            ->assertOk();

        $this->assertSame('/brands/cisco/ethernet-switches', $page->fresh()->path);
        $this->assertDatabaseHas('redirects', [
            'from_path' => '/brands/cisco/switches',
            'to_path' => '/brands/cisco/ethernet-switches',
            'status_code' => 301,
        ]);
    }

    /**
     * A place rename moves its own page and everything done there.
     *
     * Two pages off one rename, which is the case a per-page fix would have
     * got half right. `Location` does not use `Sluggable`, so there is no
     * second mechanism writing these redirects — if the trait does not, nothing
     * does.
     */
    public function test_renaming_a_location_moves_every_page_about_it(): void
    {
        $this->seed(SettingsSeeder::class);

        $location = Location::create([
            'name' => 'Kolkata', 'slug' => 'kolkata',
            'level' => LocationLevel::City, 'is_active' => true,
        ]);
        $service = Service::create(['title' => 'Firewall Installation', 'slug' => 'firewall-installation', 'status' => 'published']);
        $location->services()->attach($service->id);

        $place = LandingPage::create([
            'kind' => LandingPageKind::Location, 'location_id' => $location->id,
            'title' => 'Kolkata', 'heading' => 'Kolkata', 'status' => 'draft',
        ]);
        $offered = LandingPage::create([
            'kind' => LandingPageKind::ServiceLocation,
            'location_id' => $location->id, 'service_id' => $service->id,
            'title' => 'Firewall installation in Kolkata',
            'heading' => 'Firewall installation in Kolkata', 'status' => 'draft',
        ]);

        $this->assertSame('/locations/kolkata', $place->path);
        $this->assertSame('/locations/kolkata/firewall-installation', $offered->path);

        $location->update(['slug' => 'kolkata-wb']);

        $this->assertSame('/locations/kolkata-wb', $place->fresh()->path);
        $this->assertSame('/locations/kolkata-wb/firewall-installation', $offered->fresh()->path);
        $this->assertDatabaseHas('redirects', ['from_path' => '/locations/kolkata', 'to_path' => '/locations/kolkata-wb']);
        $this->assertDatabaseHas('redirects', [
            'from_path' => '/locations/kolkata/firewall-installation',
            'to_path' => '/locations/kolkata-wb/firewall-installation',
        ]);
    }

    /**
     * A rename that moves nothing writes nothing.
     *
     * The trait re-saves every page pointing at the record, so a change to a
     * field that is not part of any URL must not leave a redirect from a path
     * to itself — a row that would be a permanent loop for the proxy to follow.
     */
    public function test_renaming_something_a_page_is_not_composed_from_writes_no_redirect(): void
    {
        [$brand, $category] = $this->stockedBrand(3);
        $this->draft($brand, $category);

        $brand->update(['description' => 'Networking hardware.']);

        $this->assertDatabaseCount('redirects', 0);
    }

    public function test_a_location_in_use_cannot_be_deleted(): void
    {
        $this->seed(SettingsSeeder::class);
        $location = Location::create(['name' => 'Kolkata', 'slug' => 'kolkata', 'is_active' => true]);
        LandingPage::create([
            'kind' => LandingPageKind::Location, 'location_id' => $location->id,
            'title' => 'Kolkata', 'heading' => 'Kolkata', 'status' => 'draft',
        ]);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->deleteJson("/api/v1/admin/locations/{$location->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('locations', ['id' => $location->id]);
    }

    public function test_a_content_manager_cannot_reach_landing_pages(): void
    {
        $user = User::create([
            'name' => 'Editor', 'email' => 'editor@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        $this->actingAs($user->load('roles'), 'sanctum')
            ->getJson('/api/v1/admin/landing-pages')
            ->assertForbidden();
    }

    /**
     * A page published on create carries a date, like one published on update.
     *
     * The invariant lived only on the update path, so the endpoint that could
     * publish a page in a single request was the one that left the column
     * null. It is on the model now, which is why the second half of this test
     * — a page created straight from the model, as the seeder and the artisan
     * command do — holds as well.
     */
    public function test_publishing_on_create_stamps_the_date(): void
    {
        [$brand, $category] = $this->stockedBrand(3);

        $response = $this->actingAs($this->seoManager(), 'sanctum')->postJson('/api/v1/admin/landing-pages', [
            'kind' => LandingPageKind::BrandCategory->value,
            'brand_id' => $brand->id,
            'product_category_id' => $category->id,
            'title' => 'Cisco network switches, supplied and configured',
            'heading' => 'Cisco network switches we supply and support',
            'intro' => $this->realIntro(),
            'status' => 'published',
            'seo' => ['description' => 'Cisco switching we have fitted across the region, with the parts we hold and the configurations we start from.'],
        ]);

        $response->assertCreated();
        $this->assertNotNull(LandingPage::query()->latest('id')->first()->published_at);
    }

    public function test_a_page_published_outside_the_api_is_stamped_too(): void
    {
        [$brand, $category] = $this->stockedBrand(3);
        $page = $this->draft($brand, $category, ['status' => 'published']);

        $this->assertNotNull($page->published_at);
    }

    /** A draft has no publication date, and saving one must not invent one. */
    public function test_a_draft_is_not_stamped(): void
    {
        [$brand, $category] = $this->stockedBrand(3);

        $this->assertNull($this->draft($brand, $category)->published_at);
    }
}
