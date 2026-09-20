<?php

namespace Tests\Feature;

use App\Enums\CommentStatus;
use App\Enums\CustomerStatus;
use App\Models\BlogComment;
use App\Models\BlogPost;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Comments on the blog.
 *
 * The single fact this feature is shaped by: an unmoderated comment form on a
 * public page fills with spam within days. So most of what is pinned here is
 * what the module refuses to do — publish anything by itself, file anything as
 * spam by itself, or let a comment escape the queue.
 */
class BlogCommentTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A signed-in reader is linked to their comment, and a **bearer token** is
     * what does it.
     *
     * This route carries no auth middleware and must not — commenting is open
     * to somebody with no account, which is most readers. So the only thing
     * that can identify one is a token on the request, and the controller was
     * reading the default guard, which outside `auth:sanctum` is always null.
     * `customer_id` was never filled, the name and address override never
     * applied, and the `account` scoring signal never counted.
     *
     * Nothing failed, which is exactly why it survived: a comment from a
     * signed-in reader is stored perfectly well without any of it. Reverting
     * `user('sanctum')` to `user()` fails this and nothing else.
     */
    public function test_a_bearer_token_links_a_comment_to_the_customer(): void
    {
        $this->open();
        $article = $this->article();

        $customer = Customer::create([
            'name' => 'Neil Basu',
            'email' => 'neil@meridian-foods.test',
            'password' => bcrypt('irrelevant'),
            'status' => CustomerStatus::Active,
        ]);

        $this->postJson(
            "/api/v1/blog/{$article->slug}/comments",
            $this->payload(),
            ['Authorization' => 'Bearer '.$customer->createToken('portal')->plainTextToken],
        )->assertStatus(202);

        $this->assertSame($customer->id, BlogComment::latest('id')->firstOrFail()->customer_id);
    }

    /** Named `article`, not `post`: `post()` is TestCase's own HTTP helper. */
    private function article(array $attributes = []): BlogPost
    {
        return BlogPost::create(array_merge([
            'title' => 'A post',
            'slug' => 'a-post-'.uniqid(),
            'excerpt' => 'Something.',
            'body' => '<p>Something.</p>',
            'status' => 'published',
            'published_at' => now()->subDay(),
        ], $attributes));
    }

    private function open(): void
    {
        Setting::updateOrCreate(['key' => 'comments_enabled'], ['group' => 'blog', 'value' => '1', 'type' => 'boolean']);
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'author_name' => 'Neil Basu',
            'author_email' => 'neil@example.in',
            'body' => 'We hit this exact problem on a Cisco stack last year, and the fix was the same.',
        ], $overrides);
    }

    public function test_a_comment_arrives_waiting_and_is_not_published(): void
    {
        $this->open();
        $post = $this->article();

        $this->postJson("/api/v1/blog/{$post->slug}/comments", $this->payload())
            ->assertStatus(202)
            ->assertJson(['message' => 'Thank you. Your comment will appear once it has been read.']);

        $comment = BlogComment::first();

        $this->assertNotNull($comment);
        $this->assertSame(CommentStatus::Pending, $comment->status);

        // And it is not on the public read.
        $this->getJson("/api/v1/blog/{$post->slug}/comments")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    /**
     * The honeypot answers exactly like a success.
     *
     * Telling a bot it was caught tells it what to change — the rule
     * `/auth/register` and the contact form already follow.
     */
    public function test_the_honeypot_stores_nothing_and_says_nothing(): void
    {
        $this->open();
        $post = $this->article();

        $clean = $this->postJson("/api/v1/blog/{$post->slug}/comments", $this->payload());
        BlogComment::query()->delete();

        $trapped = $this->postJson(
            "/api/v1/blog/{$post->slug}/comments",
            $this->payload(['website' => 'https://example.com']),
        );

        $trapped->assertStatus($clean->status());
        $this->assertSame($clean->json('message'), $trapped->json('message'));
        $this->assertDatabaseCount('blog_comments', 0);
    }

    /**
     * A closed post refuses, rather than only hiding its form.
     *
     * A tab left open across the day comments were closed would otherwise post
     * into a discussion that has ended — the reasoning a closed vacancy already
     * follows.
     */
    public function test_a_post_with_comments_off_refuses(): void
    {
        $this->open();
        $post = $this->article(['comments_enabled' => false]);

        $this->postJson("/api/v1/blog/{$post->slug}/comments", $this->payload())
            ->assertStatus(422);

        $this->assertDatabaseCount('blog_comments', 0);
    }

    /** Off site-wide means off everywhere, whatever a post says. */
    public function test_the_site_wide_switch_closes_everything(): void
    {
        Setting::updateOrCreate(['key' => 'comments_enabled'], ['group' => 'blog', 'value' => '0', 'type' => 'boolean']);
        $post = $this->article();

        $this->postJson("/api/v1/blog/{$post->slug}/comments", $this->payload())->assertStatus(422);
    }

    /** An article older than the window stops taking comments by itself. */
    public function test_an_old_post_closes_on_age(): void
    {
        $this->open();
        Setting::updateOrCreate(['key' => 'comments_closed_after_days'], ['group' => 'blog', 'value' => '30', 'type' => 'string']);

        $old = $this->article(['published_at' => now()->subDays(60)]);
        $recent = $this->article(['published_at' => now()->subDays(5)]);

        $this->postJson("/api/v1/blog/{$old->slug}/comments", $this->payload())->assertStatus(422);
        $this->postJson("/api/v1/blog/{$recent->slug}/comments", $this->payload())->assertStatus(202);
    }

    /**
     * A reply to a reply attaches to the top-level comment.
     *
     * One level is a rule about the data, not about the client: a parent id is
     * a number in a request body, so "the form only sends top-level ids" is not
     * a property of anything.
     */
    public function test_a_reply_to_a_reply_is_flattened(): void
    {
        $this->open();
        $post = $this->article();

        $top = BlogComment::create([
            'blog_post_id' => $post->id, 'author_name' => 'A', 'author_email' => 'a@example.in',
            'body' => 'Top level.', 'status' => CommentStatus::Approved,
        ]);
        $reply = BlogComment::create([
            'blog_post_id' => $post->id, 'parent_id' => $top->id, 'author_name' => 'B',
            'author_email' => 'b@example.in', 'body' => 'A reply.', 'status' => CommentStatus::Approved,
        ]);

        $this->postJson("/api/v1/blog/{$post->slug}/comments", $this->payload(['parent_id' => $reply->id]))
            ->assertStatus(202);

        $this->assertSame($top->id, BlogComment::latest('id')->first()->parent_id);
    }

    /** A parent on another post is dropped rather than followed. */
    public function test_a_parent_on_another_post_is_ignored(): void
    {
        $this->open();
        $post = $this->article();
        $other = $this->article();

        $elsewhere = BlogComment::create([
            'blog_post_id' => $other->id, 'author_name' => 'A', 'author_email' => 'a@example.in',
            'body' => 'Elsewhere.', 'status' => CommentStatus::Approved,
        ]);

        $this->postJson("/api/v1/blog/{$post->slug}/comments", $this->payload(['parent_id' => $elsewhere->id]))
            ->assertStatus(202);

        $this->assertNull(BlogComment::latest('id')->first()->parent_id);
    }

    /**
     * A low score is still only a hint.
     *
     * Nothing is auto-filed: junk waits in the queue like everything else,
     * because auto-filing eventually hides a real reader whose comment was
     * three words and the failure is silent and permanent.
     */
    public function test_an_obviously_spammy_comment_is_scored_low_and_still_queued(): void
    {
        $this->open();
        $post = $this->article();

        $this->postJson("/api/v1/blog/{$post->slug}/comments", $this->payload([
            'body' => 'CHEAP CASINO LOANS http://a.example http://b.example http://c.example',
        ]))->assertStatus(202);

        $comment = BlogComment::first();

        $this->assertSame(CommentStatus::Pending, $comment->status, 'Nothing may be filed as spam automatically.');
        $this->assertLessThan(40, $comment->score);
        $this->assertNotEmpty($comment->score_reasons, 'A score must arrive with its working.');
    }

    /** The public read never carries an address, a score or a user agent. */
    public function test_the_public_read_exposes_no_personal_data(): void
    {
        $this->open();
        $post = $this->article();

        BlogComment::create([
            'blog_post_id' => $post->id, 'author_name' => 'Neil', 'author_email' => 'neil@example.in',
            'body' => 'Published.', 'status' => CommentStatus::Approved, 'score' => 90,
            'ip_hash' => str_repeat('a', 64), 'user_agent' => 'Mozilla/5.0',
        ]);

        $body = $this->getJson("/api/v1/blog/{$post->slug}/comments")->assertOk()->getContent();

        $this->assertStringNotContainsString('neil@example.in', $body);
        $this->assertStringNotContainsString('Mozilla', $body);
        $this->assertStringNotContainsString('score', $body);
    }

    /** An IP is stored hashed, never raw. */
    public function test_the_ip_is_hashed(): void
    {
        $this->open();
        $post = $this->article();

        $this->postJson("/api/v1/blog/{$post->slug}/comments", $this->payload())->assertStatus(202);

        $hash = BlogComment::first()->ip_hash;

        $this->assertNotNull($hash);
        $this->assertSame(64, strlen($hash));
        $this->assertStringNotContainsString('127.0.0.1', $hash);
    }

    // ------------------------------------------------------------ moderation

    /**
     * A content manager.
     *
     * Created by hand and the role created with it: there is no `UserFactory`
     * in this project, and roles are not seeded into the test database — the
     * same shape `NewsletterTest` uses.
     */
    private function editor(): User
    {
        $user = User::create([
            'name' => 'An editor',
            'email' => 'editor-'.uniqid().'@example.in',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => 'content_manager'],
            ['name' => 'Content manager'],
        ));

        return $user;
    }

    public function test_approving_publishes_it_and_records_who(): void
    {
        $this->open();
        $post = $this->article();
        $comment = BlogComment::create([
            'blog_post_id' => $post->id, 'author_name' => 'A', 'author_email' => 'a@example.in',
            'body' => 'Waiting.', 'status' => CommentStatus::Pending,
        ]);

        $editor = $this->editor();

        $this->actingAs($editor)
            ->postJson('/api/v1/admin/blog-comments/moderate', [
                'ids' => [$comment->id], 'status' => 'approved',
            ])
            ->assertOk()
            ->assertJsonPath('data.moved', 1);

        $comment->refresh();

        $this->assertSame(CommentStatus::Approved, $comment->status);
        $this->assertNotNull($comment->approved_at);
        $this->assertSame($editor->id, $comment->approved_by);

        $this->getJson("/api/v1/blog/{$post->slug}/comments")->assertJsonCount(1, 'data');
    }

    /**
     * `approved_at` is stamped on arrival and never cleared.
     *
     * The rule `resolved_at` had to be taught on tickets: un-approving a
     * comment does not un-happen the moment somebody approved it, and every
     * figure about moderation speed reads that column.
     */
    public function test_unapproving_does_not_erase_when_it_was_approved(): void
    {
        $post = $this->article();
        $comment = BlogComment::create([
            'blog_post_id' => $post->id, 'author_name' => 'A', 'author_email' => 'a@example.in',
            'body' => 'Waiting.', 'status' => CommentStatus::Pending,
        ]);

        $editor = $this->editor();

        $this->actingAs($editor)->postJson('/api/v1/admin/blog-comments/moderate', [
            'ids' => [$comment->id], 'status' => 'approved',
        ])->assertOk();

        $approvedAt = $comment->refresh()->approved_at;

        $this->actingAs($editor)->postJson('/api/v1/admin/blog-comments/moderate', [
            'ids' => [$comment->id], 'status' => 'spam',
        ])->assertOk();

        $this->assertEquals($approvedAt, $comment->refresh()->approved_at);
    }

    /** Bulk and single go through one door, so they cannot mean different things. */
    public function test_many_are_moderated_at_once(): void
    {
        $post = $this->article();

        $ids = collect(range(1, 3))->map(fn ($i) => BlogComment::create([
            'blog_post_id' => $post->id, 'author_name' => "A{$i}", 'author_email' => "a{$i}@example.in",
            'body' => 'Waiting.', 'status' => CommentStatus::Pending,
        ])->id)->all();

        $this->actingAs($this->editor())
            ->postJson('/api/v1/admin/blog-comments/moderate', ['ids' => $ids, 'status' => 'spam'])
            ->assertOk()
            ->assertJsonPath('data.moved', 3)
            ->assertJsonPath('data.waiting', 0);
    }

    public function test_the_queue_is_closed_to_a_customer_token(): void
    {
        $this->getJson('/api/v1/admin/blog-comments')->assertUnauthorized();
    }
}
