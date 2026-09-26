<?php

namespace App\Support\WordPress\Steps;

use App\Http\Requests\MenuRequest;
use App\Models\BlogCategory;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Support\LinkPattern;
use App\Support\WordPress\Context;
use App\Support\WordPress\Harvest;
use App\Support\WordPress\Outcome;
use Illuminate\Support\Str;

/**
 * WordPress menus (WordPress 5.9+ exposes them to an authenticated caller),
 * as menus here — **unassigned**, always. Assigning one to the header is a
 * decision about the live navigation, made on the menus screen by a person,
 * not a side effect of an import.
 *
 * An item pointing at a page, a post or an entry that was imported becomes a
 * record reference, so it follows a later slug change the way every menu
 * item here does. One pointing at a shop product or category, or a blog
 * category, becomes a path (there is no menu type for those). A custom link
 * to the old site is turned into this site's path when the page it names was
 * imported, and kept as a path otherwise; a link elsewhere is kept as it is.
 * Menus nest three deep here; a deeper item is lifted to the third level.
 * A second run rebuilds the menu's items wholesale, the way the builder
 * saves them.
 */
class MenusStep extends Step
{
    public function key(): string
    {
        return 'menus';
    }

    public function label(): string
    {
        return 'Menus';
    }

    public function section(): string
    {
        return 'content';
    }

    public function mapType(): ?string
    {
        return 'menu';
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $name = self::raw($record['name'] ?? '') ?: 'Menu';
        $items = $this->items($ctx, (int) $record['id']);

        if ($items === []) {
            return Outcome::skip($name, 'Has no items.');
        }

        $existing = $ctx->map->targetId('menu', $record['id']);
        $outcome = Outcome::upsert($existing !== null, $name.' — '.count($items).' items', ['existing' => $existing, 'name' => $name]);

        if (collect($items)->contains(fn ($item) => $this->depth($ctx, $item) > MenuRequest::MAX_DEPTH)) {
            $outcome->warn('Nested deeper than three levels; the deepest items are lifted to the third.');
        }

        return $outcome;
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $menu = $outcome->data['existing'] ? Menu::query()->find($outcome->data['existing']) : null;
        $menu ??= Menu::query()->create(['name' => Str::limit($outcome->data['name'], 120, ''), 'location' => null]);
        $menu->items()->delete();

        $written = [];

        foreach ($this->ordered($ctx, (int) $record['id']) as $i => $item) {
            $parent = $this->writtenParent($ctx, $item, $written);
            $values = $this->target($ctx, $item);

            if ($values === null) {
                continue;
            }

            $written[(int) $item['id']] = MenuItem::query()->create($values + [
                'menu_id' => $menu->id,
                'parent_id' => $parent,
                'label' => Str::limit(self::raw($item['title'] ?? '') ?: 'Link', 120, ''),
                'open_in_new_tab' => ($item['target'] ?? '') === '_blank',
                'is_active' => true,
                'sort_order' => (int) ($item['menu_order'] ?? $i),
            ])->id;
        }

        $ctx->map->put('menu', $record['id'], $menu);
    }

    /**
     * What an item points at here: a record reference, or a path or URL.
     *
     * @return ?array<string, mixed>
     */
    private function target(Context $ctx, array $item): ?array
    {
        $object = (string) ($item['object'] ?? '');
        $objectId = (int) ($item['object_id'] ?? 0);

        $reference = match ($item['type'] ?? '') {
            'post_type' => match (true) {
                $object === 'page' => ['page', $ctx->map->targetId('page', $objectId)],
                $object === 'post' => ['blog_post', $ctx->map->targetId('post', $objectId)],
                $object === 'product' => ['path', ($p = $ctx->map->model('product', $objectId, StoreProduct::class)) ? $p->publicPath() : null],
                default => ['entry', $ctx->map->targetId('entry', $objectId)],
            },
            'taxonomy' => match ($object) {
                'category' => ['path', ($c = $ctx->map->model('category', $objectId, BlogCategory::class)) ? $c->publicPath() : null],
                'product_cat' => ['path', ($c = $ctx->map->model('product_cat', $objectId, StoreCategory::class)) ? $c->publicPath() : null],
                default => ['path', null],
            },
            'post_type_archive' => ['path', $object === 'product' ? '/store' : null],
            default => ['path', null],
        };

        [$kind, $value] = $reference;

        if ($kind !== 'path' && $value !== null) {
            return ['type' => $kind, 'target_type' => $kind, 'target_id' => $value, 'url' => null];
        }

        $url = is_string($value) ? $value : $this->customUrl($ctx, (string) ($item['url'] ?? ''));

        return $url === null ? null : ['type' => 'custom', 'target_type' => null, 'target_id' => null, 'url' => $url];
    }

    /** A custom link made this site's where it pointed at the old one. */
    private function customUrl(Context $ctx, string $url): ?string
    {
        $url = trim($url);

        if ($url === '' || $url === '#') {
            return null;
        }

        $site = (string) parse_url((string) ($ctx->site()['url'] ?? $ctx->import->site_url), PHP_URL_HOST);
        $host = (string) parse_url($url, PHP_URL_HOST);

        if ($host !== '' && strcasecmp(preg_replace('/^www\./i', '', $host), preg_replace('/^www\./i', '', $site)) === 0) {
            $path = '/'.trim((string) parse_url($url, PHP_URL_PATH), '/');
            $url = $path === '/' ? '/' : $path;
        }

        return preg_match(LinkPattern::REGEX, $url) ? Str::limit($url, 250, '') : null;
    }

    /** @return list<array<string, mixed>> a menu's items, parents before children */
    private function ordered(Context $ctx, int $menu): array
    {
        $items = $this->items($ctx, $menu);
        usort($items, fn ($a, $b) => [$this->depth($ctx, $a), $a['menu_order'] ?? 0] <=> [$this->depth($ctx, $b), $b['menu_order'] ?? 0]);

        return $items;
    }

    /** @return list<array<string, mixed>> */
    private function items(Context $ctx, int $menu): array
    {
        return array_values(array_filter(
            $ctx->memo('menu-items', fn () => Harvest::all($ctx->import, 'menu_items')),
            fn ($item) => (int) ($item['menus'] ?? 0) === $menu && ($item['status'] ?? 'publish') === 'publish',
        ));
    }

    private function depth(Context $ctx, array $item): int
    {
        $depth = 1;
        $parent = (int) ($item['parent'] ?? 0);

        while ($parent !== 0 && $depth < 20) {
            $depth++;
            $parent = (int) ($ctx->record('menu_items', $parent)['parent'] ?? 0);
        }

        return $depth;
    }

    /** @param  array<int, int>  $written */
    private function writtenParent(Context $ctx, array $item, array $written): ?int
    {
        $parent = (int) ($item['parent'] ?? 0);

        // Lift anything below the third level to hang off its third-level ancestor.
        while ($parent !== 0 && $this->depth($ctx, $ctx->record('menu_items', $parent) ?? []) >= MenuRequest::MAX_DEPTH) {
            $parent = (int) ($ctx->record('menu_items', $parent)['parent'] ?? 0);
        }

        return $parent === 0 ? null : ($written[$parent] ?? null);
    }
}
