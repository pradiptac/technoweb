<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\HealthFinding;
use App\Models\HealthLink;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Health\LinkProber;
use App\Support\Net\PublicHost;
use App\Support\Net\UnsafeUrl;
use Database\Seeders\SettingsSeeder;
use GuzzleHttp\Exception\ResponseTransferException;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
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

    public function test_a_big_file_behind_a_refused_head_is_alive(): void
    {
        Http::fake(function ($request) {
            return $request->method() === 'HEAD' ? Http::response('', 405) : Http::response('', 200, ['Content-Length' => 200000]);
        });
        $link = $this->link();

        LinkProber::probe($link);

        $this->assertSame(['ok', 0], [$link->result, $link->fails]);
    }

    private function cappedAbort(?int $status): \Throwable
    {
        $cap = new UnsafeUrl('The file is larger than the limit.');

        return $status === null
            ? new \RuntimeException('wrapped', 0, $cap)
            : new ResponseTransferException('wrapped', new Request('GET', 'https://vendor.example/'), new Response($status), $cap);
    }

    /** @return array<string, array{0: int|null, 1: string}> */
    public static function cappedAborts(): array
    {
        return ['200 is alive' => [200, 'ok'], '404 is dead' => [404, 'failed'], '403 is unknown' => [403, 'unknown'], 'no response is unknown' => [null, 'unknown']];
    }

    #[DataProvider('cappedAborts')]
    public function test_a_size_cap_abort_is_judged_by_its_status(?int $status, string $expected): void
    {
        Http::fake(function ($request) use ($status) {
            if ($request->method() === 'HEAD') {
                return Http::response('', 405);
            }
            throw $this->cappedAbort($status);
        });
        $link = $this->link();

        LinkProber::probe($link);

        $this->assertSame($expected, $link->result);
    }

    public function test_an_internal_refused_head_is_followed_by_one_get(): void
    {
        config(['app.web_internal_url' => 'http://127.0.0.1:3000']);
        Http::fake(function ($request) {
            return $request->method() === 'HEAD' ? Http::response('', 405) : Http::response('', 404);
        });
        $link = $this->internalLink();

        LinkProber::probe($link);

        $this->assertSame(['failed', 404], [$link->result, $link->status]);
        Http::assertSentCount(2);
    }

    private function internalLink(): HealthLink
    {
        return HealthLink::updateOrCreate(['url_hash' => HealthLink::hashOf('/blog/x')],
            ['url' => '/blog/x', 'host' => '', 'internal' => true, 'next_check_at' => now()]);
    }

    public function test_an_internal_link_without_a_web_address_on_a_dev_machine_is_unknown_and_sends_nothing(): void
    {
        config(['app.web_internal_url' => null, 'app.env' => 'local']);
        $link = $this->internalLink();

        LinkProber::probe($link);

        $this->assertSame('unknown', $link->result);
        Http::assertNothingSent();
    }

    public function test_an_internal_link_without_a_web_address_is_asked_of_the_public_site_off_a_dev_machine(): void
    {
        config(['app.web_internal_url' => null, 'app.env' => 'production', 'app.frontend_url' => 'https://www.example.test']);
        Http::fake(['www.example.test/*' => Http::response('', 200)]);
        $link = $this->internalLink();

        LinkProber::probe($link);

        $this->assertSame('ok', $link->result);
        Http::assertSent(fn ($request) => $request->url() === 'https://www.example.test/blog/x');
    }

    public function test_an_internal_500_is_unknown_and_a_404_is_dead(): void
    {
        config(['app.web_internal_url' => 'http://127.0.0.1:3000']);
        $answer = 500;
        Http::fake(function () use (&$answer) {
            return Http::response('', $answer);
        });
        $link = $this->internalLink();

        LinkProber::probe($link);

        $this->assertSame(['unknown', 500, 0], [$link->result, $link->status, $link->fails]);
        $this->assertFalse($link->isDead());

        $answer = 404;
        LinkProber::probe($link);

        $this->assertSame(['failed', 404], [$link->result, $link->status]);
        $this->assertTrue($link->isDead());
    }

    public function test_an_internal_link_that_gives_no_answer_is_unknown(): void
    {
        config(['app.web_internal_url' => 'http://127.0.0.1:3000']);
        Http::fake(['127.0.0.1:3000/*' => fn () => throw new ConnectionException('timed out')]);
        $link = $this->internalLink();

        LinkProber::probe($link);

        $this->assertSame('unknown', $link->result);
    }

    public function test_the_checker_sends_the_companys_own_agent_on_every_path(): void
    {
        $this->seed(SettingsSeeder::class);
        Setting::put('company_name', 'Acme Networks');
        Setting::flushCache();
        Http::fake(function ($request) {
            return $request->method() === 'HEAD' ? Http::response('', 405) : Http::response('', 200);
        });

        LinkProber::probe($this->link());

        Http::assertSent(fn ($request) => str_starts_with($request->header('User-Agent')[0] ?? '', 'Acme Networks link checker')
            && $request->method() === 'GET');
    }

    public function test_an_internal_link_is_asked_of_the_configured_web_address(): void
    {
        config(['app.web_internal_url' => 'http://127.0.0.1:3000']);
        Http::fake(['127.0.0.1:3000/*' => Http::response('', 200)]);
        $link = $this->internalLink();

        LinkProber::probe($link);

        $this->assertSame('ok', $link->result);
        Http::assertSent(fn ($request) => $request->url() === 'http://127.0.0.1:3000/blog/x');
    }

    public function test_an_internal_redirect_is_alive_and_never_followed(): void
    {
        config(['app.web_internal_url' => 'http://127.0.0.1:3000']);
        Http::fake(['*' => Http::response('', 301, ['Location' => 'http://169.254.169.254/latest'])]);
        $link = $this->internalLink();

        LinkProber::probe($link);

        $this->assertSame('ok', $link->result);
        Http::assertSentCount(1);
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
