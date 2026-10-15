<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Models\Media;
use App\Models\Tender;
use App\Models\TenderCategory;
use App\Support\Tenders\TenderDocuments;
use App\Support\Tenders\TenderWindow;
use Database\Seeders\SettingsSeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Tenders, from the public site's side (0.174.0, docs/tenders.md): the list,
 * the categories, the notice, its documents and — the one that matters most
 * — the state.
 *
 * **The clock is fixed at Tuesday 20 October 2026, 10:00 IST**, and every
 * date below is written relative to it. A module whose whole subject is a
 * deadline cannot be tested against a moving clock: "closing soon" would
 * pass on a Monday and fail three days later.
 */
class TenderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-20 10:00:00', 'Asia/Kolkata'));
    }

    /** Counts the tenders this test has made, so each gets a free reference. */
    private int $made = 0;

    /** @param  array<string, mixed>  $overrides */
    private function tender(array $overrides = []): Tender
    {
        $this->made++;

        return Tender::create(array_replace([
            'reference' => sprintf('TW/2026/%03d', $this->made),
            'title' => 'Campus network refresh',
            'slug' => 'campus-network-refresh',
            'summary' => 'Switching and wireless for three buildings.',
            'description' => '<p>The scope of work.</p>',
            'status' => PublishStatus::Published,
            'opens_at' => '2026-10-16 10:00:00',
            'closes_at' => '2026-11-10 18:00:00',
            'submission_email' => 'tenders@example.test',
        ], $overrides));
    }

    private function category(string $name = 'Networking', bool $active = true): TenderCategory
    {
        return TenderCategory::create(['name' => $name, 'is_active' => $active]);
    }

    /* ------------------------------------------------------------- the list */

    public function test_the_list_is_published_tenders_open_first_and_closing_soonest(): void
    {
        $this->tender(['title' => 'Closes later', 'slug' => 'later', 'closes_at' => '2026-11-20 18:00:00']);
        $this->tender(['title' => 'Closes sooner', 'slug' => 'sooner', 'closes_at' => '2026-10-25 18:00:00']);
        $this->tender(['title' => 'Draft', 'slug' => 'draft', 'status' => PublishStatus::Draft]);
        $this->tender(['title' => 'Archived', 'slug' => 'archived', 'status' => PublishStatus::Archived]);

        $data = $this->getJson('/api/v1/tenders')->assertOk()->json('data');

        $this->assertSame(['sooner', 'later'], array_column($data, 'slug'));
    }

    public function test_the_default_list_leaves_out_what_has_closed_and_what_has_not_opened(): void
    {
        $this->tender(['slug' => 'open-now']);
        $this->tender(['title' => 'Shut', 'slug' => 'shut', 'opens_at' => '2026-09-01 10:00:00', 'closes_at' => '2026-10-01 18:00:00']);
        $this->tender(['title' => 'Not yet', 'slug' => 'not-yet', 'opens_at' => '2026-11-01 10:00:00', 'closes_at' => '2026-12-01 18:00:00']);

        $this->assertSame(['open-now'], array_column($this->getJson('/api/v1/tenders')->json('data'), 'slug'));
        $this->assertSame(['shut'], array_column($this->getJson('/api/v1/tenders?when=closed')->json('data'), 'slug'));
        $this->assertSame(['not-yet'], array_column($this->getJson('/api/v1/tenders?when=upcoming')->json('data'), 'slug'));
        $this->assertCount(3, $this->getJson('/api/v1/tenders?when=all')->json('data'));
    }

    public function test_closed_tenders_are_listed_newest_first(): void
    {
        $this->tender(['title' => 'Shut long ago', 'slug' => 'old', 'opens_at' => '2026-07-01 10:00:00', 'closes_at' => '2026-08-01 18:00:00']);
        $this->tender(['title' => 'Shut recently', 'slug' => 'recent', 'opens_at' => '2026-09-01 10:00:00', 'closes_at' => '2026-10-10 18:00:00']);

        $data = $this->getJson('/api/v1/tenders?when=closed')->assertOk()->json('data');

        $this->assertSame(['recent', 'old'], array_column($data, 'slug'));
    }

    public function test_an_unknown_when_is_ignored_rather_than_refused(): void
    {
        $this->tender(['slug' => 'open-now']);

        // It arrives from an old link, and an error page is the worse answer.
        $this->getJson('/api/v1/tenders?when=whatever')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_the_list_searches_the_reference_however_it_is_punctuated(): void
    {
        $this->tender(['reference' => 'TW/2026/014', 'title' => 'Cabling', 'slug' => 'cabling']);
        $this->tender(['reference' => 'TW/2026/099', 'title' => 'Servers', 'slug' => 'servers']);

        // Nobody types the slashes.
        foreach (['TW/2026/014', 'TW 2026 014', 'tw2026014', '2026014'] as $term) {
            $data = $this->getJson('/api/v1/tenders?q='.urlencode($term))->assertOk()->json('data');
            $this->assertSame(['cabling'], array_column($data, 'slug'), "searching for [{$term}]");
        }
    }

    public function test_a_wildcard_in_a_search_matches_itself(): void
    {
        $this->tender(['slug' => 'real', 'title' => 'Real tender']);

        // `%` returning the head of the table is the bug every search here
        // escapes for.
        $this->getJson('/api/v1/tenders?q=%25')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_the_list_filters_by_category_slug(): void
    {
        $networking = $this->category('Networking');
        $this->tender(['slug' => 'filed', 'tender_category_id' => $networking->id]);
        $this->tender(['title' => 'Unfiled', 'slug' => 'unfiled']);

        $data = $this->getJson('/api/v1/tenders?category='.$networking->slug)->assertOk()->json('data');

        $this->assertSame(['filed'], array_column($data, 'slug'));
        $this->assertSame('Networking', $data[0]['category']['name']);
    }

    /* -------------------------------------------------------- the categories */

    public function test_the_categories_are_only_the_ones_holding_a_published_tender(): void
    {
        $used = $this->category('Networking');
        $this->category('Nothing in it');
        $this->tender(['tender_category_id' => $used->id]);

        $body = $this->getJson('/api/v1/tender-categories')->assertOk()->json();

        $this->assertSame(['Networking'], array_column($body['data'], 'name'));
        $this->assertSame(1, $body['data'][0]['count']);
        $this->assertSame(1, $body['meta']['total']);
        $this->assertSame(1, $body['meta']['open']);
    }

    public function test_no_categories_is_an_empty_array_in_a_200(): void
    {
        $this->getJson('/api/v1/tender-categories')->assertOk()->assertExactJson([
            'data' => [],
            'meta' => ['total' => 0, 'open' => 0, 'updated_at' => null],
        ]);
    }

    public function test_switching_a_category_off_hides_its_tenders_everywhere(): void
    {
        $category = $this->category('Networking');
        $this->tender(['slug' => 'filed', 'tender_category_id' => $category->id]);

        $this->getJson('/api/v1/tenders')->assertOk()->assertJsonCount(1, 'data');

        $category->update(['is_active' => false]);

        $this->getJson('/api/v1/tenders')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/tenders/filed')->assertNotFound();
        $this->getJson('/api/v1/tender-categories')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_deleting_a_category_leaves_its_tenders_unfiled_and_still_public(): void
    {
        $category = $this->category('Networking');
        $tender = $this->tender(['slug' => 'filed', 'tender_category_id' => $category->id]);

        $category->delete();

        $this->assertNull($tender->fresh()?->tender_category_id);
        $this->getJson('/api/v1/tenders')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/tenders/filed')->assertOk()->assertJsonPath('data.category', null);
    }

    /* ----------------------------------------------------------- the notice */

    public function test_the_page_carries_every_label_from_the_api(): void
    {
        $this->tender([
            'slug' => 'campus',
            'tender_category_id' => $this->category()->id,
            'opening_at' => '2026-11-11 11:00:00',
            'prebid_at' => '2026-10-28 11:00:00',
            'prebid_place' => 'Conference room 2',
            'fee_paise' => 250000,
            'emd_paise' => 15000000,
            'submission_url' => 'https://bids.example.test/abc',
            'submission_address' => "Procurement desk\nKolkata",
            'contact_name' => 'A Person',
        ]);

        $data = $this->getJson('/api/v1/tenders/campus')->assertOk()->json('data');

        // Not a single date is formatted by anything downstream.
        $this->assertSame('Friday 16 October 2026', $data['opens_label']);
        $this->assertSame('Tuesday 10 November 2026, 6:00 pm IST', $data['closes_label']);
        $this->assertSame('11 November 2026, 11:00 am IST', $data['opening_label']);
        $this->assertSame('28 October 2026, 11:00 am IST', $data['prebid_label']);
        $this->assertSame('Conference room 2', $data['prebid_place']);

        // Money, grouped the Indian way, with the paise beside it.
        $this->assertSame('₹2,500', $data['fee_label']);
        $this->assertSame(250000, $data['fee_paise']);
        $this->assertSame('₹1,50,000', $data['emd_label']);

        $this->assertSame('open', $data['state']);
        $this->assertSame('Open', $data['state_label']);
        $this->assertFalse($data['closed']);

        $this->assertSame('https://bids.example.test/abc', $data['submission']['url']);
        $this->assertSame('A Person', $data['contact']['name']);
        $this->assertSame('Networking', $data['category']['name']);
        $this->assertSame('WebPage', $data['schema']['@type']);
    }

    public function test_a_free_tender_document_reads_free_and_an_unpriced_one_reads_nothing(): void
    {
        $this->tender(['slug' => 'free', 'fee_paise' => 0]);

        // Nothing to pay and "we have not said" are different answers.
        $this->assertSame('Free', $this->getJson('/api/v1/tenders/free')->json('data.fee_label'));
        $this->assertNull($this->getJson('/api/v1/tenders/free')->json('data.emd_label'));
    }

    public function test_a_draft_or_archived_tender_is_a_404_and_a_closed_one_is_not(): void
    {
        $this->tender(['slug' => 'draft', 'status' => PublishStatus::Draft]);
        $this->tender(['title' => 'A', 'slug' => 'archived', 'status' => PublishStatus::Archived]);
        $this->tender(['title' => 'B', 'slug' => 'shut', 'opens_at' => '2026-08-01 10:00:00', 'closes_at' => '2026-09-01 18:00:00']);

        $this->getJson('/api/v1/tenders/draft')->assertNotFound();
        $this->getJson('/api/v1/tenders/archived')->assertNotFound();
        $this->getJson('/api/v1/tenders/nobody-has-this')->assertNotFound();

        // The archive is the point: a closed notice stays readable.
        $this->getJson('/api/v1/tenders/shut')->assertOk()->assertJsonPath('data.state', 'closed');
    }

    /* ------------------------------------------------------------ the state */

    public function test_the_state_follows_the_clock_at_both_boundaries(): void
    {
        $tender = $this->tender(['slug' => 'campus', 'opens_at' => '2026-10-21 10:00:00', 'closes_at' => '2026-10-31 18:00:00']);

        $at = function (string $when) use ($tender) {
            return TenderWindow::for($tender, Carbon::parse($when, 'Asia/Kolkata'))->state;
        };

        $this->assertSame('upcoming', $at('2026-10-21 09:59:00'));
        $this->assertSame('open', $at('2026-10-21 10:00:00'), 'It opens on the minute it says.');
        $this->assertSame('open', $at('2026-10-27 09:00:00'));
        // Three calendar days out is "closing soon".
        $this->assertSame('closing_soon', $at('2026-10-28 09:00:00'));
        $this->assertSame('closing_soon', $at('2026-10-31 17:59:00'));
        $this->assertSame('closed', $at('2026-10-31 18:00:00'), 'It closes on the minute it says.');
    }

    public function test_the_countdown_counts_calendar_days_not_blocks_of_hours(): void
    {
        $tender = $this->tender(['closes_at' => '2026-10-23 18:00:00']);

        $label = fn (string $when) => TenderWindow::for($tender, Carbon::parse($when, 'Asia/Kolkata'))->countdownLabel();

        // The same deadline must not be described two ways within one
        // evening, which is what counting in 24-hour blocks does.
        $this->assertSame('3 days left', $label('2026-10-20 09:00:00'));
        $this->assertSame('3 days left', $label('2026-10-20 23:30:00'));
        $this->assertSame('Closes tomorrow', $label('2026-10-22 08:00:00'));
        $this->assertSame('Closes tomorrow', $label('2026-10-22 23:30:00'));
        $this->assertSame('Closes today', $label('2026-10-23 09:00:00'));
        $this->assertNull($label('2026-10-24 09:00:00'), 'Closed, so there is nothing to count.');
    }

    public function test_the_state_endpoint_is_never_cached(): void
    {
        $this->tender(['slug' => 'campus']);

        $response = $this->getJson('/api/v1/tenders/campus/state')->assertOk();

        // The cached page cannot answer this, which is the whole reason the
        // route exists — so it must not be cached either.
        // Laravel adds `private` of its own, so the assertion is on the
        // directive that matters rather than on the whole header.
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->assertSame([
            'state' => 'open',
            'state_label' => 'Open',
            'closes_in_label' => '21 days left',
            'closed' => false,
        ], $response->json('data'));
    }

    public function test_the_state_endpoint_is_a_404_for_a_draft(): void
    {
        $this->tender(['slug' => 'draft', 'status' => PublishStatus::Draft]);

        $this->getJson('/api/v1/tenders/draft/state')->assertNotFound();
    }

    /* -------------------------------------------------------- the documents */

    public function test_a_document_is_resolved_from_the_library_and_one_that_has_gone_is_left_out(): void
    {
        $media = Media::create([
            'filename' => 'tender-pack.pdf', 'path' => 'media/tenders/pack.pdf',
            'mime' => 'application/pdf', 'size' => 204800, 'disk' => 'public',
        ]);

        $this->tender([
            'slug' => 'campus',
            'documents' => [
                ['title' => 'Tender document', 'file_path' => $media->path, 'note' => 'Read this first'],
                ['title' => 'Bill of quantities', 'file_path' => 'media/tenders/gone.pdf', 'note' => null],
            ],
        ]);

        $data = $this->getJson('/api/v1/tenders/campus')->assertOk()->json('data');

        // A button that 404s tells a bidder a document exists when it does not.
        $this->assertCount(1, $data['documents']);
        $this->assertSame('Tender document', $data['documents'][0]['title']);
        $this->assertSame('Read this first', $data['documents'][0]['note']);
        $this->assertSame(204800, $data['documents'][0]['size']);
        $this->assertSame('pdf', $data['documents'][0]['extension']);
        $this->assertStringContainsString('media/tenders/pack.pdf', $data['documents'][0]['url']);

        // And the count agrees with the list, rather than with the column.
        $this->assertSame(1, $data['documents_count']);

        // Now take the file out of the library. The row on the tender is
        // untouched — the library is where a file is removed — and the page
        // must stop drawing it rather than offer a button that 404s.
        $media->delete();
        // A web request gets its own container; a test's `getJson` calls
        // share one, so the per-request memo has to be dropped here or this
        // read is answered from it and passes for the wrong reason.
        TenderDocuments::forget();

        $after = $this->getJson('/api/v1/tenders/campus')->assertOk()->json('data');
        $this->assertSame([], $after['documents']);
        $this->assertSame(0, $after['documents_count']);
    }

    public function test_a_page_of_tenders_reads_their_documents_in_one_query(): void
    {
        $media = Media::create([
            'filename' => 'pack.pdf', 'path' => 'media/tenders/pack.pdf',
            'mime' => 'application/pdf', 'size' => 2048, 'disk' => 'public',
        ]);

        // Ten tenders, each carrying a document, so an unprimed resource
        // would be ten `Media` queries for one page.
        for ($i = 0; $i < 10; $i++) {
            $this->tender([
                'title' => "Tender {$i}", 'slug' => "tender-{$i}",
                'documents' => [['title' => 'Pack', 'file_path' => $media->path, 'note' => null]],
            ]);
        }

        $queries = 0;
        DB::listen(function (QueryExecuted $query) use (&$queries) {
            if (str_contains($query->sql, '`media`')) {
                $queries++;
            }
        });

        $this->getJson('/api/v1/tenders')->assertOk()->assertJsonCount(10, 'data');

        $this->assertSame(1, $queries, 'The page primes its documents once; a query per row is the N+1 `prime()` exists for.');
    }

    public function test_the_list_row_carries_no_scope_of_work_or_submission_details(): void
    {
        $this->tender(['slug' => 'campus', 'submission_email' => 'tenders@example.test']);

        $row = $this->getJson('/api/v1/tenders')->assertOk()->json('data.0');

        // A listing has no use for either, and the row is what the index
        // page and the sitemap read.
        $this->assertArrayNotHasKey('description', $row);
        $this->assertArrayNotHasKey('submission', $row);
        $this->assertArrayNotHasKey('documents', $row);
        $this->assertArrayHasKey('documents_count', $row);
        $this->assertArrayHasKey('updated_at', $row, 'The sitemap reads this.');
    }

    public function test_an_index_row_carries_no_graph(): void
    {
        $this->tender(['slug' => 'campus']);

        // Twenty graphs for markup nothing renders — the rule every resource
        // here follows.
        $this->assertArrayNotHasKey('schema', $this->getJson('/api/v1/tenders')->json('data.0'));
    }
}
