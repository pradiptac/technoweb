<?php

namespace App\Support\WordPress;

use App\Models\WordPressImport;
use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * Reads a site into a `Harvest`, a slice at a time.
 *
 * The first slice discovers the site — its API root, which namespaces it
 * speaks (is WooCommerce there? ACF? Yoast?), WooCommerce's currency, weight
 * unit and tax basis — and writes the task list for the sections asked for.
 * Every slice then works through tasks one page at a time until the budget
 * runs out, and returns `PAUSED` for the job to queue the next slice, or
 * `DONE`.
 *
 * Two collections spawn tasks as they are read, because the site offers no
 * way to fetch them in bulk: a **variable product's variations** and an
 * **order's notes**. Each becomes its own task with the parent's id carried
 * on it and stamped onto every record as `_parent`, since neither endpoint
 * says which parent a record belongs to in a form worth trusting.
 *
 * An **optional** endpoint that answers 401/403/404 is recorded in
 * `missing` with the reason and skipped — a site without WooCommerce Brands,
 * or an application password whose user cannot read menus, is a narrower
 * import, not a failed one. A required endpoint failing fails the scan in the
 * site's own words.
 */
class Scanner
{
    public const PAUSED = 'paused';

    public const DONE = 'done';

    public function run(Client $client, Harvest $harvest, WordPressImport $import, CarbonImmutable $deadline): string
    {
        if ($harvest->site === []) {
            $this->discover($client, $harvest, $import);
        } else {
            $client->useRoot((string) $harvest->site['root']);
        }

        // A `for` rather than `foreach`: reading products and orders appends
        // tasks, and `foreach` walks a copy taken before they existed.
        for ($i = 0; $i < count($harvest->tasks); $i++) {
            while (! $harvest->tasks[$i]['done']) {
                if (CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                    return self::PAUSED;
                }

                $this->step($client, $harvest, $import, $i);
            }
        }

        return self::DONE;
    }

    private function step(Client $client, Harvest $harvest, WordPressImport $import, int $i): void
    {
        $task = $harvest->tasks[$i];
        $harvest->requests++;

        try {
            $result = $client->page($task['route'], $task['query'], $task['page']);
        } catch (RuntimeException $e) {
            if (! $task['optional']) {
                throw $e;
            }

            $harvest->missing[$task['key']] = $e->getMessage();
            $harvest->tasks[$i]['done'] = true;

            return;
        }

        $items = $result['items'];

        if (isset($task['parent'])) {
            $items = array_map(fn (array $item) => $item + ['_parent' => $task['parent']], $items);
        }

        $harvest->append($import, $task['key'], $items);

        // Summed, because two tasks can fill one collection (approved and held comments).
        if ($task['page'] === 1 && ! isset($task['parent'])) {
            $harvest->totals[$task['key']] = ($harvest->totals[$task['key']] ?? 0) + $result['total'];
        }

        $this->spawn($harvest, $task['key'], $items);

        $harvest->tasks[$i]['pages'] = $result['total_pages'];

        if ($items === [] || $task['page'] >= $result['total_pages']) {
            $harvest->tasks[$i]['done'] = true;
        } else {
            $harvest->tasks[$i]['page']++;
        }
    }

    /** @param  list<array<string, mixed>>  $items */
    private function spawn(Harvest $harvest, string $collection, array $items): void
    {
        foreach ($items as $item) {
            $id = $item['id'] ?? null;

            if (! is_int($id)) {
                continue;
            }

            if ($collection === 'products' && ($item['type'] ?? null) === 'variable') {
                $harvest->tasks[] = self::task('variations', "wc/v3/products/{$id}/variations", [], optional: true, parent: $id);
            }

            if ($collection === 'orders') {
                $harvest->tasks[] = self::task('order_notes', "wc/v3/orders/{$id}/notes", [], optional: true, parent: $id);
            }
        }
    }

