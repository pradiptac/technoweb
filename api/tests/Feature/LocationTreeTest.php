<?php

namespace Tests\Feature;

use App\Enums\LandingPageKind;
use App\Enums\LocationLevel;
use App\Enums\Role as RoleEnum;
use App\Models\LandingPage;
use App\Models\Location;
use App\Models\Role;
use App\Models\Service;
use App\Models\User;
use App\Support\LandingPageOpportunities;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Places as a tree, and the work that is actually done in them.
 *
 * Two things being pinned here. The tree has to stay a tree — a cycle is not
 * merely invalid, it is *invisible*, because every node in the loop still
 * resolves and is simply unreachable from a root, so a branch vanishes from the
 * navigation with nothing reporting an error.
 *
 * And a "<service> in <place>" page has to rest on somebody having said the
 * work is done there. That replaced a heuristic — the generator used to pair
 * every place with the first two published services — and the difference is the
 * difference between a tool and a doorway-page mill: an arbitrary pairing is
 * one an editor has to invent copy for, which is the shortest path there is to
 * a template with a noun substituted in.
 */
class LocationTreeTest extends TestCase
{
    use RefreshDatabase;

    private ?User $seoManager = null;

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

    /** One node, named and placed. */
    private function place(string $name, LocationLevel $level, ?Location $parent = null): Location
    {
        return Location::create([
            'name' => $name,
            'slug' => Str::slug($name),
            'level' => $level,
            'parent_id' => $parent?->id,
        ]);
    }

    /** India → West Bengal → Kolkata → Salt Lake, exactly the brief's example. */
    private function tree(): array
    {
        $india = Location::create(['name' => 'India', 'slug' => 'india', 'level' => LocationLevel::Country]);
        $wb = Location::create([
            'name' => 'West Bengal', 'slug' => 'west-bengal',
            'level' => LocationLevel::State, 'parent_id' => $india->id,
        ]);
        $kolkata = Location::create([
            'name' => 'Kolkata', 'slug' => 'kolkata', 'level' => LocationLevel::City,
            'parent_id' => $wb->id, 'response_time' => 'Same-day on site, weekdays',
        ]);
        $saltLake = Location::create([
            'name' => 'Salt Lake', 'slug' => 'salt-lake', 'level' => LocationLevel::Area,
            'parent_id' => $kolkata->id,
        ]);

        return [$india, $wb, $kolkata, $saltLake];
    }

    /* ------------------------------------------------------------ the tree */

    public function test_a_place_knows_where_it_sits(): void
    {
        [, $wb, $kolkata, $saltLake] = $this->tree();

        $this->assertSame('Salt Lake, Kolkata, West Bengal', $saltLake->fullName());
        // The country is left out on purpose — nobody says "Kolkata, West
        // Bengal, India" to another person in the same country.
        $this->assertStringNotContainsString('India', $saltLake->fullName());

        $this->assertSame($wb->id, $saltLake->stateAncestor()?->id, 'the state is the nearest state ancestor, not the parent');
        $this->assertSame($wb->id, $kolkata->stateAncestor()?->id);
    }

    public function test_a_state_can_roll_up_everything_under_it(): void
    {
        [, $wb] = $this->tree();

        $this->assertEqualsCanonicalizing(
            ['West Bengal', 'Kolkata', 'Salt Lake'],
            $wb->selfAndDescendants()->pluck('name')->all(),
        );
    }

    /**
     * A loop would still resolve from inside itself.
     *
     * The reason this is refused in validation rather than left to good sense:
     * nothing about a cycle throws. Every node still loads, still renders, and
     * is simply unreachable from a root — so a whole branch disappears from the
     * site and the only symptom is that somebody eventually notices.
     */
    public function test_a_place_cannot_be_put_inside_itself(): void
    {
        [, $wb, $kolkata] = $this->tree();

        $this->assertTrue($wb->wouldCycle($kolkata->id), 'a parent cannot be moved under its own child');
        $this->assertTrue($kolkata->wouldCycle($kolkata->id));
        $this->assertFalse($kolkata->wouldCycle($wb->id));

        $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/locations/{$wb->id}", ['parent_id' => $kolkata->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
    }

