<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Categories, the archive and the filters behind the blog's sidebar.
 *
 * The blog shipped with no taxonomy at all — no column, no pivot, not even the
 * tags the knowledge base has — so every badge, every count and every filtered
 * listing in the new design rests on this.
 */
class BlogTaxonomyTest extends TestCase
{
    use RefreshDatabase;

    private ?User $editor = null;

    /** Memoised: `users.email` is unique, so a second call would collide. */
    private function editor(): User
    {
        if ($this->editor !== null) {
            return $this->editor;
        }

        $user = User::create([
            'name' => 'Ed Editor',
            'email' => 'ed@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        return $this->editor = $user;
    }

    private function article(string $title, string $slug, ?string $when = null): BlogPost
    {
        return BlogPost::create([
            'title' => $title,
            'slug' => $slug,
            'excerpt' => 'A short summary.',
            'body' => '<p>The body of the article.</p>',
            'status' => PublishStatus::Published,
            'published_at' => $when ?? now()->subDay(),
        ]);
    }

    /** A post belongs to several categories, and the listing carries them. */
    public function test_a_post_carries_every_category_it_is_filed_under(): void
    {
        $post = $this->article('AI and advertising', 'ai-and-advertising');
        $ai = BlogCategory::create(['name' => 'Artificial Intelligence']);
        $marketing = BlogCategory::create(['name' => 'Digital Marketing']);
        $post->categories()->sync([$ai->id, $marketing->id]);

        $row = $this->getJson('/api/v1/blog')->assertOk()->json('data.0');

        $this->assertCount(2, $row['categories']);
        $this->assertEqualsCanonicalizing(
            ['Artificial Intelligence', 'Digital Marketing'],
            array_column($row['categories'], 'name'),
        );
    }

    /**
     * The sidebar's count and the listing behind it are the same query.
     *
     * A row reading eight that opens a page of five is worse than no row at
     * all — the rule the store's out-of-stock tile follows. So the count is of
     * **published** posts, and a draft filed in a category does not inflate it.
     */
    public function test_a_category_count_matches_the_listing_it_links_to(): void
    {
        $category = BlogCategory::create(['name' => 'Web Development']);

        $this->article('One', 'one')->categories()->attach($category);
        $this->article('Two', 'two')->categories()->attach($category);

        BlogPost::create([
            'title' => 'A draft',
            'slug' => 'a-draft',
            'body' => '<p>Not finished.</p>',
            'status' => PublishStatus::Draft,
        ])->categories()->attach($category);

        $sidebar = $this->getJson('/api/v1/blog/taxonomy')->assertOk()->json('data.categories');

        $this->assertCount(1, $sidebar);
        $this->assertSame(2, $sidebar[0]['posts_count']);

        $listed = $this->getJson('/api/v1/blog?category=web-development')->assertOk()->json('data');

        $this->assertCount($sidebar[0]['posts_count'], $listed);
    }

    /** A category nothing is published in is not offered. */
    public function test_an_empty_category_is_not_in_the_sidebar(): void
    {
        BlogCategory::create(['name' => 'Nothing Here']);

        $this->assertSame(
            [],
            $this->getJson('/api/v1/blog/taxonomy')->assertOk()->json('data.categories'),
        );
    }

    /** The archive groups by the month a post was published in. */
    public function test_the_archive_counts_by_month(): void
    {
        $this->article('March one', 'march-one', '2026-03-04 09:00:00');
        $this->article('March two', 'march-two', '2026-03-19 09:00:00');
        $this->article('April one', 'april-one', '2026-04-02 09:00:00');

        $archive = $this->getJson('/api/v1/blog/taxonomy')->assertOk()->json('data.archive');

        $this->assertSame([
            ['year' => 2026, 'month' => 4, 'label' => 'April 2026', 'total' => 1],
            ['year' => 2026, 'month' => 3, 'label' => 'March 2026', 'total' => 2],
        ], $archive);

        $march = $this->getJson('/api/v1/blog?year=2026&month=3')->assertOk()->json('data');

        $this->assertCount(2, $march);
    }

    /** Search reaches the body, which is where somebody's word usually is. */
    public function test_search_narrows_the_listing(): void
    {
        $this->article('Firewalls', 'firewalls');

        BlogPost::create([
            'title' => 'Something else entirely',
            'slug' => 'something-else',
            'excerpt' => 'No mention of the word.',
            'body' => '<p>About storage.</p>',
            'status' => PublishStatus::Published,
            'published_at' => now()->subDay(),
        ]);

        $found = $this->getJson('/api/v1/blog?q=firewalls')->assertOk()->json('data');

        $this->assertCount(1, $found);
        $this->assertSame('Firewalls', $found[0]['title']);
    }

    /**
     * `blog/taxonomy` and `blog/featured` resolve, rather than binding `{post}`
     * to those literal words.
     *
     * Laravel matches in declaration order, so beneath `blog/{post}` both would
     * 404 from model binding — a routing bug that reads as a missing article.
     * The media library has a test pinning exactly this for `media/move`.
     */
    public function test_the_fixed_blog_routes_are_not_swallowed_by_the_slug_route(): void
    {
        $this->getJson('/api/v1/blog/taxonomy')->assertOk();
        $this->getJson('/api/v1/blog/featured')->assertOk();
    }

    /**
     * The hero falls back to the latest when nothing is featured.
     *
     * A fresh install renders a hero rather than a gap, the same call the
     * homepage makes when no slider is assigned.
     */
    public function test_featured_falls_back_to_the_latest(): void
    {
        $this->article('Older', 'older', now()->subWeek()->toDateTimeString());
        $newest = $this->article('Newest', 'newest', now()->subHour()->toDateTimeString());

        $none = $this->getJson('/api/v1/blog/featured')->assertOk()->json('data');

        $this->assertSame('Newest', $none[0]['title']);

        BlogPost::where('slug', 'older')->firstOrFail()->update(['is_featured' => true]);

        $featured = $this->getJson('/api/v1/blog/featured')->assertOk()->json('data');

        $this->assertSame('Older', $featured[0]['title'], 'A ticked post leads.');
        $this->assertSame($newest->title, $featured[1]['title']);
    }

    /** An unknown category is an empty page, never a 422. */
    public function test_an_unknown_category_returns_nothing_rather_than_an_error(): void
    {
        $this->article('One', 'one');

        $this->assertSame(
            [],
            $this->getJson('/api/v1/blog?category=no-such-thing')->assertOk()->json('data'),
        );
    }

    /** Deleting a category keeps the posts filed under it. */
    public function test_deleting_a_category_keeps_its_posts(): void
    {
        $category = BlogCategory::create(['name' => 'Temporary']);
        $post = $this->article('Kept', 'kept');
        $post->categories()->attach($category);

        $this->actingAs($this->editor(), 'sanctum')
            ->deleteJson("/api/v1/admin/blog-categories/{$category->id}")
            ->assertOk();

        $this->assertNotNull($post->fresh(), 'The article must survive its category.');
        $this->assertCount(0, $post->fresh()->categories);
    }

    /** The console files a post under categories on save. */
    public function test_the_console_can_file_a_post_under_categories(): void
    {
        $ai = BlogCategory::create(['name' => 'Artificial Intelligence']);
        $seo = BlogCategory::create(['name' => 'SEO']);

        $created = $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/blog-posts', [
                'title' => 'How AI changed search',
                'body' => '<p>A body long enough to be real.</p>',
                'status' => 'published',
                'is_featured' => true,
                'category_ids' => [$ai->id, $seo->id],
            ])
            ->assertCreated()
            ->json('data');

        $this->assertCount(2, $created['categories']);
        $this->assertTrue($created['is_featured']);

        // Sending [] clears them, which has to be possible or the last
        // category could never be removed.
        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/blog-posts/{$created['id']}", ['category_ids' => []])
            ->assertOk();

        $this->assertCount(0, BlogPost::findOrFail($created['id'])->categories);
    }
}
