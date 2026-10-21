<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Jobs\CheckRecordHealth;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Product;
use App\Models\Role;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The stale-save guard (C2, docs/notifications.md): a form that sends the
 * `updated_at` it opened with is refused when somebody saved since, and only
 * a person's own save moves `updated_at`.
 */
class StaleSaveTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role, string $tag = 'a'): User
    {
        $user = User::firstOrCreate(
            ['email' => $role->value."-stale-{$tag}@example.test"],
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
        return Page::create(['title' => 'Stale page', 'slug' => 'stale-page', 'body' => '<p>One.</p>', 'template' => 'default', 'status' => 'draft']);
    }

    /** @return array{0: Model, 1: string, 2: string, 3: RoleEnum} */
    private function make(string $kind): array
    {
        return match ($kind) {
            'page' => [$p = $this->page(), "/api/v1/admin/pages/{$p->id}", 'title', RoleEnum::ContentManager],
            'product' => [$p = Product::create(['name' => 'Stale switch', 'slug' => 'stale-switch', 'status' => 'draft']), "/api/v1/admin/products/{$p->id}", 'name', RoleEnum::ContentManager],
            'store_product' => [$p = StoreProduct::create(['name' => 'Stale licence', 'slug' => 'stale-licence', 'price_paise' => 1000000, 'track_stock' => false, 'stock' => 0, 'status' => 'draft']), "/api/v1/admin/store/products/{$p->id}", 'name', RoleEnum::StoreManager],
        };
    }

    #[DataProvider('kinds')]
    public function test_a_save_over_a_newer_one_is_refused_allowed_with_overwrite_and_unchecked_without_a_base(string $kind): void
    {
        [$record, $url, $field, $role] = $this->make($kind);
        $base = $record->updated_at->toIso8601String();
        $this->travel(5)->seconds();
        $this->asStaff($role, 'ravi')->patchJson($url, [$field => 'Ravi was here'])->assertOk();

        $this->travel(5)->seconds();
        $this->asStaff($role, 'me')->patchJson($url, [$field => 'Mine', 'base_updated_at' => $base])
            ->assertStatus(422)
            ->assertJsonPath('errors.stale.0', fn (string $m) => str_starts_with($m, ucfirst($role->value).' ravi saved this at '))
            ->assertJsonPath('meta.stale.by', ucfirst($role->value).' ravi');
        $this->assertSame('Ravi was here', $record->fresh()->getAttribute($field));

        $this->asStaff($role, 'me')->patchJson($url, [$field => 'Mine', 'base_updated_at' => $base, 'overwrite' => true])->assertOk();
        $this->assertSame('Mine', $record->fresh()->getAttribute($field));
        $this->assertDatabaseHas('activity_log', ['action' => 'overwrote', 'subject_type' => $kind, 'subject_id' => $record->getKey()]);

        $this->asStaff($role, 'me')->patchJson($url, [$field => 'Script'])->assertOk();
    }

    public static function kinds(): array
    {
        return [['page'], ['product'], ['store_product']];
    }

    /** A save that changes only related rows (SEO, FAQs) is still a newer version. */
    #[DataProvider('kinds')]
    public function test_a_save_that_changes_only_related_rows_is_still_newer(string $kind): void
    {
        [$record, $url, , $role] = $this->make($kind);
        $base = $record->updated_at->toIso8601String();
        $this->travel(5)->seconds();
        $this->asStaff($role, 'ravi')->patchJson($url, ['seo' => ['title' => 'A better search title'], 'faqs' => [['question' => 'Is it fast?', 'answer' => '<p>Yes.</p>']]])->assertOk();

        $this->travel(5)->seconds();
        // Page history records no version for an SEO-only save, so its author is not known: "Somebody", never a wrong name.
        $this->asStaff($role, 'me')->patchJson($url, ['seo' => ['title' => 'Mine'], 'base_updated_at' => $base])->assertStatus(422)
            ->assertJsonPath('meta.stale.by', null)
            ->assertJsonPath('errors.stale.0', fn (string $m) => str_starts_with($m, 'Somebody saved this at '));
    }

    public function test_a_save_from_the_current_version_goes_through(): void
    {
        $page = $this->page();
        $this->asStaff(RoleEnum::ContentManager, 'me')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'Fine', 'base_updated_at' => $page->updated_at->toIso8601String()])->assertOk();
    }

    public function test_the_callers_own_save_in_another_tab_says_so(): void
    {
        $page = $this->page();
        $base = $page->updated_at->toIso8601String();
        $this->travel(5)->seconds();
        $this->asStaff(RoleEnum::ContentManager, 'me')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'Tab one'])->assertOk();
        $this->travel(5)->seconds();
        $this->asStaff(RoleEnum::ContentManager, 'me')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'Tab two', 'base_updated_at' => $base])
            ->assertStatus(422)
            ->assertJsonPath('errors.stale.0', fn (string $m) => str_starts_with($m, 'You saved this at ') && str_contains($m, 'in another tab'));
    }

    public function test_an_unreadable_base_is_not_checked(): void
    {
        $page = $this->page();
        $this->asStaff(RoleEnum::ContentManager, 'me')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'x', 'base_updated_at' => 'yesterday-ish'])->assertOk();
        $this->asStaff(RoleEnum::ContentManager, 'me')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'y', 'base_updated_at' => ['a']])->assertOk();
    }

    public function test_system_writes_do_not_move_updated_at(): void
    {
        $article = KnowledgeArticle::create(['title' => 'Helpful', 'slug' => 'helpful', 'excerpt' => 'x', 'body' => '<p>Words.</p>', 'status' => 'published', 'published_at' => now()->subDay()]);
        $before = $article->fresh()->updated_at;
        $this->travel(10)->seconds();

        $this->postJson("/api/v1/knowledge-base/{$article->slug}/helpful")->assertNoContent();
        $this->getJson("/api/v1/knowledge-base/{$article->slug}")->assertOk();
        CheckRecordHealth::dispatchSync('knowledge_article', $article->id);

        $this->assertSame(1, (int) $article->fresh()->helpful_count);
        $this->assertSame(1, (int) $article->fresh()->view_count);
        $this->assertEquals($before, $article->fresh()->updated_at);
    }
}
