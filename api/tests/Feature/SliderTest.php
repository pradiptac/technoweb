<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Enums\SlideCaptionPosition;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The slider's transition — how one slide gives way to the next.
 *
 * The default is the one thing that differs deliberately from the gallery's
 * own transition feature, which this was built to match: a gallery with no
 * transition previously had none at all, so defaulting every row to `fade`
 * was an upgrade nobody had to ask for. A slider's existing behaviour, before
 * this column existed, already *is* a slide — a real scrollable strip a
 * visitor can swipe or reach by keyboard with no JavaScript — so defaulting
 * anywhere else would silently change what every slider on every install
 * does, including the homepage hero, the moment the migration ran. That is
 * what `test_a_slider_slides_unless_it_is_told_otherwise` pins.
 */
class SliderTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            ['name' => 'Slider Tester', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if (! $user->roles()->count()) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => $role->value],
                ['name' => $role->label()],
            ));
        }

        return $user;
    }

    private function editor(): User
    {
        return $this->staff(RoleEnum::ContentManager, 'ed-sliders@example.test');
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Homepage hero',
            'status' => 'published',
            'slides' => [
                ['kind' => 'image', 'media_path' => 'media/a.jpg', 'heading' => 'One'],
                ['kind' => 'image', 'media_path' => 'media/b.jpg', 'heading' => 'Two'],
            ],
        ], $overrides);
    }

    public function test_a_slider_slides_unless_it_is_told_otherwise(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload())
            ->assertCreated();

        $this->getJson('/api/v1/sliders/homepage-hero')
            ->assertJsonPath('data.transition', 'slide');
    }

    public function test_a_transition_outside_the_enum_is_refused(): void
    {
        // Refused rather than falling back to the default, the rule
        // GalleryTransition already follows: this arrives from a form the
        // console drew from the same list, so a value outside it means the
        // two sides have drifted, and silently substituting the default would
        // hide that from whoever is looking at the saved record.
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload(['transition' => 'dissolve']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('transition');
    }

    public function test_each_transition_round_trips(): void
    {
        $editor = $this->editor();
        $id = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload())
            ->json('data.id');

        foreach (['fade', 'zoom', 'none', 'slide'] as $transition) {
            $this->actingAs($editor, 'sanctum')
                ->patchJson("/api/v1/admin/sliders/{$id}", ['transition' => $transition])
                ->assertOk()
                ->assertJsonPath('data.transition', $transition);
        }
    }

    public function test_the_console_is_told_the_options_rather_than_listing_them(): void
    {
        $editor = $this->editor();
        $id = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload())
            ->json('data.id');

        // On the index as well as the record, because the *new* slider screen
        // has no record to read them from — the same reason `/admin/menus/new`
        // fetches its index for `meta.locations`, and `GalleryController` does
        // the same for `meta.transitions`.
        foreach (['/api/v1/admin/sliders', "/api/v1/admin/sliders/{$id}"] as $url) {
            $response = $this->actingAs($editor, 'sanctum')->getJson($url)->assertOk();

            $values = array_column($response->json('meta.transitions'), 'value');
            $this->assertSame(['slide', 'fade', 'zoom', 'none'], $values, $url);

            $this->assertNotEmpty($response->json('meta.transitions.0.label'));
            $this->assertNotEmpty($response->json('meta.transitions.0.blurb'));
        }
    }

    public function test_the_transition_is_not_offered_publicly_as_a_list(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload())
            ->assertCreated();

        // The page needs to know which transition to run; it has no use for
        // the menu of them, and a public endpoint should not carry the
        // console's vocabulary — the rule GalleryController's public read
        // already follows.
        $response = $this->getJson('/api/v1/sliders/homepage-hero')->assertOk();
        $this->assertNotNull($response->json('data.transition'));
        $this->assertNull($response->json('meta.transitions'));
    }

    /** A slider with no slides is 404 regardless of what its transition is. */
    public function test_an_empty_slider_is_still_404_whatever_its_transition(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload(['transition' => 'zoom', 'slides' => []]))
            ->assertCreated();

        $this->getJson('/api/v1/sliders/homepage-hero')->assertNotFound();
    }

    /**
     * The nine anchors are **per slide**, which is the whole point of them.
     *
     * A carousel is one photograph with its subject on the left followed by
     * another with its subject on the right; one position for the whole
     * slider puts the words over somebody's face on every other slide. This
     * writes three different anchors in one payload and reads three different
     * anchors back, which a slider-level setting could not do.
     */
    public function test_each_slide_keeps_its_own_caption_position(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload([
                'slides' => [
                    ['kind' => 'image', 'media_path' => 'media/a.jpg', 'caption_position' => 'top-right'],
                    ['kind' => 'image', 'media_path' => 'media/b.jpg', 'caption_position' => 'middle-centre'],
                    ['kind' => 'image', 'media_path' => 'media/c.jpg', 'caption_position' => 'bottom-left'],
                ],
            ]))
            ->assertCreated();

        $positions = $this->getJson('/api/v1/sliders/homepage-hero')
            ->assertOk()
            ->json('data.slides.*.caption_position');

        $this->assertSame(['top-right', 'middle-centre', 'bottom-left'], $positions);
    }

    /** Every one of the nine round trips, not just the two the form defaults to. */
    public function test_every_caption_position_round_trips(): void
    {
        foreach (SlideCaptionPosition::cases() as $position) {
            $this->actingAs($this->editor(), 'sanctum')
                ->postJson('/api/v1/admin/sliders', $this->payload([
                    'name' => 'Anchor '.$position->value,
                    'slides' => [['kind' => 'image', 'media_path' => 'media/a.jpg', 'caption_position' => $position->value]],
                ]))
                ->assertCreated()
                ->assertJsonPath('data.slides.0.caption_position', $position->value);
        }
    }

    /**
     * Refused, not quietly corrected.
     *
     * The rule `transition` follows: this arrives from a select the console
     * drew from `meta.caption_positions`, so a value outside that list means
     * the two sides have drifted, and falling back to the default would hide
     * exactly the drift worth knowing about.
     */
    public function test_a_caption_position_outside_the_enum_is_refused(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload([
                'slides' => [['kind' => 'image', 'media_path' => 'media/a.jpg', 'caption_position' => 'over-there']],
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('slides.0.caption_position');
    }

    /**
     * A slide that says nothing about its anchor gets the one every existing
     * slide already renders at. A migration must not move the words on every
     * slider on every install the day it runs — the same reasoning the
     * transition defaults to `slide`.
     */
    public function test_a_slide_with_no_position_anchors_bottom_left(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.slides.0.caption_position', 'bottom-left');
    }

    /** The layout is the slider's, since it is the shape of the whole box. */
    public function test_the_layout_round_trips_and_defaults_to_full(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.layout', 'full');

        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload(['name' => 'Split one', 'layout' => 'split']))
            ->assertCreated()
            ->assertJsonPath('data.layout', 'split');
    }

    public function test_a_layout_outside_the_enum_is_refused(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload(['layout' => 'diagonal']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('layout');
    }

    /**
     * Both new lists are sent by the API rather than written out in
     * TypeScript, the rule `transitions`, `schema_type_options` and
     * `meta.locations` all follow: two hand-written copies of one list of
     * strings is the drift nothing type-checks across the wire.
     */
    public function test_the_console_is_told_the_layouts_and_the_anchors(): void
    {
        $response = $this->actingAs($this->editor(), 'sanctum')
            ->getJson('/api/v1/admin/sliders')
            ->assertOk();

        $this->assertSame(
            ['full', 'split'],
            array_column($response->json('meta.layouts'), 'value'),
        );
        $this->assertCount(9, $response->json('meta.caption_positions'));
    }
}
