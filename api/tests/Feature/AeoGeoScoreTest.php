<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Certification;
use App\Models\Industry;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\User;
use App\Support\AeoScore;
use App\Support\GeoScore;
use App\Support\SeoScore;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * The two newer scores on the SEO overview.
 *
 * `AeoScore` asks whether a page can be quoted, `GeoScore` whether an
 * engine can tell what it is quoting. Both are the `SeoScore` shape — a
 * rubric scored out of what applies, with the failed checks travelling
 * beside the number — and both are pinned here the way `SeoScore` is: a bare
 * record scores low with the *named* failures, a filled one scores high,
 * and the overview carries, filters and sorts on them.
 */
class AeoGeoScoreTest extends TestCase
{
    use RefreshDatabase;

    private ?User $seoManager = null;

    private function seoManager(): User
    {
        if ($this->seoManager) {
            return $this->seoManager;
        }

        $user = User::create([
            'name' => 'SEO', 'email' => 'seo-aeo-geo@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::SeoManager->value],
            ['name' => RoleEnum::SeoManager->label()],
        ));

        return $this->seoManager = $user->load('roles');
    }

    private function solution(string $title = 'Enterprise Wi-Fi'): Solution
    {
        return Solution::create([
            'title' => $title, 'slug' => str($title)->slug()->value(),
            'summary' => 'Campus wireless that stays up.',
            'overview' => '<p>Wireless for campuses. See <a href="/services/amc">the AMC</a>.</p>',
            'status' => PublishStatus::Published,
        ]);
    }

    /** Everything the AEO checks want of a solution, and what the GEO checks want of the site. */
    private function fillSolution(Solution $solution): void
    {
        foreach ([
            ['kind' => 'definition', 'answer' => 'Enterprise Wi-Fi is a managed wireless network for hundreds of devices.'],
            ['kind' => 'who_for', 'answer' => 'Campuses, hospitals and warehouses.'],
            ['kind' => 'key_fact', 'answer' => 'Wi-Fi 6E throughout.'],
            ['kind' => 'use_case', 'answer' => 'A hospital with roaming handsets.'],
            ['kind' => 'comparison', 'question' => 'Wi-Fi 6 or 6E?', 'answer' => '6E where the client devices support it.'],
            ['kind' => 'step', 'answer' => 'Survey the site.'],
            ['kind' => 'question', 'question' => 'Does it cover outdoors?', 'answer' => 'Yes.'],
            ['kind' => 'question', 'question' => 'Is it monitored?', 'answer' => 'Yes, from the NOC.'],
            ['kind' => 'question', 'question' => 'What about guests?', 'answer' => 'A captive portal.'],
        ] as $i => $block) {
            $solution->answerBlocks()->create($block + ['sort_order' => $i]);
        }

        $solution->industries()->attach(Industry::create(['name' => 'Healthcare', 'slug' => 'healthcare']));

        BlogPost::create([
            'title' => 'Why campus Wi-Fi fails', 'slug' => 'why-campus-wifi-fails',
            // The record's own path, never spelled by hand: `Str::slug` writes
            // "enterprise-wi-fi", the trap CLAUDE.md records for the seeder.
            'body' => '<p>Read <a href="'.$solution->publicPath().'">our solution</a>.</p>',
            'status' => PublishStatus::Published, 'published_at' => now(),
        ]);

        Certification::create(['name' => 'ISO 9001', 'status' => PublishStatus::Published, 'sort_order' => 1]);

        $this->seed(SettingsSeeder::class);
        Setting::put('company_name', 'Technoware');
        Setting::put('address', "12 Example Road\nMumbai 400001");
        Setting::put('phone', '+91 22 0000 0000');
        Setting::put('support_email', 'support@example.test');
        Setting::put('logo_path', 'media/logo.svg');
        Setting::flushCache();
    }

    // -------------------------------------------------------- the rubrics

