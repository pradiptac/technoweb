<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Enums\SocialNetwork;
use App\Enums\SocialPostStatus;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\Role;
use App\Models\Setting;
use App\Models\SocialPost;
use App\Models\User;
use App\Support\Social\SocialDrafts;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The admin API for reviewing social posts and connecting LinkedIn (C7, Task 4). */
class SocialPostApiTest extends TestCase
{
    use RefreshDatabase;

    private const CALLBACK = 'http://localhost/admin/settings/social/linkedin/callback';

    private BlogPost $blog;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Http::preventStrayRequests();
        config(['app.frontend_url' => 'https://www.example.test']);

        $this->blog = SocialDrafts::suppressed(fn () => BlogPost::create([
            'title' => 'New switches', 'slug' => 'new-switches', 'excerpt' => 'Faster ports.', 'body' => '<p>Body</p>',
            'status' => 'published', 'published_at' => now()->subDay(),
        ]));
    }

    private function staff(RoleEnum $role): User
    {
        $user = User::create(['name' => ucfirst($role->value), 'email' => $role->value.'@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    private function actAs(RoleEnum $role): static
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->staff($role), ['*']);

        return $this;
    }

    private function makePost(SocialNetwork $network = SocialNetwork::LinkedIn, SocialPostStatus $status = SocialPostStatus::Draft, string $text = 'Draft text'): SocialPost
    {
        return SocialPost::create([
            'network' => $network, 'status' => $status, 'subject_type' => 'blog_post', 'subject_id' => $this->blog->id,
            'text' => $text, 'url' => 'https://www.example.test/blog/new-switches', 'source' => 'manual',
        ]);
    }

    public function test_the_list_defaults_to_waiting_and_filters_by_status_and_network(): void
    {
        $this->makePost();
        $x = $this->makePost(SocialNetwork::X);
        $this->makePost(SocialNetwork::X, SocialPostStatus::Sent);
        $this->actAs(RoleEnum::ContentManager);

        $all = $this->getJson('/api/v1/admin/social-posts')->assertOk();
        $this->assertCount(2, $all->json('data'));
        $this->assertSame($x->id, $all->json('data.0.id'), 'newest first');
        $this->assertSame(2, $all->json('meta.waiting'));
        $this->assertSame(['linkedin', 'x'], array_column($all->json('meta.networks'), 'value'));
        $this->assertSame([3000, 280], array_column($all->json('meta.networks'), 'limit'));
        $this->assertSame([false, false], array_column($all->json('meta.networks'), 'connected'));
        $this->assertContains('shared_manually', array_column($all->json('meta.statuses'), 'value'));
        $this->assertSame('blog_post', $all->json('data.0.subject.type'));
        $this->assertSame('New switches', $all->json('data.0.subject.title'));
        $this->assertSame('Blog post', $all->json('data.0.subject.kind'));
        $this->assertSame('https://www.example.test/blog/new-switches', $all->json('data.0.subject.public_url'));

        $this->assertCount(1, $this->getJson('/api/v1/admin/social-posts?status=sent')->json('data'));
        $this->assertCount(1, $this->getJson('/api/v1/admin/social-posts?network=linkedin')->json('data'));
        $this->assertCount(3, $this->getJson('/api/v1/admin/social-posts?status=all')->json('data'));
        $this->getJson('/api/v1/admin/social-posts?per_page=1')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_linkedin_is_connected_in_meta_only_when_ready(): void
    {
        $this->seedConnection();
        $this->actAs(RoleEnum::ContentManager);

        $this->assertSame([true, false], array_column($this->getJson('/api/v1/admin/social-posts')->json('meta.networks'), 'connected'));
    }

    public function test_the_x_length_counts_the_link_the_site_adds(): void
    {
        $post = $this->makePost(SocialNetwork::X, text: 'Hello');
        $this->actAs(RoleEnum::ContentManager);

        $this->getJson("/api/v1/admin/social-posts/{$post->id}")->assertOk()->assertJsonPath('data.x_length', 5 + 24)->assertJsonPath('data.limit', 280);
    }

    public function test_editing_the_text_is_allowed_only_while_it_can_still_be_sent(): void
    {
        $draft = $this->makePost();
        $sent = $this->makePost(status: SocialPostStatus::Sent);
        $this->actAs(RoleEnum::ContentManager);

        $this->patchJson("/api/v1/admin/social-posts/{$draft->id}", ['text' => 'Better words'])->assertOk()->assertJsonPath('data.text', 'Better words');
        $this->patchJson("/api/v1/admin/social-posts/{$sent->id}", ['text' => 'Late'])->assertStatus(422)->assertJsonValidationErrors('text');
        $this->patchJson("/api/v1/admin/social-posts/{$draft->id}", [])->assertStatus(422)->assertJsonValidationErrors('text');
    }

    public function test_draft_refuses_unpublished_records_and_coverage_entries(): void
    {
        $this->actAs(RoleEnum::ContentManager);
        $unpublished = SocialDrafts::suppressed(fn () => BlogPost::create(['title' => 'Soon', 'slug' => 'soon', 'body' => '<p>x</p>', 'status' => 'draft']));
        $coverage = ContentType::create(['name' => 'Coverage', 'plural' => 'Coverage', 'slug' => 'coverage', 'is_active' => true, 'preset' => 'newsroom_coverage']);
        $entry = SocialDrafts::suppressed(fn () => Entry::create(['content_type_id' => $coverage->id, 'title' => 'In the news', 'status' => 'published', 'published_at' => now()]));
        $sentence = 'Only a published blog post, case study, event or press release can be shared.';

        $this->postJson('/api/v1/admin/social-posts/draft', ['type' => 'blog_post', 'id' => $unpublished->id])->assertStatus(422)->assertJsonPath('errors.id.0', $sentence);
        $this->postJson('/api/v1/admin/social-posts/draft', ['type' => 'entry', 'id' => $entry->id])->assertStatus(422)->assertJsonPath('errors.id.0', $sentence);
        $this->postJson('/api/v1/admin/social-posts/draft', ['type' => 'blog_post', 'id' => 99999])->assertStatus(422);
        $this->postJson('/api/v1/admin/social-posts/draft', ['type' => 'product', 'id' => 1])->assertStatus(422)->assertJsonValidationErrors('type');
        $this->assertSame(0, SocialPost::query()->count());
    }

    public function test_draft_makes_a_pair_for_a_published_case_study(): void
    {
        $study = SocialDrafts::suppressed(fn () => CaseStudy::create([
            'title' => 'A rollout', 'slug' => 'a-rollout', 'summary' => 'Done.', 'body' => '<p>Done.</p>', 'status' => 'published',
        ]));
        $this->actAs(RoleEnum::ContentManager);

        $response = $this->postJson('/api/v1/admin/social-posts/draft', ['type' => 'case_study', 'id' => $study->id])->assertCreated();

        $this->assertSame(['linkedin', 'x'], array_column($response->json('data'), 'network'));
        $this->assertSame(['manual', 'manual'], array_column($response->json('data'), 'source'));
        $this->assertSame('Content_manager', $response->json('data.0.drafted_by'));
        $this->assertSame('Case study', $response->json('data.0.subject.kind'));
        $this->assertSame('/admin/case-studies/'.$study->id, $response->json('data.0.subject.admin_path'));
    }

    public function test_approving_an_x_post_returns_the_intent_address_and_a_content_manager_may(): void
    {
        $post = $this->makePost(SocialNetwork::X, text: 'Faster ports');
        $this->actAs(RoleEnum::ContentManager);

        $response = $this->postJson("/api/v1/admin/social-posts/{$post->id}/approve", ['text' => 'Faster ports'])->assertOk();

        $this->assertSame('shared_manually', $response->json('data.status'));
        $this->assertSame('Content_manager', $response->json('data.approved_by'));
        $this->assertSame('https://x.com/intent/post?text=Faster+ports&url='.urlencode('https://www.example.test/blog/new-switches'), $response->json('meta.open_url'));
    }

    public function test_a_linkedin_post_sent_through_the_api_has_no_open_address(): void
    {
        $this->seedConnection();
        Http::fake(['api.linkedin.com/rest/posts' => Http::response('', 201, ['x-restli-id' => 'urn:li:share:9'])]);
        $post = $this->makePost();
        $this->actAs(RoleEnum::ContentManager);

        $this->postJson("/api/v1/admin/social-posts/{$post->id}/approve", ['text' => 'Hello'])
            ->assertOk()->assertJsonPath('data.status', 'sent')->assertJsonPath('meta.open_url', null);
    }

    public function test_a_refusal_is_a_422_on_text_with_the_posts_state(): void
    {
        $post = $this->makePost(SocialNetwork::X);
        $this->actAs(RoleEnum::ContentManager);

        $this->postJson("/api/v1/admin/social-posts/{$post->id}/approve", ['text' => str_repeat('a', 300)])
            ->assertStatus(422)
            ->assertJsonPath('message', 'That is too long for X.')
            ->assertJsonPath('errors.text.0', 'That is too long for X.')
            ->assertJsonPath('data.id', $post->id)
            ->assertJsonPath('data.status', 'draft');
    }

    public function test_discarding_a_post(): void
    {
        $post = $this->makePost();
        $sent = $this->makePost(status: SocialPostStatus::Sent);
        $this->actAs(RoleEnum::ContentManager);

        $this->postJson("/api/v1/admin/social-posts/{$post->id}/discard")->assertOk()->assertJsonPath('data.status', 'discarded');
        $this->postJson("/api/v1/admin/social-posts/{$sent->id}/discard")->assertStatus(422);
    }

    public function test_only_a_content_manager_reaches_the_posts_and_only_an_admin_the_connection(): void
    {
        $post = $this->makePost();

        $this->actAs(RoleEnum::SupportEngineer);
        $this->getJson('/api/v1/admin/social-posts')->assertForbidden();
        $this->postJson("/api/v1/admin/social-posts/{$post->id}/approve", ['text' => 'x'])->assertForbidden();
        $this->getJson('/api/v1/admin/settings/social')->assertForbidden();

        $this->actAs(RoleEnum::ContentManager);
        $this->getJson('/api/v1/admin/settings/social')->assertForbidden();
        $this->postJson('/api/v1/admin/settings/social/linkedin/disconnect')->assertForbidden();
        $this->postJson('/api/v1/admin/settings/social/linkedin/organization', ['id' => '1'])->assertForbidden();

        $this->actAs(RoleEnum::Admin);
        $this->getJson('/api/v1/admin/settings/social')->assertOk()->assertJsonPath('data.linkedin.connected', false)
            ->assertJsonPath('data.linkedin.organization', null)
            ->assertJsonPath('data.linkedin.callback_path', '/admin/settings/social/linkedin/callback');
    }

    public function test_the_callback_connects_without_a_page_and_the_organization_is_then_chosen(): void
    {
        Setting::put('social_linkedin_oauth_client_id', 'client-id');
        Setting::put('social_linkedin_oauth_client_secret', 'client-secret-value');
        Http::fake([
            'www.linkedin.com/oauth/v2/accessToken' => Http::response(['access_token' => 'li-access-token', 'expires_in' => 5184000], 200),
            'api.linkedin.com/*' => Http::response(['message' => 'Not enough permissions'], 403),
        ]);
        $this->actAs(RoleEnum::Admin);

        $this->postJson('/api/v1/admin/settings/social/linkedin/authorize', ['redirect_uri' => 'https://evil.example/x'])->assertStatus(422);
        $url = $this->postJson('/api/v1/admin/settings/social/linkedin/authorize', ['redirect_uri' => self::CALLBACK])->assertOk()->json('data.url');
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $this->postJson('/api/v1/admin/settings/social/linkedin/callback', ['code' => 'the-code', 'state' => $query['state']])
            ->assertOk()->assertJsonPath('data.organization_id', null);

        $status = $this->getJson('/api/v1/admin/settings/social')->assertOk();
        $this->assertTrue($status->json('data.linkedin.connected'));
        $this->assertTrue($status->json('data.linkedin.configured'));
        $this->assertFalse($status->json('data.linkedin.ready'), 'no page chosen yet');
        $this->assertNotNull($status->json('data.linkedin.expires_at'));

        $this->getJson('/api/v1/admin/settings/social/linkedin/organizations')->assertStatus(422)->assertJsonPath('message', 'Not enough permissions');

        $this->postJson('/api/v1/admin/settings/social/linkedin/organization', ['id' => 'abc'])->assertStatus(422)->assertJsonValidationErrors('id');
        $this->postJson('/api/v1/admin/settings/social/linkedin/organization', ['id' => '12345', 'name' => 'Acme Networks'])->assertOk();
        $this->getJson('/api/v1/admin/settings/social')
            ->assertJsonPath('data.linkedin.organization', ['id' => '12345', 'name' => 'Acme Networks'])
            ->assertJsonPath('data.linkedin.ready', true);

        $this->postJson('/api/v1/admin/settings/social/linkedin/disconnect')->assertOk();
        $this->getJson('/api/v1/admin/settings/social')->assertJsonPath('data.linkedin.connected', false)->assertJsonPath('data.linkedin.ready', false);
    }

    public function test_a_single_listed_page_is_chosen_by_the_callback(): void
    {
        Setting::put('social_linkedin_oauth_client_id', 'client-id');
        Setting::put('social_linkedin_oauth_client_secret', 'client-secret-value');
        Http::fake([
            'www.linkedin.com/oauth/v2/accessToken' => Http::response(['access_token' => 'li-access-token', 'expires_in' => 5184000], 200),
            'api.linkedin.com/rest/organizationAcls*' => Http::response(['elements' => [['organization' => 'urn:li:organization:777']]], 200),
            'api.linkedin.com/rest/organizations/777' => Http::response(['localizedName' => 'Acme Networks'], 200),
        ]);
        $this->actAs(RoleEnum::Admin);
        $url = $this->postJson('/api/v1/admin/settings/social/linkedin/authorize', ['redirect_uri' => self::CALLBACK])->json('data.url');
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $this->postJson('/api/v1/admin/settings/social/linkedin/callback', ['code' => 'c', 'state' => $query['state']])
            ->assertOk()->assertJsonPath('data.organization_id', '777');
        $this->assertSame('Acme Networks', Setting::get('social_linkedin_organization_name'));
    }

    public function test_no_token_or_secret_appears_in_any_response(): void
    {
        $this->seedConnection();
        Setting::put('social_linkedin_oauth_client_secret', 'client-secret-value');
        Http::fake(['api.linkedin.com/*' => Http::response(['elements' => []], 200)]);
        $post = $this->makePost();
        $bodies = [];

        $this->actAs(RoleEnum::Admin);
        $bodies[] = $this->getJson('/api/v1/admin/settings/social')->assertOk()->getContent();
        $bodies[] = $this->getJson('/api/v1/admin/settings/social/linkedin/organizations')->getContent();
        $bodies[] = $this->postJson('/api/v1/admin/settings/social/linkedin/organization', ['id' => '12345'])->getContent();
        $bodies[] = $this->getJson('/api/v1/admin/social-posts')->assertOk()->getContent();
        $bodies[] = $this->getJson("/api/v1/admin/social-posts/{$post->id}")->assertOk()->getContent();
        $bodies[] = $this->patchJson("/api/v1/admin/social-posts/{$post->id}", ['text' => 'Hi'])->getContent();
        $bodies[] = $this->postJson("/api/v1/admin/social-posts/{$post->id}/approve", ['text' => 'Hi'])->getContent();
        $bodies[] = $this->postJson('/api/v1/admin/social-posts/draft', ['type' => 'blog_post', 'id' => $this->blog->id])->getContent();
        $bodies[] = $this->postJson("/api/v1/admin/social-posts/{$post->id}/discard")->getContent();

        foreach ($bodies as $body) {
            $this->assertStringNotContainsString('li-token', $body);
            $this->assertStringNotContainsString('client-secret-value', $body);
        }
    }

    private function seedConnection(): void
    {
        Setting::put('social_linkedin_oauth_access_token', 'li-token');
        Setting::put('social_linkedin_oauth_expires_at', now()->addDays(30)->toIso8601String());
        Setting::put('social_linkedin_oauth_account', 'LinkedIn');
        Setting::put('social_linkedin_organization_id', '12345');
    }
}
