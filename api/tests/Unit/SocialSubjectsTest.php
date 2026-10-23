<?php

namespace Tests\Unit;

use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\Event;
use App\Support\Social\SocialSubjects;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SocialSubjectsTest extends TestCase
{
    use RefreshDatabase;

    private function entry(string $preset, string $slug): Entry
    {
        $type = ContentType::create([
            'name' => $slug, 'plural' => $slug, 'slug' => $slug, 'is_active' => true, 'preset' => $preset,
        ]);

        return Entry::create(['content_type_id' => $type->id, 'title' => 'An entry', 'status' => 'published']);
    }

    public function test_only_press_release_entries_are_supported(): void
    {
        $this->assertTrue(SocialSubjects::supports($this->entry('newsroom_releases', 'press')));
        $this->assertFalse(SocialSubjects::supports($this->entry('newsroom_coverage', 'in-the-news')));
        $this->assertTrue(SocialSubjects::supports(new BlogPost));
        $this->assertFalse(SocialSubjects::supports(new ContentType));
    }

    public function test_visibility_rules(): void
    {
        $future = BlogPost::create(['title' => 'Later', 'slug' => 'later', 'body' => 'x', 'status' => 'published', 'published_at' => now()->addDay()]);
        $live = BlogPost::create(['title' => 'Now', 'slug' => 'now', 'body' => 'x', 'status' => 'published', 'published_at' => now()->subHour()]);
        $draft = CaseStudy::create(['title' => 'Draft', 'slug' => 'draft', 'summary' => 'x', 'body' => 'x', 'status' => 'draft']);
        $event = Event::create([
            'title' => 'Open day', 'slug' => 'open-day', 'summary' => 'x', 'format' => 'online',
            'starts_at' => '2026-12-12 15:00:00', 'registration_mode' => 'none', 'status' => 'published',
        ]);

        $this->assertFalse(SocialSubjects::isVisible($future));
        $this->assertTrue(SocialSubjects::isVisible($live));
        $this->assertFalse(SocialSubjects::isVisible($draft));
        $this->assertTrue(SocialSubjects::isVisible($event));
        $this->assertSame($live->id, SocialSubjects::find('blog_post', $live->id)?->id);
        $this->assertNull(SocialSubjects::find('product', 1));
    }

    public function test_public_url_and_admin_path(): void
    {
        config(['app.frontend_url' => 'https://www.example.test/']);
        $post = BlogPost::create(['title' => 'Hello', 'slug' => 'hello', 'excerpt' => 'Short.', 'body' => '<p>Body words.</p>', 'status' => 'published', 'published_at' => now()]);
        $entry = $this->entry('newsroom_releases', 'press');

        $this->assertSame('https://www.example.test/blog/hello', SocialSubjects::publicUrl($post));
        $this->assertSame('/admin/blog/'.$post->id, SocialSubjects::adminPath($post));
        $this->assertSame('https://www.example.test/press/'.$entry->slug, SocialSubjects::publicUrl($entry));
        $this->assertSame('/admin/content/press/'.$entry->id, SocialSubjects::adminPath($entry));
        $this->assertSame('Short.', SocialSubjects::summary($post));
        $this->assertSame('Body words.', SocialSubjects::bodyText($post));
        $this->assertSame('Blog post', SocialSubjects::kindLabel($post));
        $this->assertSame('Press release', SocialSubjects::kindLabel($entry));
        $this->assertSame('Hello', SocialSubjects::title($post));
    }
}
