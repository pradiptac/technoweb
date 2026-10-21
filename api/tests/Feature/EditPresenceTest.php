<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\EditPresence;
use App\Models\Page;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Who else has an edit screen open (C2, docs/notifications.md). */
class EditPresenceTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role, string $tag = 'a'): User
    {
        $user = User::firstOrCreate(
            ['email' => $role->value."-presence-{$tag}@example.test"],
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

    private function page(): Page
    {
        return Page::create(['title' => 'Presence page', 'slug' => 'presence-page', 'body' => '<p>One.</p>', 'template' => 'default', 'status' => 'draft']);
    }

    public function test_others_are_listed_never_yourself_and_stale_rows_are_ignored(): void
    {
        $page = $this->page();
        $this->asStaff(RoleEnum::ContentManager, 'ravi')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => true])->assertOk();
        $this->asStaff(RoleEnum::ContentManager, 'old')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false])->assertOk();
        EditPresence::query()->where('user_id', $this->staff(RoleEnum::ContentManager, 'old')->id)->update(['last_seen_at' => now()->subSeconds(61)]);

        $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false])
            ->assertOk()
            ->assertJsonCount(1, 'data.others')
            ->assertJsonPath('data.others.0.name', 'Content_manager ravi')
            ->assertJsonPath('data.others.0.dirty', true);
    }

    public function test_saved_names_the_newest_versions_author(): void
    {
        $page = $this->page();
        $this->asStaff(RoleEnum::ContentManager, 'asha')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'Edited by Asha'])->assertOk();

        $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false])
            ->assertJsonPath('data.saved.by', 'Content_manager asha')
            ->assertJsonPath('data.saved.at', $page->fresh()->updated_at->toIso8601String());
    }

    public function test_presence_is_narrowed_by_role_and_leave_removes_the_row(): void
    {
        $page = $this->page();
        $this->asStaff(RoleEnum::StoreManager, 'sm')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false])->assertForbidden();
        $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false])->assertOk();
        $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/presence/leave', ['type' => 'page', 'id' => $page->id])->assertNoContent();
        $this->assertSame(0, EditPresence::count());
        $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => 999999, 'dirty' => false])->assertNotFound();
    }
}
