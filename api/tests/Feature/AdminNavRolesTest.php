<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The sidebar's role map against the route table's.
 *
 * The console hides a destination whose role you do not hold, and it decides
 * that from a hand-written map in `admin-nav.tsx`. The gate that actually
 * matters is `EnsureUserHasRole` in `routes/api.php`. **Two hand-written lists
 * on opposite sides of the wire is the drift this project keeps being bitten
 * by** — `admin_path` spelled with the API's resource names, `schema_type_options`
 * duplicated in TypeScript — and here it is silent in both directions: wrong one
 * way it hides a screen somebody is entitled to use, wrong the other it offers a
 * link that 403s.
 *
 * Nothing else checks this, so this does. It is deliberately not clever: it
 * reads the nav, and for every entry whose console path is also an API path it
 * asserts the two agree. The handful whose names differ are listed by hand and
 * named in the failure, because a mapping table would be a third list to drift.
 */
class AdminNavRolesTest extends TestCase
{
    /**
     * Console path => the API prefix it is served by, where they differ.
     *
     * @var array<string, string>
     */
    private const RENAMED = [
        'blog' => 'blog-posts',
        'knowledge-base' => 'knowledge-articles',
        'jobs' => 'job-openings',
        'users' => 'staff',
        'newsletter' => 'newsletter/subscribers',
        'profile' => '',           // every role: no gate to compare against
        'media' => 'media',
    ];

    /** @return array<int, array{path: string, role: ?string}> */
    private function navEntries(): array
    {
        $file = base_path('../web/src/app/admin/(app)/admin-nav.tsx');
        $this->assertFileExists($file, 'The admin nav moved; this test needs its new path.');

        $source = file_get_contents($file);
        $entries = [];

        // Both shapes the file uses: `role: "x", href: "/admin/y"` for nested
        // rows and `href: "...", ... role: "x"` for top-level ones.
        preg_match_all('/\{[^{}]*href:\s*"(\/admin[^"]*)"[^{}]*\}/', $source, $matches, PREG_SET_ORDER);

        foreach ($matches as $m) {
            preg_match('/role:\s*"([a-z_]+)"/', $m[0], $role);
            $entries[] = ['path' => $m[1], 'role' => $role[1] ?? null];
        }

        return $entries;
    }

    /** A typo in a role slug hides a screen from everybody and says nothing. */
    public function test_every_role_named_in_the_sidebar_is_a_real_role(): void
    {
        $valid = array_map(fn (RoleEnum $r) => $r->value, RoleEnum::cases());
        $entries = $this->navEntries();

        $this->assertNotEmpty($entries, 'No nav entries were parsed — the file shape changed.');

        foreach ($entries as $entry) {
            if ($entry['role'] === null) {
                continue;
            }

            $this->assertContains(
                $entry['role'],
                $valid,
                "The sidebar gates {$entry['path']} on '{$entry['role']}', which is not a role.",
            );
        }
    }

    /**
     * What the sidebar claims and what the route requires must be the same.
     *
     * Compared against the real middleware, so moving a route between role
     * groups — exactly what the newsletter needed — fails here until the
     * sidebar is moved with it.
     */
    public function test_the_sidebar_agrees_with_the_route_table(): void
    {
        $gates = [];

        foreach (Route::getRoutes() as $route) {
            foreach ($route->gatherMiddleware() as $middleware) {
                if (is_string($middleware) && str_starts_with($middleware, 'role:')) {
                    $gates[$route->uri()] = substr($middleware, strlen('role:'));
                }
            }
        }

        $checked = 0;

        foreach ($this->navEntries() as $entry) {
            $segment = trim(str_replace('/admin', '', $entry['path']), '/');

            if ($segment === '' || $entry['role'] === null) {
                continue;
            }

            $apiSegment = self::RENAMED[$segment] ?? $segment;

            if ($apiSegment === '') {
                continue;
            }

            $uri = 'api/v1/admin/'.$apiSegment;

            if (! isset($gates[$uri])) {
                continue;
            }

            $checked++;

            $this->assertSame(
                $gates[$uri],
                $entry['role'],
                "The sidebar gates {$entry['path']} on '{$entry['role']}' while {$uri} requires "
                ."'{$gates[$uri]}'. One of the two is wrong, and neither says so at runtime.",
            );
        }

        $this->assertGreaterThan(
            12,
            $checked,
            'Almost nothing was compared, so this test proves nothing — the path shapes changed.',
        );
    }
}
