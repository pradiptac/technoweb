<?php

namespace Tests\Feature;

use App\Models\Setting;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Every settings group is drawn on exactly one console screen.
 *
 * The settings rows are edited on ten screens since 2026-09-20 — System →
 * Settings for what the whole console shares, and a "Settings" row at the
 * end of every module's sidebar section for what that module owns — and
 * which screen draws which group is `SCREENS` in the console's
 * `settings-copy.ts`. That list and the seeder are two hand-written lists on
 * opposite sides of the wire, which is the drift this project keeps being
 * caught by: a group the seeder adds and no screen names would fall into an
 * "Other" tab under its raw key; a group named on two screens would be saved
 * from whichever was opened last. Nothing else checks this, so this does —
 * by reading the file, the way `AdminNavRolesTest` reads the sidebar.
 */
class SettingsScreensTest extends TestCase
{
    use RefreshDatabase;

    private function source(string $relative): string
    {
        $file = base_path('../web/src/app/admin/(app)/'.$relative);
        $this->assertFileExists($file, "{$relative} moved; this test needs its new path.");

        return file_get_contents($file);
    }

    /** @return array<string, string[]> screen path => the groups it draws */
    private function screens(): array
    {
        $source = $this->source('settings/settings-copy.ts');
        $start = strpos($source, 'export const SCREENS');
        $end = strpos($source, 'export const ORDER', $start);
        $this->assertNotFalse($start, 'SCREENS is not in settings-copy.ts any more.');
        $block = substr($source, $start, $end - $start);

        // Each screen opens with its `path:` line and lists its `groups: [...]`
        // lines beneath it, one per section; the next `path:` starts the next
        // screen. Both are kept on one line for exactly this reason.
        $screens = [];
        $current = null;

        foreach (preg_split('/\R/', $block) as $line) {
            if (preg_match('/^\s*path:\s*"([^"]+)"/', $line, $m)) {
                $current = $m[1];
                $screens[$current] = [];
            } elseif ($current !== null && preg_match('/groups:\s*\[([^\]]*)\]/', $line, $m)) {
                preg_match_all('/"([a-z0-9_]+)"/', $m[1], $g);
                $screens[$current] = [...$screens[$current], ...$g[1]];
            }
        }

        $this->assertNotEmpty($screens, 'No screens were parsed — the shape of SCREENS changed.');

        return $screens;
    }

    /** @return string[] */
    private function standalone(): array
    {
        preg_match('/STANDALONE_GROUPS = new Set\(\[([^\]]*)\]\)/', $this->source('settings/settings-copy.ts'), $m);
        $this->assertNotEmpty($m, 'STANDALONE_GROUPS is not in settings-copy.ts any more.');
        preg_match_all('/"([a-z0-9_]+)"/', $m[1], $g);

        return $g[1];
    }

    public function test_every_seeded_group_is_drawn_on_exactly_one_screen(): void
    {
        $this->seed(SettingsSeeder::class);

        $seeded = Setting::query()->distinct()->pluck('group')->sort()->values()->all();
        $screens = $this->screens();
        $standalone = $this->standalone();

        $where = [];
        foreach ($screens as $path => $groups) {
            foreach ($groups as $group) {
                $where[$group][] = $path;
            }
        }

        foreach ($seeded as $group) {
            if (in_array($group, $standalone, true)) {
                $this->assertArrayNotHasKey($group, $where, "'{$group}' has a screen of its own and is also drawn on a settings screen.");

                continue;
            }

            $this->assertArrayHasKey(
                $group,
                $where,
                "The seeder creates the '{$group}' settings group and no screen in SCREENS draws it — "
                .'it would render under "Other" on System → Settings with its raw key as the tab.',
            );
            $this->assertCount(1, $where[$group], "'{$group}' is drawn on more than one screen: ".implode(', ', $where[$group]));
        }

        foreach ($where as $group => $paths) {
            $this->assertContains($group, $seeded, "SCREENS names a '{$group}' group that the seeder never creates — a typo, or a group that was removed.");
        }

        foreach ($standalone as $group) {
            $this->assertContains($group, $seeded, "STANDALONE_GROUPS names '{$group}', which the seeder never creates.");
        }
    }

    /** A screen the sidebar does not name is one nobody can reach, and the role gate reads the sidebar. */
    public function test_every_screen_is_an_admin_row_in_the_sidebar_with_a_page(): void
    {
        $nav = $this->source('nav-items.tsx');

        foreach (array_keys($this->screens()) as $path) {
            $this->assertMatchesRegularExpression(
                '/\{[^{}]*role:\s*"admin"[^{}]*href:\s*"'.preg_quote($path, '/').'"[^{}]*\}/',
                $nav,
                "{$path} is a settings screen with no role:\"admin\" row in the sidebar.",
            );

            $page = base_path('../web/src/app/admin/(app)'.substr($path, strlen('/admin')).'/page.tsx');
            $this->assertFileExists($page, "{$path} is listed in SCREENS and has no page.tsx.");
        }
    }
}
