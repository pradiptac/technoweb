<?php

namespace Tests\Feature;

use App\Support\ReservedSlugs;
use Tests\TestCase;

/**
 * Every top-level route of the Next application is reserved against a
 * custom content type's slug.
 *
 * `ReservedSlugs` is a hand-written list of what the frontend's app directory
 * holds, and a hand-written list on one side of the wire is this project's
 * most repeated bug. So this reads the directory: a route added to the site
 * and not to the list fails here, on the commit that adds it — the moment
 * the fix is one line. Route groups (`(marketing)`), dynamic segments
 * (`[slug]`) and the layout files are not addresses and are skipped.
 */
class ReservedSlugsTest extends TestCase
{
    /** @return array<int, string> */
    private function frontendSegments(): array
    {
        $root = base_path('../web/src/app');
        $this->assertDirectoryExists($root, 'The frontend moved; this test needs its new path.');

        $segments = [];

        foreach ([$root, $root.'/(marketing)'] as $dir) {
            foreach (scandir($dir) ?: [] as $name) {
                if ($name === '.' || $name === '..' || str_starts_with($name, '(') || str_starts_with($name, '[')) {
                    continue;
                }

                $path = $dir.'/'.$name;

                if (is_dir($path)) {
                    $segments[] = $name;

                    continue;
                }

                // Files Next serves at the root: `robots.ts` is /robots.txt,
                // `sitemap.ts` /sitemap.xml, `opengraph-image.tsx` its own path.
                $segments[] = match (true) {
                    $name === 'robots.ts' => 'robots.txt',
                    $name === 'sitemap.ts' => 'sitemap.xml',
                    str_starts_with($name, 'opengraph-image') => 'opengraph-image',
                    $name === 'favicon.ico' => 'favicon.ico',
                    default => '',
                };
            }
        }

        return array_values(array_filter(array_unique($segments)));
    }

    public function test_every_frontend_route_is_reserved(): void
    {
        $segments = $this->frontendSegments();
        $this->assertGreaterThan(20, count($segments), 'Almost nothing was read from the app directory, so this proves nothing.');

        $missing = array_values(array_filter($segments, fn ($s) => ! ReservedSlugs::reserved($s)));

        $this->assertSame([], $missing, 'Top-level routes a content type could claim: '.implode(', ', $missing)
            .'. Add them to App\Support\ReservedSlugs.');
    }

    public function test_the_check_is_case_insensitive(): void
    {
        $this->assertTrue(ReservedSlugs::reserved('Blog'));
        // Taken by the events module (0.118.0), in either case.
        $this->assertTrue(ReservedSlugs::reserved('Events'));
        $this->assertFalse(ReservedSlugs::reserved('gatherings'));
    }
}
