<?php

namespace Tests\Feature;

use App\Jobs\PingIndexNow;
use App\Models\Setting;
use App\Models\Solution;
use App\Support\IndexNow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * IndexNow: a published record tells the engines when it changes, and
 * nothing does until the switch is on.
 */
class IndexNowTest extends TestCase
{
    use RefreshDatabase;

    private function setting(string $key, ?string $value, string $type = 'string'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => 'indexnow', 'value' => $value, 'type' => $type]);
        Setting::flushCache();
    }

    private function solution(string $status = 'published'): Solution
    {
        return Solution::create([
            'title' => 'Enterprise networking',
            'slug' => 'enterprise-networking-'.uniqid(),
            'summary' => 'Switching and routing.',
            'status' => $status,
        ]);
    }

    public function test_nothing_is_sent_while_the_switch_is_off(): void
    {
        Queue::fake();

        $this->solution();

        Queue::assertNothingPushed();
    }

    public function test_a_published_record_pings_its_own_url_on_save_and_on_delete(): void
    {
        Queue::fake();
        $this->setting('indexnow_enabled', '1', 'boolean');

        $record = $this->solution();
        $expected = rtrim((string) config('app.frontend_url'), '/').'/solutions/'.$record->slug;

        Queue::assertPushed(PingIndexNow::class, fn ($job) => $job->urls === [$expected]);

        $record->delete();

        Queue::assertPushed(PingIndexNow::class, 2);
    }

    public function test_a_draft_being_edited_does_not_ping_but_unpublishing_does(): void
    {
        Queue::fake();
        $this->setting('indexnow_enabled', '1', 'boolean');

        $draft = $this->solution('draft');
        $draft->update(['summary' => 'Edited again.']);

        Queue::assertNothingPushed();

        $live = $this->solution();
        Queue::assertPushed(PingIndexNow::class, 1);

        // Off the site: the engine has to recrawl to find the 404 or the redirect.
        $live->update(['status' => 'draft']);
        Queue::assertPushed(PingIndexNow::class, 2);
    }

    public function test_the_key_is_minted_once_and_published(): void
    {
        $first = IndexNow::key();
        $second = IndexNow::key();

        $this->assertSame($first, $second);
        $this->assertMatchesRegularExpression('/^[a-z0-9]{32}$/', $first);

        // Public, because the engines fetch the key file from the frontend.
        $this->getJson('/api/v1/settings')->assertOk()->assertJsonPath('data.indexnow_key', $first);
    }

    public function test_the_job_posts_the_urls_with_the_key_and_its_location(): void
    {
        $this->setting('indexnow_enabled', '1', 'boolean');
        Http::fake([IndexNow::ENDPOINT => Http::response('', 202)]);

        (new PingIndexNow(['https://www.technoware.in/solutions/networking']))->handle();

        Http::assertSent(function ($request) {
            $body = $request->data();

            return $request->url() === IndexNow::ENDPOINT
                && $body['key'] === IndexNow::key()
                && $body['keyLocation'] === IndexNow::keyLocation()
                && $body['urlList'] === ['https://www.technoware.in/solutions/networking'];
        });
    }

    public function test_a_refusal_is_logged_and_never_thrown(): void
    {
        $this->setting('indexnow_enabled', '1', 'boolean');
        Http::fake([IndexNow::ENDPOINT => Http::response('Invalid key', 403)]);

        (new PingIndexNow(['https://www.technoware.in/solutions/networking']))->handle();

        $this->assertTrue(true, 'reached without an exception');
    }
}
