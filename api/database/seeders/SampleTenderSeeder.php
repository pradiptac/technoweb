<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\Tender;
use App\Models\TenderCategory;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Two categories and three placeholder tenders (0.174.0, `docs/tenders.md`),
 * so the tenders pages and the console's list have something to draw on a
 * demo install: one open with a while to run, one closing within days, and
 * one that has closed.
 *
 * **Demo only, and create-only.** Called from `DemoSeeder` and nothing else.
 * A tender is an invitation to bid, with a deadline and a fee somebody could
 * act on, so a fresh install must not publish one — this is the sharpest
 * version of the rule the sample events already follow. The rows are made
 * only while the table is empty, so a re-seed never brings a deleted sample
 * back beside a real notice, and every title and reference says "Sample" —
 * the must-not-ship list in CLAUDE.md.
 *
 * **No documents.** The other sample seeders generate a placeholder picture;
 * a tender's documents are the tender pack, and a generated file called
 * "Tender document" that opens to a placeholder is worse than none — a
 * bidder would download it. The three samples carry none, which is also a
 * true state for a real tender whose pack is collected in person.
 *
 * The dates are relative to the day of seeding, so the samples read
 * correctly whenever the demo is looked at. The reference numbers, the fee,
 * the EMD and the contact are invented, and the submission address is an
 * `example.com` one that reaches nobody.
 */
class SampleTenderSeeder extends Seeder
{
    public function run(): void
    {
        if (Tender::query()->exists()) {
            return;
        }

        $categories = $this->categories();
        $now = Carbon::now();

        $this->make([
            'reference' => 'SAMPLE/2026/001',
            'title' => 'Sample tender — campus network refresh',
            'slug' => 'sample-campus-network-refresh',
            'summary' => 'Supply, installation and commissioning of switching and wireless for a three-building campus. This is sample content.',
            'description' => '<p>This is sample content and describes nothing real.</p>'
                .'<p>The scope would set out the quantities, the makes and models accepted, the standards the work must meet, the warranty asked for and the conditions of payment.</p>'
                .'<p>Bidders would be asked to quote per line item and to attach their certifications.</p>',
            'tender_category_id' => $categories['networking'],
            'opens_at' => $now->copy()->subDays(4)->setTime(10, 0),
            'closes_at' => $now->copy()->addDays(21)->setTime(18, 0),
            'opening_at' => $now->copy()->addDays(22)->setTime(11, 0),
            'prebid_at' => $now->copy()->addDays(9)->setTime(11, 0),
            'prebid_place' => 'Sample conference room, ground floor',
            'fee_paise' => 250000,
            'emd_paise' => 5000000,
        ]);

        $this->make([
            'reference' => 'SAMPLE/2026/002',
            'title' => 'Sample tender — annual maintenance of server hardware',
            'slug' => 'sample-annual-maintenance-servers',
            'summary' => 'Comprehensive annual maintenance for rack servers and storage across two sites. This is sample content.',
            'description' => '<p>This is sample content and describes nothing real.</p>'
                .'<p>The scope would set out the equipment covered, the response and resolution times expected, what spares are included and how the contract is renewed.</p>',
            'tender_category_id' => $categories['amc'],
            'opens_at' => $now->copy()->subDays(18)->setTime(10, 0),
            // Inside `Tender::CLOSING_SOON_DAYS`, so the demo shows the
            // "Closing soon" chip and the countdown line.
            'closes_at' => $now->copy()->addDays(2)->setTime(17, 0),
            'fee_paise' => 0,
            'emd_paise' => 2500000,
        ]);

        $this->make([
            'reference' => 'SAMPLE/2025/014',
            'title' => 'Sample tender — structured cabling for a new floor',
            'slug' => 'sample-structured-cabling',
            'summary' => 'Category 6A cabling, racks and passive components for one floor. This is sample content, and this tender has closed.',
            'description' => '<p>This is sample content and describes nothing real. This tender has closed and is kept as a record.</p>',
            'tender_category_id' => $categories['networking'],
            'opens_at' => $now->copy()->subDays(70)->setTime(10, 0),
            'closes_at' => $now->copy()->subDays(40)->setTime(18, 0),
            'opening_at' => $now->copy()->subDays(39)->setTime(11, 0),
            'fee_paise' => 150000,
            'emd_paise' => 1500000,
        ]);
    }

    /**
     * Two categories, by the slug the tenders above file themselves under.
     *
     * `firstOrCreate` on the slug rather than create: a demo install
     * re-seeded after somebody renamed one must not end up with two.
     *
     * @return array<string, int>
     */
    private function categories(): array
    {
        $rows = [
            'networking' => ['name' => 'Networking', 'description' => 'Switching, wireless and structured cabling.', 'sort_order' => 1],
            'amc' => ['name' => 'Annual maintenance', 'description' => 'Maintenance and support contracts.', 'sort_order' => 2],
        ];

        $out = [];

        foreach ($rows as $slug => $attributes) {
            $out[$slug] = (int) TenderCategory::query()
                ->firstOrCreate(['slug' => $slug], $attributes + ['is_active' => true])
                ->id;
        }

        return $out;
    }

    /**
     * One sample, published, with the fields every one of them shares.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function make(array $attributes): void
    {
        Tender::query()->create($attributes + [
            'status' => PublishStatus::Published->value,
            'submission_email' => 'tenders@example.com',
            'submission_address' => "Sample Procurement Desk\nSample Business Park\nKolkata 700091",
            'contact_name' => 'Sample contact',
            'contact_phone' => '+91 98765 43210',
            'contact_email' => 'tenders@example.com',
        ]);
    }
}
