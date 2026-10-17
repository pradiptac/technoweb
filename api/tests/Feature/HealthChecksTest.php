<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Role;
use App\Models\User;
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
}
