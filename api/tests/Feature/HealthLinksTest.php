<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\HealthFinding;
use App\Models\HealthLink;
use App\Models\Role;
use App\Models\User;
use App\Support\Health\LinkProber;
use App\Support\Net\PublicHost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HealthLinksTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        // No test resolves real DNS (the PublicHost rule): every host answers a public address.
        $this->app->instance(PublicHost::RESOLVER, fn (string $host) => ['93.184.216.34']);
    }

    private function link(string $url = 'https://vendor.example/sheet.pdf'): HealthLink
    {
        return HealthLink::updateOrCreate(['url_hash' => HealthLink::hashOf($url)],
            ['url' => $url, 'host' => parse_url($url, PHP_URL_HOST), 'internal' => false, 'next_check_at' => now()]);
    }

    public function test_a_pass_resets_and_waits_a_week(): void
    {
        Http::fake(['vendor.example/*' => Http::response('', 200)]);
        $link = $this->link();
        $link->update(['fails' => 1, 'result' => 'failed']);

        LinkProber::probe($link);

        $this->assertSame(['ok', 0], [$link->result, $link->fails]);
        $this->assertTrue($link->next_check_at->between(now()->addDays(7)->subMinute(), now()->addDays(7)->addMinute()));
    }

    public function test_failures_count_and_come_back_sooner_the_first_time(): void
    {
        Http::fake(['vendor.example/*' => Http::response('', 404)]);
        $link = $this->link();

        LinkProber::probe($link);
        $this->assertSame(['failed', 1, 404], [$link->result, $link->fails, $link->status]);
        $this->assertTrue($link->next_check_at->lt(now()->addDays(2)));
        $this->assertFalse($link->isDead());

        LinkProber::probe($link);
        $this->assertTrue($link->isDead());
    }

    public function test_bot_blocking_is_unknown_not_a_failure(): void
    {
        Http::fake(['vendor.example/*' => Http::response('', 403)]);
        $link = $this->link();

        LinkProber::probe($link);

        $this->assertSame(['unknown', 0], [$link->result, $link->fails]);
    }

    public function test_head_refused_falls_back_to_get(): void
    {
        Http::fake(function ($request) {
            return $request->method() === 'HEAD' ? Http::response('', 405) : Http::response('', 200);
        });
        $link = $this->link();

        LinkProber::probe($link);

        $this->assertSame('ok', $link->result);
    }

    public function test_a_private_host_is_refused_as_a_failure(): void
    {
        $this->app->instance(PublicHost::RESOLVER, fn (string $host) => ['10.0.0.5']);
        $link = $this->link('https://intranet.example/x');

        LinkProber::probe($link);

        $this->assertSame(['failed', 1, null], [$link->result, $link->fails, $link->status]);
        Http::assertNothingSent();
    }

    public function test_crossing_into_dead_rechecks_the_records_linking_to_it(): void
    {
        Http::fake(['vendor.example/*' => Http::response('', 404)]);
        $author = User::firstOrCreate(['email' => 'cm-links@example.test'],
            ['name' => 'Staff', 'password' => 'password-for-tests', 'is_active' => true]);
        $author->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()])->id]);
        BlogPost::create(['title' => 'P', 'slug' => 'p', 'excerpt' => 'x', 'status' => 'published', 'published_at' => now(), 'author_id' => $author->id,
            'body' => '<p><a href="https://vendor.example/sheet.pdf">Datasheet</a></p>']);
        $link = HealthLink::where('url_hash', HealthLink::hashOf('https://vendor.example/sheet.pdf'))->sole();

        LinkProber::probe($link);
        $this->assertSame(0, HealthFinding::count());

        LinkProber::probe($link->fresh());
        $this->assertSame(['link_external_dead'], HealthFinding::pluck('check')->all());
    }

    public function test_the_command_takes_one_request_per_host_per_second(): void
    {
        Http::fake(['*' => Http::response('', 200)]);
        $this->link('https://a.example/1');
        $this->link('https://a.example/2');
        $this->link('https://b.example/1');

        $started = microtime(true);
        $this->artisan('technoware:check-links')->assertSuccessful();

        $this->assertSame(3, HealthLink::where('result', 'ok')->count());
        $this->assertGreaterThanOrEqual(0.9, microtime(true) - $started);
    }
}
