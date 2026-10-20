<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Content-type presets (docs/content-presets.md): newsroom, investors,
 * testimonials and awards, installed in one press on top of custom content
 * types.
 */
class ContentPresetsTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::firstOrCreate(['email' => $role->value.'-presets@example.test'], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(
            ['slug' => $role->value], ['name' => $role->label()],
        )->id]);

        return $user;
    }

    /* ------------------------------------------------------------ entry pages */

    public function test_an_entry_of_a_type_without_entry_pages_links_to_the_archive_and_has_no_page(): void
    {
        $type = ContentType::create([
            'name' => 'Testimonial', 'plural' => 'Testimonials', 'slug' => 'praise',
            'schema_type' => 'WebPage', 'entry_pages' => false,
        ]);
        $entry = Entry::create([
            'content_type_id' => $type->id, 'title' => 'R. Kulkarni', 'status' => 'published',
        ]);

        $this->assertFalse($entry->hasOwnPage());
        $this->assertSame('/praise', $entry->publicPath());
        $this->getJson('/api/v1/types/praise/'.$entry->slug)->assertNotFound();
        $this->getJson('/api/v1/types/praise')->assertOk()
            ->assertJsonPath('meta.type.entry_pages', false)
            ->assertJsonPath('data.0.path', '/praise');
    }

    public function test_an_ordinary_type_keeps_its_entry_pages(): void
    {
        $type = ContentType::create(['name' => 'Event', 'plural' => 'Events', 'slug' => 'gatherings', 'schema_type' => 'Article']);
        $entry = Entry::create(['content_type_id' => $type->id, 'title' => 'Launch', 'status' => 'published']);

        $this->assertTrue($entry->hasOwnPage());
        $this->assertSame('/gatherings/launch', $entry->publicPath());
        $this->getJson('/api/v1/types/gatherings/launch')->assertOk()->assertJsonPath('data.type.slug', 'gatherings');
    }

    public function test_preset_cannot_be_set_through_the_type_form(): void
    {
        $type = ContentType::create(['name' => 'Event', 'plural' => 'Events', 'slug' => 'gatherings', 'schema_type' => 'Article']);

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/content-types/{$type->id}", ['preset' => 'awards'])
            ->assertStatus(422)->assertJsonValidationErrors('preset');

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/content-types/{$type->id}", ['entry_pages' => false])
            ->assertOk()->assertJsonPath('data.entry_pages', false);
    }
}
