<?php

namespace Database\Seeders;

use App\Enums\ContentBlockType;
use App\Enums\PublishStatus;
use App\Models\Brand;
use App\Models\ContentBlock;
use App\Models\Media;
use App\Models\Setting;
use Illuminate\Database\Seeder;

/**
 * Sample content blocks (2026-09-24). Create-only: a block that exists by
 * slug is never touched, so an editor's changes survive a re-seed.
 *
 * **The one published block is the default CTA, `site-audit`, carrying the
 * words every theme's closing band already shows** — so the feature arrives
 * without moving a pixel, and an editor finds the band already there to
 * change. Everything else is a **draft**: a sample of each layout to start
 * from, on nobody's page until somebody embeds and publishes it. The figures
 * in the stat samples are the homepage hero's own, which are themselves on
 * the must-not-ship list; the pricing is invented. See CLAUDE.md, "Known
 * risks and placeholders".
 */
class ContentBlockSeeder extends Seeder
{
    public function run(): void
    {
        $this->cta();
        $this->stats();
        $this->pricing();
        $this->stack();
    }

    /** @param  array<string, mixed>  $data */
    private function make(string $slug, ContentBlockType $type, string $layout, string $name, array $data, bool $published = false, bool $default = false): void
    {
        if (ContentBlock::where('slug', $slug)->exists()) {
            return;
        }

        ContentBlock::create([
            'slug' => $slug, 'type' => $type, 'layout' => $layout, 'name' => $name,
            'status' => $published ? PublishStatus::Published : PublishStatus::Draft,
            'is_default' => $default, 'data' => $data,
        ]);
    }

    private function cta(): void
    {
        $band = [
            'heading' => 'Let’s look at what you’re actually running.',
            'body' => 'A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.',
            'primary' => ['label' => 'Book a site audit', 'href' => '/contact'],
            'secondary_mode' => 'call',
        ];
        $this->make('site-audit', ContentBlockType::Cta, 'band', 'Site audit (default closing band)', $band, true, true);

        $picture = Media::query()->where('mime', 'like', 'image/%')->where('mime', '!=', 'image/svg+xml')->orderBy('id')->value('path');
        if ($picture) {
            $this->make('sample-cta-split', ContentBlockType::Cta, 'split', 'Sample — split with image', [
                ...$band, 'kicker' => 'Free assessment', 'image_path' => $picture, 'image_side' => 'right',
            ]);
        }

        $this->make('sample-cta-two-path', ContentBlockType::Cta, 'two_path', 'Sample — two paths', [
            'heading' => 'Two ways to get started',
            'body' => 'Whether you know exactly what you need or want a second opinion first.',
            'paths' => [
                ['icon' => 'network', 'title' => 'Book a site audit', 'body' => 'An engineer walks the site and writes up what they find.', 'cta' => ['label' => 'Book an audit', 'href' => '/contact?subject=Site%20audit']],
                ['icon' => 'headset', 'title' => 'Talk to sales', 'body' => 'Pricing, lead times and AMC options on a short call.', 'cta' => ['label' => 'Talk to sales', 'href' => '/contact?subject=Sales']],
            ],
        ]);

        $this->make('sample-cta-reassurance', ContentBlockType::Cta, 'reassurance', 'Sample — button with reassurance', [
            ...$band,
            'promises' => ['No obligation', 'Findings in writing', 'An engineer, not a salesperson', 'Within a week'],
        ]);

        $this->make('sample-cta-newsletter', ContentBlockType::Cta, 'newsletter', 'Sample — inline newsletter', [
            'heading' => 'One useful email a month',
            'body' => 'Field notes from our engineers — what broke, what fixed it, what to watch for.',
            'placeholder' => 'you@company.in', 'button_label' => 'Subscribe',
        ]);

        $pdf = Media::query()->where('mime', 'application/pdf')->orderBy('id')->value('path');
        if ($pdf) {
            $this->make('sample-cta-download', ContentBlockType::Cta, 'gated_download', 'Sample — gated download', [
                'kicker' => 'Free guide', 'heading' => 'The network readiness checklist',
                'body' => 'Twenty questions to ask before your next office move.',
                'media_path' => $pdf, 'button_label' => 'Email me the PDF',
            ]);
        }

        $this->make('sample-cta-countdown', ContentBlockType::Cta, 'countdown', 'Sample — countdown', [
            'kicker' => 'Offer ends soon', 'heading' => 'Free first-year AMC on new firewall installs',
            'primary' => ['label' => 'Claim the offer', 'href' => '/contact?subject=AMC%20offer'],
            'ends_at' => now()->addDays(14)->startOfDay()->toIso8601String(), 'expired' => 'hide',
        ]);

        $this->make('sample-cta-webinar', ContentBlockType::Cta, 'webinar', 'Sample — webinar strip', [
            'kicker' => 'Live session', 'heading' => 'SD-WAN for multi-site businesses, in an hour',
            'starts_at' => now()->addDays(21)->setTime(11, 0)->toIso8601String(), 'duration_minutes' => 60,
            'where' => 'Online — link sent on registration', 'button_label' => 'Save my seat',
        ]);

        $this->make('sample-cta-hiring', ContentBlockType::Cta, 'hiring', 'Sample — hiring', [
            'heading' => 'We’re hiring engineers who like the hard problems',
            'body' => 'Field, network and support roles across the city.',
            'primary' => ['label' => 'See all roles', 'href' => '/careers'], 'limit' => 3,
        ]);
    }

