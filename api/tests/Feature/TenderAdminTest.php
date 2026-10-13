<?php

namespace Tests\Feature;

use App\Enums\MenuItemType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\ContentType;
use App\Models\Media;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Models\Page;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\Tender;
use App\Models\TenderCategory;
use App\Models\User;
use App\Support\Chat\Retriever;
use App\Support\SiteSection;
use App\Support\StructuredData;
use App\Support\Tenders\TenderWindow;
use Database\Seeders\SampleTenderSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Tenders, from the console's side (0.174.0, docs/tenders.md): the CRUD and
 * its rules, who may reach it, and every other place a tender appears —
 * search, menus, the SEO overview, the page builder, the assistant, the
 * reserved slug.
 *
 * **Those last seven are the ones worth having.** A missed morph-map or
 * site-section entry fails at runtime, in the browser, not in CI — which is
 * exactly what the two wiring tests at the foot of `EventAdminTest` were
 * written for. These are their twins.
 *
 * The clock is fixed at Tuesday 20 October 2026, 10:00 IST.
 */
class TenderAdminTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-20 10:00:00', 'Asia/Kolkata'));
    }

    private function staff(RoleEnum $role = RoleEnum::ContentManager, ?string $email = null): User
    {
        $user = User::create([
            'name' => ucfirst($role->value), 'email' => $email ?? $role->value.'-'.Str::random(6).'@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    /** @param  array<string, mixed>  $overrides */
    private function body(array $overrides = []): array
    {
        return array_replace([
            'reference' => 'TW/2026/014',
            'title' => 'Campus network refresh',
            'summary' => 'Switching and wireless for three buildings.',
            'description' => '<p>The scope of work.</p>',
            'status' => 'published',
            'opens_at' => '2026-10-21T10:00',
            'closes_at' => '2026-11-10T18:00',
            'submission_email' => 'tenders@example.test',
        ], $overrides);
    }

    /** @param  array<string, mixed>  $overrides */
    private function create(array $overrides = [])
    {
        return $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/tenders', $this->body($overrides));
    }

    private int $made = 0;

    /** @param  array<string, mixed>  $overrides */
    private function tender(array $overrides = []): Tender
    {
        $this->made++;

        return Tender::create(array_replace([
            'reference' => sprintf('TW/2026/%03d', $this->made),
            'title' => 'Campus network refresh',
            'slug' => 'campus-network-refresh',
            'summary' => 'Switching and wireless for three buildings.',
            'description' => '<p>The scope of work.</p>',
            'status' => PublishStatus::Published,
            'opens_at' => '2026-10-16 10:00:00',
            'closes_at' => '2026-11-10 18:00:00',
            'submission_email' => 'tenders@example.test',
        ], $overrides));
    }

    /* ---------------------------------------------------------------- CRUD */

    public function test_a_tender_is_created_with_its_slug_derived_and_its_labels_returned(): void
    {
        $response = $this->create()->assertCreated();

        $this->assertSame('campus-network-refresh', $response->json('data.slug'));
        $this->assertSame('TW/2026/014', $response->json('data.reference'));
        // Wall clock back out, the instant beside it.
        $this->assertSame('2026-11-10T18:00', $response->json('data.closes_at'));
        $this->assertSame('Tuesday 10 November 2026, 6:00 pm IST', $response->json('data.closes_label'));
        $this->assertSame('upcoming', $response->json('data.state'));
        $this->assertSame('/tenders/campus-network-refresh', $response->json('data.public_path'));
        $this->assertSame('IST', $response->json('meta.timezone'));
        $this->assertSame(10, $response->json('meta.max_documents'));
        $this->assertSame(3, $response->json('meta.closing_soon_days'));
    }

    public function test_a_second_tender_cannot_take_a_reference_in_use(): void
    {
        $this->tender(['reference' => 'TW/2026/014']);

        $this->create(['reference' => 'TW/2026/014'])
            ->assertStatus(422)
            ->assertJsonPath('errors.reference.0', 'Another tender already has that number.');
    }

    public function test_the_dates_are_held_to_each_other(): void
    {
        $this->create(['opens_at' => '2026-11-10T18:00', 'closes_at' => '2026-11-10T18:00'])
            ->assertStatus(422)
            ->assertJsonPath('errors.closes_at.0', 'The last date for submission has to be after the tender opens.');

        $this->create(['opening_at' => '2026-11-09T11:00'])
            ->assertStatus(422)
            ->assertJsonPath('errors.opening_at.0', 'Bids are opened after the last date for submission, not before it.');

        $this->create(['prebid_at' => '2026-11-11T11:00', 'prebid_place' => 'Room 2'])
            ->assertStatus(422)
            ->assertJsonPath('errors.prebid_at.0', 'A pre-bid meeting happens before the last date for submission.');

        $this->create(['prebid_at' => '2026-10-20T11:00', 'prebid_place' => 'Room 2'])
            ->assertStatus(422)
            ->assertJsonPath('errors.prebid_at.0', 'A pre-bid meeting cannot be before the tender opens.');
    }

    public function test_a_pre_bid_meeting_with_no_place_is_refused(): void
    {
        $this->create(['prebid_at' => '2026-10-28T11:00'])
            ->assertStatus(422)
            ->assertJsonPath('errors.prebid_place.0', 'Where is the pre-bid meeting? A time on its own is not something anyone can attend.');
    }

    public function test_a_notice_nobody_can_answer_cannot_be_published(): void
    {
        $this->create(['submission_email' => null, 'submission_url' => null, 'submission_address' => null])
            ->assertStatus(422)
            ->assertJsonPath('errors.submission_email.0', 'How should a bid be submitted? Add an email address, a link or a postal address before publishing.');

        // A draft may be as unfinished as it likes.
        $this->create(['status' => 'draft', 'submission_email' => null])->assertCreated();

        // And any one of the three is enough.
        $this->create(['slug' => 'by-post', 'reference' => 'TW/2026/015', 'submission_email' => null, 'submission_address' => 'Procurement desk, Kolkata'])
            ->assertCreated();
    }

    public function test_a_partial_edit_is_held_to_the_stored_half(): void
    {
        $tender = $this->tender(['opens_at' => '2026-10-16 10:00:00', 'closes_at' => '2026-11-10 18:00:00']);

        // Only the closing date is sent; it is compared with the stored
        // opening date. An invariant checked only when both halves arrive
        // together is not an invariant.
        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/tenders/{$tender->id}", ['closes_at' => '2026-10-15T18:00'])
            ->assertStatus(422)
            ->assertJsonPath('errors.closes_at.0', 'The last date for submission has to be after the tender opens.');

        // And the same edit with a date that works goes through.
        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/tenders/{$tender->id}", ['closes_at' => '2026-11-20T18:00'])
            ->assertOk()
            ->assertJsonPath('data.closes_at', '2026-11-20T18:00');
    }

    public function test_an_edit_that_would_leave_a_published_tender_unanswerable_is_refused(): void
    {
        $tender = $this->tender(['submission_email' => 'tenders@example.test']);

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/tenders/{$tender->id}", ['submission_email' => null])
            ->assertStatus(422)
            ->assertJsonPath('errors.submission_email.0', 'How should a bid be submitted? Add an email address, a link or a postal address before publishing.');
    }

    public function test_renaming_the_slug_writes_a_redirect(): void
    {
        $tender = $this->tender(['slug' => 'campus-network-refresh']);

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/tenders/{$tender->id}", ['slug' => 'campus-refresh-2026'])
            ->assertOk();

        $this->assertDatabaseHas('redirects', [
            'from_path' => '/tenders/campus-network-refresh',
            'to_path' => '/tenders/campus-refresh-2026',
        ]);
    }

    public function test_a_document_must_be_in_the_library_and_comes_back_with_its_path_and_url(): void
    {
        $media = Media::create([
            'filename' => 'pack.pdf', 'path' => 'media/tenders/pack.pdf',
            'mime' => 'application/pdf', 'size' => 2048, 'disk' => 'public',
        ]);

        // The error key is the dotted path, flat — which is what the console
        // maps to the row's own field.
        $this->create(['documents' => [['title' => 'Pack', 'file_path' => 'media/nope.pdf']]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['documents.0.file_path' => 'That file is not in the media library.']);

        $response = $this->create(['documents' => [['title' => 'Pack', 'file_path' => $media->path, 'note' => 'Read first']]])
            ->assertCreated();

        $document = $response->json('data.documents.0');
        $this->assertSame('media/tenders/pack.pdf', $document['file_path'], 'The path is what a save posts back.');
        $this->assertStringContainsString('media/tenders/pack.pdf', (string) $document['url']);
        $this->assertFalse($document['missing']);
    }

    public function test_the_console_says_when_a_documents_file_has_gone(): void
    {
        $tender = $this->tender(['documents' => [['title' => 'Pack', 'file_path' => 'media/tenders/gone.pdf', 'note' => null]]]);

        $document = $this->actingAs($this->staff(), 'sanctum')
            ->getJson("/api/v1/admin/tenders/{$tender->id}")->assertOk()->json('data.documents.0');

        // Hiding it would make the row simply wrong, and the editor is the
        // only one who can fix it.
        $this->assertTrue($document['missing']);
        $this->assertNull($document['url']);
        $this->assertSame(0, $this->actingAs($this->staff(), 'sanctum')
            ->getJson("/api/v1/admin/tenders/{$tender->id}")->json('data.documents_count'));
    }

    public function test_the_list_filters_sorts_and_finds_tenders_filed_nowhere(): void
    {
        $category = TenderCategory::create(['name' => 'Networking']);
        $this->tender(['slug' => 'filed', 'tender_category_id' => $category->id]);
        $this->tender(['title' => 'Unfiled', 'slug' => 'unfiled']);
        $this->tender(['title' => 'A draft', 'slug' => 'draft', 'status' => PublishStatus::Draft]);

        $staff = $this->staff();

        $this->assertCount(3, $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/tenders')->assertOk()->json('data'));

        $none = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/tenders?category=none')->assertOk()->json('data');
        $this->assertSame(['unfiled', 'draft'], array_column($none, 'slug'));

        $filed = $this->actingAs($staff, 'sanctum')->getJson("/api/v1/admin/tenders?category={$category->id}")->assertOk()->json('data');
        $this->assertSame(['filed'], array_column($filed, 'slug'));

        $drafts = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/tenders?status=draft')->assertOk()->json('data');
        $this->assertSame(['draft'], array_column($drafts, 'slug'));

        // The allowlist, and an unknown key falls back rather than 422ing.
        $byTitle = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/tenders?sort=title&dir=asc')->assertOk()->json('data');
        $this->assertSame('A draft', $byTitle[0]['title']);
        $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/tenders?sort=nonsense')->assertOk();
    }

    public function test_an_index_row_carries_no_scope_of_work(): void
    {
        $this->tender();

        $row = $this->actingAs($this->staff(), 'sanctum')->getJson('/api/v1/admin/tenders')->assertOk()->json('data.0');

        // A list of forty tenders has no use for forty scopes of work.
        $this->assertArrayNotHasKey('description', $row);
        $this->assertArrayNotHasKey('seo', $row);
        $this->assertArrayHasKey('closes_label', $row);
    }

    public function test_duplicating_makes_a_draft_with_a_free_reference_and_no_seo(): void
    {
        $tender = $this->tender(['reference' => 'TW/2026/014', 'status' => PublishStatus::Published]);
        $tender->seo()->create(['title' => 'A hand-written title']);

        $response = $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/tenders/{$tender->id}/duplicate")
            ->assertCreated();

        $this->assertSame('draft', $response->json('data.status'));
        $this->assertSame('Campus network refresh (copy)', $response->json('data.title'));
        $this->assertSame('TW/2026/014-copy', $response->json('data.reference'));
        $this->assertNotSame($tender->slug, $response->json('data.slug'));
        // Two pages with one hand-written title is the duplicate the SEO
        // overview exists to find.
        $this->assertNull($response->json('data.seo.title'));
    }

    public function test_deleting_a_tender_takes_its_seo_row_and_leaves_its_documents_in_the_library(): void
    {
        $media = Media::create([
            'filename' => 'pack.pdf', 'path' => 'media/tenders/pack.pdf',
            'mime' => 'application/pdf', 'size' => 2048, 'disk' => 'public',
        ]);
        $tender = $this->tender(['documents' => [['title' => 'Pack', 'file_path' => $media->path, 'note' => null]]]);
        $tender->seo()->create(['title' => 'A title']);

        $this->actingAs($this->staff(), 'sanctum')
            ->deleteJson("/api/v1/admin/tenders/{$tender->id}")
            ->assertOk()->assertJsonPath('message', 'Tender deleted.');

        $this->assertDatabaseMissing('tenders', ['id' => $tender->id]);
        // Polymorphic, so nothing cascades it.
        $this->assertDatabaseMissing('seo_metadata', ['seoable_type' => 'tender', 'seoable_id' => $tender->id]);
        // The library is where a file is removed, and the same PDF is often
        // on two tenders.
        $this->assertDatabaseHas('media', ['id' => $media->id]);
    }

    public function test_bulk_publishes_what_it_can_and_names_what_it_cannot(): void
    {
        $ready = $this->tender(['slug' => 'ready', 'status' => PublishStatus::Draft]);
        $unanswerable = $this->tender(['title' => 'No way in', 'slug' => 'no-way-in', 'status' => PublishStatus::Draft, 'submission_email' => null]);

        $response = $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/tenders/bulk', ['ids' => [$ready->id, $unanswerable->id], 'action' => 'publish'])
            ->assertOk();

        // 200 always: a triage pass over fifty rows should not stop at the
        // one it cannot move.
        $this->assertSame([$ready->id], $response->json('updated'));
        $this->assertSame($unanswerable->id, $response->json('refused.0.id'));
        $this->assertStringContainsString('How should a bid be submitted?', $response->json('refused.0.message'));
        $this->assertSame(PublishStatus::Published, $ready->fresh()?->status);
        $this->assertSame(PublishStatus::Draft, $unanswerable->fresh()?->status);
    }

    /* ---------------------------------------------------------- categories */

    public function test_a_category_derives_its_slug_and_counts_its_tenders(): void
    {
        $staff = $this->staff();

        $created = $this->actingAs($staff, 'sanctum')
            ->postJson('/api/v1/admin/tender-categories', ['name' => 'Annual maintenance'])
            ->assertCreated();

        $this->assertSame('annual-maintenance', $created->json('data.slug'));
        $this->assertTrue($created->json('data.is_active'));

        $this->tender(['tender_category_id' => $created->json('data.id')]);

        $this->assertSame(1, $this->actingAs($staff, 'sanctum')
            ->getJson('/api/v1/admin/tender-categories')->assertOk()->json('data.0.tenders_count'));
    }

    public function test_a_blank_slug_on_an_edit_derives_it_again(): void
    {
        $category = TenderCategory::create(['name' => 'Networking']);

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/tender-categories/{$category->id}", ['name' => 'Cabling', 'slug' => ''])
            ->assertOk()
            ->assertJsonPath('data.slug', 'cabling');
    }

    /* --------------------------------------------------------------- roles */

    public function test_only_a_content_manager_reaches_tenders(): void
    {
        $tender = $this->tender();

        foreach ([RoleEnum::SalesManager, RoleEnum::SupportEngineer, RoleEnum::StoreManager] as $role) {
            $this->app['auth']->forgetGuards();
            $this->actingAs($this->staff($role), 'sanctum')->getJson('/api/v1/admin/tenders')->assertForbidden();
            $this->app['auth']->forgetGuards();
            $this->actingAs($this->staff($role), 'sanctum')->getJson("/api/v1/admin/tenders/{$tender->id}")->assertForbidden();
        }

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')->getJson('/api/v1/admin/tenders')->assertOk();
    }

    public function test_a_content_manager_still_reaches_the_blog(): void
    {
        // The role is not narrowed by adding tenders to it.
        $this->actingAs($this->staff(), 'sanctum')->getJson('/api/v1/admin/blog-posts')->assertOk();
    }

    /* ------------------------------------------------------------- wiring */

    public function test_tenders_is_no_longer_an_address_a_page_or_a_content_type_can_take(): void
    {
        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->postJson('/api/v1/admin/pages', ['title' => 'Tenders', 'slug' => 'tenders', 'body' => '<p>Hello.</p>'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('slug');

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/content-types', ['name' => 'Tender', 'plural' => 'Tenders', 'slug' => 'tenders'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('slug');

        $this->assertDatabaseMissing('pages', ['slug' => 'tenders']);
        $this->assertDatabaseMissing('content_types', ['slug' => 'tenders']);
    }

    public function test_the_graph_is_a_webpage_and_claims_nothing_more(): void
    {
        $category = TenderCategory::create(['name' => 'Networking']);
        $tender = $this->tender(['tender_category_id' => $category->id, 'fee_paise' => 250000]);
        $tender->load('category');

        $graph = StructuredData::tender($tender);

        $this->assertSame('WebPage', $graph['@type']);
        $this->assertSame('Campus network refresh', $graph['name']);
        $this->assertSame('Networking', $graph['about']['name']);
        $this->assertArrayHasKey('datePublished', $graph);
        $this->assertSame('Organization', $graph['publisher']['@type']);

        // Schema.org has no tender type, so nothing richer is claimed. An
        // `Offer` would say this company is selling something at a price.
        $this->assertArrayNotHasKey('offers', $graph);
        $this->assertArrayNotHasKey('validThrough', $graph);
        $this->assertStringNotContainsString('250000', (string) json_encode($graph));
    }

    public function test_search_the_palette_the_assistant_and_the_seo_overview_find_a_tender(): void
    {
        $tender = $this->tender(['reference' => 'TW/2026/014']);
        $this->tender(['title' => 'Campus work, not published', 'slug' => 'unpublished', 'status' => PublishStatus::Draft]);

        // Site search: published only, with the state and the deadline as
        // the kicker.
        $groups = collect($this->getJson('/api/v1/search?q=campus')->assertOk()->json('data.groups'));
        $group = $groups->firstWhere('type', 'tender');
        $this->assertSame('Tenders', $group['label']);
        $this->assertSame(1, $group['total']);
        $this->assertSame('/tenders/campus-network-refresh', $group['results'][0]['path']);
        $this->assertStringContainsString('Open', $group['results'][0]['kicker']);

        // And by the reference, however it is punctuated.
        $byNumber = collect($this->getJson('/api/v1/search?q='.urlencode('tw 2026 014'))->assertOk()->json('data.groups'));
        $this->assertSame(1, $byNumber->firstWhere('type', 'tender')['total']);

        // The console's palette: drafts too, for a role that may open them.
        $palette = collect($this->actingAs($this->staff(), 'sanctum')->getJson('/api/v1/admin/search?q=campus')->assertOk()->json('data'));
        $found = $palette->firstWhere('type', 'tender');
        $this->assertCount(2, $found['items']);
        $this->assertContains("/admin/tenders/{$tender->id}", array_column($found['items'], 'admin_path'));

        $this->app['auth']->forgetGuards();
        $sales = collect($this->actingAs($this->staff(RoleEnum::SalesManager), 'sanctum')->getJson('/api/v1/admin/search?q=campus')->assertOk()->json('data'));
        $this->assertNull($sales->firstWhere('type', 'tender'), 'A group the caller cannot open is absent, not empty.');

        // The assistant: open ones, with the reference and the deadline.
        $sources = collect(Retriever::for('Do you have any open tenders for campus networking?'));
        $source = $sources->firstWhere('type', 'tender');
        $this->assertSame('/tenders/campus-network-refresh', $source['url']);
        $this->assertStringContainsString('TW/2026/014', $source['excerpt']);
        $this->assertCount(1, $sources->where('type', 'tender'));

        // The SEO overview: a row per tender, at the console's own route.
        $this->app['auth']->forgetGuards();
        $rows = collect($this->actingAs($this->staff(RoleEnum::SeoManager), 'sanctum')->getJson('/api/v1/admin/seo?type=tender')->assertOk()->json('data'));
        $row = $rows->firstWhere('id', $tender->id);
        $this->assertSame('tender', $row['type']);
        $this->assertSame("/admin/tenders/{$tender->id}", $row['admin_path']);
        $this->assertSame('/tenders/campus-network-refresh', $row['public_path']);
    }

    public function test_the_assistant_never_offers_a_closed_tender(): void
    {
        $this->tender(['title' => 'Campus work, closed', 'slug' => 'shut', 'opens_at' => '2026-08-01 10:00:00', 'closes_at' => '2026-09-01 18:00:00']);

        // Offering a notice that shut last month reads as an invitation.
        $this->assertCount(0, collect(Retriever::for('Do you have any open tenders for campus work?'))->where('type', 'tender'));
    }

    public function test_menus_and_site_sections_know_a_tender(): void
    {
        $menu = Menu::create(['name' => 'Footer', 'location' => 'footer']);
        MenuItem::create(['menu_id' => $menu->id, 'sort_order' => 0, 'label' => 'Tenders', 'type' => 'section', 'target_key' => 'tenders', 'is_active' => true]);

        $hrefs = function () {
            Cache::flush();
            SiteSection::forgetContent();

            return array_column($this->getJson('/api/v1/menus/footer')->assertOk()->json('data'), 'href');
        };

        // The section is dropped until a tender is published.
        $this->assertSame([], $hrefs());

        $tender = $this->tender(['status' => PublishStatus::Draft]);
        $this->assertSame([], $hrefs(), 'A draft tender is not content.');

        // An item pointing at the tender itself follows the same rule.
        MenuItem::create([
            'menu_id' => $menu->id, 'sort_order' => 1, 'label' => 'Campus refresh', 'type' => MenuItemType::Tender->value,
            'target_type' => 'tender', 'target_id' => $tender->id, 'is_active' => true,
        ]);
        $this->assertSame([], $hrefs());

        $tender->update(['status' => PublishStatus::Published]);
        $this->assertSame(['/tenders', '/tenders/campus-network-refresh'], $hrefs());

        // A closed one stays linked: the archive is the point.
        $tender->update(['opens_at' => '2026-08-01 10:00:00', 'closes_at' => '2026-09-01 18:00:00']);
        $this->assertSame(['/tenders', '/tenders/campus-network-refresh'], $hrefs());
    }

    public function test_the_page_builders_cards_draw_what_is_open_closing_soonest_first(): void
    {
        $this->tender(['title' => 'Closes later', 'slug' => 'later', 'reference' => 'TW/2026/020', 'closes_at' => '2026-11-20 18:00:00']);
        $this->tender(['title' => 'Closes sooner', 'slug' => 'sooner', 'reference' => 'TW/2026/021', 'closes_at' => '2026-10-25 18:00:00']);
        $this->tender(['title' => 'Shut', 'slug' => 'shut', 'reference' => 'TW/2026/022', 'opens_at' => '2026-08-01 10:00:00', 'closes_at' => '2026-09-01 18:00:00']);

        $page = Page::create([
            'title' => 'Work with us', 'slug' => 'work-with-us', 'status' => PublishStatus::Published,
            'template' => 'builder', 'published_at' => now(),
            'blocks' => [[
                'id' => 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
                'type' => 'cards', 'hidden' => false,
                'data' => ['source' => 'tenders', 'limit' => 6],
            ]],
        ]);

        $section = $this->getJson("/api/v1/pages/{$page->slug}")->assertOk()->json('data.sections.0');

        $this->assertSame('/tenders', $section['data']['index_path']);
        $items = $section['data']['items'];
        // Open only, soonest first — a row of closed tenders invites a bid
        // nobody can make.
        $this->assertSame(['Closes sooner', 'Closes later'], array_column($items, 'title'));
        $this->assertSame('TW/2026/021', $items[0]['kicker']);
        $this->assertSame('Sunday 25 October 2026, 6:00 pm IST', $items[0]['meta']);
    }

    public function test_a_tender_can_be_previewed_from_a_share_link(): void
    {
        $tender = $this->tender(['slug' => 'draft-notice', 'status' => PublishStatus::Draft]);

        $created = $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/preview-links', ['type' => 'tender', 'id' => $tender->id])
            ->assertCreated();

        $path = (string) $created->json('data.path');
        $this->assertMatchesRegularExpression('#^/preview/[0-9a-f]{64}$#', $path);

        // The preview is the public read, so a draft comes back whole.
        $body = $this->getJson('/api/v1/'.ltrim($path, '/'))->assertOk();
        $this->assertSame('tender', $body->json('data.type'));
        $this->assertSame('Campus network refresh', $body->json('data.record.title'));
        $this->assertSame('draft', $body->json('meta.status'));
        // Minus the structured data, as every preview is.
        $this->assertArrayNotHasKey('schema', $body->json('data.record'));
    }

    public function test_a_save_is_recorded_as_a_version(): void
    {
        $tender = $this->tender();

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/tenders/{$tender->id}", ['title' => 'Campus refresh, reworded'])
            ->assertOk();

        $rows = $this->actingAs($this->staff(), 'sanctum')
            ->getJson("/api/v1/admin/revisions?type=tender&id={$tender->id}")
            ->assertOk()->json('data');

        $this->assertNotEmpty($rows);
    }

    public function test_the_sample_seeder_is_create_only_and_says_sample(): void
    {
        $this->seed(SampleTenderSeeder::class);

        $tenders = Tender::query()->get();
        $this->assertCount(3, $tenders);

        foreach ($tenders as $tender) {
            $this->assertStringContainsString('Sample', $tender->title);
            $this->assertStringContainsString('SAMPLE', $tender->reference);
        }

        // One open, one closing soon, one closed — what the demo needs to
        // show every state.
        $states = $tenders->map(fn (Tender $t) => TenderWindow::for($t)->state)->sort()->values()->all();
        $this->assertSame(['closed', 'closing_soon', 'open'], $states);

        // Re-seeding brings nothing back.
        $tenders->first()?->delete();
        $this->seed(SampleTenderSeeder::class);
        $this->assertCount(2, Tender::query()->get());
    }

    public function test_a_content_type_named_tender_is_not_confused_with_the_module(): void
    {
        // The morph map holds `tender`, and a content type's entries are
        // `entry` — so a type an editor happens to call "Tender" is fine as
        // long as its slug is free.
        $type = ContentType::create(['name' => 'Bid', 'plural' => 'Bids', 'slug' => 'bids', 'is_active' => true]);

        $this->assertSame('bids', $type->slug);
        $this->assertDatabaseHas('content_types', ['slug' => 'bids']);
    }

    public function test_an_old_redirect_is_not_written_over_the_index(): void
    {
        // Nothing here writes one, but the reserved slug means a page can
        // never sit at /tenders — so an editor cannot make the index
        // unreachable by accident.
        $this->assertDatabaseMissing('redirects', ['from_path' => '/tenders']);
        Redirect::query()->create(['from_path' => '/old-tenders', 'to_path' => '/tenders', 'status_code' => 301, 'is_active' => true]);

        $this->getJson('/api/v1/redirects/lookup?path=/old-tenders')->assertOk()->assertJsonPath('data.to', '/tenders');
    }
}
