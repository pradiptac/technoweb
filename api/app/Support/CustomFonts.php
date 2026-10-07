<?php

namespace App\Support;

use App\Models\Setting;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * A company's own typefaces (0.125.0, docs/theming.md).
 *
 * The site offers nineteen vendored faces. A company with a brand font of
 * its own uploads it here instead: two slots, each a name and one or two
 * WOFF2 files, which then appear in the Headline and Body font lists as
 * `custom-1` and `custom-2`.
 *
 * **Slots, not a list.** A slot's id is fixed, so the stylesheet rule that
 * names it is fixed too — the root layout declares `--font-custom-1` whether
 * or not anything has been uploaded, and a theme that still points at an
 * emptied slot falls back to the default face rather than to nothing. Two is
 * a headline face and a body face, which is all the site has roles for.
 *
 * **WOFF2 only, and checked by its bytes.** It is the one format every
 * current browser reads and the smallest; a TTF renamed `.woff2` would be
 * served for a year and never drawn. A font is not a media-library file: it
 * has no thumbnail, nothing can be done to it there, and nothing but this
 * class should be able to delete one that the site is set in.
 *
 * The files live on the public disk under `fonts/` with a random name. The
 * website serves them from its own origin (`/font/<name>`), because a font —
 * unlike a picture — is refused cross-origin without CORS headers, and the
 * API's storage is another origin.
 */
final class CustomFonts
{
    /** @var array<int, int> */
    public const SLOTS = [1, 2];

    /** Kilobytes. A text face is 20–150 KB; a variable one with every script reaches a megabyte. */
    public const MAX_KB = 2048;

    /** The first four bytes of every WOFF2 file. */
    private const MAGIC = 'wOF2';

    /** @return array{slot: int, id: string, name: string|null, regular: string|null, bold: string|null, variable: bool} */
    public static function slot(int $slot): array
    {
        return [
            'slot' => $slot,
            'id' => "custom-{$slot}",
            'name' => self::read($slot, 'name'),
            'regular' => self::read($slot, 'regular'),
            'bold' => self::read($slot, 'bold'),
            'variable' => (bool) Setting::get("custom_font_{$slot}_variable", false),
        ];
    }

    /** @return array<int, array{slot: int, id: string, name: string|null, regular: string|null, bold: string|null, variable: bool}> */
    public static function all(): array
    {
        return array_map(fn (int $slot) => self::slot($slot), self::SLOTS);
    }

    public static function isWoff2(UploadedFile $file): bool
    {
        $handle = @fopen($file->getRealPath(), 'rb');

        if ($handle === false) {
            return false;
        }

        $head = (string) fread($handle, 4);
        fclose($handle);

        return $head === self::MAGIC;
    }

    /**
     * Fill a slot. A file that is not sent is left as it is, so a name can be
     * corrected, or a bold weight added later, without uploading the regular
     * one again. A replaced file is deleted — its address is never reused, so
     * nothing cached can be showing it under the new name.
     *
     * @return array{slot: int, id: string, name: string|null, regular: string|null, bold: string|null, variable: bool}
     */
    public static function store(int $slot, string $name, ?UploadedFile $regular, ?UploadedFile $bold, bool $variable): array
    {
        foreach (['regular' => $regular, 'bold' => $bold] as $weight => $file) {
            if ($file === null) {
                continue;
            }

            $path = 'fonts/'.Str::random(40).'.woff2';
            Storage::disk('public')->put($path, (string) file_get_contents($file->getRealPath()));

            self::forget($slot, $weight);
            Setting::put("custom_font_{$slot}_{$weight}", $path);
        }

        // A variable font is one file that holds every weight: a bold beside
        // it would be chosen over the real one for every heading.
        if ($variable) {
            self::forget($slot, 'bold');
            Setting::put("custom_font_{$slot}_bold", null);
        }

        Setting::put("custom_font_{$slot}_name", $name);
        Setting::put("custom_font_{$slot}_variable", $variable ? '1' : '0');
        Setting::flushCache();

        return self::slot($slot);
    }

    /**
     * Empty a slot, and take the site off it: a theme still set in
     * `custom-1` would otherwise go on asking for a face that is gone. The
     * frontend falls back by itself, but the settings screen would show a
     * font chosen that nobody can see in the list.
     */
    public static function clear(int $slot): void
    {
        foreach (['regular', 'bold'] as $weight) {
            self::forget($slot, $weight);
            Setting::put("custom_font_{$slot}_{$weight}", null);
        }

        Setting::put("custom_font_{$slot}_name", null);
        Setting::put("custom_font_{$slot}_variable", '0');

        foreach (['theme_font_display' => 'instrument', 'theme_font_body' => 'inter'] as $key => $default) {
            if (Setting::query()->where('key', $key)->value('value') === "custom-{$slot}") {
                Setting::put($key, $default);
            }
        }

        Setting::flushCache();
    }

    /** A stored path, when it has the shape this class writes; anything else is treated as empty. */
    private static function read(int $slot, string $part): ?string
    {
        $value = Setting::query()->where('key', "custom_font_{$slot}_{$part}")->value('value');

        if (! is_string($value) || $value === '') {
            return null;
        }

        if ($part !== 'name' && preg_match('#^fonts/[A-Za-z0-9]{40}\.woff2$#', $value) !== 1) {
            return null;
        }

        return $value;
    }

    private static function forget(int $slot, string $weight): void
    {
        $old = self::read($slot, $weight);

        if ($old !== null) {
            Storage::disk('public')->delete($old);
        }
    }
}