    private function stats(): void
    {
        $figures = collect(preg_split('/\r?\n/', (string) Setting::get('hero_stats', '')))
            ->map(fn ($line) => explode('|', trim($line)))
            ->filter(fn ($p) => count($p) >= 2 && $p[0] !== '' && $p[1] !== '')
            ->map(fn ($p) => ['value' => $p[0], 'label' => $p[1], 'icon' => $p[2] ?? null])
            ->values()->all();
        if (! $figures) {
            $figures = [['value' => '16 yrs', 'label' => 'In the field'], ['value' => '340+', 'label' => 'Sites under AMC'], ['value' => '< 4 hrs', 'label' => 'First response SLA'], ['value' => '99.9%', 'label' => 'Managed uptime']];
        }
        $series = [[4, 6, 5, 8, 9, 11, 12], [210, 240, 260, 290, 310, 330, 340], [7, 6, 6, 5, 4, 4, 3.5], [99.2, 99.5, 99.7, 99.8, 99.9, 99.9, 99.9]];
        $percents = [80, 68, 92, 99.9];
        $items = array_map(fn ($f, $i) => $f + ['series' => $series[$i % 4], 'percent' => $percents[$i % 4], 'delta' => ['+2', '+14%', '−30 min', '+0.2%'][$i % 4]], $figures, array_keys($figures));

        $this->make('sample-stats-row', ContentBlockType::Stats, 'row', 'Sample — four-figure row', ['items' => $figures]);
        $this->make('sample-stats-sparklines', ContentBlockType::Stats, 'sparkline_cards', 'Sample — metric cards with sparklines', ['heading' => 'The last six months', 'items' => $items]);
        $this->make('sample-stats-rings', ContentBlockType::Stats, 'rings', 'Sample — ring gauge trio', ['heading' => 'How the desk is doing', 'items' => array_slice($items, 0, 3)]);
        $this->make('sample-stats-count-up', ContentBlockType::Stats, 'count_up', 'Sample — count-up', ['items' => $figures]);
        $this->make('sample-stats-pulse', ContentBlockType::Stats, 'pulse_strip', 'Sample — anomaly pulse strip', [
            'heading' => 'This week on the network',
            'items' => array_map(fn ($it, $i) => $it + ['anomaly' => $i === 2], $items, array_keys($items)),
        ]);
        $this->make('sample-stats-feature-cards', ContentBlockType::Stats, 'feature_cards', 'Sample — feature cards', [
            'heading' => 'Built for teams that', 'heading_emphasis' => 'ship relentlessly',
            'lede' => 'One partner to design, install and support the network — so your people can get on with the work.',
            'items' => array_map(fn ($it, $i) => $it + [
                'badge' => ['Experience', 'Coverage', 'Response', 'Reliability'][$i % 4],
                'description' => ['Networks designed, installed and supported since 2010.', 'Sites we look after on an annual maintenance contract.', 'Median time to a first reply from an engineer.', 'Uptime across the networks we manage.'][$i % 4],
            ], array_slice($items, 0, 3), [0, 1, 2]),
        ]);
        $this->make('sample-stats-chips', ContentBlockType::Stats, 'chips', 'Sample — figures as chips', [
            'heading' => 'Infrastructure that', 'heading_emphasis' => 'scales with you',
            'lede' => 'Trusted by offices, factories and campuses across the region.',
            'items' => array_slice($figures, 0, 3),
            'recognitions' => [['icon' => 'cert', 'score' => 'Select', 'name' => 'Cisco partner'], ['icon' => 'shield', 'score' => 'Advanced', 'name' => 'Fortinet partner'], ['icon' => 'chart', 'score' => '4.8', 'name' => 'Google reviews']],
        ]);
    }

