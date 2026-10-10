<?php

namespace App\Support\PageSections;

use App\Enums\PublishStatus;
use App\Models\Form;
use App\Models\Gallery;
use App\Models\Media;
use App\Models\Slider;
use App\Support\MediaMeta;
use App\Support\MediaUrl;
use App\Support\YouTube;
use Illuminate\Database\Eloquent\Model;

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
    /** The id field each record widget carries. */
    private const RECORDS = ['form' => 'form_id', 'slider' => 'slider_id', 'gallery' => 'gallery_id'];

    /** @var array<string, class-string<Model>> */
    private const MODELS = ['form' => Form::class, 'slider' => Slider::class, 'gallery' => Gallery::class];

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>|null null drops the section
     */
    public static function present(array $data): ?array
    {
        $rows = array_values(array_filter((array) ($data['rows'] ?? []), 'is_array'));

        $paths = [];
        $ids = [];
        foreach ($rows as $row) {
            foreach ((array) ($row['columns'] ?? []) as $column) {
                foreach ((array) (is_array($column) ? ($column['widgets'] ?? []) : []) as $widget) {
                    if (! is_array($widget)) {
                        continue;
                    }
                    foreach (['image_path', 'poster_path', 'video_path'] as $key) {
                        if (is_string($widget[$key] ?? null) && $widget[$key] !== '') {
                            $paths[] = $widget[$key];
                        }
                    }
                    foreach (self::RECORDS as $type => $key) {
                        if (($widget['type'] ?? null) === $type && is_numeric($widget[$key] ?? null)) {
                            $ids[$type][] = (int) $widget[$key];
                        }
                    }
                }
            }
        }
        $present = $paths === [] ? [] : Media::query()->whereIn('path', array_unique($paths))->pluck('path')->flip()->all();

        // The slug of each published form, slider and gallery named, one query a kind.
        $slugs = [];
        foreach ($ids as $type => $list) {
            $slugs[$type] = self::MODELS[$type]::query()
                ->where('status', PublishStatus::Published)
                ->whereIn('id', array_unique($list))
                ->pluck('slug', 'id')->all();
        }

        $outRows = [];
        foreach ($rows as $row) {
            $columns = [];
            foreach (array_values(array_filter((array) ($row['columns'] ?? []), 'is_array')) as $column) {
                $widgets = [];
                foreach (array_values(array_filter((array) ($column['widgets'] ?? []), 'is_array')) as $widget) {
                    if (($shown = self::widget($widget, $present, $slugs)) !== null) {
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
     * @param  array<string, array<int, string>>  $slugs  the published records named, by kind then id
     * @return array<string, mixed>|null
     */
    private static function widget(array $widget, array $present, array $slugs = []): ?array
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
            case 'video':
                return self::video($widget, $present);
            case 'form':
            case 'slider':
            case 'gallery':
                $key = self::RECORDS[$widget['type']];
                $slug = $slugs[$widget['type']][(int) ($widget[$key] ?? 0)] ?? null;
                if ($slug === null) {
                    return null;
                }
                unset($widget[$key]);

                return [...$widget, 'slug' => $slug];
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

    /**
     * A video widget: a YouTube id the website opens only on a press, or a
     * library file with its cover. Gone when the link no longer parses or the
     * file has left the library; a missing cover is just no cover.
     *
     * @param  array<string, mixed>  $widget
     * @param  array<string, int>  $present
     * @return array<string, mixed>|null
     */
    private static function video(array $widget, array $present): ?array
    {
        $source = $widget['source'] ?? 'youtube';
        $poster = $widget['poster_path'] ?? null;
        $out = $widget;
        unset($out['poster_path'], $out['video_path'], $out['youtube']);

        if ($source === 'mp4') {
            $path = $widget['video_path'] ?? null;
            if (! is_string($path) || ! array_key_exists($path, $present)) {
                return null;
            }
            $out['video'] = MediaUrl::for($path);
        } else {
            $id = is_string($widget['youtube'] ?? null) ? YouTube::id($widget['youtube']) : null;
            if ($id === null) {
                return null;
            }
            $out['youtube'] = $id;
        }

        if (is_string($poster) && array_key_exists($poster, $present)) {
            $out['poster'] = MediaUrl::for($poster);
            $out['poster_alt'] = MediaMeta::alt($poster) ?? '';
        }

        return $out;
    }
}
