<?php

namespace App\Support\SiteImport\Steps;

use App\Models\Menu;
use App\Models\MenuItem;
use App\Support\LinkPattern;
use App\Support\SiteImport\Context;
use App\Support\SiteImport\Paths;
use App\Support\WordPress\Outcome;
use Illuminate\Support\Str;

/**
 * The menus the site's chrome held — the header's and the footer's — as
 * menus here, **unassigned**, always. Assigning one to the header is a
 * decision about the live navigation, made on the menus screen by a person,
 * not a side effect of an import.
 *
 * An item pointing at a page that was imported becomes a record reference, so
 * it follows a later slug change the way every menu item does. Any other link
 * on the old site stays a path; a link elsewhere stays as it is. A dropdown's
 * toggle with nothing to open to is a heading, and one with no items under it
 * is dropped. A second run rebuilds the menu's items wholesale, the way the
 * builder saves them.
 */
class MenusStep extends Step
{
    public const NAMES = ['primary' => 'Header menu', 'footer' => 'Footer menu'];

    public function key(): string
    {
        return 'menus';
    }

    public function label(): string
    {
        return 'Menus';
    }

    public function mapType(): ?string
    {
        return 'menu';
    }

    public function identity(array $record): string
    {
        return (string) $record['id'];
    }

    public function applies(Context $ctx): bool
    {
        return $ctx->import->wants('menus');
    }

    public function records(Context $ctx): iterable
    {
        $chosen = $ctx->decision('menus');
        $menus = (array) (($ctx->site()['menus'] ?? []));
        $out = [];

        foreach (self::NAMES as $key => $name) {
            if (($menus[$key] ?? []) !== [] && ($chosen === null || in_array($key, (array) $chosen, true))) {
                $out[] = ['id' => $key, 'name' => $name, 'items' => $menus[$key]];
            }
        }

        return $out;
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $count = self::count($record['items']);
        $name = self::name($ctx, (string) $record['id']);
        $existing = $ctx->map->targetId('menu', $record['id']);

        return Outcome::upsert($existing !== null, "{$name} — {$count} items", ['existing' => $existing, 'name' => $name]);
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $menu = $outcome->data['existing'] ? Menu::query()->find($outcome->data['existing']) : null;
        $menu ??= Menu::query()->create(['name' => Str::limit($outcome->data['name'], 120, ''), 'location' => null]);
        $menu->items()->delete();

        $this->items($ctx, $menu, $record['items'], null);

        $ctx->map->put('menu', $record['id'], $menu);
    }

    /** The menu's name here: "Header menu — Acme". */
    public static function name(Context $ctx, string $key): string
    {
        $site = (string) ($ctx->site()['name'] ?? Paths::bare($ctx->siteUrl()));

        return Str::limit(self::NAMES[$key].($site !== '' ? ' — '.$site : ''), 120, '');
    }

    /** @param  list<array<string, mixed>>  $items */
    private static function count(array $items): int
    {
        return array_sum(array_map(fn (array $i) => 1 + self::count($i['children'] ?? []), $items));
    }

    /**
     * @param  list<array<string, mixed>>  $items
     */
    private function items(Context $ctx, Menu $menu, array $items, ?int $parent): void
    {
        foreach ($items as $i => $item) {
            $values = $this->target($ctx, $item);

            // A heading with nothing under it, or a link nobody can follow, is not a menu item.
            if ($values === null || ($values['url'] === null && $values['type'] === 'custom' && ($item['children'] ?? []) === [])) {
                continue;
            }

            $made = MenuItem::query()->create($values + [
                'menu_id' => $menu->id,
                'parent_id' => $parent,
                'label' => Str::limit((string) $item['label'], 120, ''),
                'open_in_new_tab' => false,
                'is_active' => true,
                'sort_order' => $i,
            ]);

            $this->items($ctx, $menu, (array) ($item['children'] ?? []), $made->id);
        }
    }

    /**
     * What an item points at here: an imported page, a path, an address — or
     * nothing, for a toggle that is a heading.
     *
     * @param  array<string, mixed>  $item
     * @return ?array<string, mixed>
     */
    private function target(Context $ctx, array $item): ?array
    {
        $href = $item['href'] ?? null;

        if ($href === null) {
            return ['type' => 'custom', 'target_type' => null, 'target_id' => null, 'url' => null];
        }

        if (preg_match('#^https?://#i', $href) && Paths::sameSite($href, $ctx->siteUrl())) {
            $path = Paths::normalise($href);

            // A page, a blog post or a product that was imported: a record reference, so it follows a slug change.
            foreach (['page' => 'page', 'post' => 'blog_post', 'product' => 'product'] as $source => $alias) {
                if (($id = $ctx->map->targetId($source, $path)) !== null) {
                    return ['type' => $alias, 'target_type' => $alias, 'target_id' => $id, 'url' => null];
                }
            }

            // Not imported: its old path, which the redirects cannot answer but a person can see.
            $href = ($path === '/' ? '/' : $path).(($f = parse_url($href, PHP_URL_FRAGMENT)) ? '#'.$f : '');
        }

        $href = Str::limit($href, 250, '');

        return preg_match(LinkPattern::REGEX, $href) ? ['type' => 'custom', 'target_type' => null, 'target_id' => null, 'url' => $href] : null;
    }
}
