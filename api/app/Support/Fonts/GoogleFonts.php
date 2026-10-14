<?php

namespace App\Support\Fonts;

use App\Models\GoogleFont;
use App\Models\Setting;
use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * A Google font copied to this server (0.179.0, docs/theming.md "Google
 * fonts"). Google is asked once, at install; visitors are sent our copy.
 *
 * Google answers WOFF2 `@font-face` blocks only to a browser it recognises,
 * so the CSS request carries a current Chrome user agent. `SafeHttp::get()`
 * would put its own agent first (array union keeps the left key), so the
 * request is built from `SafeHttp::request()` instead.
 */
final class GoogleFonts
{
    public const WEIGHTS = [400, 600, 700];

    public const MAX_BYTES = 2 * 1024 * 1024;

    /**
     * The most files one install copies. Google splits a big family into
     * many unicode-range pieces (a Japanese face is 372 for three weights),
     * and every piece is a download inside one web request, so a family past
     * this is refused before anything is fetched rather than timing out with
     * files left on disk.
     */
    public const MAX_FACES = 60;

    private const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    public const PREVIEWS = 'font-previews';

    /** @return array{0: GoogleFont, 1: bool} the font, and whether it was downloaded now */
    public static function install(string $slug): array
    {
        if ($existing = GoogleFont::where('slug', $slug)->first()) {
            return [$existing, false];
        }

        $entry = GoogleFontCatalogue::find($slug) ?? self::refuse('Choose a font from the list.');
        $faces = self::fetchFaces($entry['family'], self::weightsFor($entry['weights']));

        if (count($faces) > self::MAX_FACES) {
            self::refuse('That font comes in '.count($faces).' pieces and is too big to copy here. Choose a lighter one.');
        }

        // Up to sixty downloads: lengthen a web request's limit, and never set
        // one where there is none (the command line, a worker).
        $limit = (int) ini_get('max_execution_time');
        if ($limit > 0 && $limit < 180) {
            set_time_limit(180);
        }

        $dir = "fonts/google/{$slug}";
        $stored = [];
        $bytes = 0;

        try {
            foreach ($faces as $i => $face) {
                $body = self::download($face['url']);
                Storage::disk('public')->put("{$dir}/{$i}.woff2", $body);
                $stored[] = ['weight' => $face['weight'], 'range' => $face['range'], 'path' => "{$dir}/{$i}.woff2"];
                $bytes += strlen($body);
            }
        } catch (\Throwable $e) {
            Storage::disk('public')->deleteDirectory($dir);
            throw $e;
        }

        try {
            return [GoogleFont::create([
                'slug' => $slug, 'family' => $entry['family'], 'category' => $entry['category'],
                'faces' => $stored, 'bytes' => $bytes,
            ]), true];
        } catch (UniqueConstraintViolationException) {
            // The same font was installed by another request while this one
            // downloaded. It wrote the same files to the same paths, so they
            // are left alone and its row is the answer.
            return [GoogleFont::where('slug', $slug)->firstOrFail(), false];
        }
    }

    public static function remove(GoogleFont $font): void
    {
        foreach (['theme_font_display' => 'heading', 'theme_font_body' => 'body'] as $key => $role) {
            if (Setting::get($key) === $font->id()) {
                self::refuse("The {$role} font uses this. Choose another first.");
            }
        }

        Storage::disk('public')->deleteDirectory("fonts/google/{$font->slug}");
        $font->delete();
    }

    /** The regular Latin face for the console's sample line, cached on the private disk. */
    public static function preview(string $slug): string
    {
        $entry = GoogleFontCatalogue::find($slug) ?? abort(404);
        $path = self::PREVIEWS."/{$slug}.woff2";

        if (! Storage::disk('local')->exists($path)) {
            $faces = self::fetchFaces($entry['family'], [self::weightsFor($entry['weights'])[0]]);
            // The Latin block is Google's last for most families; any block does for a sample.
            $face = collect($faces)->first(fn (array $f) => str_contains($f['range'], 'U+0000')) ?? $faces[0];
            Storage::disk('local')->put($path, self::download($face['url']));
        }

        return Storage::disk('local')->path($path);
    }

    /**
     * @param  list<int>  $available
     * @return list<int>
     */
    public static function weightsFor(array $available): array
    {
        $wanted = array_values(array_intersect(self::WEIGHTS, $available));

        if ($wanted !== []) {
            return $wanted;
        }

        usort($available, fn (int $a, int $b) => abs($a - 400) <=> abs($b - 400));

        return [$available[0]];
    }

    /**
     * @param  list<int>  $weights
     * @return list<array{weight:int, range:string, url:string}>
     */
    private static function fetchFaces(string $family, array $weights): array
    {
        $url = 'https://fonts.googleapis.com/css2?family='.rawurlencode($family).':wght@'.implode(';', $weights).'&display=swap';

        try {
            $response = SafeHttp::request($url)->timeout(20)->withHeaders(['User-Agent' => self::AGENT])->get($url);
        } catch (UnsafeUrl|ConnectionException) {
            self::refuse('That font could not be downloaded from Google. Try again shortly.');
        }

        if (! $response->successful()) {
            self::refuse("Google refused the request ({$response->status()}). Try again shortly.");
        }

        preg_match_all('/@font-face\s*\{(.*?)\}/s', $response->body(), $blocks);
        $faces = [];

        foreach ($blocks[1] as $block) {
            preg_match('/font-weight:\s*(\d+)/', $block, $w);
            preg_match('/url\((https:\/\/[^)]+\.woff2)\)/', $block, $u);
            preg_match('/unicode-range:\s*([^;]+);/', $block, $r);

            if (! $w || ! $u) {
                continue;
            }

            if (parse_url($u[1], PHP_URL_HOST) !== 'fonts.gstatic.com') {
                self::refuse('Google pointed at a file somewhere other than its font server, so nothing was installed.');
            }

            $faces[] = ['weight' => (int) $w[1], 'range' => trim($r[1] ?? 'U+0000-FFFF'), 'url' => $u[1]];
        }

        return $faces !== [] ? $faces : self::refuse('Google sent no font files for that family.');
    }

    private static function download(string $url): string
    {
        try {
            $response = SafeHttp::request($url)->timeout(20)->withHeaders(['User-Agent' => self::AGENT])->get($url);
        } catch (UnsafeUrl|ConnectionException) {
            self::refuse('That font could not be downloaded from Google. Try again shortly.');
        }

        $body = $response->body();

        if (! $response->successful() || ! str_starts_with($body, 'wOF2') || strlen($body) > self::MAX_BYTES) {
            self::refuse('Google sent a file that is not a web font, so nothing was installed.');
        }

        return $body;
    }

    private static function refuse(string $message): never
    {
        throw ValidationException::withMessages(['slug' => $message]);
    }
}
