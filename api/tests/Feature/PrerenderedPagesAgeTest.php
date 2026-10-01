<?php

namespace Tests\Feature;

use App\Support\System\Updater;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * A page the build shipped must not look newer than the server's clock.
 *
 * Next reads a prerendered page's age from its file's modified time, and a
 * purge only expires pages older than itself. A release built in one time
 * zone and unpacked in another put every page hours in the future (a zip
 * stores local time, no zone), so they never went stale and the wizard's
 * purge expired none of them (Plesk, 2026-09-30). `agePrerenderedPages` is
 * what the wizard and the updater run first.
 */
class PrerenderedPagesAgeTest extends TestCase
{
    private string $home;

    protected function setUp(): void
    {
        parent::setUp();
        $this->home = sys_get_temp_dir().'/tw-age-'.bin2hex(random_bytes(4));
        File::ensureDirectoryExists($this->home.'/web/.next/server/app/blog');
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->home);
        parent::tearDown();
    }

    private function page(string $rel, int $mtime): string
    {
        $path = $this->home.'/web/.next/server/app/'.$rel;
        file_put_contents($path, 'x');
        touch($path, $mtime);
        clearstatcache();

        return $path;
    }

    public function test_pages_dated_in_the_future_are_brought_into_the_past(): void
    {
        $future = $this->page('index.html', time() + 4 * 3600);
        $nested = $this->page('blog/index.rsc', time() + 60);

        $this->assertSame(2, Updater::agePrerenderedPages($this->home));

        clearstatcache();
        $this->assertLessThanOrEqual(time() - 119, filemtime($future));
        $this->assertLessThanOrEqual(time() - 119, filemtime($nested));
    }

    public function test_a_page_with_a_real_older_time_is_left_alone(): void
    {
        $old = time() - 3600;
        $path = $this->page('index.html', $old);

        $this->assertSame(0, Updater::agePrerenderedPages($this->home));

        clearstatcache();
        $this->assertSame($old, filemtime($path));
    }

    public function test_a_missing_folder_is_not_an_error(): void
    {
        $this->assertSame(0, Updater::agePrerenderedPages($this->home.'/nowhere'));
    }
}
