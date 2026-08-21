<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\CaseStudy;
use App\Models\Industry;
use Illuminate\Database\Seeder;

/**
 * Mirrors the case studies in web/mock-api.mjs so the real API and the mock
 * agree. Slugs are set explicitly — they are the URL contract.
 *
 * These are invented reference customers, like the rest of the placeholder
 * content: see the "must not ship" list in CLAUDE.md.
 */
class CaseStudySeeder extends Seeder
{
    public function run(): void
    {
        $industries = Industry::pluck('id', 'slug');

        $studies = [
            [
                'slug' => 'six-plant-consolidation',
                'industry_id' => $industries['manufacturing'] ?? null,
                'title' => 'Six-plant network consolidation',
                'client_name' => 'Meridian Foods',
                'summary' => 'Replaced six independently-built site networks with one standardised design, central firewall policy and site-to-site VPN.',
                'body' => '<p>Each plant had been wired by whichever local contractor was available at the time.</p>'
                    .'<h2>What we changed</h2>'
                    .'<p>One switching standard, one addressing plan, one firewall policy pushed from the centre.</p>',
                'results' => [
                    ['value' => '-71%', 'label' => 'Network tickets'],
                    ['value' => '6 wks', 'label' => 'Cutover'],
                    ['value' => '6', 'label' => 'Sites standardised'],
                    ['value' => 'Zero', 'label' => 'Production stoppages'],
                ],
                'status' => PublishStatus::Published,
            ],
            [
                'slug' => 'hospital-wifi',
                'industry_id' => $industries['healthcare'] ?? null,
                'title' => 'Hospital Wi-Fi & device segmentation',
                'client_name' => null,
                'summary' => 'High-density wireless across four floors with clinical devices, staff and guest traffic properly separated.',
                'body' => '<p>Clinical devices cannot share a broadcast domain with guest phones.</p>',
                'results' => [
                    ['value' => '180', 'label' => 'Access points'],
                    ['value' => 'Zero', 'label' => 'Clinical downtime'],
                ],
                'status' => PublishStatus::Published,
            ],
            [
                // A draft, so the CMS list demonstrates the status filter.
                'slug' => 'school-district-refresh',
                'industry_id' => $industries['education'] ?? null,
                'title' => 'District-wide switching refresh',
                'client_name' => null,
                'summary' => 'Eleven schools moved onto a single managed switching standard over one summer break.',
                'body' => '<p>The window was fixed: everything had to be live before term started.</p>',
                'results' => [
                    ['value' => '11', 'label' => 'Schools'],
                    ['value' => '1', 'label' => 'Summer break'],
                ],
                'status' => PublishStatus::Draft,
            ],
        ];

        foreach ($studies as $study) {
            CaseStudy::updateOrCreate(['slug' => $study['slug']], $study);
        }
    }
}
