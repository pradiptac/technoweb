<?php

namespace App\Console\Commands;

use App\Models\BlogPost;
use App\Models\Product;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use Illuminate\Console\Command;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Query count and wall time for every public endpoint the site renders from.
 *
 *   php artisan technoware:profile
 *   php artisan technoware:profile --json
 *   php artisan technoware:profile --endpoint=/settings --endpoint=/search?q=switch
 *
 * The frontend ISR-caches nearly everything it reads, which means a slow
 * endpoint is paid once per revalidation rather than once per visitor — and
 * is therefore invisible from the browser. This is the ruler for the other
 * half: each request is pushed through the HTTP kernel in-process with the
 * query log on, and reported as status, how many queries it ran, how long the
 * database spent, and the wall time of the whole handle.
 *
 * **What it does not measure is the boot.** Providers have already booted by
 * the time this command runs, so a service provider that queries the database
 * on every request (`MailSettingsProvider` reading settings at boot, say)
 * costs nothing here and something on every real request. Measure that
 * separately, from outside:
 *
 *   curl -w '%{time_starttransfer}\n' -o /dev/null -s http://127.0.0.1:8000/api/v1/
 *
 * Slugs are read from the database rather than hard-coded, because they come
 * from the seeder and change with every `migrate:fresh` — the reason
 * `audit.mjs` discovers its detail routes instead of naming them.
 *
 * It is a ruler, not a gate: it exits 0 whatever it finds. Turn a figure into
 * a gate once there is a baseline to gate against.
 */
class ProfilePublicEndpoints extends Command
{
    protected $signature = 'technoware:profile
        {--json : Print the results as JSON rather than a table}
        {--endpoint=* : Only these paths (relative to /api/v1)}';

    protected $description = 'Report query count and time for the public API endpoints';

    public function handle(Kernel $kernel): int
    {
        $paths = $this->option('endpoint') ?: $this->defaultPaths();
        $rows = [];

        foreach ($paths as $path) {
            $rows[] = $this->profile($kernel, $path);
        }

        if ($this->option('json')) {
            $this->line(json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            return self::SUCCESS;
        }

        $this->table(
            ['Endpoint', 'Status', 'Queries', 'SQL ms', 'Wall ms'],
            array_map(fn (array $r) => [
                $r['path'], $r['status'], $r['queries'], $r['sql_ms'], $r['wall_ms'],
            ], $rows),
        );

        $this->line('Boot is outside these figures; see the docblock.');

        return self::SUCCESS;
    }

    /** @return array{path: string, status: int, queries: int, sql_ms: float, wall_ms: float} */
    private function profile(Kernel $kernel, string $path): array
    {
        $request = Request::create('/api/v1'.$path, 'GET', server: ['HTTP_ACCEPT' => 'application/json']);

        DB::flushQueryLog();
        DB::enableQueryLog();

        $started = hrtime(true);
        $response = $kernel->handle($request);
        $wall = (hrtime(true) - $started) / 1e6;

        $log = DB::getQueryLog();
        DB::disableQueryLog();

        // A request leaves state behind — memoised settings, a resolved
        // route — that the next one must not inherit or the second endpoint
        // measures cheaper than it is.
        $kernel->terminate($request, $response);

        return [
            'path' => $path,
            'status' => $response->getStatusCode(),
            'queries' => count($log),
            'sql_ms' => round(array_sum(array_column($log, 'time')), 1),
            'wall_ms' => round($wall, 1),
        ];
    }

    /** @return list<string> */
    private function defaultPaths(): array
    {
        $product = Product::query()->where('status', 'published')->value('slug');
        $post = BlogPost::query()->where('status', 'published')->value('slug');
        $storeProduct = StoreProduct::query()->where('status', 'published')->value('slug');
        $storeCategory = StoreCategory::query()->value('slug');

        return array_values(array_filter([
            '/settings',
            '/menus/primary',
            '/menus/footer',
            '/popups',
            '/solutions?in_menu=1',
            '/product-categories?in_menu=1',
            '/solutions',
            '/solutions/networking',
            '/products',
            '/products?q=switch',
            '/product-categories/switches',
            $product ? "/products/{$product}" : null,
            '/brands',
            '/blog',
            '/blog/taxonomy',
            $post ? "/blog/{$post}" : null,
            '/case-studies',
            '/knowledge-base',
            '/pages',
            '/team',
            '/clients',
            '/certifications',
            '/careers',
            '/landing-pages',
            '/store/products',
            '/store/categories',
            $storeProduct ? "/store/products/{$storeProduct}" : null,
            $storeCategory ? "/store/categories/{$storeCategory}" : null,
            '/search?q=switch',
            '/sliders/homepage-hero',
            '/redirects/lookup?path=/solutions/nothing-here',
        ]));
    }
}
