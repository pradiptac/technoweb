<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\KnowledgeArticle;
use App\Models\KnowledgeCategory;
use Illuminate\Database\Seeder;

/**
 * Mirrors the articles in web/mock-api.mjs so the real API and the mock agree.
 * Slugs are set explicitly — they are the URL contract.
 */
class KnowledgeBaseSeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['slug' => 'email-hosting', 'name' => 'Email & hosting', 'sort_order' => 10],
            ['slug' => 'wifi', 'name' => 'Wi-Fi', 'sort_order' => 20],
            ['slug' => 'networking', 'name' => 'Networking', 'sort_order' => 30],
            ['slug' => 'portal', 'name' => 'Portal', 'sort_order' => 40],
        ];

        foreach ($categories as $category) {
            KnowledgeCategory::updateOrCreate(['slug' => $category['slug']], $category);
        }

        $byslug = KnowledgeCategory::pluck('id', 'slug');

        $articles = [
            [
                'slug' => 'business-email-on-mobile',
                'knowledge_category_id' => $byslug['email-hosting'],
                'title' => 'Configuring business email on iPhone and Android',
                'excerpt' => 'Step-by-step IMAP and Exchange setup, with the ports that actually matter.',
                'body' => '<p>Use these settings exactly — most failures are a wrong port or SSL setting.</p>'
                    .'<h2>IMAP</h2><p>Incoming 993 SSL, outgoing 587 STARTTLS.</p>',
                'tags' => ['email', 'mobile', 'imap'],
                'status' => PublishStatus::Published,
                'published_at' => '2026-07-28 09:00:00',
            ],
            [
                'slug' => 'why-your-wifi-survey-was-wrong',
                'knowledge_category_id' => $byslug['wifi'],
                'title' => 'Why your Wi-Fi survey was wrong',
                'excerpt' => 'Predictive surveys assume an empty building. Here is what changes once the racking goes in.',
                'body' => '<p>Metal racking absorbs 5 GHz far more aggressively than drywall.</p>',
                // "wifi" must find this article even though the title is
                // hyphenated — see KnowledgeArticle::scopeSearch.
                'tags' => ['wifi', 'survey'],
                'status' => PublishStatus::Published,
                'published_at' => '2026-07-19 09:00:00',
            ],
            [
                'slug' => 'reset-portal-password',
                'knowledge_category_id' => $byslug['portal'],
                'title' => 'Resetting a forgotten portal password',
                'excerpt' => 'What to do if you cannot sign in to the support portal.',
                'body' => '<p>Contact your account engineer — portal accounts are issued with your AMC contract.</p>',
                'tags' => ['portal', 'account'],
                'status' => PublishStatus::Published,
                'published_at' => '2026-07-02 09:00:00',
            ],
            [
                // A draft, so the CMS list demonstrates the status filter.
                'slug' => 'vlan-numbering-conventions',
                'knowledge_category_id' => $byslug['networking'],
                'title' => 'VLAN numbering conventions that survive a rebuild',
                'excerpt' => 'Pick a scheme that still makes sense when the network doubles.',
                'body' => '<p>Leave gaps. A contiguous numbering plan has nowhere to grow.</p>',
                'tags' => ['vlan', 'networking'],
                'status' => PublishStatus::Draft,
                'published_at' => null,
            ],
        ];

        foreach ($articles as $article) {
            KnowledgeArticle::updateOrCreate(['slug' => $article['slug']], $article);
        }
    }
}
