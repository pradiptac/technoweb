<?php

namespace App\Support\PageSections;

use App\Models\Media;
use App\Support\MediaMeta;
use App\Support\MediaUrl;

/**
 * A layout section as the public site reads it (0.147.0).
 *
 * Stored rows, columns and widgets go out as they are — defaults still absent,
 * the website applies them — with three changes, and each is the point:
 *
 * - **A picture's path becomes what a picture is**: `image`, `image_alt`,
 *   `image_focus`, `image_blur`, the keys `SectionPresenter::picture()` gives
 *   every other section. The path is not sent.
 * - **Nothing is drawn empty.** A widget whose picture has since left the
 *   library, a text with no text, a list with nothing in it is dropped; a
 *   column with no widgets, a row with no columns and a section with no rows
 *   follow — the rule an empty `cards` list already follows.
 * - **One lookup for every picture** in the section, not one per widget.
 *   `MediaMeta` memoises its map, so alt text, focal point and blur cost
 *   nothing more.
 */
final class LayoutPresenter
{
    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>|null null drops the section
     */
    public static function present(array $data): ?array
    {
        $rows = array_values(array_filter((array) ($data['rows'] ?? []), 'is_array'));

        $paths = [];
        foreach ($rows as $row) {
            foreach ((array) ($row['columns'] ?? []) as $column) {
                foreach ((array) (is_array($column) ? ($column['widgets'] ?? []) : []) as $widget) {
                    if (is_array($widget) && is_string($widget['image_path'] ?? null) && $widget['image_path'] !== '') {
                        $paths[] = $widget['image_path'];
                    }
                }
            }
        }
        $present = $paths === [] ? [] : Media::query()->whereIn('path', array_unique($paths))->pluck('path')->flip()->all();

        $outRows = [];
        foreach ($rows as $row) {
            $columns = [];
            foreach (array_values(array_filter((array) ($row['columns'] ?? []), 'is_array')) as $column) {
                $widgets = [];
                foreach (array_values(array_filter((array) ($column['widgets'] ?? []), 'is_array')) as $widget) {
                    if (($shown = self::widget($widget, $present)) !== null) {
                        $widgets[] = $shown;
                    }
                }
                if ($widgets !== []) {
                    $columns[] = [...$column, 'widgets' => $widgets];
                }
            }
            if ($columns !== []) {
                $outRows[] = [...$row, 'columns' => $columns];
            }
        }

        if ($outRows === []) {
            return null;
        }

        return [...array_intersect_key($data, array_flip(LayoutRules::HEAD)), 'rows' => $outRows];
    }

    /**
     * @param  array<string, mixed>  $widget
     * @param  array<string, int>  $present  library paths that exist, as keys
     * @return array<string, mixed>|null
     */
    private static function widget(array $widget, array $present): ?array
    {
        switch ($widget['type'] ?? null) {
            case 'image':
                $path = $widget['image_path'] ?? null;
                if (! is_string($path) || ! array_key_exists($path, $present)) {
                    return null;
                }
                unset($widget['image_path']);

                return [
                    ...$widget,
                    'image' => MediaUrl::for($path),
                    'image_alt' => MediaMeta::alt($path) ?? '',
                    'image_focus' => MediaMeta::focus($path),
                    'image_blur' => MediaMeta::blur($path),
                ];
            case 'heading':
                return filled($widget['text'] ?? null) ? $widget : null;
            case 'text':
                return filled($widget['html'] ?? null) ? $widget : null;
            case 'button':
                return filled($widget['label'] ?? null) && filled($widget['href'] ?? null) ? $widget : null;
            case 'icon_box':
                return filled($widget['title'] ?? null) ? $widget : null;
            case 'accordion':
            case 'list':
                return ! empty($widget['items']) ? $widget : null;
            case 'spacer':
            case 'divider':
                return $widget;
            default:
                return null;
        }
    }
}
