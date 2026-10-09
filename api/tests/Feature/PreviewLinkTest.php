<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Brand;
use App\Models\CaseStudy;
use App\Models\ContentType;
use App\Models\Customer;
use App\Models\Entry;
use App\Models\Event;
use App\Models\JobOpening;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Page;
use App\Models\PreviewLink;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Role;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\PreviewLinks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Draft share links (0.138.0, docs/admin-console.md "Draft share links").
 *
 * Staff are authenticated with a real `Authorization: Bearer` header and the
 * resolved guard is forgotten before every switch of principal: `actingAs()`
 * stages the authentication by hand and the guard a request resolved stays
 * resolved for the rest of the test.
 */
class PreviewLinkTest extends TestCase
{
    use RefreshDatabase;

    private const TYPES = [
        'page', 'blog_post', 'knowledge_article', 'case_study', 'solution', 'service',
        'product', 'store_product', 'event', 'job_opening', 'entry', 'landing_page',
    ];

    // ------------------------------------------------------------- helpers

    private function staff(RoleEnum $role): User
    {
        $user = User::firstOrCreate(
            ['email' => $role->value.'-pl@example.test'],
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

    /** A request with no credentials at all, after one that had them. */
    private function signedOut(): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withoutHeader('Authorization');
    }

    /** A draft of the given kind, with enough around it to have relations to load. */
    private function draft(string $type): Model
    {
        $status = ['status' => 'draft'];

        return match ($type) {
            'page' => Page::create(['title' => 'A draft page', 'slug' => 'a-draft-page', 'body' => '<p>Words.</p>'] + $status),
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
            'solution' => Solution::create(['title' => 'A draft solution', 'slug' => 'a-draft-solution', 'summary' => 'x'] + $status),
            'service' => Service::create(['title' => 'A draft service', 'slug' => 'a-draft-service', 'summary' => 'x'] + $status),
            'product' => Product::create(['name' => 'A draft switch', 'slug' => 'a-draft-switch'] + $status),
            'store_product' => StoreProduct::create([
                'name' => 'A draft licence', 'slug' => 'a-draft-licence', 'price_paise' => 1000000, 'track_stock' => false, 'stock' => 0,
            ] + $status),
            'event' => Event::create([
                'title' => 'A draft seminar', 'slug' => 'a-draft-seminar', 'summary' => 'x', 'format' => 'online',
                'starts_at' => '2026-12-12 15:00:00', 'online_url' => 'https://meet.example.test/secret-room',
                'registration_mode' => 'none',
            ] + $status),
            'job_opening' => JobOpening::create(['title' => 'A draft vacancy', 'slug' => 'a-draft-vacancy', 'summary' => 'x'] + $status),
            'entry' => Entry::create([
                'content_type_id' => ContentType::create([
                    'name' => 'Partner story', 'plural' => 'Partner stories', 'slug' => 'partner-stories',
                    'is_active' => true, 'archive_enabled' => true,
                ])->id,
                'title' => 'A draft story', 'slug' => 'a-draft-story', 'summary' => 'x',
            ] + $status),
            'landing_page' => LandingPage::create([
                'kind' => 'brand_category',
                'brand_id' => Brand::create(['name' => 'Cisco', 'slug' => 'cisco'])->id,
                'product_category_id' => ProductCategory::create(['name' => 'Switches', 'slug' => 'switches'])->id,
                'title' => 'Cisco Switches', 'heading' => 'Cisco switches we supply',
            ] + $status),
        };
    }

    /** The public detail address of a record, for comparing against the preview. */
    private function publicUrl(string $type, Model $record): string
    {
        return match ($type) {
            'page' => "/api/v1/pages/{$record->slug}",
            'blog_post' => "/api/v1/blog/{$record->slug}",
            'knowledge_article' => "/api/v1/knowledge-base/{$record->slug}",
            'case_study' => "/api/v1/case-studies/{$record->slug}",
            'solution' => "/api/v1/solutions/{$record->slug}",
            'service' => "/api/v1/services/{$record->slug}",
            'product' => "/api/v1/products/{$record->slug}",
            'store_product' => "/api/v1/store/products/{$record->slug}",
            'event' => "/api/v1/events/{$record->slug}",
            'job_opening' => "/api/v1/careers/{$record->slug}",
            'entry' => '/api/v1/types/partner-stories/'.$record->slug,
            'landing_page' => '/api/v1/landing-pages/lookup?path='.urlencode((string) $record->path),
        };
    }

    private function publish(Model $record): void
    {
        $record->forceFill(['status' => 'published'])->save();

        if ($record->isFillable('published_at')) {
            $record->forceFill(['published_at' => now()->subDay()])->save();
        }
    }

    /** @return array<string, mixed> */
    private function create(string $type, int $id, ?int $days = null, RoleEnum $as = RoleEnum::Admin): array
    {
        return $this->asStaff($as)
            ->postJson('/api/v1/admin/preview-links', array_filter(
                ['type' => $type, 'id' => $id, 'days' => $days], fn ($v) => $v !== null,
            ))
            ->assertCreated()
            ->json('data');
    }

    private function token(array $link): string
    {
        return substr($link['path'], strlen('/preview/'));
    }

    /** @return array<string, array{0: string}> */
    public static function types(): array
    {
        return array_combine(self::TYPES, array_map(fn ($t) => [$t], self::TYPES));
    }

    // -------------------------------------------------------- a draft, read

    #[DataProvider('types')]
    public function test_a_draft_is_readable_through_its_link_with_the_keys_of_the_public_read(string $type): void
    {
        $record = $this->draft($type);

        // A draft is a 404 on the public read, which is the premise.
        $this->getJson($this->publicUrl($type, $record))->assertNotFound();

        $link = $this->create($type, $record->getKey());
        $this->assertMatchesRegularExpression('~^/preview/[a-f0-9]{64}$~', $link['path']);

        $preview = $this->signedOut()->getJson('/api/v1/preview/'.$this->token($link))->assertOk();
        $preview->assertHeader('Cache-Control');

        $this->assertSame($type, $preview->json('data.type'));
        $this->assertSame('draft', $preview->json('meta.status'));
        $this->assertSame('Draft', $preview->json('meta.status_label'));
        $this->assertFalse($preview->json('meta.published'));
        $this->assertNotSame('', $preview->json('meta.title'));
        $this->assertNotEmpty($preview->json('meta.expires_label'));

        $record = $preview->json('data.record');
        $this->assertIsArray($record);
        $this->assertArrayNotHasKey('schema', $record, 'A preview emits no structured data.');
        $this->assertArrayNotHasKey('faq_schema', $record);

        // Publish the same record and ask the public endpoint: the preview must
        // carry exactly the keys it does, minus the two for search engines.
        $fresh = $this->draftAgain($type);
        $this->publish($fresh);
        $public = $this->signedOut()->getJson($this->publicUrl($type, $fresh))->assertOk()->json('data');
        unset($public['schema'], $public['faq_schema']);

        $keys = array_keys($record);
        $expected = array_keys($public);
        sort($keys);
        sort($expected);
        $this->assertSame($expected, $keys, "The preview of a {$type} drifted from its public read.");

        if ($type === 'entry') {
            $this->assertSame('partner-stories', $preview->json('data.type_slug'));
        }
        if ($type === 'landing_page') {
            $this->assertSame($fresh->path, $preview->json('data.path'));
        }
    }

    /** The record the test already made, re-fetched (it is the same row). */
    private function draftAgain(string $type): Model
    {
        return match ($type) {
            'page' => Page::firstOrFail(),
            'blog_post' => BlogPost::firstOrFail(),
            'knowledge_article' => KnowledgeArticle::firstOrFail(),
            'case_study' => CaseStudy::firstOrFail(),
            'solution' => Solution::firstOrFail(),
            'service' => Service::firstOrFail(),
            'product' => Product::firstOrFail(),
            'store_product' => StoreProduct::firstOrFail(),
            'event' => Event::firstOrFail(),
            'job_opening' => JobOpening::firstOrFail(),
            'entry' => Entry::firstOrFail(),
            'landing_page' => LandingPage::firstOrFail(),
        };
    }

    public function test_an_event_preview_never_carries_the_join_link(): void
    {
        $event = $this->draft('event');
        $token = $this->token($this->create('event', $event->id));

        $body = $this->signedOut()->getJson('/api/v1/preview/'.$token)->assertOk()->getContent();

        $this->assertStringNotContainsString('secret-room', $body);
    }

    public function test_a_preview_does_not_count_as_a_knowledge_base_view(): void
    {
        $article = $this->draft('knowledge_article');
        $token = $this->token($this->create('knowledge_article', $article->id));

        $this->signedOut()->getJson('/api/v1/preview/'.$token)->assertOk();

        $this->assertSame(0, (int) $article->fresh()->view_count);
    }

    public function test_a_published_record_says_so(): void
    {
        $page = $this->draft('page');
        $this->publish($page);
        $token = $this->token($this->create('page', $page->id));

        $this->signedOut()->getJson('/api/v1/preview/'.$token)->assertOk()
            ->assertJsonPath('meta.published', true)
            ->assertJsonPath('meta.status_label', 'Published');
    }

    // ------------------------------------------------ one 404 for everything

    public function test_every_dead_token_is_the_same_404(): void
    {
        $page = $this->draft('page');
        $live = $this->create('page', $page->id);

        // Malformed: refused by the route before a controller runs.
        $this->signedOut();
        foreach (['short', str_repeat('A', 64), str_repeat('g', 64), $this->token($live).'0'] as $bad) {
            $this->getJson('/api/v1/preview/'.$bad)->assertNotFound();
        }

        // Unknown but well formed.
        $unknown = $this->getJson('/api/v1/preview/'.str_repeat('a', 64));
        $unknown->assertNotFound();

        // Expired.
        PreviewLink::query()->update(['expires_at' => now()->subSecond()]);
        $expired = $this->getJson('/api/v1/preview/'.$this->token($live));
        $expired->assertNotFound();

        // Revoked.
        PreviewLink::query()->update(['expires_at' => now()->addDay()]);
        $this->getJson('/api/v1/preview/'.$this->token($live))->assertOk();
        $this->asStaff(RoleEnum::Admin)->deleteJson('/api/v1/admin/preview-links/'.$live['id'])->assertNoContent();
        $revoked = $this->signedOut()->getJson('/api/v1/preview/'.$this->token($live));
        $revoked->assertNotFound();

        // Replaced.
        $first = $this->create('page', $page->id);
        $second = $this->create('page', $page->id);
        $replaced = $this->signedOut()->getJson('/api/v1/preview/'.$this->token($first));
        $replaced->assertNotFound();
        $this->getJson('/api/v1/preview/'.$this->token($second))->assertOk();

        // One answer: the same status and the same words. (Not the same bytes —
        // a debug-mode 404 carries a trace that names the line of this test.)
        foreach ([$expired, $revoked, $replaced] as $dead) {
            $this->assertSame($unknown->json('message'), $dead->json('message'));
        }

        // A record deleted since is the same 404 too.
        $page->delete();
        $this->getJson('/api/v1/preview/'.$this->token($second))->assertNotFound();
    }

    // ----------------------------------------------------------- the admin

    public function test_a_second_link_replaces_the_first(): void
    {
        $page = $this->draft('page');

        $first = $this->create('page', $page->id);
        $second = $this->create('page', $page->id);

        $this->assertNotSame($first['path'], $second['path']);
        $this->assertSame(1, PreviewLink::count());

        $read = $this->asStaff(RoleEnum::Admin)->getJson("/api/v1/admin/preview-links?type=page&id={$page->id}")->assertOk();
        $this->assertSame($second['path'], $read->json('data.path'));
        $this->assertSame([1, 7, 30], $read->json('meta.days'));
        $this->assertSame(7, $read->json('meta.default_days'));
    }

    public function test_no_link_reads_as_null(): void
    {
        $page = $this->draft('page');

        $this->asStaff(RoleEnum::ContentManager)
            ->getJson("/api/v1/admin/preview-links?type=page&id={$page->id}")
            ->assertOk()->assertJsonPath('data', null);
    }

    public function test_views_are_counted_without_moving_updated_at(): void
    {
        $page = $this->draft('page');
        $link = $this->create('page', $page->id);
        $row = PreviewLink::firstOrFail();
        $stamp = $row->updated_at;

        $this->travel(5)->minutes();
        $this->signedOut();
        $this->getJson('/api/v1/preview/'.$this->token($link))->assertOk();
        $this->getJson('/api/v1/preview/'.$this->token($link))->assertOk();

        $row->refresh();
        $this->assertSame(2, $row->views);
        $this->assertNotNull($row->last_viewed_at);
        $this->assertTrue($stamp->equalTo($row->updated_at));

        $read = $this->asStaff(RoleEnum::Admin)->getJson("/api/v1/admin/preview-links?type=page&id={$page->id}")->json('data');
        $this->assertSame(2, $read['views']);
    }

    public function test_the_expiry_is_one_seven_or_thirty_days(): void
    {
        $page = $this->draft('page');

        foreach ([1, 7, 30] as $days) {
            $link = $this->create('page', $page->id, $days);
            $this->assertEqualsWithDelta(
                now()->addDays($days)->getTimestamp(),
                PreviewLink::firstOrFail()->expires_at->getTimestamp(),
                5,
            );
            $this->assertFalse($link['is_expired']);
        }

        // The default is seven.
        $link = $this->create('page', $page->id);
        $this->assertEqualsWithDelta(now()->addDays(7)->getTimestamp(), PreviewLink::firstOrFail()->expires_at->getTimestamp(), 5);

        foreach ([0, 2, 8, 31, 365, -1] as $bad) {
            $this->asStaff(RoleEnum::Admin)
                ->postJson('/api/v1/admin/preview-links', ['type' => 'page', 'id' => $page->id, 'days' => $bad])
                ->assertUnprocessable()->assertJsonValidationErrors('days');
        }

        $this->assertNotEmpty($link['expires_label']);
    }

    public function test_an_unknown_type_or_record_is_a_422_on_the_field(): void
    {
        $this->asStaff(RoleEnum::Admin)
            ->postJson('/api/v1/admin/preview-links', ['type' => 'order', 'id' => 1])
            ->assertUnprocessable()->assertJsonValidationErrors('type');

        $this->asStaff(RoleEnum::Admin)
            ->postJson('/api/v1/admin/preview-links', ['type' => 'page', 'id' => 99999])
            ->assertUnprocessable()->assertJsonValidationErrors('id');

        $this->asStaff(RoleEnum::Admin)
            ->postJson('/api/v1/admin/preview-links', ['type' => 'page'])
            ->assertUnprocessable()->assertJsonValidationErrors('id');
    }

    public function test_the_token_appears_in_the_admin_resource_only_inside_the_path(): void
    {
        $page = $this->draft('page');
        $created = $this->asStaff(RoleEnum::Admin)
            ->postJson('/api/v1/admin/preview-links', ['type' => 'page', 'id' => $page->id]);

        $token = PreviewLink::firstOrFail()->token;

        foreach ([
            $created->json('data'),
            $this->asStaff(RoleEnum::Admin)->getJson("/api/v1/admin/preview-links?type=page&id={$page->id}")->json('data'),
        ] as $data) {
            $this->assertArrayNotHasKey('token', $data);
            $this->assertSame('/preview/'.$token, $data['path']);
            unset($data['path']);
            $this->assertStringNotContainsString($token, json_encode($data));
        }

        // The model hides it from serialisation too.
        $this->assertArrayNotHasKey('token', PreviewLink::firstOrFail()->toArray());

        // And it is a path, never a URL.
        $this->assertStringStartsWith('/', $created->json('data.path'));
        $this->assertSame('Admin Person', $created->json('data.created_by'));
    }

    // ------------------------------------------------------------ the roles

    public function test_a_content_manager_cannot_link_a_shop_product_or_a_landing_page(): void
    {
        $product = $this->draft('store_product');
        $landing = $this->draft('landing_page');

        foreach ([['store_product', $product->id], ['landing_page', $landing->id]] as [$type, $id]) {
            $this->asStaff(RoleEnum::ContentManager)
                ->postJson('/api/v1/admin/preview-links', ['type' => $type, 'id' => $id])->assertForbidden();
            $this->asStaff(RoleEnum::ContentManager)
                ->getJson("/api/v1/admin/preview-links?type={$type}&id={$id}")->assertForbidden();
        }

        $this->assertSame(0, PreviewLink::count());
    }

    public function test_a_store_manager_can_link_a_shop_product_and_nothing_else(): void
    {
        $product = $this->draft('store_product');
        $post = $this->draft('blog_post');

        $this->asStaff(RoleEnum::StoreManager)
            ->postJson('/api/v1/admin/preview-links', ['type' => 'store_product', 'id' => $product->id])->assertCreated();

        $this->asStaff(RoleEnum::StoreManager)
            ->postJson('/api/v1/admin/preview-links', ['type' => 'blog_post', 'id' => $post->id])->assertForbidden();
    }

    public function test_an_seo_manager_can_link_a_landing_page_and_nothing_else(): void
    {
        $landing = $this->draft('landing_page');
        $page = $this->draft('page');

        $this->asStaff(RoleEnum::SeoManager)
            ->postJson('/api/v1/admin/preview-links', ['type' => 'landing_page', 'id' => $landing->id])->assertCreated();

        $this->asStaff(RoleEnum::SeoManager)
            ->postJson('/api/v1/admin/preview-links', ['type' => 'page', 'id' => $page->id])->assertForbidden();
    }

    public function test_revoking_is_narrowed_by_the_records_owner(): void
    {
        $product = $this->draft('store_product');
        $link = $this->create('store_product', $product->id);

        $this->asStaff(RoleEnum::ContentManager)
            ->deleteJson('/api/v1/admin/preview-links/'.$link['id'])->assertForbidden();
        $this->assertSame(1, PreviewLink::count());

        $this->asStaff(RoleEnum::StoreManager)
            ->deleteJson('/api/v1/admin/preview-links/'.$link['id'])->assertNoContent();
        $this->assertSame(0, PreviewLink::count());
    }

    public function test_an_administrator_can_link_every_kind(): void
    {
        foreach (self::TYPES as $type) {
            $record = $this->draft($type);
            $this->create($type, $record->getKey());
        }

        $this->assertSame(count(self::TYPES), PreviewLink::count());
        $this->assertSame(PreviewLinks::aliases(), self::TYPES);
    }

    public function test_a_customer_token_is_refused(): void
    {
        $page = $this->draft('page');
        $customer = Customer::create([
            'name' => 'Neil Basu', 'email' => 'neil-pl@example.test', 'password' => 'password-for-tests',
            'status' => 'active',
        ]);

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$customer->createToken('portal', ['portal'])->plainTextToken)
            ->postJson('/api/v1/admin/preview-links', ['type' => 'page', 'id' => $page->id])
            ->assertForbidden();

        $this->signedOut()->postJson('/api/v1/admin/preview-links', ['type' => 'page', 'id' => $page->id])
            ->assertUnauthorized();
    }
}