    private function discover(Client $client, Harvest $harvest, WordPressImport $import): void
    {
        $index = $client->discover();
        $namespaces = $index['namespaces'];
        $woo = in_array('wc/v3', $namespaces, true);

        $harvest->site = $index + [
            'woocommerce' => $woo,
            'acf' => (bool) array_filter($namespaces, fn ($n) => str_starts_with($n, 'acf')),
            'yoast' => in_array('yoast/v1', $namespaces, true),
            'rank_math' => (bool) array_filter($namespaces, fn ($n) => str_starts_with($n, 'rankmath')),
            'wc' => [],
            'types' => [],
        ];

        $sections = $import->sections ?? [];

        if ($woo && array_intersect(['catalogue', 'customers'], $sections)) {
            foreach (['general', 'products', 'tax'] as $group) {
                foreach ((array) $client->one("wc/v3/settings/{$group}") as $setting) {
                    if (is_array($setting) && isset($setting['id'])) {
                        $harvest->site['wc'][(string) $setting['id']] = $setting['value'] ?? null;
                    }
                }
            }
        }

        $edit = ['context' => 'edit'];
        $any = ['status' => 'publish,future,draft,pending,private'] + $edit;

        // Media metadata is always read: posts, products and ACF fields all point at attachments by id.
        $tasks = [self::task('media', 'wp/v2/media', $edit)];

        if (in_array('content', $sections, true)) {
            array_push($tasks,
                self::task('users', 'wp/v2/users', $edit, optional: true),
                self::task('categories', 'wp/v2/categories', $edit),
                self::task('tags', 'wp/v2/tags', $edit, optional: true),
                self::task('posts', 'wp/v2/posts', $any),
                self::task('pages', 'wp/v2/pages', $any),
                self::task('comments', 'wp/v2/comments', ['status' => 'approve'] + $edit, optional: true),
                self::task('comments', 'wp/v2/comments', ['status' => 'hold'] + $edit, optional: true),
                self::task('menus', 'wp/v2/menus', $edit, optional: true),
                self::task('menu_items', 'wp/v2/menu-items', $edit, optional: true),
            );
        }

        if (in_array('custom', $sections, true)) {
            $types = (array) $client->one('wp/v2/types', $edit);

            foreach ($types as $slug => $type) {
                $base = is_array($type) ? (string) ($type['rest_base'] ?? '') : '';

                if (! is_array($type) || in_array($slug, self::BUILTIN_TYPES, true) || ! preg_match('/^[a-z0-9_-]+$/', $base)) {
                    continue;
                }

                $harvest->site['types'][(string) $slug] = [
                    'name' => (string) ($type['name'] ?? $slug),
                    'slug' => (string) $slug,
                    'rest_base' => $base,
                    'hierarchical' => (bool) ($type['hierarchical'] ?? false),
                ];
                $tasks[] = self::task('cpt:'.$slug, 'wp/v2/'.$base, $any, optional: true);
            }
        }

        if ($woo && in_array('catalogue', $sections, true)) {
            array_push($tasks,
                self::task('product_categories', 'wc/v3/products/categories', []),
                self::task('brands', 'wc/v3/products/brands', [], optional: true),
                self::task('products', 'wc/v3/products', ['status' => 'any']),
                self::task('reviews', 'wc/v3/products/reviews', ['status' => 'all'], optional: true),
            );
        }

        if ($woo && in_array('customers', $sections, true)) {
            array_push($tasks,
                self::task('customers', 'wc/v3/customers', ['role' => 'all']),
                self::task('coupons', 'wc/v3/coupons', []),
                self::task('orders', 'wc/v3/orders', ['status' => 'any']),
            );
        }

        if (! $woo && array_intersect(['catalogue', 'customers'], $sections)) {
            $harvest->missing['woocommerce'] = 'WooCommerce is not installed on this site, or its REST API is switched off.';
        }

        $harvest->tasks = $tasks;
    }

    /** Post types WordPress itself defines; anything else with a REST base is a custom post type. */
    private const BUILTIN_TYPES = [
        'post', 'page', 'attachment', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part',
        'wp_navigation', 'wp_global_styles', 'wp_font_family', 'wp_font_face', 'product', 'product_variation',
        'shop_order', 'shop_coupon', 'shop_order_refund',
    ];

    /**
     * @param  array<string, scalar>  $query
     * @return array{key: string, route: string, query: array<string, scalar>, page: int, pages: ?int, done: bool, optional: bool, parent?: int}
     */
    private static function task(string $key, string $route, array $query, bool $optional = false, ?int $parent = null): array
    {
        $task = ['key' => $key, 'route' => $route, 'query' => $query, 'page' => 1, 'pages' => null, 'done' => false, 'optional' => $optional];

        if ($parent !== null) {
            $task['parent'] = $parent;
        }

        return $task;
    }
}
