<?php

namespace Tests\Feature;

use App\Models\Redirect;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The two public redirect endpoints the frontend proxy is built on.
 *
 * There was no test for `lookup` for as long as it existed; `index` is new
 * and is what the proxy now holds in memory, so what it must and must not
 * contain is the whole of the feature.
 */
class RedirectLookupTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_index_lists_active_redirects_only(): void
    {
        Redirect::create(['from_path' => '/solutions/old', 'to_path' => '/solutions/new', 'status_code' => 301]);
        Redirect::create(['from_path' => '/blog/temp', 'to_path' => '/blog/moved', 'status_code' => 302]);
        Redirect::create(['from_path' => '/gone', 'to_path' => '/', 'status_code' => 301, 'is_active' => false]);

        $res = $this->getJson('/api/v1/redirects')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=60, public')
            ->assertJsonCount(2, 'data');

        // The shape the proxy keys its Map on, and nothing else: no ids, no
        // hit counts, no timestamps.
        $this->assertSame(
            [['from' => '/solutions/old', 'to' => '/solutions/new', 'status' => 301],
                ['from' => '/blog/temp', 'to' => '/blog/moved', 'status' => 302]],
            $res->json('data'),
        );
    }

    public function test_the_index_is_empty_rather_than_absent_when_there_are_none(): void
    {
        $this->getJson('/api/v1/redirects')->assertOk()->assertExactJson(['data' => []]);
    }

    public function test_lookup_answers_404_for_an_unknown_path(): void
    {
        $this->getJson('/api/v1/redirects/lookup?path=/solutions/nothing')->assertNotFound();
    }

    /**
     * `lookup` is what the proxy calls on a hit, and the only reason it still
     * calls anything: the hit is counted here.
     */
    public function test_lookup_records_the_hit(): void
    {
        $redirect = Redirect::create(['from_path' => '/solutions/old', 'to_path' => '/solutions/new', 'status_code' => 301]);

        $this->getJson('/api/v1/redirects/lookup?path=/solutions/old')
            ->assertOk()
            ->assertJsonPath('data.to', '/solutions/new')
            ->assertJsonPath('data.status', 301);

        $redirect->refresh();

        $this->assertSame(1, $redirect->hit_count);
        $this->assertNotNull($redirect->last_hit_at);
    }

    public function test_an_inactive_redirect_is_not_looked_up(): void
    {
        Redirect::create(['from_path' => '/gone', 'to_path' => '/', 'status_code' => 301, 'is_active' => false]);

        $this->getJson('/api/v1/redirects/lookup?path=/gone')->assertNotFound();
    }
}