    public function test_a_broader_place_cannot_sit_inside_a_narrower_one(): void
    {
        [, , $kolkata] = $this->tree();

        $this->actingAs($this->seoManager(), 'sanctum')
            ->postJson('/api/v1/admin/locations', [
                'name' => 'Bihar', 'slug' => 'bihar',
                'level' => 'state', 'parent_id' => $kolkata->id,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('level');
    }

    /**
     * A city directly under a country is ordinary, not an error.
     *
     * Plenty of places have no meaningful state, and forcing an invented
     * intermediate row to satisfy a rule produces a page about a region nobody
     * would ever search for.
     */
    public function test_a_level_may_be_skipped(): void
    {
        $india = Location::create(['name' => 'India', 'slug' => 'india', 'level' => LocationLevel::Country]);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->postJson('/api/v1/admin/locations', [
                'name' => 'Chennai', 'slug' => 'chennai', 'level' => 'city', 'parent_id' => $india->id,
            ])
            ->assertCreated();
    }

    public function test_a_place_with_children_cannot_be_deleted(): void
    {
        [, , $kolkata] = $this->tree();

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->deleteJson("/api/v1/admin/locations/{$kolkata->id}")
            ->assertStatus(422);

        // Named, not just counted: "1 place sits inside this" leaves somebody
        // hunting for which.
        $this->assertStringContainsString('Salt Lake', $response->json('message'));
        $this->assertDatabaseHas('locations', ['id' => $kolkata->id]);
    }

    /**
     * A parent always arrives before its children.
     *
     * `level` is a string column, so `orderBy('level')` sorts it alphabetically
     * — area, city, country, state — which is very nearly the reverse of what
     * the console needs and looks plausible enough in a three-row list to
     * survive review. It did: Salt Lake came out above the Kolkata it belongs
     * to, so a list rendering the nesting would meet a child with no parent yet
     * on screen.
     */
    public function test_places_are_listed_broadest_first(): void
    {
        $this->tree();

        $names = collect(
            $this->actingAs($this->seoManager(), 'sanctum')
                ->getJson('/api/v1/admin/locations')
                ->assertOk()
                ->json('data')
        )->pluck('name')->all();

        $this->assertSame(['India', 'West Bengal', 'Kolkata', 'Salt Lake'], $names);
    }

    /**
     * The public index survives a place with a derived state.
     *
     * `state` is not an attribute — it is walked from the tree — and a public
     * method named `state()` on an Eloquent model is a trap: `$location->state`
     * routes through `getAttribute`, finds the method and throws "must return a
     * relationship instance". It did, on this endpoint, and the frontend's own
     * graceful degradation hid it: `/locations` caught the failure and rendered
     * its empty state, so a 500 looked like "nothing published yet". The audit
     * passed the page too, because an empty state is a valid page.
     *
     * Hence a test at the endpoint rather than trust in the method name.
     */
    public function test_the_public_index_reports_a_derived_state(): void
    {
        $this->seed(SettingsSeeder::class);
        [, , $kolkata] = $this->tree();

        LandingPage::create([
            'kind' => LandingPageKind::Location, 'location_id' => $kolkata->id,
            'title' => 'IT Infrastructure Support in Kolkata',
            'heading' => 'What we do in Kolkata',
            'status' => 'published', 'published_at' => now(),
        ]);

        $this->getJson('/api/v1/landing-pages?kind=location')
            ->assertOk()
            ->assertJsonPath('data.0.location.name', 'Kolkata')
            ->assertJsonPath('data.0.location.state', 'West Bengal');
    }

    /* --------------------------------------------- what is done where */

    public function test_a_service_page_needs_the_service_to_be_offered_there(): void
    {
        $this->seed(SettingsSeeder::class);
        [, , $kolkata] = $this->tree();

        $service = Service::create([
            'title' => 'Network Installation', 'slug' => 'network-installation', 'status' => 'published',
        ]);

        $page = LandingPage::create([
            'kind' => LandingPageKind::ServiceLocation,
            'location_id' => $kolkata->id, 'service_id' => $service->id,
            'title' => 'Network Installation in Kolkata',
            'heading' => 'Network installation in Kolkata',
            'intro' => '<p>Most of our Kolkata installation work is in older buildings where the risers are '
                .'already full, so a survey comes before a quote rather than after it. We run our own cabling '
                .'crew here, which is why a floor can usually be done over a single weekend rather than in '
                .'evenings spread across a fortnight.</p>',
            'status' => 'draft',
        ]);

        // Nobody has said this service is offered there.
        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$page->id}", ['status' => 'published'])
            ->assertStatus(422);

        $this->assertStringContainsString(
            'not on the list of work you do in Kolkata',
            implode(' ', $response->json('errors.status')),
        );

        // Say that you do it there, and the same page is fine.
        $kolkata->services()->attach($service->id);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$page->id}", ['status' => 'published'])
            ->assertOk();
    }

