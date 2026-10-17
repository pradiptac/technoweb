<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Certification;
use App\Models\HealthFinding;
use App\Models\HealthLink;
use App\Models\Page;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\User;
use App\Support\Health\Checker;
use App\Support\Health\Content;
use App\Support\Health\Findings;
use App\Support\Health\Kinds;
use App\Support\Health\LinkTarget;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
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

    public function test_links_are_classified(): void
    {
        config(['app.frontend_url' => 'https://www.technoware.in']);

        $this->assertSame(['kind' => 'internal', 'value' => '/about'], LinkTarget::classify('https://technoware.in/about/'));
        $this->assertSame(['kind' => 'internal', 'value' => '/about'], LinkTarget::classify('/about?utm=x#team'));
        $this->assertSame(['kind' => 'external', 'value' => 'https://vendor.example/a'], LinkTarget::classify('https://vendor.example/a'));
        $this->assertSame(['kind' => 'anchor', 'value' => 'team'], LinkTarget::classify('#team'));
        $this->assertSame(['kind' => 'external', 'value' => 'https://vendor.example/x'], LinkTarget::classify('//vendor.example/x'));
        foreach (['mailto:a@b.in', 'tel:+91', '#', '', 'javascript:x'] as $skip) {
            $this->assertNull(LinkTarget::classify($skip));
        }
    }

    public function test_query_strings_and_trailing_slashes_are_normalised(): void
    {
        $post = $this->blogPost();

        $this->assertSame(['state' => 'ok'], LinkTarget::judge(LinkTarget::classify($post->publicPath().'/?utm=x')['value']));
    }

    public function test_an_internal_path_is_judged_cheapest_first(): void
    {
        Redirect::create(['from_path' => '/old-page', 'to_path' => '/about', 'status_code' => 301, 'is_active' => true, 'created_automatically' => false]);
        Storage::fake('public')->put('files/a.pdf', 'x');
        Storage::disk('public')->put('files/my file.pdf', 'x');

        $this->assertSame(['state' => 'ok'], LinkTarget::judge('/blog'));
        $this->assertSame(['state' => 'redirect', 'to' => '/about'], LinkTarget::judge('/old-page'));
        $this->assertSame(['state' => 'ok'], LinkTarget::judge('/storage/files/a.pdf'));
        $this->assertSame(['state' => 'dead'], LinkTarget::judge('/storage/files/missing.pdf'));
        $this->assertSame(['state' => 'ok'], LinkTarget::judge('/storage/files/my%20file.pdf'));
        $this->assertSame(['state' => 'dead'], LinkTarget::judge('/storage/files'));
        $this->assertSame(['state' => 'dead'], LinkTarget::judge('/storage/../.env'));
        $this->assertSame(['state' => 'ask'], LinkTarget::judge('/some/frontend/route'));
    }

    private function checks(Model $m): array
    {
        return array_column(Checker::run($m), 'check');
    }

    public function test_each_link_check(): void
    {
        $post = $this->blogPost(['body' => '<p><a href="/nowhere/at-all">Somewhere</a> <a href="#missing">Jump</a> <a href="/old">Old</a></p>']);
        Redirect::create(['from_path' => '/old', 'to_path' => '/about', 'status_code' => 301, 'is_active' => true, 'created_automatically' => false]);
        HealthLink::updateOrCreate(['url_hash' => HealthLink::hashOf('/nowhere/at-all')], ['url' => '/nowhere/at-all', 'host' => 'internal', 'internal' => true, 'result' => 'failed', 'fails' => 1]);

        $this->assertEqualsCanonicalizing(['link_internal_dead', 'link_anchor_missing', 'link_redirected'], $this->checks($post));
    }

    public function test_an_external_link_is_dead_only_after_two_failures(): void
    {
        $post = $this->blogPost(['body' => '<p><a href="https://vendor.example/sheet.pdf">Datasheet</a></p>']);
        $this->assertSame([], $this->checks($post));
        $link = HealthLink::where('url_hash', HealthLink::hashOf('https://vendor.example/sheet.pdf'))->sole();
        $this->assertSame('pending', $link->result);

        $link->update(['result' => 'failed', 'fails' => 1]);
        $this->assertSame([], $this->checks($post));

        $link->update(['fails' => 2, 'status' => 404]);
        $this->assertSame(['link_external_dead'], $this->checks($post));
    }

    public function test_stale_and_the_dated_checks(): void
    {
        $page = Page::create(['title' => 'Old page', 'slug' => 'old-page', 'body' => '<p>x</p>', 'status' => 'published']);
        Page::whereKey($page->id)->toBase()->update(['updated_at' => now()->subMonths(19)]);
        $this->assertSame(['stale'], $this->checks($page->fresh()));

        $cert = Certification::create(['name' => 'ISO', 'issuer' => 'BSI', 'status' => 'published', 'valid_until' => now()->subDay()]);
        $this->assertSame(['certification_expired'], $this->checks($cert));
    }

    public function test_each_accessibility_check(): void
    {
        $post = $this->blogPost(['cover_image_path' => 'media/no-alt.png', 'body' => '<h2>A</h2><h4>B</h4><p><a href="/blog">click here</a><a href="/blog"></a></p><img src="/storage/x.png"><table><tr><td>1</td></tr></table>']);

        $this->assertEqualsCanonicalizing(
            ['image_no_alt', 'image_no_alt', 'heading_jump', 'link_text_vague', 'link_empty', 'table_no_header'],
            $this->checks($post),
        );
    }

    public function test_findings_are_replaced_keeping_first_seen_and_ignore(): void
    {
        $post = $this->blogPost(['body' => '<p><a href="/blog">click here</a></p>']);
        Findings::replace($post, Checker::run($post));
        $row = HealthFinding::sole();
        $row->update(['ignored_at' => now(), 'first_seen_at' => now()->subWeek()]);

        Findings::replace($post, Checker::run($post));
        $again = HealthFinding::sole();
        $this->assertNotNull($again->ignored_at);
        $this->assertTrue($again->first_seen_at->lt(now()->subDays(6)));

        $post->update(['body' => '<p><a href="/blog">The blog</a></p>']);
        Findings::replace($post, Checker::run($post));
        $this->assertSame(0, HealthFinding::count());
    }

    public function test_a_changed_detail_is_a_new_finding(): void
    {
        $post = $this->blogPost(['body' => '<p><a href="/blog">click here</a></p>']);
        Findings::replace($post, Checker::run($post));
        HealthFinding::query()->update(['ignored_at' => now()]);

        $post->update(['body' => '<p><a href="/blog">read more</a></p>']);
        Findings::replace($post, Checker::run($post));

        $this->assertNull(HealthFinding::sole()->ignored_at);
    }
}
