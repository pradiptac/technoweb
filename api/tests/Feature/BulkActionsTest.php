<?php

namespace Tests\Feature;

use App\Enums\LandingPageKind;
use App\Enums\Role as RoleEnum;
use App\Models\Activity;
use App\Models\BlogPost;
use App\Models\Brand;
use App\Models\CaseStudy;
use App\Models\ContentType;
use App\Models\Customer;
use App\Models\Download;
use App\Models\Entry;
use App\Models\Event;
use App\Models\EventRegistration;
use App\Models\Faq;
use App\Models\Industry;
use App\Models\JobOpening;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Role;
use App\Models\SeoMetadata;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\Solution;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Downloads\DownloadFiles;
use Database\Seeders\SettingsSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Bulk actions on the console's content lists (0.139.0, docs/admin-console.md
 * "Bulk actions").
 *
 * Staff are authenticated with a real `Authorization: Bearer` header and the
 * resolved guard is forgotten before every switch of principal: `actingAs()`
 * stages the authentication by hand and tests the controller rather than the
 * wiring, and the guard a request resolved stays resolved for the rest of the
 * test.
 *
 * `assertExactJson` is what pins "absent": `assertJson` matches a subset, so
 * `refused: []` would be satisfied by a response full of refusals.
 */
class BulkActionsTest extends TestCase
{
    use RefreshDatabase;

    /** type => [admin path, role that owns it, model class] */
    private const STATUS_LISTS = [
        'page' => ['pages', RoleEnum::ContentManager, Page::class],
        'blog_post' => ['blog-posts', RoleEnum::ContentManager, BlogPost::class],
        'knowledge_article' => ['knowledge-articles', RoleEnum::ContentManager, KnowledgeArticle::class],
        'case_study' => ['case-studies', RoleEnum::ContentManager, CaseStudy::class],
        'solution' => ['solutions', RoleEnum::ContentManager, Solution::class],
        'service' => ['services', RoleEnum::ContentManager, Service::class],
        'product' => ['products', RoleEnum::ContentManager, Product::class],
        'store_product' => ['store/products', RoleEnum::StoreManager, StoreProduct::class],
        'event' => ['events', RoleEnum::ContentManager, Event::class],
        'job_opening' => ['job-openings', RoleEnum::ContentManager, JobOpening::class],
        'entry' => ['content-types/partner-stories/entries', RoleEnum::ContentManager, Entry::class],
        'download' => ['downloads', RoleEnum::ContentManager, Download::class],
    ];

    private const DELETE_ONLY_LISTS = [
        'brand' => ['brands', RoleEnum::ContentManager, Brand::class],
        'industry' => ['industries', RoleEnum::ContentManager, Industry::class],
        'product_category' => ['product-categories', RoleEnum::ContentManager, ProductCategory::class],
        'service_category' => ['service-categories', RoleEnum::ContentManager, ServiceCategory::class],
        'store_category' => ['store/categories', RoleEnum::StoreManager, StoreCategory::class],
    ];

    // ------------------------------------------------------------- helpers

    private function staff(RoleEnum $role): User
    {
        $user = User::firstOrCreate(
            ['email' => $role->value.'-bulk@example.test'],
            ['name' => ucfirst($role->value).' Person', 'password' => 'password-for-tests', 'is_active' => true],
        );
        $user->roles()->syncWithoutDetaching([
            Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id,
        ]);

        return $user;
    }

