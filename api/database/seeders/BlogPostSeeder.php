<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\BlogPost;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Mirrors the two posts in web/mock-api.mjs so the real API and the mock agree,
 * and the CMS screen opens on something rather than an empty list.
 *
 * Slugs are set explicitly, as everywhere else in this project — they are the
 * URL contract, and Str::slug has produced surprises before.
 */
class BlogPostSeeder extends Seeder
{
    public function run(): void
    {
        $author = User::where('is_active', true)->orderBy('id')->first();

        $posts = [
            [
                'slug' => 'firewall-rules-that-stop-working',
                'title' => 'Firewall rules that quietly stop working',
                'excerpt' => 'Five policy patterns that pass review but fail in production, and how to catch them early.',
                'body' => '<p>A firewall policy is not a static document. It describes a network that keeps changing underneath it.</p>'
                    .'<h2>The stale object problem</h2>'
                    .'<p>An address object pointing at a host that was decommissioned two years ago still matches nothing — until DHCP hands that address to a printer.</p>'
                    .'<ul><li>Audit address objects quarterly</li><li>Prefer FQDN objects where the vendor supports them</li></ul>',
                'published_at' => '2026-08-12 09:00:00',
                'status' => PublishStatus::Published,
            ],
            [
                'slug' => 'sizing-a-ups',
                'title' => 'Sizing a UPS for a small server room',
                'excerpt' => 'Load calculation, runtime targets and the mistake almost everyone makes with power factor.',
                'body' => '<p>Most undersized UPS installations come from reading the wrong number off the label.</p>'
                    .'<h2>VA is not watts</h2>'
                    .'<p>A 1500&nbsp;VA unit does not deliver 1500&nbsp;W. Multiply by the power factor — often 0.6 on cheaper units — before you compare it against your load.</p>',
                'published_at' => '2026-08-04 09:00:00',
                'status' => PublishStatus::Published,
            ],
            [
                // One draft, so the CMS list demonstrates the status filter and
                // the public site demonstrably does not show it.
                'slug' => 'switch-stacking-in-practice',
                'title' => 'Switch stacking in practice',
                'excerpt' => 'When stacking earns its licence cost, and when two independent switches serve you better.',
                'body' => '<p>Stacking simplifies management, but it also turns two failure domains into one.</p>',
                'published_at' => null,
                'status' => PublishStatus::Draft,
            ],
        ];

        foreach ($posts as $post) {
            BlogPost::updateOrCreate(
                ['slug' => $post['slug']],
                $post + ['author_id' => $author?->id],
            );
        }
    }
}
