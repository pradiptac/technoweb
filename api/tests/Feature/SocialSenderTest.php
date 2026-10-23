<?php

namespace Tests\Feature;

use App\Enums\SocialNetwork;
use App\Enums\SocialPostStatus;
use App\Models\BlogPost;
use App\Models\Setting;
use App\Models\SocialPost;
use App\Models\User;
use App\Support\OAuth\OAuthConnection;
use App\Support\Social\LinkedInPoster;
use App\Support\Social\SocialDrafts;
use App\Support\Social\SocialSender;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Sending a social post (C7, Task 3): X always by intent URL, LinkedIn through
 * the API once connected, and the rules that stop one draft being sent twice.
 */
class SocialSenderTest extends TestCase
{
    use RefreshDatabase;

    private BlogPost $blog;

    private User $user;

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
        $this->user = User::create(['name' => 'Editor', 'email' => 'editor@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
    }

    private function draft(SocialNetwork $network = SocialNetwork::LinkedIn, string $text = 'Draft text'): SocialPost
    {
        return SocialPost::create([
            'network' => $network, 'status' => SocialPostStatus::Draft, 'subject_type' => 'blog_post', 'subject_id' => $this->blog->id,
            'text' => $text, 'url' => 'https://www.example.test/blog/new-switches', 'source' => 'manual',
        ]);
    }

    private function connect(): void
    {
        Setting::put('social_linkedin_oauth_access_token', 'li-token');
        Setting::put('social_linkedin_oauth_expires_at', now()->addDays(30)->toIso8601String());
        Setting::put('social_linkedin_oauth_account', 'LinkedIn');
        Setting::put('social_linkedin_organization_id', '12345');
    }

    private function sender(): SocialSender
    {
        return app(SocialSender::class);
    }

    public function test_x_approval_returns_an_intent_url_and_marks_shared_by_hand(): void
    {
        Http::fake();
        $post = $this->draft(SocialNetwork::X);

        $out = $this->sender()->approve($post, 'Hello & "world" #switches', $this->user);

        $this->assertNull($out->refusal);
        $this->assertSame(
            'https://x.com/intent/post?text='.urlencode('Hello & "world" #switches').'&url='.urlencode('https://www.example.test/blog/new-switches'),
            $out->openUrl,
        );
        $fresh = $post->fresh();
        $this->assertSame(SocialPostStatus::SharedManually, $fresh->status);
        $this->assertSame('Hello & "world" #switches', $fresh->text);
        $this->assertSame($this->user->id, (int) $fresh->approved_by);
        $this->assertNotNull($fresh->approved_at);
        Http::assertNothingSent();
    }

    public function test_linkedin_without_a_connection_falls_back_to_share_offsite(): void
    {
        Http::fake();
        $post = $this->draft();

        $out = $this->sender()->approve($post, 'Words', $this->user);

        $this->assertSame('https://www.linkedin.com/sharing/share-offsite/?url='.urlencode('https://www.example.test/blog/new-switches'), $out->openUrl);
        $this->assertSame(SocialPostStatus::SharedManually, $post->fresh()->status);
        Http::assertNothingSent();
    }

    public function test_linkedin_posts_as_the_organisation_and_records_the_live_url(): void
    {
        $this->connect();
        Http::fake(['api.linkedin.com/*' => Http::response('', 201, ['x-restli-id' => 'urn:li:share:777'])]);
        $post = $this->draft();

        $out = $this->sender()->approve($post, 'Fresh news', $this->user);

        $this->assertNull($out->refusal);
        $this->assertNull($out->openUrl);
        Http::assertSent(function (Request $r) {
            $body = $r->data();

            return $r->url() === 'https://api.linkedin.com/rest/posts'
                && $r->hasHeader('Authorization', 'Bearer li-token')
                && $r->hasHeader('LinkedIn-Version', LinkedInPoster::LINKEDIN_VERSION)
                && $r->hasHeader('X-Restli-Protocol-Version', '2.0.0')
                && $body['author'] === 'urn:li:organization:12345'
                && $body['commentary'] === 'Fresh news'
                && $body['visibility'] === 'PUBLIC'
                && $body['lifecycleState'] === 'PUBLISHED'
                && $body['content']['article']['source'] === 'https://www.example.test/blog/new-switches'
                && $body['content']['article']['title'] === 'New switches';
        });
        $fresh = $post->fresh();
        $this->assertSame(SocialPostStatus::Sent, $fresh->status);
        $this->assertSame('urn:li:share:777', $fresh->remote_id);
        $this->assertSame('https://www.linkedin.com/feed/update/urn:li:share:777', $fresh->remote_url);
        $this->assertNotNull($fresh->sent_at);
        $this->assertNull($fresh->error);
    }

    public function test_a_refusal_is_failed_with_linkedins_words_and_a_401_marks_the_connection(): void
    {
        $this->connect();
        Http::fake(['api.linkedin.com/*' => Http::response(['status' => 401, 'message' => 'The token used in the request has expired'], 401)]);
        $post = $this->draft();

        $out = $this->sender()->approve($post, 'Fresh news', $this->user);

        $this->assertSame('The token used in the request has expired', $out->refusal);
        $fresh = $post->fresh();
        $this->assertSame(SocialPostStatus::Failed, $fresh->status);
        $this->assertSame('The token used in the request has expired', $fresh->error);
        $this->assertStringContainsString('The token used in the request has expired', (string) Setting::get('social_linkedin_error'));
        $this->assertStringNotContainsString('li-token', (string) $fresh->error.(string) Setting::get('social_linkedin_error'));

        // The dead token is not tried again: the next approval falls back to the share page.
        $this->assertFalse(app(LinkedInPoster::class)->ready());
    }

    public function test_a_timeout_is_unconfirmed_and_retry_needs_confirmation(): void
    {
        $this->connect();
        $calls = 0;
        Http::fake(['api.linkedin.com/*' => function () use (&$calls) {
            if (++$calls === 1) {
                throw new ConnectionException('timed out');
            }

            return Http::response('', 201, ['x-restli-id' => 'urn:li:share:9']);
        }]);
        $post = $this->draft();

        $out = $this->sender()->approve($post, 'Fresh news', $this->user);

        $this->assertSame(SocialPostStatus::Unconfirmed, $post->fresh()->status);
        $this->assertSame("We couldn't confirm LinkedIn received this. Check the page before trying again.", $post->fresh()->error);
        $this->assertNotNull($out->post);

        $blocked = $this->sender()->approve($post->fresh(), 'Fresh news', $this->user);
        $this->assertSame('Check LinkedIn first — confirm to send it again.', $blocked->refusal);
        $this->assertSame(1, $calls);

        $retry = $this->sender()->approve($post->fresh(), 'Fresh news', $this->user, confirm: true);
        $this->assertNull($retry->refusal);
        $this->assertSame(SocialPostStatus::Sent, $post->fresh()->status);
        $this->assertNull($post->fresh()->error);
    }

    public function test_a_second_approve_sends_nothing(): void
    {
        $this->connect();
        Http::fake(['api.linkedin.com/*' => Http::response('', 201, ['x-restli-id' => 'urn:li:share:1'])]);
        $post = $this->draft();

        $first = $this->sender()->approve($post, 'Once', $this->user);
        $second = $this->sender()->approve($post, 'Twice', $this->user);

        $this->assertNull($first->refusal);
        $this->assertSame('This post has already been sent.', $second->refusal);
        Http::assertSentCount(1);
        $this->assertSame('Once', $post->fresh()->text);
    }

    public function test_discarded_and_sending_posts_cannot_be_approved(): void
    {
        Http::fake();
        $post = $this->draft(SocialNetwork::X);
        $this->assertNull($this->sender()->discard($post));
        $this->assertSame('Discarded posts cannot be sent.', $this->sender()->approve($post->fresh(), 'x', $this->user)->refusal);
        $this->assertNotNull($this->sender()->discard($post->fresh()));

        $busy = $this->draft(SocialNetwork::X);
        $busy->update(['status' => SocialPostStatus::Sending]);
        $this->assertSame('This post has already been sent.', $this->sender()->approve($busy->fresh(), 'x', $this->user)->refusal);
        Http::assertNothingSent();
    }

    public function test_x_text_over_the_limit_is_refused(): void
    {
        Http::fake();
        $post = $this->draft(SocialNetwork::X);

        $out = $this->sender()->approve($post, str_repeat('a', 300), $this->user);

        $this->assertSame('That is too long for X.', $out->refusal);
        $this->assertSame(SocialPostStatus::Draft, $post->fresh()->status);
        $this->assertSame('Draft text', $post->fresh()->text);

        $li = $this->draft();
        $this->assertSame('LinkedIn allows up to 3,000 characters.', $this->sender()->approve($li, str_repeat('a', 3001), $this->user)->refusal);
    }

    public function test_an_unpublished_subject_is_refused_and_the_draft_kept(): void
    {
        $this->connect();
        Http::fake();
        $post = $this->draft();
        SocialDrafts::suppressed(fn () => $this->blog->update(['status' => 'draft']));

        $out = $this->sender()->approve($post, 'New words', $this->user);

        $this->assertSame('That page is no longer published.', $out->refusal);
        $this->assertSame(SocialPostStatus::Draft, $post->fresh()->status);
        Http::assertNothingSent();
    }

    public function test_a_connection_without_a_refresh_token_is_accepted_and_reports_its_expiry(): void
    {
        $this->travelTo(now()->startOfSecond());
        Setting::put('social_linkedin_oauth_client_id', 'client');
        Setting::put('social_linkedin_oauth_client_secret', 'secret');
        Http::fake(['www.linkedin.com/oauth/v2/accessToken' => Http::response(['access_token' => 'li-token', 'expires_in' => 5184000], 200)]);

        $connection = OAuthConnection::linkedIn();
        $this->assertFalse($connection->isConnected());
        $connection->exchange('the-code', 'http://localhost:3000/admin/settings/social/callback');

        $this->assertTrue($connection->isConnected());
        $this->assertSame('li-token', $connection->accessToken());
        $this->assertSame(now()->addSeconds(5184000)->toIso8601String(), $connection->expiresAt()?->toIso8601String());
        $this->assertTrue(app(LinkedInPoster::class)->ready() === false, 'ready needs the organisation too');

        Setting::put('social_linkedin_organization_id', '12345');
        $this->assertTrue(app(LinkedInPoster::class)->ready());

        $this->travel(61)->days();
        $this->assertFalse(app(LinkedInPoster::class)->ready());
    }

    public function test_other_providers_still_demand_a_refresh_token(): void
    {
        Setting::put('zoho_books_oauth_client_id', 'c');
        Setting::put('zoho_books_oauth_client_secret', 's');
        Http::fake(['accounts.zoho.in/*' => Http::response(['access_token' => 'a', 'expires_in' => 3600], 200)]);

        $this->expectException(\RuntimeException::class);
        OAuthConnection::zohoBooks('in')->exchange('code', 'http://localhost/cb');
    }

    public function test_the_linkedin_settings_are_private(): void
    {
        Setting::put('social_linkedin_oauth_client_id', 'client-id-value');
        Setting::put('social_linkedin_organization_id', '12345');

        $this->assertSame('social_accounts', Setting::query()->where('key', 'social_linkedin_oauth_client_id')->value('group'));
        $this->assertTrue((bool) Setting::query()->where('key', 'social_linkedin_oauth_client_secret')->value('is_secret'));
        $this->assertTrue((bool) Setting::query()->where('key', 'social_linkedin_oauth_access_token')->value('is_secret'));

        $json = json_encode($this->getJson('/api/v1/settings')->assertOk()->json('data'));
        $this->assertStringNotContainsString('social_linkedin_oauth', $json);
        $this->assertStringNotContainsString('social_linkedin_organization', $json);
        $this->assertStringNotContainsString('client-id-value', $json);
    }

    public function test_organisations_lists_the_accounts_the_admin_runs(): void
    {
        $this->connect();
        Http::fake([
            'api.linkedin.com/rest/organizationAcls*' => Http::response(['elements' => [
                ['organization' => 'urn:li:organization:12345', 'role' => 'ADMINISTRATOR'],
            ]], 200),
            'api.linkedin.com/rest/organizations/12345' => Http::response(['localizedName' => 'Acme Networks'], 200),
        ]);

        $this->assertSame([['id' => '12345', 'name' => 'Acme Networks']], app(LinkedInPoster::class)->organizations());
    }
}