    public function test_a_bare_record_scores_low_and_names_what_is_missing(): void
    {
        $aeo = AeoScore::for(['type' => 'solution', 'has_body' => true, 'body' => 'Some words.', 'answer_blocks' => [], 'faq_count' => 0]);

        $this->assertSame('poor', $aeo['band']);
        $this->assertEqualsCanonicalizing(
            ['definition', 'questions', 'key_facts', 'use_cases', 'comparison', 'steps', 'faq_page', 'internal_links'],
            array_column($aeo['failed'], 'key'),
        );
        // `direct_answers` did not apply: there are no question blocks.
        $this->assertSame(9, $aeo['checked']);
        $this->assertArrayNotHasKey('issues', AeoScore::publish($aeo));

        $geo = GeoScore::for(['type' => 'solution', 'entity' => ['solutions' => [], 'services' => [], 'industries' => [], 'articles' => [], 'faq_count' => 0]]);

        $this->assertSame('poor', $geo['band']);
        $this->assertEqualsCanonicalizing(
            ['organization', 'nap_consistent', 'industries_link', 'articles_link', 'certifications', 'first_hand', 'definition'],
            array_column($geo['failed'], 'key'),
        );
        // A brand, a category, services and an author are not asked of a solution.
        $this->assertSame(7, $geo['checked']);
    }

    public function test_the_applicability_rules_are_the_scorer_s(): void
    {
        // A product is asked for a brand and a category; a page for neither.
        $product = GeoScore::for(['type' => 'product', 'entity' => ['solutions' => [], 'services' => [], 'industries' => [], 'articles' => []]]);
        $page = GeoScore::for(['type' => 'page', 'entity' => ['solutions' => [], 'services' => [], 'industries' => [], 'articles' => []]]);

        $this->assertContains('brand_link', array_column($product['failed'], 'key'));
        $this->assertContains('solutions_link', array_column($product['failed'], 'key'));
        $this->assertNotContains('brand_link', array_column($page['failed'], 'key'));
        $this->assertNotContains('solutions_link', array_column($page['failed'], 'key'));

        // A comparison is asked of a product, steps of an article, and a spec sheet counts as key facts on a product.
        $article = AeoScore::for(['type' => 'knowledge_article', 'answer_blocks' => [], 'faq_count' => 0]);
        $spec = AeoScore::for(['type' => 'store_product', 'answer_blocks' => [], 'faq_count' => 0, 'has_specs' => true]);

        $this->assertContains('steps', array_column($article['failed'], 'key'));
        $this->assertNotContains('comparison', array_column($article['failed'], 'key'));
        $this->assertNotContains('key_facts', array_column($spec['failed'], 'key'));
        $this->assertContains('comparison', array_column($spec['failed'], 'key'));
    }

    public function test_a_filled_record_scores_high(): void
    {
        $aeo = AeoScore::for([
            'type' => 'solution', 'has_body' => true, 'body' => 'x', 'internal_links' => true,
            'answer_blocks' => ['definition', 'key_fact', 'use_case', 'comparison', 'step', 'question', 'question', 'question'],
            'faq_count' => 0,
        ]);
        $geo = GeoScore::for([
            'type' => 'solution', 'answer_blocks' => ['definition', 'why'],
            'entity' => ['solutions' => [], 'services' => [], 'industries' => [['name' => 'Healthcare', 'path' => '/industries/healthcare']], 'articles' => [['name' => 'A post', 'path' => '/blog/a-post']]],
            'certifications' => true, 'organization_complete' => true, 'nap_consistent' => true,
        ]);

        $this->assertSame(100, $aeo['value']);
        $this->assertSame([], $aeo['failed']);
        $this->assertSame(100, $geo['value']);
        $this->assertSame('good', $geo['band']);
    }

    /** `SeoScore`'s output did not change when the arithmetic moved into the shared trait. */
    public function test_seo_score_still_carries_its_issues(): void
    {
        $score = SeoScore::for(['resolved' => ['title' => 'A title long enough to pass the length check here'], 'slug' => 'a-slug', 'has_body' => false]);

        $this->assertArrayHasKey('issues', $score);
        $this->assertContains('No description', $score['issues']);
        $this->assertSame('good', SeoScore::band(80));
    }

    // -------------------------------------------------------- the overview

    public function test_overview_rows_carry_both_scores_and_the_entity_block(): void
    {
        $solution = $this->solution();

        $row = collect($this->actingAs($this->seoManager(), 'sanctum')
            ->getJson('/api/v1/admin/seo?type=solution')
            ->assertOk()
            ->json('data'))->firstWhere('id', $solution->id);

        $this->assertSame('poor', $row['aeo']['band']);
        $this->assertSame('poor', $row['geo']['band']);
        $this->assertIsInt($row['aeo']['value']);
        $this->assertSame([], $row['entity']['industries']);
        $this->assertSame(0, $row['entity']['faq_count']);
        // The list carries the figure; the checks come from the single-record read.
        $this->assertArrayNotHasKey('failed', $row['aeo']);
    }