    /**
     * The generator proposes only pairings somebody stated.
     *
     * Before the pivot existed this returned the first two published services
     * against every place, whether or not anybody worked there — the arbitrary
     * combination an editor then had to invent copy for.
     */
    public function test_only_declared_pairings_are_proposed(): void
    {
        [, , $kolkata] = $this->tree();

        $offered = Service::create(['title' => 'Network Installation', 'slug' => 'network-installation', 'status' => 'published']);
        // Published, and deliberately not offered in Kolkata.
        Service::create(['title' => 'Web Hosting', 'slug' => 'web-hosting', 'status' => 'published']);

        $kolkata->services()->attach($offered->id);

        $proposed = collect(LandingPageOpportunities::find())->where('kind', 'service_location');

        $this->assertCount(1, $proposed);
        $this->assertSame('/locations/kolkata/network-installation', $proposed->first()['path']);
    }

    public function test_a_place_with_nothing_recorded_is_still_not_offered(): void
    {
        [, $wb] = $this->tree();   // West Bengal has no local detail of its own

        $service = Service::create(['title' => 'Network Installation', 'slug' => 'network-installation', 'status' => 'published']);
        $wb->services()->attach($service->id);

        $paths = collect(LandingPageOpportunities::find())->pluck('path');

        $this->assertNotContains('/locations/west-bengal', $paths);
        $this->assertNotContains('/locations/west-bengal/network-installation', $paths);
        $this->assertStringContainsString('West Bengal', implode(' ', LandingPageOpportunities::skippedLocations()));
    }

    /**
     * A state does not borrow its cities' substance.
     *
     * Kolkata has a response time and West Bengal does not, and West Bengal is
     * still refused. Inheriting would move the template problem up a level
     * rather than solve it: a state page assembled from its cities' facts says
     * nothing about the state.
     */
    public function test_substance_is_not_inherited_from_a_child(): void
    {
        $this->seed(SettingsSeeder::class);
        [, $wb, $kolkata] = $this->tree();

        $this->assertTrue($kolkata->hasLocalSubstance());
        $this->assertFalse($wb->hasLocalSubstance());

        $page = LandingPage::create([
            'kind' => LandingPageKind::Location, 'location_id' => $wb->id,
            'title' => 'IT Support across West Bengal', 'heading' => 'What we do across West Bengal',
            'intro' => '<p>We cover the state from two bases, which between them put an engineer within a '
                .'three-hour drive of most industrial districts. Work outside the metro is scheduled rather '
                .'than on call, and we say so up front because pretending otherwise is how support contracts '
                .'go wrong in the first year.</p>',
            'status' => 'draft',
        ]);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/landing-pages/{$page->id}", ['status' => 'published'])
            ->assertStatus(422);
    }

