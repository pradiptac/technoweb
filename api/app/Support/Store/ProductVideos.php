<?php

namespace App\Support\Store;

use App\Models\Media;
use App\Support\Media\MediaUploader;
use App\Support\YouTube;
use Closure;

/**
 * A store product's videos (2026-09-26): up to four, each a YouTube video or
 * a file from the media library, with an optional title and poster.
 *
 * **A YouTube video is stored as its id, never the link that was pasted.**
 * The id is what reaches an iframe `src`, and an unchecked `src` is another
 * site rendered inside this origin — the reasoning `App\Support\YouTube`
 * gives. So the link is validated through `YouTube::id()` (which refuses
 * `youtube.com.attacker.test` by comparing the host exactly) and only the id
 * it returns is written.
 *
 * **A file is a media-library path, and it must be a video.** An MP4 or WebM
 * the library holds; a path it does not know is a player that never plays,
 * and a PDF offered as a video is a broken box on the product page. The
 * poster is a raster image from the library — the frame shown before play,
 * and the only thumbnail the page ever uses for a YouTube video, since
 * `i.ytimg.com` is never contacted (see `youtube-embed.tsx`).
 */
class ProductVideos
{
    public const MAX = 4;

    /** Pictures a poster may be. Not SVG: a poster is a frame of a video. */
    private const POSTER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    /** @return array<string, mixed> */
    public static function rules(): array
    {
        return [
            'videos' => ['sometimes', 'nullable', 'array', 'max:'.self::MAX],
            'videos.*' => ['array'],
            'videos.*.kind' => ['required', 'in:youtube,file'],
            'videos.*.youtube_id' => [
                'nullable', 'string', 'max:255', 'required_if:videos.*.kind,youtube',
                function (string $attribute, mixed $value, Closure $fail) {
                    if (filled($value) && YouTube::id(is_string($value) ? $value : null) === null) {
                        $fail('That is not a YouTube video link. Paste the address of the video itself — a watch, share or embed link.');
                    }
                },
            ],
            'videos.*.path' => [
                'nullable', 'string', 'max:255', 'required_if:videos.*.kind,file',
                function (string $attribute, mixed $value, Closure $fail) {
                    if (filled($value) && ! self::isLibraryFile((string) $value, MediaUploader::VIDEO_EXTENSIONS)) {
                        $fail('Choose an MP4 or WebM video from the media library.');
                    }
                },
            ],
            'videos.*.title' => ['nullable', 'string', 'max:120'],
            'videos.*.poster_path' => [
                'nullable', 'string', 'max:255',
                function (string $attribute, mixed $value, Closure $fail) {
                    if (filled($value) && ! self::isLibraryFile((string) $value, self::POSTER_EXTENSIONS)) {
                        $fail('The poster has to be a JPEG, PNG, WebP or GIF from the media library.');
                    }
                },
            ],
        ];
    }

    /** @return array<string, string> */
    public static function messages(): array
    {
        return [
            'videos.max' => 'A product can carry up to '.self::MAX.' videos.',
            'videos.*.kind.in' => 'A video is either a YouTube link or a file from the media library.',
            'videos.*.youtube_id.required_if' => 'Paste the YouTube link.',
            'videos.*.path.required_if' => 'Choose the video file.',
        ];
    }

    /**
     * The validated attributes with `videos` in its stored shape: a YouTube
     * link turned into its id, and nothing kept that the kind does not use.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    public static function normaliseAttributes(array $attributes): array
    {
        if (array_key_exists('videos', $attributes)) {
            $attributes['videos'] = self::normalise($attributes['videos']);
        }

        return $attributes;
    }

    /**
     * @return array<int, array{kind: string, youtube_id?: string, path?: string, title: ?string, poster_path: ?string}>|null
     */
    public static function normalise(mixed $videos): ?array
    {
        if (! is_array($videos)) {
            return null;
        }

        $out = [];

        foreach (array_values($videos) as $row) {
            if (! is_array($row)) {
                continue;
            }

            $base = [
                'title' => filled($row['title'] ?? null) ? trim((string) $row['title']) : null,
                'poster_path' => filled($row['poster_path'] ?? null) ? (string) $row['poster_path'] : null,
            ];

            if (($row['kind'] ?? null) === 'youtube') {
                $id = YouTube::id(is_string($row['youtube_id'] ?? null) ? $row['youtube_id'] : null);

                if ($id !== null) {
                    $out[] = ['kind' => 'youtube', 'youtube_id' => $id] + $base;
                }
            } elseif (($row['kind'] ?? null) === 'file' && filled($row['path'] ?? null)) {
                $out[] = ['kind' => 'file', 'path' => (string) $row['path']] + $base;
            }
        }

        return $out === [] ? null : array_slice($out, 0, self::MAX);
    }

    /**
     * What the storefront reads: a YouTube id or a file URL, the title, and
     * the poster as a URL with its alt text.
     *
     * @param  array<int, mixed>|null  $videos
     * @return array<int, array<string, mixed>>
     */
    public static function forPublic(?array $videos): array
    {
        return collect($videos ?? [])
            ->filter(fn ($v) => is_array($v))
            ->map(fn (array $v) => array_filter([
                'kind' => $v['kind'] ?? null,
                'youtube_id' => ($v['kind'] ?? null) === 'youtube' ? ($v['youtube_id'] ?? null) : null,
                'url' => ($v['kind'] ?? null) === 'file' && filled($v['path'] ?? null) ? asset('storage/'.$v['path']) : null,
                'title' => $v['title'] ?? null,
                'poster_url' => filled($v['poster_path'] ?? null) ? asset('storage/'.$v['poster_path']) : null,
            ], fn ($value) => $value !== null))
            ->filter(fn (array $v) => isset($v['youtube_id']) || isset($v['url']))
            ->values()
            ->all();
    }

    /**
     * What the console edits: the stored shape, plus URLs for the previews.
     *
     * @param  array<int, mixed>|null  $videos
     * @return array<int, array<string, mixed>>
     */
    public static function forAdmin(?array $videos): array
    {
        return collect($videos ?? [])
            ->filter(fn ($v) => is_array($v))
            ->map(fn (array $v) => [
                'kind' => $v['kind'] ?? 'youtube',
                'youtube_id' => $v['youtube_id'] ?? null,
                'path' => $v['path'] ?? null,
                'url' => filled($v['path'] ?? null) ? asset('storage/'.$v['path']) : null,
                'title' => $v['title'] ?? null,
                'poster_path' => $v['poster_path'] ?? null,
                'poster_url' => filled($v['poster_path'] ?? null) ? asset('storage/'.$v['poster_path']) : null,
            ])
            ->values()
            ->all();
    }

    /** @param  array<int, string>  $extensions */
    private static function isLibraryFile(string $path, array $extensions): bool
    {
        if (preg_match('/^https?:\/\//i', $path)) {
            return false;
        }

        if (! in_array(strtolower(pathinfo($path, PATHINFO_EXTENSION)), $extensions, true)) {
            return false;
        }

        return Media::query()->where('path', $path)->exists();
    }
}
