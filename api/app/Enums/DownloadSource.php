<?php

namespace App\Enums;

/**
 * Where a download's file is kept (docs/downloads.md).
 *
 * `Library` is a file the media library holds: it has a public address, so
 * it can never be a customers-only download. `Upload` is a file sent to the
 * download itself and kept on the private disk — the only kind that can be
 * restricted, and the only way to offer a type the library refuses (a
 * firmware image, an installer).
 */
enum DownloadSource: string
{
    case Library = 'library';
    case Upload = 'upload';

    public function label(): string
    {
        return match ($this) {
            self::Library => 'From the media library',
            self::Upload => 'Uploaded here (private)',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Library => 'A PDF, document or archive already in the library. It has a public address.',
            self::Upload => 'Kept off the public disk and handed out by the site. Needed for a customers-only file, and for firmware or installers.',
        };
    }

    /** @return array<int, array{value: string, label: string, blurb: string}> */
    public static function options(): array
    {
        return array_map(
            fn (self $s) => ['value' => $s->value, 'label' => $s->label(), 'blurb' => $s->blurb()],
            self::cases(),
        );
    }
}
