<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Brand;
use App\Models\LandingPage;
use App\Models\Page;
use App\Models\ProductCategory;
use App\Models\RecordNote;
use App\Models\Role;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Team notes on records (C2, docs/notifications.md): one thread per record of
 * the kinds page history knows, readable and writable by the kind's owning role.
 */
class RecordNotesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function staff(RoleEnum $role, string $tag = 'a'): User
    {
        $user = User::firstOrCreate(
            ['email' => $role->value."-note-{$tag}@example.test"],
            ['name' => ucfirst($role->value)." {$tag}", 'password' => 'password-for-tests', 'is_active' => true],
        );
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user->load('roles');
    }

    private function asStaff(RoleEnum $role, string $tag = 'a'): static
    {
        $user = $this->staff($role, $tag);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function page(string $slug = 'notes-page', string $title = 'Notes page'): Page
    {
        return Page::create(['title' => $title, 'slug' => $slug, 'body' => '<p>x</p>', 'template' => 'default', 'status' => 'draft']);
    }

    public function test_the_owning_role_writes_and_reads_a_note_and_a_mention_is_told(): void
    {
        $page = $this->page();
        $ravi = $this->staff(RoleEnum::ContentManager, 'ravi');

        $note = $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => "@{$ravi->name} can you check the hero?", 'mentions' => [$ravi->id]])
            ->assertCreated()->assertJsonPath('data.mentioned.0.id', $ravi->id)->assertJsonPath('data.can_delete', true)->json('data');

        $this->asStaff(RoleEnum::ContentManager, 'ravi')->getJson("/api/v1/admin/record-notes?type=page&id={$page->id}")
            ->assertOk()->assertJsonPath('data.0.id', $note['id'])->assertJsonPath('data.0.can_delete', false);

        $this->assertDatabaseHas('staff_notifications', ['user_id' => $ravi->id, 'kind' => 'mention_note', 'path' => "/admin/pages/{$page->id}", 'line' => 'Content_manager me mentioned you in a note on Notes page.']);
    }

    public function test_a_role_that_does_not_own_the_kind_is_refused(): void
    {
        $product = StoreProduct::create(['name' => 'A draft licence', 'slug' => 'a-draft-licence', 'price_paise' => 1000000, 'track_stock' => false, 'stock' => 0, 'description' => '<p>Words.</p>']);
        $this->asStaff(RoleEnum::ContentManager, 'me')->getJson("/api/v1/admin/record-notes?type=store_product&id={$product->id}")->assertForbidden();
        $this->asStaff(RoleEnum::StoreManager, 'sm')->getJson("/api/v1/admin/record-notes?type=store_product&id={$product->id}")->assertOk();

        $landing = LandingPage::create([
            'kind' => 'brand_category',
            'brand_id' => Brand::create(['name' => 'Cisco', 'slug' => 'cisco'])->id,
            'product_category_id' => ProductCategory::create(['name' => 'Switches', 'slug' => 'switches'])->id,
            'title' => 'Cisco Switches', 'heading' => 'Cisco switches we supply', 'intro' => '<p>Words.</p>',
        ]);
        $this->asStaff(RoleEnum::StoreManager, 'sm')->postJson('/api/v1/admin/record-notes', ['type' => 'landing_page', 'id' => $landing->id, 'body' => 'x'])->assertForbidden();
        $this->asStaff(RoleEnum::SeoManager, 'seo')->postJson('/api/v1/admin/record-notes', ['type' => 'landing_page', 'id' => $landing->id, 'body' => 'x'])->assertCreated();
    }

    public function test_a_note_on_a_record_that_has_gone_is_a_404_and_a_bad_body_is_a_422(): void
    {
        $this->asStaff(RoleEnum::ContentManager, 'me')->getJson('/api/v1/admin/record-notes?type=page&id=999999')->assertNotFound();
        $page = $this->page('p-422', 'P');
        $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => str_repeat('a', 2001)])->assertJsonValidationErrors('body');
        $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'planet', 'id' => 1, 'body' => 'x'])->assertJsonValidationErrors('type');
        $this->asStaff(RoleEnum::ContentManager, 'me')->getJson('/api/v1/admin/record-notes?type=planet&id=1')->assertJsonValidationErrors('type');
    }

    public function test_only_the_author_or_an_administrator_deletes(): void
    {
        $page = $this->page('p-del', 'P');
        $id = $this->asStaff(RoleEnum::ContentManager, 'author')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => 'mine'])->json('data.id');

        $this->asStaff(RoleEnum::ContentManager, 'other')->deleteJson("/api/v1/admin/record-notes/{$id}")->assertForbidden();
        $this->asStaff(RoleEnum::Admin, 'adm')->deleteJson("/api/v1/admin/record-notes/{$id}")->assertNoContent();
    }

    public function test_notes_go_with_their_record(): void
    {
        $page = $this->page('p-gone', 'P');
        $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => 'bye'])->assertCreated();
        $page->delete();
        $this->assertSame(0, RecordNote::count());
    }

    public function test_the_body_is_stored_as_typed(): void
    {
        $page = $this->page('p-raw', 'P');
        $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => '<b>hi</b> & bye'])
            ->assertJsonPath('data.body', '<b>hi</b> & bye');
    }
}