    private function pricing(): void
    {
        $plans = [
            ['name' => 'Essential', 'description' => 'For a single office that needs the basics looked after.', 'price_monthly_paise' => 499900, 'price_yearly_paise' => 4999000, 'period' => 'per site',
                'features' => ['Quarterly health check', 'Next-business-day response', 'Remote support, office hours'], 'cta' => ['label' => 'Enquire', 'href' => '/contact?subject=Essential%20AMC']],
            ['name' => 'Business', 'badge' => 'Most chosen', 'highlighted' => true, 'description' => 'For offices where the network is the business.', 'price_monthly_paise' => 999900, 'price_yearly_paise' => 9999000, 'period' => 'per site',
                'features' => ['Monthly health check', '4-hour response', 'Remote support, 8am–8pm', 'Spares held on site'], 'cta' => ['label' => 'Enquire', 'href' => '/contact?subject=Business%20AMC']],
            ['name' => 'Enterprise', 'description' => 'Multi-site estates with round-the-clock operations.', 'price_label' => 'Custom', 'period' => '',
                'features' => ['Named engineer', '2-hour response, 24×7', 'Quarterly review with your team', 'Change management'], 'cta' => ['label' => 'Talk to us', 'href' => '/contact?subject=Enterprise%20AMC']],
        ];
        $rows = [
            ['label' => 'Health checks', 'group' => 'Maintenance', 'cells' => ['Quarterly', 'Monthly', 'Monthly']],
            ['label' => 'Response time', 'group' => 'Support', 'cells' => ['Next business day', '4 hours', '2 hours']],
            ['label' => 'Out-of-hours cover', 'group' => 'Support', 'cells' => ['no', 'no', 'yes']],
            ['label' => 'Spares on site', 'group' => 'Support', 'cells' => ['no', 'yes', 'yes']],
            ['label' => 'Named engineer', 'group' => 'Support', 'cells' => ['no', 'no', 'yes']],
        ];
        $data = [
            'heading' => 'Annual maintenance, priced per site',
            'lede' => 'Invented figures for the layout — replace before launch.',
            'billing' => ['enabled' => true, 'monthly_label' => 'Monthly', 'yearly_label' => 'Yearly', 'yearly_note' => 'Two months free'],
            'sets' => [
                ['label' => 'Network AMC', 'plans' => $plans, 'rows' => $rows],
                ['label' => 'CCTV AMC', 'plans' => array_map(fn ($p) => array_merge($p, [
                    'price_monthly_paise' => isset($p['price_monthly_paise']) ? (int) ($p['price_monthly_paise'] * 0.6) : null,
                    'price_yearly_paise' => isset($p['price_yearly_paise']) ? (int) ($p['price_yearly_paise'] * 0.6) : null,
                ]), $plans), 'rows' => $rows],
            ],
        ];

        $this->make('sample-pricing-three-tier', ContentBlockType::Pricing, 'three_tier', 'Sample — three-tier pricing', $data);
        $this->make('sample-pricing-comparison', ContentBlockType::Pricing, 'comparison', 'Sample — comparison table', $data);
        $this->make('sample-pricing-single', ContentBlockType::Pricing, 'single_focus', 'Sample — single plan', $data);
    }

    private function stack(): void
    {
        $brands = Brand::query()->whereNotNull('logo_path')->orderBy('sort_order')->orderBy('id')->limit(20)->get();
        if ($brands->count() < 3) {
            return;
        }

        $groups = collect([['Networking', 6, 60], ['Security & compute', 6, 80], ['Across the estate', 8, 110]])
            ->map(fn ($g, $i) => [
                'name' => $g[0], 'speed_seconds' => $g[2], 'direction' => $i % 2 ? 'ccw' : 'cw',
                'items' => $brands->slice($i * 6, $g[1])->map(fn (Brand $b) => [
                    'label' => '', 'brand_id' => $b->id, 'type' => 'Vendor', 'weight' => 3,
                ])->values()->all(),
            ])->filter(fn ($g) => $g['items'] !== [])->values()->all();

        $this->make('sample-stack', ContentBlockType::Stack, 'orbit', 'Sample — technology stack', [
            'heading' => 'The kit we design, install and support',
            'lede' => 'Vendors we work with every week. Pick one to see what we do with it.',
            'groups' => $groups,
        ]);
    }
}
