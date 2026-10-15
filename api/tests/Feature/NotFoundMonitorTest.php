<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\NotFoundHit;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Missing pages (0.137.0, docs/seo.md): the 404 page reports an address, the
 * SEO manager sees it ranked by how often it was asked for, and it leaves the
 * list by itself when a redirect starts there.
 *
 * Staff are authenticated with a real `Authorization: Bearer` header, and the
 * resolved guard is forgotten before each switch of principal — `actingAs()`
 * would test the controller rather than the wiring, and the guard a request
 * resolved stays resolved for the rest of the test.
 */
class NotFoundMonitorTest extends TestCase
{
    use RefreshDatabase;

    private function asStaff(RoleEnum $role): static
    {
        // One account per role per test: several requests in one test act as the same person.
        $user = User::firstOrCreate(
            ['email' => $role->value.'-nf@example.test'],
            ['name' => 'Staff', 'password' => 'password-for-tests', 'is_active' => true],
        );
        $user->roles()->syncWithoutDetaching([
            Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id,
        ]);

        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function report(string $path, ?string $referrer = null): void
    {
        $this->postJson('/api/v1/not-found', array_filter(
            ['path' => $path, 'referrer' => $referrer], fn ($v) => $v !== null,
        ))->assertNoContent();
    }

    private function redirect(string $from, bool $active = true): Redirect
    {
        return Redirect::create([
            'from_path' => $from, 'to_path' => '/about', 'status_code' => 301,
            'is_active' => $active, 'created_automatically' => false,
        ]);
    }

    /** @return list<string> the paths on the live list, in the order the console sees them */
    private function livePaths(RoleEnum $role = RoleEnum::SeoManager, string $query = ''): array
    {
        return $this->asStaff($role)->getJson('/api/v1/admin/not-found'.$query)
            ->assertOk()->json('data.*.path');
    }

    // ------------------------------------------------------------ recording

    public function test_a_report_is_recorded_and_a_repeat_adds_to_the_count_not_a_row(): void
    {
        $this->report('/old-brochure-page');
        $this->report('/old-brochure-page');
        $this->report('/old-brochure-page/');

        $this->assertSame(1, NotFoundHit::count());

        $hit = NotFoundHit::sole();
        $this->assertSame('/old-brochure-page', $hit->path);
        $this->assertSame(3, $hit->hits);
        $this->assertNotNull($hit->first_seen_at);

        $this->report('/another-dead-page');
        $this->assertSame(2, NotFoundHit::count());
    }

    public function test_the_query_string_and_host_are_dropped(): void
    {
        $this->report('/products/old-switch?utm_source=mail&x=1');
        $this->report('https://evil.example/products/old-switch#frag');

        $hit = NotFoundHit::sole();
        $this->assertSame('/products/old-switch', $hit->path);
        $this->assertSame(2, $hit->hits);
    }

    /** @return array<string, array{string}> */
    public static function neverRecorded(): array
    {
        return [
            'the home page' => ['/'],
            'nothing' => [''],
            'a query string only' => ['?x=1'],
            'the console' => ['/admin/tickets/TW-2026-00001'],
            'the console root' => ['/admin'],
            'the portal' => ['/portal/orders'],
            'the api' => ['/api/v1/anything'],
            'next internals' => ['/_next/static/chunk.js'],
            'an order' => ['/order/ORD-2026-00001'],
            'a visit' => ['/visit/TV-2026-00001'],
            'a meeting' => ['/meeting/MT-2026-00001'],
            'an event registration' => ['/events/registration/'.'a1b2c3'],
            'a survey' => ['/ticket-survey/abc'],
            'a preview' => ['/preview/token'],
            'an unsubscribe link' => ['/newsletter/unsubscribe/abc'],
            'a stock notice' => ['/store/notify/cancel/abc'],
            'a wishlist stop' => ['/store/wishlist/stop/abc'],
            'a basket restore' => ['/store/basket/restore/abc'],
            'scanner: php' => ['/wp-login.php'],
            'scanner: env' => ['/app/.env'],
            'scanner: git' => ['/.git/config'],
            'scanner: wp dir' => ['/wp-admin/setup'],
            'scanner: cgi-bin' => ['/cgi-bin/test'],
            'scanner: asp' => ['/login.asp'],
            'scanner: jsp' => ['/index.jsp'],
            'a script' => ['/assets/app.js'],
            'a stylesheet' => ['/assets/site.CSS'],
            'a source map' => ['/assets/app.js.map'],
            'an image' => ['/images/logo.png'],
            'a favicon' => ['/favicon.ico'],
            'a font' => ['/fonts/x.woff2'],
            'a text file' => ['/humans.txt'],
            'an xml file' => ['/old-sitemap.xml'],
            'a json file' => ['/manifest.json'],
        ];
    }

    #[DataProvider('neverRecorded')]
    public function test_some_addresses_are_never_recorded(string $path): void
    {
        $this->report($path);

        $this->assertSame(0, NotFoundHit::count());
    }

    public function test_a_page_that_merely_resembles_a_private_area_is_recorded(): void
    {
        // `/administration` is not `/admin`, and `/orders` is not a secret's prefix.
        $this->report('/administration');
        $this->report('/orders-and-returns');

        $this->assertSame(2, NotFoundHit::count());
    }

    public function test_an_overlong_address_is_cut_rather_than_refused(): void
    {
        $this->report('/'.str_repeat('a', 700));

        $this->assertSame(512, strlen(NotFoundHit::sole()->path));
    }

    public function test_the_referrer_keeps_origin_and_path_only(): void
    {
        $this->report('/dead', 'https://Example.com/links/page?token=secret&x=1#frag');

        $this->assertSame('https://example.com/links/page', NotFoundHit::sole()->referrer);
    }

    public function test_a_referrer_that_is_not_http_is_discarded(): void
    {
        $this->report('/dead-one', 'javascript:alert(1)');
        $this->report('/dead-two', 'ftp://example.com/x');
        $this->report('/dead-three', 'not a url');
        $this->report('/dead-four');

        $this->assertSame(4, NotFoundHit::count());
        $this->assertSame(0, NotFoundHit::whereNotNull('referrer')->count());
    }

    public function test_a_newer_referrer_replaces_the_old_one_and_none_keeps_it(): void
    {
        $this->report('/dead', 'https://a.example/one');
        $this->report('/dead');
        $this->assertSame('https://a.example/one', NotFoundHit::sole()->referrer);

        $this->report('/dead', 'https://b.example/two');
        $this->assertSame('https://b.example/two', NotFoundHit::sole()->referrer);
        $this->assertSame(3, NotFoundHit::sole()->hits);
    }

    public function test_garbage_is_answered_204_and_stores_nothing(): void
    {
        $this->postJson('/api/v1/not-found', [])->assertNoContent();
        $this->postJson('/api/v1/not-found', ['path' => ['x']])->assertNoContent();
        $this->postJson('/api/v1/not-found', ['path' => 12])->assertNoContent();
        $this->postJson('/api/v1/not-found', ['path' => 'http://'])->assertNoContent();
        $this->postJson('/api/v1/not-found', ['path' => '/ok', 'referrer' => ['x']])->assertNoContent();

        $this->assertSame(1, NotFoundHit::count());
        $this->assertNull(NotFoundHit::sole()->referrer);
    }

    // ------------------------------------------------------------ redirects

    public function test_an_address_with_an_active_redirect_is_not_recorded(): void
    {
        $this->redirect('/moved');
        $this->redirect('/switched-off', active: false);

        $this->report('/moved');
        $this->report('/switched-off');

        $this->assertSame(['/switched-off'], NotFoundHit::pluck('path')->all());
    }

    public function test_an_address_leaves_the_live_list_when_a_redirect_is_made_and_returns_when_it_is_switched_off(): void
    {
        $this->report('/dead-page');
        $this->report('/other-dead-page');

        $this->assertEqualsCanonicalizing(['/dead-page', '/other-dead-page'], $this->livePaths());

        $redirect = $this->redirect('/dead-page');
        $this->assertSame(['/other-dead-page'], $this->livePaths());
        // The row is kept; only the list changed.
        $this->assertSame(2, NotFoundHit::count());

        $redirect->update(['is_active' => false]);
        $this->assertEqualsCanonicalizing(['/dead-page', '/other-dead-page'], $this->livePaths());

        $redirect->update(['is_active' => true]);
        $this->assertSame(['/other-dead-page'], $this->livePaths());
    }

    // ---------------------------------------------------------------- ignore

    public function test_ignore_and_restore_move_an_address_between_the_two_lists(): void
    {
        $this->report('/dead-page');
        $hit = NotFoundHit::sole();

        $this->asStaff(RoleEnum::SeoManager)->postJson("/api/v1/admin/not-found/{$hit->id}/ignore")
            ->assertOk()
            ->assertJsonPath('data.path', '/dead-page')
            ->assertJsonPath('data.redirect_path', '/admin/redirects/new?from=%2Fdead-page');

        $this->assertNotNull($hit->fresh()->ignored_at);
        $this->assertSame([], $this->livePaths());
        $this->assertSame(['/dead-page'], $this->asStaff(RoleEnum::SeoManager)->getJson('/api/v1/admin/not-found?ignored=1')->json('data.*.path'));

        $this->asStaff(RoleEnum::SeoManager)->postJson("/api/v1/admin/not-found/{$hit->id}/restore")->assertOk();

        $this->assertNull($hit->fresh()->ignored_at);
        $this->assertSame(['/dead-page'], $this->livePaths());
    }

    public function test_an_ignored_address_asked_for_again_stays_ignored_but_counts(): void
    {
        $this->report('/dead-page');
        $hit = NotFoundHit::sole();
        $this->asStaff(RoleEnum::SeoManager)->postJson("/api/v1/admin/not-found/{$hit->id}/ignore")->assertOk();
        $ignoredAt = $hit->fresh()->ignored_at;

        $this->report('/dead-page');
        $this->report('/dead-page');

        $fresh = $hit->fresh();
        $this->assertSame(3, $fresh->hits);
        $this->assertTrue($ignoredAt->equalTo($fresh->ignored_at));
        $this->assertSame([], $this->livePaths());
    }

    public function test_the_list_is_ranked_by_how_often_and_searchable_with_counts_in_meta(): void
    {
        $this->report('/once');
        foreach (range(1, 3) as $_) {
            $this->report('/three-times');
        }
        foreach (range(1, 2) as $_) {
            $this->report('/twice_a_week');
        }
        $this->report('/ignored-one');
        $this->asStaff(RoleEnum::SeoManager)
            ->postJson('/api/v1/admin/not-found/'.NotFoundHit::where('path', '/ignored-one')->value('id').'/ignore')
            ->assertOk();

        $response = $this->asStaff(RoleEnum::SeoManager)->getJson('/api/v1/admin/not-found')->assertOk();
        $response->assertJsonPath('meta.live', 3)
            ->assertJsonPath('meta.ignored', 1)
            ->assertJsonPath('meta.retention_days', 90)
            ->assertJsonPath('meta.total', 3);
        $this->assertSame(['/three-times', '/twice_a_week', '/once'], $response->json('data.*.path'));

        $this->assertSame(['/once', '/twice_a_week', '/three-times'], $this->livePaths(query: '?sort=hits&dir=asc'));

        // The LIKE metacharacters match themselves: `_` is not "any character".
        $this->assertSame(['/twice_a_week'], $this->livePaths(query: '?q=ce_a'));
        $this->assertSame([], $this->livePaths(query: '?q=twic%25a'));
        $this->assertSame([], $this->livePaths(query: '?q=ce.a'));
    }

    // ----------------------------------------------------------------- roles

    public function test_an_seo_manager_may_read_and_a_content_manager_may_not(): void
    {
        $this->report('/dead-page');
        $hit = NotFoundHit::sole();

        $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/not-found')->assertForbidden();
        $this->asStaff(RoleEnum::ContentManager)->postJson("/api/v1/admin/not-found/{$hit->id}/ignore")->assertForbidden();
        $this->assertNull($hit->fresh()->ignored_at);

        $this->asStaff(RoleEnum::SeoManager)->getJson('/api/v1/admin/not-found')
            ->assertOk()
            ->assertJsonPath('data.0.path', '/dead-page');

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', '')->getJson('/api/v1/admin/not-found')->assertUnauthorized();
    }

    // ----------------------------------------------------------------- prune

    public function test_the_prune_deletes_addresses_not_seen_for_ninety_days(): void
    {
        $this->report('/old-and-quiet');
        $this->report('/recent');
        $this->report('/ignored-and-quiet');

        NotFoundHit::where('path', '/old-and-quiet')->update(['last_seen_at' => now()->subDays(91)]);
        NotFoundHit::where('path', '/ignored-and-quiet')->update(['last_seen_at' => now()->subDays(120), 'ignored_at' => now()->subDays(100)]);
        NotFoundHit::where('path', '/recent')->update(['first_seen_at' => now()->subYear(), 'last_seen_at' => now()->subDays(89)]);

        $this->artisan('technoware:prune-not-found')->assertSuccessful();

        $this->assertSame(['/recent'], NotFoundHit::pluck('path')->all());
    }

    // --------------------------------------------------- the redirect target

    /** @return array<string, array{string}> */
    public static function refusedTargets(): array
    {
        return [
            'a javascript address' => ['javascript:alert(1)'],
            'a protocol-relative address' => ['//evil.test'],
            'a backslash form' => ['/\\evil.test'],
            'a data address' => ['data:text/html,x'],
            'a mailto address' => ['mailto:a@example.test'],
        ];
    }

    #[DataProvider('refusedTargets')]
    public function test_a_redirect_to_somewhere_unsafe_is_refused(string $target): void
    {
        $this->asStaff(RoleEnum::SeoManager)->postJson('/api/v1/admin/redirects', [
            'from_path' => '/old', 'to_path' => $target,
        ])->assertStatus(422)->assertJsonValidationErrors(['to_path']);

        $this->assertSame(0, Redirect::count());
    }

    public function test_a_redirect_to_a_path_or_an_https_address_saves(): void
    {
        $this->asStaff(RoleEnum::SeoManager)->postJson('/api/v1/admin/redirects', [
            'from_path' => '/old', 'to_path' => '/about',
        ])->assertCreated()->assertJsonPath('data.to_path', '/about');

        $this->asStaff(RoleEnum::SeoManager)->postJson('/api/v1/admin/redirects', [
            'from_path' => '/older', 'to_path' => 'https://example.com/x',
        ])->assertCreated()->assertJsonPath('data.to_path', 'https://example.com/x');

        // A destination typed without its slash is still read as a path.
        $this->asStaff(RoleEnum::SeoManager)->postJson('/api/v1/admin/redirects', [
            'from_path' => '/oldest', 'to_path' => 'about/',
        ])->assertCreated()->assertJsonPath('data.to_path', '/about');

        $this->assertSame(3, Redirect::count());
    }

    public function test_updating_a_redirect_to_somewhere_unsafe_is_refused_too(): void
    {
        $redirect = $this->redirect('/old');

        $this->asStaff(RoleEnum::SeoManager)->patchJson("/api/v1/admin/redirects/{$redirect->id}", [
            'to_path' => 'javascript:alert(1)',
        ])->assertStatus(422)->assertJsonValidationErrors(['to_path']);

        $this->assertSame('/about', $redirect->fresh()->to_path);
    }
}
