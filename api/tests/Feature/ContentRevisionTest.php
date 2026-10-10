<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Brand;
use App\Models\CaseStudy;
use App\Models\ContentRevision;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\Event;
use App\Models\JobOpening;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Role;
use App\Models\SavedSection;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\PreviewLinks;
use App\Support\Revisions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Page history (0.145.0, docs/page-builder.md "Page history").
 *
 * Staff are authenticated with a real `Authorization: Bearer` header and the
 * resolved guard is forgotten before every switch of principal: `actingAs()`
 * stages the authentication by hand, and the actor a revision records is read
 * from the real request, which is what is being tested.
 */
class ContentRevisionTest extends TestCase
{
    use RefreshDatabase;

    // ------------------------------------------------------------- helpers

    private function staff(RoleEnum $role, string $tag = 'a'): User
    {
        $user = User::firstOrCreate(
            ['email' => $role->value."-rev-{$tag}@example.test"],
            ['name' => ucfirst($role->value)." {$tag}", 'password' => 'password-for-tests', 'is_active' => true],
        );
        $user->roles()->syncWithoutDetaching([
            Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id,
        ]);

        return $user;
    }

    private function asStaff(RoleEnum $role, string $tag = 'a'): static
    {
        $user = $this->staff($role, $tag);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function page(array $attrs = []): Page
    {
        return Page::create($attrs + ['title' => 'History page', 'slug' => 'history-page', 'body' => '<p>One.</p>', 'template' => 'default', 'status' => 'draft']);
    }

    private function revisions(Model $subject, string $alias = 'page')
    {
        return ContentRevision::query()->where('subject_type', $alias)->where('subject_id', $subject->getKey())->orderBy('id')->get();
    }

    private function editAs(string $tag, Page $page, array $data): void
    {
        $this->asStaff(RoleEnum::ContentManager, $tag)
            ->patchJson("/api/v1/admin/pages/{$page->id}", $data)
            ->assertOk();
    }

    private static function block(string $text): array
    {
        return ['id' => (string) Str::uuid(), 'type' => 'rich_text', 'hidden' => false, 'background' => null, 'data' => ['body' => "<p>{$text}</p>"]];
    }

    // --------------------------------------------------------------- capture

    public function test_creating_a_page_is_its_first_revision(): void
    {
        $page = $this->page(['template' => 'builder', 'blocks' => [self::block('A')]]);

        $rows = $this->revisions($page);

        $this->assertCount(1, $rows);
        $this->assertSame(['created'], $rows[0]->changed);
        $this->assertSame(1, $rows[0]->blocks_count);
        $this->assertSame('History page', $rows[0]->snapshot['title']);
        $this->assertSame(40, strlen($rows[0]->hash));
        $this->assertNull($rows[0]->user_id, 'a model created outside a request has no actor');
    }

    public function test_an_update_records_what_changed(): void
    {
        $page = $this->page();

        $page->update(['title' => 'Renamed', 'body' => '<p>Two.</p>']);

        $rows = $this->revisions($page);
        $this->assertCount(2, $rows);
        $this->assertSame(['title', 'body'], $rows[1]->changed);
        $this->assertSame('<p>Two.</p>', $rows[1]->snapshot['body']);
    }

    public function test_a_status_only_change_records_nothing_and_a_snapshot_never_holds_it(): void
    {
        $page = $this->page();

        // A freshly loaded instance: the changed-columns check stops it.
        Page::find($page->id)->update(['status' => 'published', 'published_at' => now()]);
        // The instance that created it still says "recently created": the hash stops it.
        $page->update(['status' => 'archived']);

        $rows = $this->revisions($page);
        $this->assertCount(1, $rows);
        $this->assertArrayNotHasKey('status', $rows[0]->snapshot);
        $this->assertArrayNotHasKey('published_at', $rows[0]->snapshot);
    }

    public function test_saving_identical_content_adds_nothing(): void
    {
        $page = $this->page();

        $page->update(['title' => 'Other']);
        $page->update(['title' => 'History page']);
        // Back to the first state: a different row from the one before it.
        $this->assertCount(3, $this->revisions($page));

        // Same words again, however the save arrives.
        $page->update(['body' => '<p>One.</p>']);
        $page->forceFill(['title' => 'History page'])->save();
        $this->assertCount(3, $this->revisions($page));
    }

    public function test_the_same_person_saving_again_within_five_minutes_is_folded_in(): void
    {
        $page = $this->page();

        $this->editAs('a', $page, ['title' => 'First edit']);
        $this->editAs('a', $page, ['title' => 'Second edit']);

        $rows = $this->revisions($page);
        $this->assertCount(2, $rows, 'creation, plus one revision for the run of saves');
        $this->assertSame('Second edit', $rows[1]->snapshot['title']);
        $this->assertSame(['title'], $rows[1]->changed);
        $this->assertSame('Content_manager a', $rows[1]->actor_name);
    }

    public function test_a_different_person_does_not_fold_into_the_previous_revision(): void
    {
        $page = $this->page();

        $this->editAs('a', $page, ['title' => 'By A']);
        $this->editAs('b', $page, ['title' => 'By B']);

        $rows = $this->revisions($page);
        $this->assertCount(3, $rows);
        $this->assertSame('By A', $rows[1]->snapshot['title']);
        $this->assertSame('By B', $rows[2]->snapshot['title']);
    }

    public function test_a_save_after_five_minutes_starts_a_new_revision(): void
    {
        $page = $this->page();

        $this->editAs('a', $page, ['title' => 'Early']);
        $this->travel(6)->minutes();
        $this->editAs('a', $page, ['title' => 'Late']);

        $this->assertCount(3, $this->revisions($page));
    }

    public function test_only_the_newest_thirty_are_kept(): void
    {
        $page = $this->page();

        for ($i = 1; $i <= 34; $i++) {
            $page->update(['body' => "<p>Version {$i}.</p>"]);
        }

        $rows = $this->revisions($page);
        $this->assertCount(Revisions::KEEP, $rows);
        $this->assertSame(30, Revisions::KEEP);
        $this->assertSame('<p>Version 34.</p>', $rows->last()->snapshot['body']);
        $this->assertSame('<p>Version 5.</p>', $rows->first()->snapshot['body'], 'the oldest five, creation included, were pruned');
    }

    public function test_the_section_library_keeps_a_history_of_its_own(): void
    {
        $section = SavedSection::create([
            'kind' => 'section', 'name' => 'Intro', 'description' => null, 'blocks' => [self::block('Hello')],
        ]);
        $section->update(['name' => 'Intro v2']);

        $rows = $this->revisions($section, 'saved_section');
        $this->assertCount(2, $rows);
        $this->assertSame(['name'], $rows[1]->changed);
        $this->assertArrayNotHasKey('kind', $rows[0]->snapshot);
    }

    public function test_deleting_a_page_deletes_its_history(): void
    {
        $page = $this->page();
        $other = $this->page(['slug' => 'other-page']);
        $page->update(['title' => 'x']);

        $page->delete();

        $this->assertCount(0, $this->revisions($page));
        $this->assertCount(1, $this->revisions($other));
    }

    public function test_the_prune_command_removes_orphans_and_keeps_the_rest(): void
    {
        $page = $this->page();
        ContentRevision::create([
            'subject_type' => 'page', 'subject_id' => 999999, 'snapshot' => ['title' => 'Gone'],
            'changed' => ['created'], 'blocks_count' => 0, 'hash' => sha1('gone'),
        ]);

        $this->artisan('technoware:prune-revisions')->assertSuccessful();

        $this->assertSame(0, ContentRevision::where('subject_id', 999999)->count());
        $this->assertCount(1, $this->revisions($page));
    }

    public function test_the_prune_keeps_the_newest_five_of_a_year_old_history(): void
    {
        $page = $this->page();
        for ($i = 1; $i <= 7; $i++) {
            $page->update(['body' => "<p>V{$i}</p>"]);
        }
        ContentRevision::query()->update(['updated_at' => now()->subDays(400)]);

        $this->artisan('technoware:prune-revisions')->assertSuccessful();

        $rows = $this->revisions($page);
        $this->assertCount(5, $rows);
        $this->assertSame('<p>V7</p>', $rows->last()->snapshot['body']);
    }

    public function test_a_failure_to_record_never_fails_the_save(): void
    {
        $page = $this->page();
        // Writing a revision throws; the save must go through. (No DDL here: a dropped table commits the test's transaction.)
        ContentRevision::creating(fn () => throw new RuntimeException('the history is unavailable'));

        $page->update(['title' => 'Still saved']);

        $this->assertSame('Still saved', $page->fresh()->title);
        $this->assertCount(1, $this->revisions($page), 'the failed write left no half-made row');
    }

    // ------------------------------------------------------------------- API

    public function test_the_list_omits_snapshots_and_the_detail_includes_them_with_media(): void
    {
        $page = $this->page(['template' => 'builder', 'blocks' => [[
            'id' => (string) Str::uuid(), 'type' => 'media_text', 'hidden' => false, 'background' => null,
            'data' => ['heading' => 'H', 'image_path' => 'uploads/rev.jpg'],
        ]]]);
        $page->update(['title' => 'Changed']);

        $list = $this->asStaff(RoleEnum::ContentManager)->getJson("/api/v1/admin/revisions?type=page&id={$page->id}")->assertOk();

        $this->assertCount(2, $list->json('data'));
        $first = $list->json('data.0');
        $this->assertArrayNotHasKey('snapshot', $first);
        $this->assertSame(['title'], $first['changed']);
        $this->assertGreaterThan(0, $first['size']);
        $this->assertSame(1, $first['blocks_count']);
        $this->assertSame('Title', $list->json('meta.labels.title'));
        $this->assertSame(30, $list->json('meta.keep'));

        $detail = $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/revisions/'.$first['id'])->assertOk();

        $this->assertSame('Changed', $detail->json('data.snapshot.title'));
        $this->assertSame('page', $detail->json('data.type'));
        $this->assertArrayHasKey('uploads/rev.jpg', $detail->json('data.blocks_media'));
    }

    public function test_a_page_with_no_media_sends_an_object_not_a_list(): void
    {
        $page = $this->page();
        $id = $this->revisions($page)->first()->id;

        $raw = $this->asStaff(RoleEnum::ContentManager)->get('/api/v1/admin/revisions/'.$id)->assertOk()->getContent();

        $this->assertStringContainsString('"blocks_media":{}', $raw);
    }

    public function test_history_is_read_by_the_role_that_owns_the_record(): void
    {
        $page = $this->page();
        $id = $this->revisions($page)->first()->id;

        $this->asStaff(RoleEnum::StoreManager)->getJson("/api/v1/admin/revisions?type=page&id={$page->id}")->assertForbidden();
        $this->asStaff(RoleEnum::StoreManager)->getJson("/api/v1/admin/revisions/{$id}")->assertForbidden();
        $this->asStaff(RoleEnum::SupportEngineer)->getJson("/api/v1/admin/revisions?type=page&id={$page->id}")->assertForbidden();
        $this->asStaff(RoleEnum::Admin)->getJson("/api/v1/admin/revisions?type=page&id={$page->id}")->assertOk();
    }

    public function test_an_unknown_kind_or_revision_is_refused(): void
    {
        $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/revisions?type=nonsense&id=1')->assertUnprocessable();
        $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/revisions/999999')->assertNotFound();
        $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/revisions/abc')->assertNotFound();
    }

    public function test_a_signed_out_caller_gets_nothing(): void
    {
        $this->app['auth']->forgetGuards();

        $this->withoutHeader('Authorization')->getJson('/api/v1/admin/revisions?type=page&id=1')->assertUnauthorized();
    }

    // ------------------------------------------------- the other eleven kinds (0.148.0)

    /** A draft of the given kind, as `PreviewLinkTest` makes them. */
    private function draft(string $type): Model
    {
        $status = ['status' => 'draft'];

        return match ($type) {
            'blog_post' => BlogPost::create([
                'title' => 'A draft post', 'slug' => 'a-draft-post', 'excerpt' => 'x', 'body' => '<p>Words.</p>',
                'author_id' => $this->staff(RoleEnum::ContentManager)->id,
            ] + $status),
            'knowledge_article' => KnowledgeArticle::create([
                'title' => 'A draft article', 'slug' => 'a-draft-article', 'excerpt' => 'x', 'body' => '<p>Words.</p>',
            ] + $status),
            'case_study' => CaseStudy::create([
                'title' => 'A draft case study', 'slug' => 'a-draft-case-study', 'summary' => 'x', 'body' => '<p>Words.</p>',
            ] + $status),
            'solution' => Solution::create(['title' => 'A draft solution', 'slug' => 'a-draft-solution', 'summary' => 'x', 'overview' => '<p>Words.</p>'] + $status),
            'service' => Service::create(['title' => 'A draft service', 'slug' => 'a-draft-service', 'summary' => 'x', 'body' => '<p>Words.</p>'] + $status),
            'product' => Product::create(['name' => 'A draft switch', 'slug' => 'a-draft-switch', 'description' => '<p>Words.</p>'] + $status),
            'store_product' => StoreProduct::create([
                'name' => 'A draft licence', 'slug' => 'a-draft-licence', 'price_paise' => 1000000, 'track_stock' => false, 'stock' => 0,
                'description' => '<p>Words.</p>',
            ] + $status),
            'event' => Event::create([
                'title' => 'A draft seminar', 'slug' => 'a-draft-seminar', 'summary' => 'x', 'format' => 'online',
                'starts_at' => '2026-12-12 15:00:00', 'online_url' => 'https://meet.example.test/secret-room',
                'registration_mode' => 'none', 'body' => '<p>Words.</p>',
            ] + $status),
            'job_opening' => JobOpening::create(['title' => 'A draft vacancy', 'slug' => 'a-draft-vacancy', 'summary' => 'x', 'description' => '<p>Words.</p>'] + $status),
            'entry' => Entry::create([
                'content_type_id' => ContentType::create([
                    'name' => 'Partner story', 'plural' => 'Partner stories', 'slug' => 'partner-stories',
                    'is_active' => true, 'archive_enabled' => true,
                ])->id,
                'title' => 'A draft story', 'slug' => 'a-draft-story', 'summary' => 'x', 'body' => '<p>Words.</p>',
            ] + $status),
            'landing_page' => LandingPage::create([
                'kind' => 'brand_category',
                'brand_id' => Brand::create(['name' => 'Cisco', 'slug' => 'cisco'])->id,
                'product_category_id' => ProductCategory::create(['name' => 'Switches', 'slug' => 'switches'])->id,
                'title' => 'Cisco Switches', 'heading' => 'Cisco switches we supply', 'intro' => '<p>Words.</p>',
            ] + $status),
        };
    }

    /**
     * alias => [alias, watched column that carries the written body, the role that owns it,
     *           a role that does not, whether the kind has sections].
     *
     * @return array<string, array{0: string, 1: string, 2: RoleEnum, 3: RoleEnum, 4: bool}>
     */
    public static function kinds(): array
    {
        return [
            'blog_post' => ['blog_post', 'body', RoleEnum::ContentManager, RoleEnum::StoreManager, true],
            'knowledge_article' => ['knowledge_article', 'body', RoleEnum::ContentManager, RoleEnum::StoreManager, true],
            'case_study' => ['case_study', 'body', RoleEnum::ContentManager, RoleEnum::StoreManager, true],
            'solution' => ['solution', 'overview', RoleEnum::ContentManager, RoleEnum::StoreManager, true],
            'service' => ['service', 'body', RoleEnum::ContentManager, RoleEnum::StoreManager, true],
            'product' => ['product', 'description', RoleEnum::ContentManager, RoleEnum::StoreManager, true],
            'store_product' => ['store_product', 'description', RoleEnum::StoreManager, RoleEnum::ContentManager, true],
            'event' => ['event', 'body', RoleEnum::ContentManager, RoleEnum::StoreManager, true],
            'job_opening' => ['job_opening', 'description', RoleEnum::ContentManager, RoleEnum::StoreManager, true],
            'entry' => ['entry', 'body', RoleEnum::ContentManager, RoleEnum::StoreManager, true],
            'landing_page' => ['landing_page', 'intro', RoleEnum::SeoManager, RoleEnum::ContentManager, false],
        ];
    }

    #[DataProvider('kinds')]
    public function test_creating_a_record_of_this_kind_is_its_first_revision(string $alias, string $column, RoleEnum $owner, RoleEnum $other, bool $sections): void
    {
        $record = $this->draft($alias);

        $rows = $this->revisions($record, $alias);

        $this->assertCount(1, $rows);
        $this->assertSame(['created'], $rows[0]->changed);
        $this->assertSame($record->getAttribute($column), $rows[0]->snapshot[$column]);
        $this->assertEqualsCanonicalizing(Revisions::columns($alias), array_keys($rows[0]->snapshot));
    }

    #[DataProvider('kinds')]
    public function test_a_change_to_a_watched_column_is_a_revision(string $alias, string $column, RoleEnum $owner, RoleEnum $other, bool $sections): void
    {
        $record = $this->draft($alias);

        $record->update([$column => '<p>Changed words.</p>']);

        $rows = $this->revisions($record, $alias);
        $this->assertCount(2, $rows);
        $this->assertSame([$column], $rows[1]->changed);
        $this->assertSame('<p>Changed words.</p>', $rows[1]->snapshot[$column]);
    }

    #[DataProvider('kinds')]
    public function test_a_change_to_the_sections_or_their_layout_is_a_revision(string $alias, string $column, RoleEnum $owner, RoleEnum $other, bool $sections): void
    {
        if (! $sections) {
            $this->assertNotContains('blocks', Revisions::columns($alias));
            $this->assertNotContains('body_layout', Revisions::columns($alias));

            return;
        }

        $record = $this->draft($alias);

        $record->update(['body_layout' => 'sections', 'blocks' => [self::block('Laid out')]]);

        $rows = $this->revisions($record, $alias);
        $this->assertCount(2, $rows);
        $this->assertSame(['body_layout', 'blocks'], $rows[1]->changed);
        $this->assertSame(1, $rows[1]->blocks_count);
        $this->assertSame('sections', $rows[1]->snapshot['body_layout']);
    }

    #[DataProvider('kinds')]
    public function test_a_status_only_change_records_nothing_for_this_kind(string $alias, string $column, RoleEnum $owner, RoleEnum $other, bool $sections): void
    {
        $record = $this->draft($alias);
        $class = $record::class;

        // A freshly loaded instance, as the console's status change is.
        $class::query()->findOrFail($record->getKey())->update(['status' => 'published']);
        $class::query()->findOrFail($record->getKey())->update(['status' => 'archived']);

        $rows = $this->revisions($record, $alias);
        $this->assertCount(1, $rows);
        $this->assertArrayNotHasKey('status', $rows[0]->snapshot);
        $this->assertArrayNotHasKey('published_at', $rows[0]->snapshot);
    }

    #[DataProvider('kinds')]
    public function test_the_role_that_owns_the_kind_reads_its_history_and_another_does_not(string $alias, string $column, RoleEnum $owner, RoleEnum $other, bool $sections): void
    {
        $record = $this->draft($alias);
        $record->update([$column => '<p>Second.</p>']);
        $first = $this->revisions($record, $alias)->first();

        $list = $this->asStaff($owner)->getJson("/api/v1/admin/revisions?type={$alias}&id={$record->getKey()}")->assertOk();
        $this->assertCount(2, $list->json('data'));
        $this->assertSame([$column], $list->json('data.0.changed'));
        $this->assertTrue($list->json('meta.restorable'));
        $this->assertSame(Revisions::bodyColumns($alias), $list->json('meta.body_columns'));
        $this->assertSame(Revisions::labels($alias)[$column], $list->json("meta.labels.{$column}"));
        $this->asStaff($owner)->getJson('/api/v1/admin/revisions/'.$first->id)->assertOk()
            ->assertJsonPath('data.type', $alias);

        $this->asStaff($other)->getJson("/api/v1/admin/revisions?type={$alias}&id={$record->getKey()}")->assertForbidden();
        $this->asStaff($other)->getJson('/api/v1/admin/revisions/'.$first->id)->assertForbidden();
        $this->asStaff(RoleEnum::Admin)->getJson("/api/v1/admin/revisions?type={$alias}&id={$record->getKey()}")->assertOk();
    }

    #[DataProvider('kinds')]
    public function test_deleting_a_record_of_this_kind_deletes_its_history(string $alias, string $column, RoleEnum $owner, RoleEnum $other, bool $sections): void
    {
        $record = $this->draft($alias);
        $record->update([$column => '<p>Second.</p>']);
        $this->assertCount(2, $this->revisions($record, $alias));

        $record->delete();

        $this->assertCount(0, $this->revisions($record, $alias));
    }

    public function test_a_store_manager_has_a_shop_products_history_and_not_a_posts(): void
    {
        $product = $this->draft('store_product');
        $post = $this->draft('blog_post');

        $this->asStaff(RoleEnum::StoreManager)->getJson("/api/v1/admin/revisions?type=store_product&id={$product->id}")->assertOk();
        $this->asStaff(RoleEnum::StoreManager)->getJson("/api/v1/admin/revisions?type=blog_post&id={$post->id}")->assertForbidden();
        $this->asStaff(RoleEnum::ContentManager)->getJson("/api/v1/admin/revisions?type=blog_post&id={$post->id}")->assertOk();
        $this->asStaff(RoleEnum::ContentManager)->getJson("/api/v1/admin/revisions?type=store_product&id={$product->id}")->assertForbidden();
    }

    public function test_a_save_through_the_console_records_who_made_it_on_a_non_page_kind(): void
    {
        $post = $this->draft('blog_post');

        $this->asStaff(RoleEnum::ContentManager, 'poster')
            ->patchJson("/api/v1/admin/blog-posts/{$post->id}", ['title' => 'Edited through the console'])
            ->assertOk();

        $rows = $this->revisions($post, 'blog_post');
        $this->assertCount(2, $rows);
        $this->assertSame('Content_manager poster', $rows[1]->actor_name);
        $this->assertSame(['title'], $rows[1]->changed);
    }

    public function test_every_registered_kind_names_a_written_body_and_no_kind_is_preview_only(): void
    {
        foreach (Revisions::aliases() as $alias) {
            if ($alias === 'saved_section') {
                continue; // the library holds sections, not a written body
            }

            $this->assertNotEmpty(Revisions::bodyColumns($alias), $alias);
            $this->assertEmpty(array_diff(Revisions::bodyColumns($alias), Revisions::columns($alias)), "{$alias}: a body column is not watched");
            $this->assertTrue(Revisions::restorable($alias), $alias);
        }
    }

    // -------------------------------------------------------------- registry

    public function test_every_kind_that_can_be_shared_is_registered_or_named_as_deferred(): void
    {
        foreach (PreviewLinks::aliases() as $alias) {
            $this->assertTrue(
                Revisions::knows($alias) || in_array($alias, Revisions::DEFERRED, true),
                "{$alias} has share links but is neither registered in Revisions nor listed as deferred.",
            );
        }

        $this->assertSame([], array_intersect(Revisions::aliases(), Revisions::DEFERRED), 'a kind cannot be both');
    }

    public function test_a_registered_kind_never_holds_status_or_publication(): void
    {
        foreach (Revisions::aliases() as $alias) {
            $this->assertEmpty(array_intersect(['status', 'published_at'], Revisions::columns($alias)), $alias);
        }
    }
}