    public function test_a_filled_solution_scores_high_on_the_overview(): void
    {
        $solution = $this->solution();
        $this->fillSolution($solution);

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->getJson("/api/v1/admin/seo/solution/{$solution->id}")
            ->assertOk();

        $this->assertSame('good', $response->json('data.aeo.band'));
        $this->assertSame([], $response->json('data.aeo.failed'));
        $this->assertSame('good', $response->json('data.geo.band'));
        $this->assertSame([], $response->json('data.geo.failed'));
        // The relationships the page states, as the overview sees them.
        $this->assertSame('Healthcare', $response->json('data.entity.industries.0.name'));
        $this->assertSame('/blog/why-campus-wifi-fails', $response->json('data.entity.articles.0.path'));
    }

    public function test_the_single_record_read_carries_the_failed_checks(): void
    {
        $solution = $this->solution();

        $response = $this->actingAs($this->seoManager(), 'sanctum')
            ->getJson("/api/v1/admin/seo/solution/{$solution->id}")
            ->assertOk();

        $keys = array_column($response->json('data.aeo.failed'), 'key');
        $this->assertContains('definition', $keys);
        $this->assertSame('No definition', collect($response->json('data.aeo.failed'))->firstWhere('key', 'definition')['label']);
        $this->assertNotEmpty($response->json('data.geo.failed.0.hint'));
    }

    public function test_the_band_filters_and_the_sort_work(): void
    {
        $poor = $this->solution('Bare solution');
        $good = $this->solution();
        $this->fillSolution($good);

        $manager = $this->seoManager();

        $ids = collect($this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/seo?type=solution&aeo=poor')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$poor->id], $ids);

        $ids = collect($this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/seo?type=solution&geo=good')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$good->id], $ids);

        // An unknown band is ignored rather than refused: it arrives from a link.
        $this->assertCount(2, $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/seo?type=solution&aeo=splendid')->assertOk()->json('data'));

        $ids = collect($this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/seo?type=solution&sort=aeo&dir=desc')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$good->id, $poor->id], $ids);

        $ids = collect($this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/seo?type=solution&sort=geo&dir=asc')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$poor->id, $good->id], $ids);
    }

    /** The site card's "biggest wins" for each readiness score open the records failing that one check. */
    public function test_a_named_aeo_or_geo_check_filters_to_the_records_failing_it(): void
    {
        $poor = $this->solution('Bare solution');
        $good = $this->solution();
        $this->fillSolution($good);

        $manager = $this->seoManager();

        $ids = collect($this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/seo?type=solution&aeo_check=definition')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$poor->id], $ids);

        $ids = collect($this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/seo?type=solution&geo_check=first_hand')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$poor->id], $ids);

        // `internal_links` is a key on all three rubrics, which is why each
        // score has a parameter of its own: naming it under `?check=` is the
        // SEO score's failure, not AEO's.
        $this->assertCount(0, $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/seo?type=solution&aeo_check=no_such_check')->assertOk()->json('data'));
    }

    public function test_the_site_score_carries_both_averages(): void
    {
        $this->solution();

        $site = $this->actingAs($this->seoManager(), 'sanctum')
            ->getJson('/api/v1/admin/seo')
            ->assertOk()
            ->json('meta.site_score');

        $this->assertIsInt($site['aeo']['value']);
        $this->assertContains($site['aeo']['band'], ['poor', 'fair', 'good']);
        $this->assertNotEmpty($site['aeo']['top_issues']);
        $this->assertSame(AeoScore::GROUPS, $site['aeo']['groups']);
        $this->assertSame(GeoScore::GROUPS, $site['geo']['groups']);
        // The SEO half is untouched.
        $this->assertSame(SeoScore::GROUPS, $site['groups']);
    }

    /**
     * The `Organization` node is built by the frontend from the public
     * settings map, so `knowsAbout` and `areaServed` travel there as two
     * derived, JSON-encoded lists — absent rather than empty when there is
     * nothing to say.
     */
    public function test_the_public_settings_carry_the_organization_s_facts(): void
    {
        $this->assertArrayNotHasKey('organization_knows_about', $this->getJson('/api/v1/settings')->assertOk()->json('data'));

        $this->solution();
        Cache::flush();

        $data = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame(['Enterprise Wi-Fi'], json_decode($data['organization_knows_about'], true));
        $this->assertArrayNotHasKey('organization_area_served', $data);
    }
}
