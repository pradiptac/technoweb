<?php

namespace Tests\Feature;

use App\Jobs\WriteSocialPost;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\SocialPost;
use App\Support\Social\SocialDrafts;
use App\Support\Social\SocialText;
use App\Support\Writing\Writer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class SocialDraftsTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    private function blog(array $over = []): BlogPost
    {
        return BlogPost::create($over + [
            'title' => 'New switches', 'slug' => 'new-switches', 'excerpt' => 'Faster ports.', 'body' => '<p>We now stock faster switches.</p>',
            'status' => 'published', 'published_at' => now(),
        ]);
    }

    private function press(string $preset, string $status = 'published'): Entry
    {
        $type = ContentType::firstOrCreate(['slug' => $preset], ['name' => $preset, 'plural' => $preset, 'is_active' => true, 'preset' => $preset]);

        return Entry::create(['content_type_id' => $type->id, 'title' => 'An entry', 'status' => $status, 'published_at' => $status === 'published' ? now() : null]);
    }

    public function test_publishing_a_post_makes_one_pair_with_fallback_text(): void
    {
        config(['app.frontend_url' => 'https://www.example.test']);
        $post = $this->blog();

        $rows = SocialPost::query()->orderBy('id')->get();
        $this->assertCount(2, $rows);
        $this->assertSame(['linkedin', 'x'], $rows->map(fn ($r) => $r->network->value)->all());
        $this->assertSame(['publish', 'publish'], $rows->pluck('source')->all());
        $this->assertSame('https://www.example.test/blog/new-switches', $rows[0]->url);
        $this->assertSame(SocialText::fallback($rows[1]->network, 'New switches', 'Faster ports.', $rows[1]->url), $rows[1]->text);
        $this->assertSame('blog_post', $rows[0]->subject_type);
        $this->assertSame($post->id, (int) $rows[0]->subject_id);
        $this->assertSame('draft', $rows[0]->status->value);
    }

    public function test_saving_again_or_republishing_makes_no_second_pair(): void
    {
        $post = $this->blog();
        $post->update(['title' => 'New switches, faster']);
        $post->update(['status' => 'draft']);
        $post->update(['status' => 'published']);

        $this->assertSame(2, SocialPost::query()->count());
    }

    public function test_a_future_dated_post_is_drafted_by_the_sweep_once(): void
    {
        $this->blog(['published_at' => now()->addDay()]);
        $this->assertSame(0, SocialPost::query()->count());

        $this->travel(2)->days();
        Artisan::call('technoware:draft-social-posts');
        $this->assertSame(2, SocialPost::query()->count());

        Artisan::call('technoware:draft-social-posts');
        $this->assertSame(2, SocialPost::query()->count());
    }

    public function test_coverage_entries_and_drafts_are_never_drafted(): void
    {
        $this->press('newsroom_coverage');
        $this->blog(['slug' => 'draft-post', 'status' => 'draft']);
        $this->press('newsroom_releases', 'draft');
        Artisan::call('technoware:draft-social-posts');
        $this->assertSame(0, SocialPost::query()->count());

        $this->press('newsroom_releases'); // published press release: drafted (own content type slug)
        $this->assertSame(2, SocialPost::query()->count());
    }

    public function test_the_ai_answer_replaces_untouched_fallback_text(): void
    {
        $this->writerOn();
        Queue::fake();
        $this->blog();
        $fake = $this->fakeModel(['text' => 'Fresh words about switches. https://evil.test/x #networking']);

        $rows = SocialPost::query()->orderBy('id')->get();
        $this->assertTrue($rows->every(fn ($r) => $r->ai_pending));
        foreach ($rows as $r) {
            (new WriteSocialPost($r->id))->handle(app(Writer::class));
        }

        $rows = SocialPost::query()->orderBy('id')->get();
        $this->assertSame(2, $fake->calls);
        $this->assertSame('Fresh words about switches.  #networking', $rows[0]->text);
        $this->assertStringContainsString('We now stock faster switches.', $this->sent($fake));
        $this->assertFalse($rows->contains(fn ($r) => $r->ai_pending));
    }

    public function test_an_editors_text_is_never_overwritten_by_the_ai(): void
    {
        $this->writerOn();
        Queue::fake();
        $this->blog();
        $this->fakeModel(['text' => 'Fresh words about switches.']);

        $row = SocialPost::query()->where('network', 'linkedin')->firstOrFail();
        $row->update(['text' => 'The editor wrote this.']);
        (new WriteSocialPost($row->id))->handle(app(Writer::class));

        $row->refresh();
        $this->assertSame('The editor wrote this.', $row->text);
        $this->assertFalse($row->ai_pending);
    }

    public function test_a_refused_model_leaves_the_fallback_and_clears_pending(): void
    {
        $this->writerOn();
        Queue::fake();
        $this->blog();
        $this->fakeModel('boom', ok: false);

        $row = SocialPost::query()->where('network', 'x')->firstOrFail();
        $before = $row->text;
        (new WriteSocialPost($row->id))->handle(app(Writer::class));

        $row->refresh();
        $this->assertSame($before, $row->text);
        $this->assertFalse($row->ai_pending);
    }

    public function test_with_ai_on_two_jobs_are_queued_and_with_it_off_none(): void
    {
        Queue::fake();
        $this->blog(['slug' => 'off']);
        Queue::assertNotPushed(WriteSocialPost::class);
        $this->assertSame([false, false], SocialPost::query()->pluck('ai_pending')->all());

        $this->writerOn();
        $this->blog(['slug' => 'on']);
        Queue::assertPushed(WriteSocialPost::class, 2);
        $this->assertSame(2, SocialPost::query()->where('ai_pending', true)->count());
    }

    public function test_a_failure_making_drafts_never_fails_the_save(): void
    {
        SocialPost::creating(fn () => throw new \RuntimeException('boom'));

        try {
            $post = $this->blog();
        } finally {
            SocialPost::flushEventListeners();
        }

        $this->assertTrue($post->exists);
        $this->assertSame(1, BlogPost::query()->count());
        $this->assertSame(0, SocialPost::query()->count());
    }

    public function test_editing_an_already_published_pairless_post_makes_no_pair(): void
    {
        $post = SocialDrafts::suppressed(fn () => $this->blog());
        $post->update(['title' => 'New switches, faster']);

        $this->assertSame(0, SocialPost::query()->count());
    }

    public function test_a_post_created_published_forty_days_ago_makes_none(): void
    {
        $this->blog(['published_at' => now()->subDays(40)]);

        $this->assertSame(0, SocialPost::query()->count());
    }

    public function test_draft_to_published_makes_one_pair(): void
    {
        $post = $this->blog(['status' => 'draft']);
        $this->assertSame(0, SocialPost::query()->count());

        $post->update(['status' => 'published', 'published_at' => now()]);
        $this->assertSame(2, SocialPost::query()->count());
    }

    public function test_a_published_case_study_edited_again_makes_none(): void
    {
        $study = SocialDrafts::suppressed(fn () => CaseStudy::create([
            'title' => 'A rollout', 'slug' => 'a-rollout', 'summary' => 'Done.', 'body' => '<p>Done.</p>', 'status' => 'published',
        ]));
        $study->update(['title' => 'A rollout, finished']);
        $this->assertSame(0, SocialPost::query()->count());

        // Created published, it counts as the transition.
        CaseStudy::create(['title' => 'Another', 'slug' => 'another', 'summary' => 'Done.', 'body' => '<p>Done.</p>', 'status' => 'published']);
        $this->assertSame(2, SocialPost::query()->count());
    }

    public function test_a_record_saved_inside_the_suppression_wrapper_makes_no_pair(): void
    {
        SocialDrafts::suppressed(fn () => $this->blog());
        $this->assertSame(0, SocialPost::query()->count());

        $this->blog(['slug' => 'after']); // and drafting resumes outside it
        $this->assertSame(2, SocialPost::query()->count());
    }
}
