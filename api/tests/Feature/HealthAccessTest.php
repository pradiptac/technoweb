<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Customer;
use App\Models\HealthFinding;
use App\Models\Page;
use App\Models\Role;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Health\Findings;
use App\Support\Health\Score;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class HealthAccessTest extends TestCase
{
    use RefreshDatabase;

    private function asStaff(RoleEnum $role): static
    {
        $user = User::firstOrCreate(['email' => $role->value.'-ha@example.test'],
            ['name' => 'Staff', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function seedFindings(): array
    {
        $page = Page::create(['title' => 'Page', 'slug' => 'page', 'body' => '<p><a href="/blog">here</a></p>', 'status' => 'published']);
        $shop = StoreProduct::create(['name' => 'Switch', 'slug' => 'switch', 'type' => 'physical', 'price_paise' => 100000,
            'status' => 'published', 'description' => '<p><a href="/blog">here</a></p>']);

        return [$page, $shop];
    }

    public function test_each_role_sees_only_its_own_findings(): void
    {
        $this->seedFindings();

        $this->assertSame(['page'], $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/health')->assertOk()->json('data.*.subject.type'));
        $this->assertSame(['store_product'], $this->asStaff(RoleEnum::StoreManager)->getJson('/api/v1/admin/health')->assertOk()->json('data.*.subject.type'));
    }

    public function test_only_an_administrator_gets_the_score(): void
    {
        $this->seedFindings();
        Cache::forever(Score::LAST_SWEEP_KEY, now()->toIso8601String());

        $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/health')->assertOk()->assertJsonMissingPath('meta.score');
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/health')->assertOk()->assertJsonPath('meta.score.value', 0);
    }

    public function test_a_finding_on_another_roles_kind_is_a_404(): void
    {
        [, $shop] = $this->seedFindings();
        $id = HealthFinding::where('subject_type', 'store_product')->value('id');

        $this->asStaff(RoleEnum::ContentManager)->postJson("/api/v1/admin/health/{$id}/ignore")->assertNotFound();
        $this->asStaff(RoleEnum::StoreManager)->postJson("/api/v1/admin/health/{$id}/ignore")->assertOk()->assertJsonPath('data.id', $id);
        $this->asStaff(RoleEnum::ContentManager)->postJson('/api/v1/admin/health/recheck', ['type' => 'store_product', 'id' => $shop->id])->assertNotFound();
    }

    public function test_a_customer_token_is_refused(): void
    {
        $customer = Customer::create(['name' => 'C', 'email' => 'c@example.test', 'password' => 'password-for-tests', 'status' => 'active']);
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$customer->createToken('portal', ['portal'])->plainTextToken)
            ->getJson('/api/v1/admin/health')->assertForbidden();
    }

    public function test_bulk_never_discloses_or_touches_another_roles_findings(): void
    {
        $this->seedFindings();
        $own = HealthFinding::where('subject_type', 'page')->value('id');
        $foreign = HealthFinding::where('subject_type', 'store_product')->value('id');

        $res = $this->asStaff(RoleEnum::ContentManager)->postJson('/api/v1/admin/health/bulk', ['ids' => [$own, $foreign], 'action' => 'ignore'])
            ->assertOk()->assertJsonPath('updated', [$own])->assertJsonPath('refused', []);

        $this->assertStringNotContainsString('here', $res->getContent());
        $this->assertNotNull(HealthFinding::find($own)->ignored_at);
        $this->assertNull(HealthFinding::find($foreign)->ignored_at);
    }

    public function test_restore_and_recheck_respect_ownership(): void
    {
        [$page, $shop] = $this->seedFindings();
        $own = HealthFinding::where('subject_type', 'page')->value('id');
        $foreign = HealthFinding::where('subject_type', 'store_product')->value('id');
        HealthFinding::whereKey($own)->update(['ignored_at' => now()]);

        $this->asStaff(RoleEnum::ContentManager)->postJson("/api/v1/admin/health/{$foreign}/restore")->assertNotFound();
        $this->asStaff(RoleEnum::ContentManager)->postJson("/api/v1/admin/health/{$own}/restore")
            ->assertOk()->assertJsonPath('data.ignored_at', null);
        $this->assertNull(HealthFinding::find($own)->ignored_at);

        $this->asStaff(RoleEnum::ContentManager)->postJson('/api/v1/admin/health/recheck', ['type' => 'page', 'id' => $page->id])
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.subject.type', 'page');
    }

    public function test_links_due_is_an_administrators_alone(): void
    {
        $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/health')->assertJsonMissingPath('meta.links_due');
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/health')->assertJsonPath('meta.links_due', 0);
    }

    public function test_the_list_filters_and_carries_its_vocabulary(): void
    {
        $this->seedFindings();

        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/health?group=links')->assertOk()->assertJsonCount(0, 'data');
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/health?group=accessibility&type=page')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.sentence', 'A link says only "here". Say where it goes.')
            ->assertJsonPath('data.0.admin_path', '/admin/pages/'.Page::value('id'))
            ->assertJsonPath('meta.summary.accessibility.warning', 2);
    }

    public function test_the_sections_tab_id_is_builder_on_a_page_and_sections_elsewhere(): void
    {
        $this->assertSame('builder', Findings::tabFor('blocks.0.data.body', 'page'));
        $this->assertSame('sections', Findings::tabFor('blocks.0.data.body', 'solution'));
        $this->assertNull(Findings::tabFor('body', 'page'));
    }
}
