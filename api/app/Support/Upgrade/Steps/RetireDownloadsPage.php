<?php

namespace App\Support\Upgrade\Steps;

use App\Enums\MenuItemType;
use App\Enums\PublishStatus;
use App\Support\Upgrade\UpgradeStep;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `/downloads` becomes the downloads centre (0.131.0, docs/downloads.md).
 *
 * Until this release that address was a CMS page the installer seeded — a
 * few paragraphs saying where documents could be asked for. The site now
 * has a route of its own there, and Next resolves a route before the page
 * catch-all, so the page would be a row nobody can open: still in the
 * sitemap, still in the SEO overview, at an address that shows something
 * else. Three things, each safe to run twice:
 *
 *   - **Menu items that pointed at the page point at the centre.** They
 *     become `section` items with the key `downloads`, so the footer's
 *     "Downloads" keeps working — and is dropped at render until a download
 *     is published, the rule every list page's link follows.
 *   - **The page keeps its words, as a draft at another address.** Nothing
 *     an editor wrote is deleted; it is renamed `downloads-page` (suffixed
 *     until free) through the query builder, so `Sluggable` writes no 301
 *     from `/downloads` to it.
 *   - **A redirect *from* `/downloads` is removed.** The proxy answers a
 *     redirect before any route, so one left behind would send every
 *     visitor of the centre somewhere else.
 *
 * A fresh install never has the page — `PageSeeder` stopped seeding it in
 * the same release — and is marked as having run this.
 */
final class RetireDownloadsPage implements UpgradeStep
{
    public const SLUG = 'downloads';

    public function id(): string
    {
        return '2026-10-08-retire-downloads-page';
    }

    public function version(): string
    {
        return '0.131.0';
    }

    public function description(): string
    {
        return 'Move the old Downloads page aside for the downloads centre';
    }

    public function run(): void
    {
        if (Schema::hasTable('redirects')) {
            DB::table('redirects')->where('from_path', '/'.self::SLUG)->delete();
        }

        $page = DB::table('pages')->where('slug', self::SLUG)->first(['id']);

        if ($page === null) {
            return;
        }

        DB::table('menu_items')
            ->where('type', MenuItemType::Page->value)
            ->where('target_id', $page->id)
            ->update([
                'type' => MenuItemType::Section->value,
                'target_type' => null,
                'target_id' => null,
                'target_key' => self::SLUG,
                'updated_at' => now(),
            ]);

        $slug = self::SLUG.'-page';
        for ($i = 2; DB::table('pages')->where('slug', $slug)->exists(); $i++) {
            $slug = self::SLUG.'-page-'.$i;
        }

        DB::table('pages')->where('id', $page->id)->update([
            'slug' => $slug,
            'status' => PublishStatus::Draft->value,
            'updated_at' => now(),
        ]);
    }
}
