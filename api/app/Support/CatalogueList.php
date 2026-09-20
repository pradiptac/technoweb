<?php

namespace App\Support;

use App\Enums\MenuItemType;
use App\Enums\PublishStatus;
use App\Models\Industry;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;

/**
 * A menu item that is a *live list* of the catalogue.
 *
 * The seeded footer used to copy the solutions, the product categories and
 * the services into the menu as rows — seven each, "the generated columns,
 * frozen into a list" — so from the moment a footer menu was assigned, a
 * newly published solution appeared everywhere on the site except the
 * footer. A menu is a written list, and a catalogue outgrows a written list
 * the first time somebody publishes something.
 *
 * So a `catalogue` item stores a key and nothing else, and `MenuTree` expands
 * it at render into whatever is published and ticked for the menu *now*: the
 * same query the mega menu's `?in_menu=1` runs, so the header and the footer
 * cannot disagree about which solutions exist. The item's own label is the
 * column heading; its href is the index page, so the heading is a link where
 * the footer draws one. An editor still decides *whether* a column is live —
 * a hand-picked list of seven records is as valid as it ever was, and the
 * rebuild now writes live columns because the client asked why the footer
 * lagged the catalogue.
 *
 * Same shape as `SiteSection`: an allowlist keyed by a string the console
 * offers from `meta.catalogues`, never a class name or a query on the wire.
 */
class CatalogueList
{
    /** @var array<string, array{label: string, path: string, type: MenuItemType}> */
    private const LISTS = [
        'solutions' => ['label' => 'Solutions', 'path' => '/solutions', 'type' => MenuItemType::Solution],
        'services' => ['label' => 'Services', 'path' => '/services', 'type' => MenuItemType::Service],
        'industries' => ['label' => 'Industries', 'path' => '/industries', 'type' => MenuItemType::Industry],
        'product_categories' => ['label' => 'Product categories', 'path' => '/products', 'type' => MenuItemType::ProductCategory],
    ];

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_keys(self::LISTS);
    }

    public static function exists(string $key): bool
    {
        return isset(self::LISTS[$key]);
    }

    /** The index page the heading links to, or null for a key no longer listed. */
    public static function path(string $key): ?string
    {
        return self::LISTS[$key]['path'] ?? null;
    }

    public static function label(string $key): ?string
    {
        return self::LISTS[$key]['label'] ?? null;
    }

    /**
     * The list as it stands: published (where the model has a status) and
     * `show_in_menu`, in the catalogue's own order. Top-level categories only,
     * the way the mega menu and the category index read them.
     *
     * @return array<int, array{label: string, href: string, icon: ?string, description: ?string}>
     */
    public static function items(string $key): array
    {
        $list = self::LISTS[$key] ?? null;
        if ($list === null) {
            return [];
        }

        $type = $list['type'];
        $query = match ($type) {
            MenuItemType::Solution => Solution::query()->where('status', PublishStatus::Published),
            MenuItemType::Service => Service::query()->where('status', PublishStatus::Published),
            MenuItemType::Industry => Industry::query(),
            // The one list of the four where nesting exists: top-level only,
            // the way the mega menu and the category index read it.
            MenuItemType::ProductCategory => ProductCategory::query()->whereNull('parent_id'),
        };

        $column = $type->titleColumn();

        return $query
            ->where('show_in_menu', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($record) => [
                'label' => (string) $record->{$column},
                'href' => $type->url($record),
                'icon' => $record->getAttribute('icon'),
                'description' => $record->getAttribute('summary') ?? $record->getAttribute('description'),
            ])
            ->filter(fn ($row) => $row['href'] !== null)
            ->values()
            ->all();
    }

    /**
     * The options the console offers, sent by the API rather than listed in
     * TypeScript — the rule `SiteSection::options()` follows.
     *
     * @return array<int, array{value: string, label: string, path: string}>
     */
    public static function options(): array
    {
        return array_map(
            fn (string $key) => ['value' => $key, 'label' => self::LISTS[$key]['label'], 'path' => self::LISTS[$key]['path']],
            array_keys(self::LISTS),
        );
    }
}
