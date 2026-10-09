<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Sample content, so an empty install can be judged before it is filled in.
 *
 * Every row here is invented — the must-not-ship list in CLAUDE.md: blog
 * posts, knowledge-base articles, case studies, products with placeholder
 * pictures, an address, a phone number and social links, a team, clients and
 * certifications, content blocks, a sample builder page and a worked support
 * desk. The setup wizard offers it as a tick box, off by default, and says it
 * all has to be replaced or deleted before launch.
 *
 * Runs after `InstallSeeder` and after an administrator exists: blog posts
 * are attributed to a staff account.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            BlogPostSeeder::class,
            KnowledgeBaseSeeder::class,
            CaseStudySeeder::class,
            ProductSeeder::class,
            // Placeholder hardware and installation services, filed under the
            // categories `CatalogueSeeder` (in InstallSeeder) made. Create-only.
            SampleServiceSeeder::class,
            // Last among the content — it fills gaps left by everything above.
            DemoContentSeeder::class,
            // The team, the clients and the certifications — placeholder rows,
            // created only while each table is empty.
            CompanyProfileSeeder::class,
            // Sample CTA banners, stat bars, pricing and a technology stack —
            // drafts, except the default closing band. Create-only.
            ContentBlockSeeder::class,
            // One draft builder page with a section of every type, after the
            // blocks, sliders and forms it points at. Create-only.
            SampleBuilderPageSeeder::class,
            // Three placeholder events — a seminar, a webinar and a trade
            // show — dated from today. Created only while there are none.
            SampleEventSeeder::class,
            // Three shelves and three placeholder files for the downloads
            // centre, after the products they are attached to. Created only
            // while there are none.
            SampleDownloadSeeder::class,
            // One placeholder YouTube video on each of the first three shop
            // products, for the "shop the videos" row. Created only while no
            // shop product carries a video.
            SampleProductVideoSeeder::class,
            // A worked support desk: a portal login, tickets across every
            // status and a couple of enquiries.
            DemoSupportSeeder::class,
        ]);
    }
}
