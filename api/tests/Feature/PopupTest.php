<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Popup;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A picture over a page, and which pages it lands on.
 *
 * The part worth testing is the **targeting**: a popup that appears on the
 * wrong page is a promotion in front of somebody at the checkout, and a popup
 * that appears nowhere is an afternoon spent wondering why. Everything else
 * here is ordinary CRUD.
 */
class PopupTest extends TestCase
{
    use RefreshDatabase;

    private ?User $contentManager = null;

    /**
     * `firstOrCreate` on the role, not a lookup.
     *
     * `RefreshDatabase` re-migrates and does not seed, so `roles` is empty —
     * a `where('slug', …)` finds nothing, the user gets no role, and every
     * admin call answers 403 while the test reads as though it were about
     * something else. `LandingPageTest` and `SeoAiTest` both build one this way.
     */
    private function contentManager(): User
    {
        if ($this->contentManager) {
            return $this->contentManager;
        }

        $user = User::create([
            'name' => 'Content', 'email' => 'content@technoware.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);

        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        return $this->contentManager = $user->load('roles');
    }

    private function popup(array $overrides = []): Popup
    {
        return Popup::create([
            'name' => 'Diwali offer',
            'status' => 'published',
            'image_path' => 'media/popups/offer.jpg',
            'sections' => ['home'],
            'paths' => [],
            ...$overrides,
        ]);
    }

    public function test_a_section_becomes_a_subtree_and_home_stays_exact(): void
    {
        // Ticking "Store" means the shop, including everything under it —
        // which is what anybody means by it.
        $this->assertSame(['/store/*'], $this->popup(['sections' => ['store']])->matchPatterns());

        /*
         * Home is the exception and must stay exact. `/` as a subtree is the
         * whole site, so ticking Home would silently mean everywhere — the one
         * mistake in this expansion nobody would notice until a popup turned up
         * over the checkout.
         */
        $this->assertSame(['/'], $this->popup(['sections' => ['home']])->matchPatterns());
    }

    public function test_sections_and_paths_are_merged_and_deduplicated(): void
    {
        $popup = $this->popup([
            'sections' => ['home', 'store'],
            'paths' => ['/solutions/networking', '/store/*'],
        ]);

        // `/store/*` arrives from both halves and appears once.
        $this->assertSame(['/', '/store/*', '/solutions/networking'], $popup->matchPatterns());
    }

    public function test_a_section_that_has_left_the_allowlist_is_dropped(): void
    {
        // Written straight to the column, the way a key stored before somebody
        // removed it from `SiteSection` would be. Dropped rather than rendered
        // as a pattern matching nothing — the rule a menu item whose record was
        // deleted already follows.
        $popup = $this->popup(['sections' => ['home', 'a_section_that_no_longer_exists']]);

        $this->assertSame(['/'], $popup->matchPatterns());
    }

    public function test_the_public_endpoint_shows_only_what_is_live(): void
    {
        $this->popup(['name' => 'Published']);
        $this->popup(['name' => 'Draft', 'status' => 'draft']);
        $this->popup(['name' => 'Not yet', 'starts_at' => now()->addDay()]);
        $this->popup(['name' => 'Over', 'ends_at' => now()->subDay()]);
        $this->popup(['name' => 'Open ended', 'starts_at' => now()->subDay(), 'ends_at' => null]);

        $rows = $this->getJson('/api/v1/popups')->assertOk()->json('data');

        $this->assertCount(2, $rows);
    }

    public function test_the_public_response_carries_patterns_and_never_section_keys(): void
    {
        $this->popup(['sections' => ['store']]);

        $row = $this->getJson('/api/v1/popups')->assertOk()->json('data.0');

        $this->assertSame(['/store/*'], $row['paths']);

        /*
         * `SiteSection` stays on this side of the wire. A second copy of that
         * allowlist in TypeScript is the drift `admin_path` and
         * `schema_type_options` were both caught by.
         */
        $this->assertArrayNotHasKey('sections', $row);

        // And the stored path never crosses either — the browser gets a URL.
        $this->assertArrayNotHasKey('image_path', $row);
        $this->assertStringContainsString('storage/media/popups/offer.jpg', $row['image']);
    }

    public function test_the_order_is_total_so_one_popup_can_be_chosen(): void
    {
        $second = $this->popup(['name' => 'Second', 'sort_order' => 5]);
        $first = $this->popup(['name' => 'First', 'sort_order' => 1]);
        // Two sharing an order are settled by id, because MySQL is free to
        // order equal rows differently between two reads.
        $tie = $this->popup(['name' => 'Tie', 'sort_order' => 1]);

        $ids = collect($this->getJson('/api/v1/popups')->assertOk()->json('data'))->pluck('id')->all();

        $this->assertSame([$first->id, $tie->id, $second->id], $ids);
    }

    public function test_the_image_dimensions_ride_along_when_the_library_knows_them(): void
    {
        Media::create([
            'path' => 'media/popups/offer.jpg', 'filename' => 'offer.jpg',
            'disk' => 'public', 'mime' => 'image/jpeg', 'size' => 1024,
            'width' => 1120, 'height' => 840,
        ]);

        $this->popup();

        $row = $this->getJson('/api/v1/popups')->assertOk()->json('data.0');

        // Without these the popup box has no ratio to reserve and jumps when
        // the image lands — the same triple the logo sends on `/settings`.
        $this->assertSame(1120, $row['image_width']);
        $this->assertSame(840, $row['image_height']);
    }

    public function test_a_popup_targeting_nothing_is_refused(): void
    {
        $this->actingAs($this->contentManager(), 'sanctum')
            ->postJson('/api/v1/admin/popups', [
                'name' => 'Nowhere',
                'image_path' => 'media/popups/offer.jpg',
                'sections' => [],
                'paths' => [],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('sections');
    }

    public function test_an_unknown_section_key_is_refused(): void
    {
        $this->actingAs($this->contentManager(), 'sanctum')
            ->postJson('/api/v1/admin/popups', [
                'name' => 'Bad target',
                'image_path' => 'media/popups/offer.jpg',
                'sections' => ['not_a_section'],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('sections.0');
    }

    public function test_a_window_that_ends_before_it_starts_is_refused(): void
    {
        // It would show never, and look exactly like one that is simply broken.
        $this->actingAs($this->contentManager(), 'sanctum')
            ->postJson('/api/v1/admin/popups', [
                'name' => 'Backwards',
                'image_path' => 'media/popups/offer.jpg',
                'sections' => ['home'],
                'starts_at' => now()->addWeek()->toIso8601String(),
                'ends_at' => now()->toIso8601String(),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ends_at');
    }

    public function test_a_javascript_link_cannot_be_stored(): void
    {
        // It becomes an href on a live page, so it is held to the same shape a
        // menu's custom link is.
        $this->actingAs($this->contentManager(), 'sanctum')
            ->postJson('/api/v1/admin/popups', [
                'name' => 'Hostile',
                'image_path' => 'media/popups/offer.jpg',
                'sections' => ['home'],
                'link_url' => 'javascript:alert(1)',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('link_url');
    }

    public function test_a_created_popup_comes_back_wrapped_and_with_its_defaults(): void
    {
        $res = $this->actingAs($this->contentManager(), 'sanctum')
            ->postJson('/api/v1/admin/popups', [
                'name' => 'New offer',
                'image_path' => 'media/popups/offer.jpg',
                'sections' => ['home'],
            ])
            ->assertCreated();

        // `->response()` rather than `response()->json($resource)`, which drops
        // the `data` wrapper — that has shipped twice here already.
        $res->assertJsonPath('data.name', 'New offer');

        /*
         * The defaults are readable on a record created and serialised in one
         * breath, which is what `$attributes` on the model is for: a column
         * default only applies on the way back, so without it this is null and
         * the response says the popup has no size.
         */
        $res->assertJsonPath('data.size', 'medium');
        $res->assertJsonPath('data.frequency', 'session');
    }

    public function test_the_console_is_sent_the_lists_it_draws_its_controls_from(): void
    {
        $meta = $this->actingAs($this->contentManager(), 'sanctum')
            ->getJson('/api/v1/admin/popups')->assertOk()->json('meta');

        // Sent by the API rather than retyped in TypeScript.
        $this->assertNotEmpty($meta['sections']);
        $this->assertSame(['small', 'medium', 'large'], array_column($meta['sizes'], 'value'));
        $this->assertSame(['session', 'day', 'every'], array_column($meta['frequencies'], 'value'));
    }

    public function test_the_public_endpoint_is_open_and_an_empty_list_is_a_200(): void
    {
        // No popups is the ordinary state of this site. A 404 on the common
        // case would put an error in the log on every page render.
        $this->getJson('/api/v1/popups')->assertOk()->assertJsonPath('data', []);
    }
}
