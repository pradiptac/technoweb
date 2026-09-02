<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Every route parameter a form request reads must be one a route declares.
 *
 * `$this->route('name')` answers **null** for a parameter that does not exist.
 * It does not warn, it does not throw, and null is a perfectly ordinary value
 * for most of the things these requests do with it — so a misspelling is
 * silent, and stays silent through review, through the type checker, and
 * through a test suite that never happens to exercise the one rule that
 * depended on it.
 *
 * Which is what happened. `Store\ProductRequest` read `store_product` while
 * `routes/api.php` declares `{storeProduct:id}`, so
 * `Rule::unique(...)->ignore(null)` ignored nothing and the uniqueness check
 * counted the record being edited as a conflict with itself: **no store
 * product could be saved unless its slug was also changed**, and the message
 * on screen was "Another store product already uses that slug" on a shop with
 * one product in it. `Store\CategoryRequest` had the same typo.
 *
 * The same shape as `AdminNavRolesTest`, and for the same reason: two
 * hand-written lists on opposite sides of a boundary with nothing comparing
 * them. This compares them.
 */
class RouteParameterNamesTest extends TestCase
{
    /**
     * Every `$this->route('...')` in every form request, with where it is.
     *
     * Read out of the source rather than by reflection, because the call is
     * inside a method body — there is no API that reports "which route
     * parameters does this class ask for". A regex over 60-odd small files is
     * the honest way to answer it, and the failure mode of a regex that misses
     * one is a check that is merely incomplete rather than wrong.
     *
     * @return array<int, array{0: string, 1: string}> [parameter, file]
     */
    private function parametersRequested(): array
    {
        $found = [];

        $directory = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator(app_path('Http/Requests'))
        );

        foreach ($directory as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }

            preg_match_all(
                '/\$this->route\(\s*[\'"]([A-Za-z_][A-Za-z0-9_]*)[\'"]/',
                (string) file_get_contents($file->getPathname()),
                $matches,
            );

            foreach ($matches[1] as $parameter) {
                $found[] = [$parameter, basename($file->getPathname())];
            }
        }

        return $found;
    }

    public function test_every_route_parameter_a_request_reads_actually_exists(): void
    {
        $declared = collect(Route::getRoutes())
            ->flatMap(fn ($route) => $route->parameterNames())
            ->unique()
            ->all();

        $requested = $this->parametersRequested();

        // A regex that matched nothing would make this test pass while
        // checking nothing at all — the failure `RepathsLandingPages` taught,
        // where the trigger was staged by hand and the wiring was never tested.
        $this->assertGreaterThan(15, count($requested), 'The scan found almost no route parameters, which means it is broken rather than that everything is fine.');

        $wrong = [];
        foreach ($requested as [$parameter, $file]) {
            if (! in_array($parameter, $declared, true)) {
                $wrong[] = "{$file} reads \$this->route('{$parameter}'), which no route declares";
            }
        }

        $this->assertSame([], $wrong, implode("\n", $wrong));
    }
}
