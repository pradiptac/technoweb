<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Gallery;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GalleryTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            ['name' => 'Gallery Tester', 'password' => 'password-for-tests', 'is_active' => true],
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
        return $this->staff(RoleEnum::ContentManager, 'gwen-galleries@example.test');
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Recent work',
            'subtitle' => 'A few of the sites we have handed over.',
            'status' => 'published',
            'groups' => [
                ['name' => 'Networking', 'slug' => 'networking'],
                ['name' => 'Surveillance', 'slug' => 'surveillance'],
            ],
            'items' => [
                ['media_path' => 'media/a.jpg', 'title' => 'Core switch', 'subtitle' => 'Salt Lake', 'group' => 'networking'],
                ['media_path' => 'media/b.jpg', 'title' => 'Camera run', 'subtitle' => 'Howrah', 'group' => 'surveillance'],
                ['media_path' => 'media/c.jpg', 'title' => 'Rack', 'subtitle' => null, 'group' => null],
            ],
        ], $overrides);
    }

    // ---------------------------------------------------------------- public

    public function test_a_published_gallery_is_returned_by_slug(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->assertCreated();

        $response = $this->getJson('/api/v1/galleries/recent-work')->assertOk();

        $response->assertJsonPath('data.name', 'Recent work');
        $response->assertJsonPath('data.subtitle', 'A few of the sites we have handed over.');
        $response->assertJsonCount(2, 'data.groups');
        $response->assertJsonCount(3, 'data.items');
    }

    public function test_an_item_carries_the_slug_of_its_group(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->assertCreated();

        $items = $this->getJson('/api/v1/galleries/recent-work')->json('data.items');

        $this->assertSame('networking', $items[0]['group']);
        $this->assertSame('surveillance', $items[1]['group']);
        // Ungrouped is a real answer, not a missing one: the item shows under
        // "All" and under no tab.
        $this->assertNull($items[2]['group']);
    }

    public function test_a_draft_gallery_is_not_public(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload(['status' => 'draft']))
            ->assertCreated();

        $this->getJson('/api/v1/galleries/recent-work')->assertNotFound();
    }

    public function test_a_gallery_with_no_items_is_a_404_rather_than_an_empty_success(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload(['items' => []]))
            ->assertCreated();

        // An empty 200 would put a tab strip with nothing under it into the
        // middle of somebody's article. The frontend's fallback is to render
        // nothing at all, and it needs to be told.
        $this->getJson('/api/v1/galleries/recent-work')->assertNotFound();
    }

    public function test_an_empty_tab_still_appears(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload([
                'items' => [['media_path' => 'media/a.jpg', 'group' => 'networking']],
            ]))
            ->assertCreated();

        // Different case from an empty gallery: a tab somebody made and has
        // not filled yet. Hiding it makes the console and the page disagree
        // about what exists.
        $this->getJson('/api/v1/galleries/recent-work')->assertJsonCount(2, 'data.groups');
    }

    // ----------------------------------------------------------------- admin

    public function test_the_created_record_comes_back_wrapped_in_data(): void
    {
        $response = $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->assertCreated();

        // `response()->json($resource)` drops the wrapper, so a created record
        // arrives shaped unlike every read of one — the bug menus and campaigns
        // each shipped once.
        $response->assertJsonPath('data.slug', 'recent-work');
    }

    public function test_a_slug_is_generated_and_made_unique(): void
    {
        $editor = $this->editor();

        $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload(['slug' => null]))
            ->assertCreated()
            ->assertJsonPath('data.slug', 'recent-work');

        $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload(['slug' => null, 'items' => [], 'groups' => []]))
            ->assertCreated()
            ->assertJsonPath('data.slug', 'recent-work-2');
    }

    public function test_grouping_survives_a_save(): void
    {
        $editor = $this->editor();

        $id = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->json('data.id');

        // The console resubmits the whole gallery. Groups are replaced
        // wholesale, so every group id is new — and the items have to land in
        // the right tabs anyway. This is the test that fails if the payload is
        // ever re-keyed on ids.
        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/galleries/{$id}", $this->payload())
            ->assertOk();

        $items = $this->getJson('/api/v1/galleries/recent-work')->json('data.items');

        $this->assertSame('networking', $items[0]['group']);
        $this->assertSame('surveillance', $items[1]['group']);
    }

    public function test_an_item_naming_a_group_that_does_not_exist_is_refused(): void
    {
        // Filed under a missing tab, an item is in the gallery, in the database
        // and on screen nowhere. Refused rather than quietly ungrouped.
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload([
                'items' => [['media_path' => 'media/a.jpg', 'group' => 'no-such-tab']],
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('items.0.group');
    }

    public function test_a_group_may_be_named_without_being_slugged(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload([
                'groups' => [['name' => 'Wi-Fi & wireless']],
                'items' => [['media_path' => 'media/a.jpg', 'group' => 'wi-fi-wireless']],
            ]))
            ->assertCreated();

        $this->assertSame('wi-fi-wireless', Gallery::first()->groups()->first()->slug);
    }

    public function test_items_are_replaced_wholesale_and_renumbered(): void
    {
        $editor = $this->editor();
        $id = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->json('data.id');

        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/galleries/{$id}", [
                'items' => [
                    ['media_path' => 'media/z.jpg', 'title' => 'Now first'],
                    ['media_path' => 'media/y.jpg', 'title' => 'Now second'],
                ],
            ])
            ->assertOk();

        $items = $this->getJson('/api/v1/galleries/recent-work')->json('data.items');

        $this->assertCount(2, $items);
        $this->assertSame('Now first', $items[0]['title']);
        // sort_order comes from the array's order, so moving a picture does not
        // also mean renumbering the ones around it.
        $this->assertSame([0, 1], Gallery::find($id)->items()->pluck('sort_order')->all());
    }

    public function test_omitting_the_keys_leaves_both_relations_alone(): void
    {
        $editor = $this->editor();
        $id = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->json('data.id');

        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/galleries/{$id}", ['name' => 'Renamed'])
            ->assertOk();

        $gallery = Gallery::find($id);
        $this->assertSame('Renamed', $gallery->name);
        $this->assertCount(3, $gallery->items);
        $this->assertCount(2, $gallery->groups);
    }

    public function test_sending_an_empty_array_clears_the_items(): void
    {
        $editor = $this->editor();
        $id = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->json('data.id');

        // Has to be possible, or the last picture could never be removed.
        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/galleries/{$id}", ['items' => []])
            ->assertOk();

        $this->assertCount(0, Gallery::find($id)->items);
    }

    public function test_deleting_a_tab_keeps_the_pictures_filed_under_it(): void
    {
        $editor = $this->editor();
        $id = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->json('data.id');

        // The tab goes, the photographs stay and fall back to ungrouped. Same
        // call `media.folder_id` makes: the label is cheap and the files are
        // not.
        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/galleries/{$id}", ['groups' => []])
            ->assertOk();

        $gallery = Gallery::find($id);
        $this->assertCount(0, $gallery->groups);
        $this->assertCount(3, $gallery->items);
        $this->assertNull($gallery->items->first()->gallery_group_id);
    }

    public function test_a_gallery_fades_unless_it_is_told_otherwise(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->assertCreated();

        // The default is the column's, so a gallery that predates the setting
        // gets the transition on the migration rather than needing an editor
        // to go and turn it on.
        $this->getJson('/api/v1/galleries/recent-work')
            ->assertJsonPath('data.transition', 'fade');
    }

    public function test_a_transition_outside_the_enum_is_refused(): void
    {
        // Refused rather than falling back to the default, unlike `?sort=`: a
        // sort parameter arrives mangled from an old bookmark, this arrives
        // from a form the console drew from this same list, so a value outside
        // it means the two sides have drifted and silence would hide that.
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload(['transition' => 'dissolve']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('transition');
    }

    public function test_each_transition_round_trips(): void
    {
        $editor = $this->editor();
        $id = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->json('data.id');

        foreach (['slide', 'zoom', 'none', 'fade'] as $transition) {
            $this->actingAs($editor, 'sanctum')
                ->patchJson("/api/v1/admin/galleries/{$id}", ['transition' => $transition])
                ->assertOk()
                ->assertJsonPath('data.transition', $transition);
        }
    }

    public function test_the_console_is_told_the_options_rather_than_listing_them(): void
    {
        $editor = $this->editor();
        $id = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->json('data.id');

        // On the index as well as the record, because the *new* gallery screen
        // has no record to read them from — the same reason `/admin/menus/new`
        // fetches its index for `meta.locations`.
        foreach (['/api/v1/admin/galleries', "/api/v1/admin/galleries/{$id}"] as $url) {
            $response = $this->actingAs($editor, 'sanctum')->getJson($url)->assertOk();

            $values = array_column($response->json('meta.transitions'), 'value');
            $this->assertSame(['fade', 'slide', 'zoom', 'none'], $values, $url);

            // Each carries the sentence the console shows beside it, so the
            // console never writes one of its own.
            $this->assertNotEmpty($response->json('meta.transitions.0.label'));
            $this->assertNotEmpty($response->json('meta.transitions.0.blurb'));
        }
    }

    public function test_the_transition_is_not_offered_publicly_as_a_list(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload())
            ->assertCreated();

        // The page needs to know which transition to run; it has no use for the
        // menu of them, and a public endpoint should not carry the console's
        // vocabulary.
        $response = $this->getJson('/api/v1/galleries/recent-work')->assertOk();
        $this->assertNotNull($response->json('data.transition'));
        $this->assertNull($response->json('meta.transitions'));
    }

    public function test_the_interval_is_bounded_at_both_ends(): void
    {
        $editor = $this->editor();

        $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload(['interval_ms' => 500]))
            ->assertStatus(422)->assertJsonValidationErrors('interval_ms');

        $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/galleries', $this->payload(['interval_ms' => 120000]))
            ->assertStatus(422)->assertJsonValidationErrors('interval_ms');
    }

    public function test_a_role_without_content_manager_is_refused(): void
    {
        $user = $this->staff(RoleEnum::SupportEngineer, 'sid-support@example.test');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/admin/galleries')
            ->assertForbidden();
    }
}
