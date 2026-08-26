<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Activity;
use App\Models\BlogPost;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The activity log.
 *
 * Three properties are worth more than the happy path:
 *
 *   1. **Credentials never reach it.** The settings form carries the SMTP
 *      password; a log that copies request bodies is a plaintext copy of it in
 *      a table built to be read by people.
 *   2. **Nothing can edit or delete a line.** A log its own subject can prune
 *      to taste is evidence of nothing.
 *   3. **Retention has a floor.** Somebody typing 0 into a settings field must
 *      not be able to destroy the audit trail by accident.
 */
class ActivityLogTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::create([
            'name' => 'Ada Admin',
            'email' => 'ada@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $role = Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value],
            ['name' => RoleEnum::Admin->label()],
        );
        $user->roles()->attach($role);

        return $user;
    }

    /* ------------------------------------------------------- what it records */

    public function test_a_deletion_is_recorded_with_what_the_record_was_called(): void
    {
        $redirect = Redirect::create([
            'from_path' => '/old', 'to_path' => '/new', 'status_code' => 301, 'is_active' => true,
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/redirects/{$redirect->id}")
            ->assertSuccessful();

        $entry = Activity::where('action', 'destroy')->firstOrFail();

        $this->assertSame('redirect', $entry->subject_type);
        // The label is stored, not resolved later. The record is gone.
        $this->assertSame('/old', $entry->subject_label);
    }

    public function test_a_creation_is_recorded(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/redirects', [
                'from_path' => '/a', 'to_path' => '/b', 'status_code' => 301, 'is_active' => true,
            ])->assertSuccessful();

        $this->assertSame(1, Activity::where('action', 'store')->count());
    }

    /**
     * Editing a blog post is the ordinary work of the console. A log that
     * records everything is a log nobody reads.
     */
    public function test_routine_content_edits_are_not_recorded(): void
    {
        $admin = $this->admin();

        $post = BlogPost::create([
            'title' => 'A post', 'slug' => 'a-post', 'excerpt' => 'x',
            'body' => '<p>x</p>', 'status' => 'draft', 'author_id' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/blog-posts/{$post->id}", ['excerpt' => 'changed'])
            ->assertSuccessful();

        $this->assertSame(0, Activity::where('action', 'update')->count());
    }

    public function test_a_refused_request_is_not_recorded(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/redirects', ['from_path' => ''])
            ->assertStatus(422);

        // Nothing changed, so nothing happened.
        $this->assertSame(0, Activity::count());
    }

    /* ------------------------------------------------------------ redaction */

    public function test_a_credential_never_reaches_the_log(): void
    {
        Setting::create(['group' => 'mail', 'key' => 'mail_password', 'value' => null, 'type' => 'string', 'is_secret' => true]);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson('/api/v1/admin/settings', [
                'settings' => [['key' => 'mail_password', 'value' => 'hunter2-never-log-me']],
            ])->assertSuccessful();

        $entry = Activity::firstOrFail();

        // The key is worth having; the value is the thing that must not be.
        $this->assertSame(['mail_password'], $entry->context['settings']);
        $this->assertStringNotContainsString('hunter2', json_encode($entry->context));
        $this->assertStringNotContainsString('hunter2', json_encode($entry->getAttributes()));
    }

    /* --------------------------------------------------------- append-only */

    public function test_there_is_no_way_to_write_or_delete_a_line(): void
    {
        $admin = $this->actingAs($this->admin(), 'sanctum');

        // 405 or 404 both mean "this endpoint does not exist"; what matters is
        // that neither is a success.
        $this->assertTrue($admin->postJson('/api/v1/admin/activity')->status() >= 400);
        $this->assertTrue($admin->deleteJson('/api/v1/admin/activity/1')->status() >= 400);
    }

    public function test_only_an_administrator_can_read_it(): void
    {
        $engineer = User::create([
            'name' => 'Sam Support', 'email' => 'sam@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $engineer->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::SupportEngineer->value],
            ['name' => RoleEnum::SupportEngineer->label()],
        ));

        // It records colleagues' actions, which is not support-desk business.
        $this->actingAs($engineer, 'sanctum')->getJson('/api/v1/admin/activity')->assertStatus(403);
        $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/activity')->assertOk();
    }

    /* ----------------------------------------------------------- retention */

    public function test_the_prune_deletes_only_what_is_past_retention(): void
    {
        Setting::create(['group' => 'security', 'key' => 'activity_retention_days', 'value' => '90', 'type' => 'string']);

        $old = Activity::create(['actor_name' => 'A', 'actor_email' => 'a@example.test', 'action' => 'login']);
        $old->forceFill(['created_at' => now()->subDays(120)])->save();

        Activity::create(['actor_name' => 'B', 'actor_email' => 'b@example.test', 'action' => 'login']);

        $this->artisan('technoware:prune-activity')->assertExitCode(0);

        $this->assertSame(1, Activity::count());
        $this->assertSame('b@example.test', Activity::first()->actor_email);
    }

    public function test_a_retention_of_zero_cannot_destroy_the_log(): void
    {
        Setting::create(['group' => 'security', 'key' => 'activity_retention_days', 'value' => '0', 'type' => 'string']);

        $entry = Activity::create(['actor_name' => 'A', 'actor_email' => 'a@example.test', 'action' => 'login']);
        $entry->forceFill(['created_at' => now()->subDays(40)])->save();

        $this->artisan('technoware:prune-activity')->assertExitCode(0);

        // 40 days old, and the floor is 30 — so it goes. What matters is that
        // "0" did not mean "delete everything".
        $this->assertSame(0, Activity::count());

        $recent = Activity::create(['actor_name' => 'C', 'actor_email' => 'c@example.test', 'action' => 'login']);
        $recent->forceFill(['created_at' => now()->subDays(10)])->save();

        $this->artisan('technoware:prune-activity')->assertExitCode(0);
        $this->assertSame(1, Activity::count());
    }
}
