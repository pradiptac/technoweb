<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Role;
use App\Models\User;
use App\Support\Health\Content;
use App\Support\Health\Kinds;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthChecksTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role): User
    {
        $user = User::firstOrCreate(['email' => $role->value.'-health@example.test'],
            ['name' => 'Staff', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user;
    }

    private function blogPost(array $attributes = []): BlogPost
    {
        return BlogPost::create($attributes + [
            'title' => 'A post', 'slug' => 'a-post', 'excerpt' => 'x', 'body' => '<p>Words.</p>',
            'author_id' => $this->staff(RoleEnum::ContentManager)->id, 'status' => 'published', 'published_at' => now(),
        ]);
    }

    public function test_kinds_lists_the_revision_kinds_without_the_library_plus_certifications(): void
    {
        $aliases = Kinds::aliases();

        $this->assertContains('blog_post', $aliases);
        $this->assertContains('store_product', $aliases);
        $this->assertContains('certification', $aliases);
        $this->assertNotContains('saved_section', $aliases);
        $this->assertSame(BlogPost::class, Kinds::classFor('blog_post'));
        $this->assertSame('store_manager', Kinds::roleFor('store_product'));
        $this->assertSame('content_manager', Kinds::roleFor('certification'));
    }

    public function test_a_role_sees_only_its_own_kinds(): void
    {
        $store = $this->staff(RoleEnum::StoreManager);

        $this->assertSame(['store_product'], Kinds::aliasesFor($store));
        $this->assertFalse(Kinds::allows($store, 'page'));
    }

    public function test_title_admin_path_and_published(): void
    {
        $post = $this->blogPost();

        $this->assertSame('A post', Kinds::title($post));
        $this->assertSame('/admin/blog/'.$post->id, Kinds::adminPath($post));
        $this->assertTrue(Kinds::isPublished($post));
        $this->assertFalse(Kinds::isPublished($this->blogPost(['slug' => 'draft', 'status' => 'draft'])));
    }

    public function test_content_walks_the_body_and_visible_sections(): void
    {
        $post = $this->blogPost([
            'body' => '<h2 id="intro">Intro</h2><h4>Skipped</h4><p><a href="/solutions/x">read more</a> <a href="https://vendor.example/sheet.pdf">Datasheet</a> <a href="/y"></a></p><img src="/storage/a.png"><table><tr><td>1</td></tr></table>',
            'body_layout' => 'sections',
            'blocks' => [
                ['id' => '11111111-1111-4111-8111-111111111111', 'type' => 'cta', 'hidden' => false, 'style' => ['anchor' => 'contact'],
                    'data' => ['heading' => 'Talk', 'primary' => ['label' => 'Go', 'href' => '/contact']]],
                ['id' => '22222222-2222-4222-8222-222222222222', 'type' => 'video', 'hidden' => false,
                    'data' => ['source' => 'youtube', 'youtube' => 'abcdefghijk']],
            ],
        ]);

        $c = Content::of($post);

        $this->assertSame(['/solutions/x', 'https://vendor.example/sheet.pdf', '/y', '/contact'], array_column($c->links, 'href'));
        $this->assertSame('blocks.0.data.primary.href', $c->links[3]['field']);
        $this->assertSame([['field' => 'body', 'alt' => null]], $c->bodyImages);
        $this->assertSame([['field' => 'blocks.1.data', 'titled' => false]], $c->videos);
        $this->assertSame(['contact', 'intro'], $c->anchors);
        $this->assertSame([['field' => 'body', 'levels' => [2, 4]]], $c->headings);
        $this->assertSame(['body'], $c->tablesWithoutHeader);
        $this->assertSame(['body'], $c->emptyLinks);
    }

    public function test_hidden_sections_are_skipped(): void
    {
        $post = $this->blogPost(['body_layout' => 'sections', 'blocks' => [
            ['id' => '33333333-3333-4333-8333-333333333333', 'type' => 'cta', 'hidden' => true,
                'data' => ['heading' => 'x', 'primary' => ['label' => 'Go', 'href' => '/nowhere']]],
        ]]);

        $this->assertSame([], Content::of($post)->links);
    }

    public function test_empty_and_broken_bodies_yield_nothing(): void
    {
        foreach ([null, '', '<p>', '<div><a href="/x">unclosed'] as $i => $body) {
            $c = Content::of($this->blogPost(['slug' => 'b'.$i, 'body' => $body]));
            $this->assertIsArray($c->links);
        }

        $this->assertSame([['field' => 'body', 'href' => '/x', 'text' => 'unclosed']], Content::of(BlogPost::where('slug', 'b3')->sole())->links);
    }
}