    public function test_the_cap_on_proposals_per_place_is_reported_rather_than_silent(): void
    {
        [, , $kolkata] = $this->tree();

        foreach (range(1, 6) as $i) {
            $service = Service::create(['title' => "Service {$i}", 'slug' => "service-{$i}", 'status' => 'published']);
            $kolkata->services()->attach($service->id);
        }

        $proposed = collect(LandingPageOpportunities::find())->where('kind', 'service_location');

        $this->assertCount(LandingPageOpportunities::LOCATION_SUGGESTIONS, $proposed);
        // A cap nobody is told about is indistinguishable from a bug.
        $this->assertSame(
            6 - LandingPageOpportunities::LOCATION_SUGGESTIONS,
            LandingPageOpportunities::heldBack()['Kolkata'] ?? 0,
        );
    }

    /* ------------------------------------------- the tree under a partial edit */

    /**
     * A level-only edit is still checked against the parent already on the row.
     *
     * The hole this closes: the check used to return early unless the request
     * carried `parent_id`, so a PATCH sending nothing but `level` skipped it
     * entirely. Promoting a city that sits inside a state to `country` left a
     * tree contradicting its own declared hierarchy, with every page under it
     * still resolving — the invisible kind of break, again.
     */
    public function test_a_level_only_edit_cannot_contradict_the_stored_parent(): void
    {
        $state = $this->place('West Bengal', LocationLevel::State);
        $city = $this->place('Kolkata', LocationLevel::City, $state);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/locations/{$city->id}", ['level' => 'country'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('level');

        $this->assertSame(LocationLevel::City, $city->fresh()->level);
    }

    /**
     * A parent-only edit is checked against the level already on the row.
     *
     * The mirror image, and it was open for the same reason: the level was
     * read from the request with the stored value as a fallback, but the whole
     * block was skipped when `parent_id` was absent — so the two halves were
     * never both effective at once.
     */
    public function test_a_parent_only_edit_cannot_contradict_the_stored_level(): void
    {
        $state = $this->place('West Bengal', LocationLevel::State);
        $area = $this->place('Salt Lake', LocationLevel::Area);
        $city = $this->place('Kolkata', LocationLevel::City, $state);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/locations/{$city->id}", ['parent_id' => $area->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');

        $this->assertSame($state->id, $city->fresh()->parent_id);
    }

    /**
     * Widening a node breaks the rows beneath it, not itself.
     *
     * Turning a state into an area leaves its cities inside something narrower
     * than they are. Every check that only reads the record being edited says
     * this request is fine, because nothing on that row is wrong.
     */
    public function test_a_level_change_that_would_strand_a_child_is_refused(): void
    {
        $state = $this->place('West Bengal', LocationLevel::State);
        $this->place('Kolkata', LocationLevel::City, $state);

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/locations/{$state->id}", ['level' => 'area'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('level');

        // Named, not merely refused: "something went wrong" on a tree edit is
        // an editor clicking the same button again.
        $this->assertStringContainsString('Kolkata', $response->json('errors.level.0'));
        $this->assertSame(LocationLevel::State, $state->fresh()->level);
    }

    /** Narrowing a leaf is ordinary and must stay possible. */
    public function test_a_level_change_with_nothing_underneath_is_allowed(): void
    {
        $state = $this->place('West Bengal', LocationLevel::State);
        $city = $this->place('Kolkata', LocationLevel::City, $state);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/locations/{$city->id}", ['level' => 'area'])
            ->assertOk();

        $this->assertSame(LocationLevel::Area, $city->fresh()->level);
    }

    /** An edit touching neither field is not made to answer for the tree. */
    public function test_an_edit_that_touches_neither_field_is_untroubled(): void
    {
        $state = $this->place('West Bengal', LocationLevel::State);
        $city = $this->place('Kolkata', LocationLevel::City, $state);

        $this->actingAs($this->seoManager(), 'sanctum')
            ->patchJson("/api/v1/admin/locations/{$city->id}", ['response_time' => 'Same day, most of the metro'])
            ->assertOk();

        $this->assertSame('Same day, most of the metro', $city->fresh()->response_time);
    }
}