    private function asStaff(RoleEnum $role): static
    {
        $user = $this->staff($role);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function bulk(string $path, array $ids, string $action, RoleEnum $as = RoleEnum::Admin): TestResponse
    {
        return $this->asStaff($as)->postJson("/api/v1/admin/{$path}/bulk", ['ids' => $ids, 'action' => $action]);
    }

    private function contentType(): ContentType
    {
        return ContentType::firstOrCreate(['slug' => 'partner-stories'], [
            'name' => 'Partner story', 'plural' => 'Partner stories',
            'is_active' => true, 'archive_enabled' => true,
        ]);
    }

    /** The i-th record of a kind, in the given status. */
    private function make(string $type, int $i, string $status = 'draft'): Model
    {
        $s = ['status' => $status];
        $title = "Bulk {$type} {$i}";
        $slug = Str::slug($title);

        return match ($type) {
            'page' => Page::create(['title' => $title, 'slug' => $slug, 'body' => '<p>Words.</p>'] + $s),
            'blog_post' => BlogPost::create([
                'title' => $title, 'slug' => $slug, 'excerpt' => 'x', 'body' => '<p>Words.</p>',
                'author_id' => $this->staff(RoleEnum::ContentManager)->id,
            ] + $s),
            'knowledge_article' => KnowledgeArticle::create(['title' => $title, 'slug' => $slug, 'excerpt' => 'x', 'body' => '<p>Words.</p>'] + $s),
            'case_study' => CaseStudy::create(['title' => $title, 'slug' => $slug, 'summary' => 'x', 'body' => '<p>Words.</p>'] + $s),
            'solution' => Solution::create(['title' => $title, 'slug' => $slug, 'summary' => 'x'] + $s),
            'service' => Service::create(['title' => $title, 'slug' => $slug, 'summary' => 'x'] + $s),
            'product' => Product::create(['name' => $title, 'slug' => $slug] + $s),
            'store_product' => StoreProduct::create([
                'name' => $title, 'slug' => $slug, 'price_paise' => 1000000, 'track_stock' => false, 'stock' => 0,
            ] + $s),
            'event' => Event::create([
                'title' => $title, 'slug' => $slug, 'summary' => 'x', 'format' => 'online',
                'starts_at' => '2026-12-12 15:00:00', 'registration_mode' => 'none',
            ] + $s),
            'job_opening' => JobOpening::create(['title' => $title, 'slug' => $slug, 'summary' => 'x'] + $s),
            'entry' => Entry::create([
                'content_type_id' => $this->contentType()->id, 'title' => $title, 'slug' => $slug, 'summary' => 'x',
            ] + $s),
            'download' => Download::create([
                'title' => $title, 'source' => 'library', 'access' => 'public', 'file_path' => "media/{$slug}.pdf",
            ] + $s),
            'brand' => Brand::create(['name' => $title, 'slug' => $slug]),
            'industry' => Industry::create(['name' => $title, 'slug' => $slug]),
            'product_category' => ProductCategory::create(['name' => $title, 'slug' => $slug]),
            'service_category' => ServiceCategory::create(['name' => $title, 'slug' => $slug]),
            'store_category' => StoreCategory::create(['name' => $title, 'slug' => $slug]),
        };
    }

    /** @return array<string, array{0: string}> */
    public static function statusTypes(): array
    {
        return array_combine(array_keys(self::STATUS_LISTS), array_map(fn ($t) => [$t], array_keys(self::STATUS_LISTS)));
    }

    /** @return array<string, array{0: string}> */
    public static function deleteOnlyTypes(): array
    {
        return array_combine(array_keys(self::DELETE_ONLY_LISTS), array_map(fn ($t) => [$t], array_keys(self::DELETE_ONLY_LISTS)));
    }

    /** @return array<string, array{0: string}> */
    public static function allTypes(): array
    {
        return self::statusTypes() + self::deleteOnlyTypes();
    }

    /** @return array{0: string, 1: RoleEnum, 2: class-string<Model>} */
    private static function list(string $type): array
    {
        return self::STATUS_LISTS[$type] ?? self::DELETE_ONLY_LISTS[$type];
    }

    // ------------------------------------------------------ status changes

    #[DataProvider('statusTypes')]
    public function test_publish_then_draft_then_archive_moves_every_ticked_row(string $type): void
    {
        [$path, $role, $class] = self::list($type);
        $a = $this->make($type, 1);
        $b = $this->make($type, 2);
        $untouched = $this->make($type, 3);

        $this->bulk($path, [$a->id, $b->id], 'publish', $role)
            ->assertOk()
            ->assertExactJson(['updated' => [$a->id, $b->id], 'refused' => []]);

        $this->assertSame('published', $a->fresh()->status->value);
        $this->assertSame('published', $b->fresh()->status->value);
        $this->assertSame('draft', $untouched->fresh()->status->value, 'An unticked row is left alone.');

        // The save went through the model, so the date was stamped where the
        // table has one — publishing that looked like it did nothing is the
        // bug `PublishStamp` exists for.
        if ($a->isFillable('published_at')) {
            $this->assertNotNull($a->fresh()->published_at);
            $this->assertNotNull($b->fresh()->published_at);
        }

        $this->bulk($path, [$a->id, $b->id], 'draft', $role)
            ->assertOk()
            ->assertExactJson(['updated' => [$a->id, $b->id], 'refused' => []]);
        $this->assertSame('draft', $a->fresh()->status->value);

        $this->bulk($path, [$a->id], 'archive', $role)
            ->assertOk()
            ->assertExactJson(['updated' => [$a->id], 'refused' => []]);
        $this->assertSame('archived', $a->fresh()->status->value);
        $this->assertSame('draft', $b->fresh()->status->value);
    }

    public function test_publishing_keeps_a_date_that_was_already_set(): void
    {
        $post = $this->make('blog_post', 1);
        $post->forceFill(['published_at' => '2025-01-02 03:04:05'])->save();

        $this->bulk('blog-posts', [$post->id], 'publish')->assertOk();

        $this->assertSame('2025-01-02 03:04:05', $post->fresh()->published_at->format('Y-m-d H:i:s'));
    }

    public function test_publishing_what_is_already_published_is_not_an_error(): void
    {
        $post = $this->make('blog_post', 1, 'published');

        $this->bulk('blog-posts', [$post->id], 'publish')
            ->assertOk()
            ->assertExactJson(['updated' => [$post->id], 'refused' => []]);
    }

    // ------------------------------------------------------------- deleting

    #[DataProvider('allTypes')]
    public function test_delete_removes_the_ticked_rows_and_only_those(string $type): void
    {
        [$path, $role, $class] = self::list($type);
        $a = $this->make($type, 1);
        $b = $this->make($type, 2);
        $kept = $this->make($type, 3);

        $this->bulk($path, [$a->id, $b->id], 'delete', $role)
            ->assertOk()
            ->assertExactJson(['updated' => [$a->id, $b->id], 'refused' => []]);

        $this->assertNull($class::find($a->id));
        $this->assertNull($class::find($b->id));
        $this->assertNotNull($class::find($kept->id));
    }

    public function test_deleting_a_post_clears_what_hangs_off_it(): void
    {
        $post = $this->make('blog_post', 1);
        $post->faqs()->create(['question' => 'Why?', 'answer' => '<p>Because.</p>', 'sort_order' => 0]);
        $post->seo()->create(['title' => 'A title']);

        $this->bulk('blog-posts', [$post->id], 'delete')->assertOk();

        $this->assertSame(0, Faq::query()->count());
        $this->assertSame(0, SeoMetadata::query()->count());
    }

    public function test_deleting_a_product_releases_its_slug_as_the_single_delete_does(): void
    {
        $product = $this->make('product', 1);
        $slug = $product->slug;

        $this->bulk('products', [$product->id], 'delete')->assertOk();

        $trashed = Product::withTrashed()->findOrFail($product->id);
        $this->assertTrue($trashed->trashed());
        $this->assertSame("{$slug}-deleted-{$product->id}", $trashed->slug);

        // And the address is free again.
        $this->assertNotNull(Product::create(['name' => 'Again', 'slug' => $slug, 'status' => 'draft']));
    }

    public function test_deleting_a_category_promotes_its_children_to_its_parent(): void
    {
        $root = ProductCategory::create(['name' => 'Root', 'slug' => 'root']);
        $middle = ProductCategory::create(['name' => 'Middle', 'slug' => 'middle', 'parent_id' => $root->id]);
        $leaf = ProductCategory::create(['name' => 'Leaf', 'slug' => 'leaf', 'parent_id' => $middle->id]);

        $this->bulk('product-categories', [$middle->id], 'delete')
            ->assertOk()
            ->assertExactJson(['updated' => [$middle->id], 'refused' => []]);

        $this->assertSame($root->id, $leaf->fresh()->parent_id, 'Children go to the grandparent, not to the top level.');
    }

    public function test_deleting_a_download_removes_its_private_file(): void
    {
        Storage::fake('local');
        $path = DownloadFiles::FOLDER.'/'.Str::random(40).'.bin';
        Storage::disk('local')->put($path, 'firmware');
        $download = Download::create([
            'title' => 'Firmware', 'source' => 'upload', 'access' => 'customers', 'private_path' => $path,
            'file_name' => 'fw.bin', 'status' => 'published',
        ]);

        $this->bulk('downloads', [$download->id], 'delete')->assertOk();

        Storage::disk('local')->assertMissing($path);
    }

    // ---------------------------------------------------- refused, in words

    public function test_a_mixed_batch_half_refuses_and_still_answers_200(): void
    {
        $free = $this->make('event', 1);
        $taken = $this->make('event', 2);
        EventRegistration::create(['event_id' => $taken->id, 'name' => 'Guest', 'email' => 'guest@example.test', 'seats' => 1]);

        $response = $this->bulk('events', [$taken->id, $free->id], 'delete')->assertOk();

        $response->assertExactJson([
            'updated' => [$free->id],
            'refused' => [[
                'id' => $taken->id,
                'title' => $taken->title,
                'message' => 'People have registered for this event, so it cannot be deleted. Archive it instead.',
            ]],
        ]);
        $this->assertNull(Event::find($free->id));
        $this->assertNotNull(Event::find($taken->id));
    }

    public function test_an_online_event_without_a_join_link_is_refused_in_the_words_an_edit_gets(): void
    {
        $ready = $this->make('event', 1);
        $bare = $this->make('event', 2);
        $bare->forceFill(['format' => 'online', 'registration_mode' => 'open', 'online_url' => null])->save();

        $bulk = $this->bulk('events', [$bare->id, $ready->id], 'publish')->assertOk();

        $bulk->assertJsonPath('updated', [$ready->id])
            ->assertJsonCount(1, 'refused')
            ->assertJsonPath('refused.0.id', $bare->id);
        $this->assertSame('draft', $bare->fresh()->status->value);

        // One definition: the edit screen says exactly this.
        $edit = $this->asStaff(RoleEnum::Admin)->patchJson("/api/v1/admin/events/{$bare->id}", ['status' => 'published'])->assertStatus(422);
        $this->assertSame($edit->json('errors.online_url.0'), $bulk->json('refused.0.message'));
    }

    /**
     * Publishing what is already published changes nothing and is not judged
     * again: a row that is live is reported as done, never as refused for a
     * rule it would fail today.
     */
    public function test_a_record_already_in_the_status_asked_for_is_not_judged_again(): void
    {
        $live = $this->make('event', 1, 'published');
        $live->forceFill(['format' => 'online', 'registration_mode' => 'open', 'online_url' => null])->save();

        $this->bulk('events', [$live->id], 'publish')->assertOk()
            ->assertExactJson(['updated' => [$live->id], 'refused' => []]);

        $this->assertSame('published', $live->fresh()->status->value);
    }

    public function test_a_download_without_a_file_is_refused_in_the_words_an_edit_gets(): void
    {
        $empty = Download::create(['title' => 'Nothing yet', 'source' => 'library', 'status' => 'draft']);
        $full = $this->make('download', 1);

        $bulk = $this->bulk('downloads', [$empty->id, $full->id], 'publish')->assertOk();

        $bulk->assertJsonPath('updated', [$full->id])->assertJsonPath('refused.0.id', $empty->id);
        $this->assertSame('draft', $empty->fresh()->status->value);

        $edit = $this->asStaff(RoleEnum::Admin)->patchJson("/api/v1/admin/downloads/{$empty->id}", ['status' => 'published'])->assertStatus(422);
        $this->assertSame($edit->json('errors.status.0'), $bulk->json('refused.0.message'));
    }

    public function test_a_landing_page_that_has_not_earned_it_is_refused_with_the_gates_sentences(): void
    {
        $this->seed(SettingsSeeder::class);
        $brand = Brand::create(['name' => 'Cisco', 'slug' => 'cisco']);
        $category = ProductCategory::create(['name' => 'Network Switches', 'slug' => 'switches']);

        foreach (range(1, 3) as $i) {
            Product::create([
                'name' => "Catalyst {$i}", 'slug' => "catalyst-{$i}", 'sku' => "SKU{$i}",
                'brand_id' => $brand->id, 'product_category_id' => $category->id, 'status' => 'published',
            ]);
        }

        $intro = '<p>We have fitted Cisco switching in eleven buildings across the region in the last three years, '
            .'so the parts we hold on the van are the ones these sites actually fail on. '
            .'Every unit listed below is one an engineer here has configured, racked and handed over, '
            .'and the configuration templates we start from came out of those jobs rather than out of a datasheet.</p>';

        $good = LandingPage::create([
            'kind' => LandingPageKind::BrandCategory, 'brand_id' => $brand->id, 'product_category_id' => $category->id,
            'title' => 'Cisco Network Switches', 'heading' => 'Cisco network switches we supply', 'intro' => $intro, 'status' => 'draft',
        ]);

        $firewalls = ProductCategory::create(['name' => 'Firewalls', 'slug' => 'firewalls']);
        $thin = LandingPage::create([
            'kind' => LandingPageKind::BrandCategory, 'brand_id' => $brand->id, 'product_category_id' => $firewalls->id,
            'title' => 'Cisco Firewalls', 'heading' => 'Cisco firewalls', 'status' => 'draft',
        ]);

        $bulk = $this->bulk('landing-pages', [$thin->id, $good->id], 'publish', RoleEnum::SeoManager)->assertOk();

        $bulk->assertJsonPath('updated', [$good->id])->assertJsonPath('refused.0.id', $thin->id);
        $this->assertSame('published', $good->fresh()->status->value);
        $this->assertNotNull($good->fresh()->published_at);
        $this->assertSame('draft', $thin->fresh()->status->value);

        $edit = $this->asStaff(RoleEnum::SeoManager)->patchJson("/api/v1/admin/landing-pages/{$thin->id}", ['status' => 'published'])->assertStatus(422);
        $this->assertSame(implode(' ', $edit->json('errors.status')), $bulk->json('refused.0.message'));

        // Archiving the thin one needs no gate, and deleting the good one works.
        $this->bulk('landing-pages', [$thin->id], 'archive', RoleEnum::SeoManager)
            ->assertExactJson(['updated' => [$thin->id], 'refused' => []]);
        $this->bulk('landing-pages', [$good->id], 'delete', RoleEnum::SeoManager)
            ->assertExactJson(['updated' => [$good->id], 'refused' => []]);
        $this->assertNull(LandingPage::find($good->id));
    }

    public function test_an_id_that_does_not_exist_is_absent_from_both_lists(): void
    {
        $post = $this->make('blog_post', 1);

        $this->bulk('blog-posts', [999999, $post->id], 'publish')
            ->assertOk()
            ->assertExactJson(['updated' => [$post->id], 'refused' => []]);

        $this->bulk('blog-posts', [999999], 'delete')
            ->assertOk()
            ->assertExactJson(['updated' => [], 'refused' => []]);
    }

    public function test_an_entry_of_another_type_is_absent_from_the_answer_and_untouched(): void
    {
        $mine = $this->make('entry', 1);
        $other = ContentType::create(['name' => 'Case', 'plural' => 'Cases', 'slug' => 'cases', 'is_active' => true]);
        $theirs = Entry::create(['content_type_id' => $other->id, 'title' => 'Theirs', 'slug' => 'theirs', 'summary' => 'x', 'status' => 'draft']);

        $this->bulk('content-types/partner-stories/entries', [$mine->id, $theirs->id], 'publish')
            ->assertOk()
            ->assertExactJson(['updated' => [$mine->id], 'refused' => []]);

        $this->assertSame('draft', $theirs->fresh()->status->value);

        $this->bulk('content-types/partner-stories/entries', [$theirs->id], 'delete')
            ->assertExactJson(['updated' => [], 'refused' => []]);
        $this->assertNotNull(Entry::find($theirs->id));
    }

    // --------------------------------------------------------- the request

    #[DataProvider('deleteOnlyTypes')]
    public function test_a_list_without_a_status_refuses_publish_with_a_422_on_action(string $type): void
    {
        [$path, $role] = self::list($type);
        $record = $this->make($type, 1);

        foreach (['publish', 'draft', 'archive', 'nonsense'] as $action) {
            $this->bulk($path, [$record->id], $action, $role)
                ->assertStatus(422)
                ->assertJsonValidationErrors('action');
        }
    }

    #[DataProvider('allTypes')]
    public function test_more_than_a_hundred_ids_is_a_422(string $type): void
    {
        [$path, $role] = self::list($type);
        $this->contentType();

        $this->bulk($path, range(1, 101), 'delete', $role)->assertStatus(422)->assertJsonValidationErrors('ids');
        $this->bulk($path, [], 'delete', $role)->assertStatus(422)->assertJsonValidationErrors('ids');
        $this->bulk($path, ['abc'], 'delete', $role)->assertStatus(422)->assertJsonValidationErrors('ids.0');
        $this->bulk($path, [1, 1], 'delete', $role)->assertStatus(422)->assertJsonValidationErrors('ids.0');

        // A hundred is allowed.
        $this->bulk($path, range(1, 100), 'delete', $role)->assertOk()->assertExactJson(['updated' => [], 'refused' => []]);
    }

    #[DataProvider('allTypes')]
    public function test_the_bulk_route_is_not_swallowed_by_the_id_route(string $type): void
    {
        [$path] = self::list($type);

        $route = Route::getRoutes()->match(Request::create("/api/v1/admin/{$path}/bulk", 'POST'));

        $this->assertSame('bulk', $route->getActionMethod(), "POST /admin/{$path}/bulk must reach bulk().");
    }

    // ---------------------------------------------------------------- roles

    public function test_the_role_that_owns_a_list_owns_its_bulk_route_both_ways(): void
    {
        $post = $this->make('blog_post', 1);
        $product = $this->make('store_product', 1);
        $page = $this->make('page', 1);
        $landing = LandingPage::create([
            'kind' => LandingPageKind::BrandCategory, 'title' => 'x', 'heading' => 'x', 'status' => 'draft',
            'brand_id' => Brand::create(['name' => 'Cisco', 'slug' => 'cisco'])->id,
            'product_category_id' => ProductCategory::create(['name' => 'Switches', 'slug' => 'switches'])->id,
        ]);

        // A content manager cannot reach the shop or the landing pages.
        $this->bulk('store/products', [$product->id], 'delete', RoleEnum::ContentManager)->assertForbidden();
        $this->bulk('landing-pages', [$landing->id], 'delete', RoleEnum::ContentManager)->assertForbidden();
        $this->bulk('blog-posts', [$post->id], 'delete', RoleEnum::StoreManager)->assertForbidden();
        $this->bulk('blog-posts', [$post->id], 'delete', RoleEnum::SeoManager)->assertForbidden();
        $this->bulk('pages', [$page->id], 'delete', RoleEnum::SupportEngineer)->assertForbidden();

        $this->assertNotNull(StoreProduct::find($product->id));
        $this->assertNotNull(LandingPage::find($landing->id));
        $this->assertNotNull(BlogPost::find($post->id));

        // And each owner can.
        $this->bulk('blog-posts', [$post->id], 'delete', RoleEnum::ContentManager)->assertOk();
        $this->bulk('store/products', [$product->id], 'delete', RoleEnum::StoreManager)->assertOk();
        $this->bulk('landing-pages', [$landing->id], 'delete', RoleEnum::SeoManager)->assertOk();
    }

    public function test_a_customer_token_and_no_token_are_refused(): void
    {
        $post = $this->make('blog_post', 1);

        $customer = Customer::create([
            'name' => 'Cust', 'email' => 'cust-bulk@example.test', 'password' => 'password-for-tests', 'status' => 'active',
        ]);
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$customer->createToken('portal', ['portal'])->plainTextToken)
            ->postJson('/api/v1/admin/blog-posts/bulk', ['ids' => [$post->id], 'action' => 'delete'])
            ->assertForbidden();

        $this->app['auth']->forgetGuards();
        $this->withoutHeader('Authorization')
            ->postJson('/api/v1/admin/blog-posts/bulk', ['ids' => [$post->id], 'action' => 'delete'])
            ->assertUnauthorized();

        $this->assertNotNull(BlogPost::find($post->id));
    }

    // ------------------------------------------------------- activity log

    public function test_a_bulk_delete_is_recorded_with_the_action_and_a_count_and_nothing_else(): void
    {
        $a = $this->make('blog_post', 1);
        $b = $this->make('blog_post', 2);

        $this->bulk('blog-posts', [$a->id, $b->id], 'delete')->assertOk();

        $line = Activity::query()->sole();
        $this->assertSame('destroy', $line->action);
        // MySQL's JSON does not keep key order, so equality and not identity.
        $this->assertEquals(['action' => 'delete', 'count' => 2], $line->context);
    }

    public function test_status_changes_and_fully_refused_deletes_leave_no_line(): void
    {
        $taken = $this->make('event', 1);
        EventRegistration::create(['event_id' => $taken->id, 'name' => 'Guest', 'email' => 'guest@example.test', 'seats' => 1]);
        $post = $this->make('blog_post', 1);

        $this->bulk('blog-posts', [$post->id], 'publish')->assertOk();
        $this->bulk('events', [$taken->id], 'delete')->assertOk()->assertJsonCount(1, 'refused');

        $this->assertSame(0, Activity::query()->count());
    }
}
