<?php

namespace App\Support\Media;

use App\Support\Colour;
use App\Support\UploadLimits;
use DOMDocument;
use DOMElement;
use DOMXPath;

/**
 * The colours a logo is made of (0.173.0, `docs/theming.md` "Brand from a
 * logo"), weighed so the one a person would call the brand comes first.
 *
 * **The API reads the logo rather than the browser.** All three places that
 * offer this already have the file on this disk, and a browser cannot read
 * it: the logo is served from the API's own origin, so a canvas drawn from
 * it is tainted and a `fetch` of it is refused — the wall 0.172.0's players
 * hit. Reading it here is one implementation that also works in the setup
 * wizard, where there is no React at all.
 *
 * **Two readers, because a logo is as often a vector as a picture.** GD
 * cannot read SVG, and most logos in this product are SVG.
 *
 * - **A raster** is resampled small and its pixels counted. Transparent
 *   pixels are skipped: a logo's ground is usually a transparent black, and
 *   counting it would make black the brand of every logo with a margin.
 * - **An SVG states its colours**, which is better evidence than its pixels
 *   would be — so they are read from the markup, and nothing is rasterised
 *   (that would want Imagick, which is not a dependency here).
 *
 * Nothing here decides what a brand colour *is*; that is `BrandPalette`.
 */
final class LogoColours
{
    /**
     * The long side a raster is resampled to. The blur placeholder's twelve
     * pixels cannot tell two brand colours apart; 96 is some nine thousand
     * samples, which is more than a logo needs and still instant.
     */
    private const SAMPLE = 96;

    /** Channels are rounded to this, so anti-aliasing does not read as a colour of its own. */
    private const BUCKET = 16;

    /** The fallback for the upload's megapixel ceiling, where there is no application to ask. */
    private const MAX_MEGAPIXELS = 50.0;

    /** More than this and the list stops being a palette and starts being a photograph. */
    private const MOST = 12;

    /** Where an SVG states a colour. */
    private const COLOUR_ATTRIBUTES = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color'];

    /**
     * @return list<array{hex: string, share: float}> Ordered by share, descending.
     *                                                Empty for a file that cannot be read.
     */
    public static function read(string $absolutePath): array
    {
        if (! is_file($absolutePath) || ! is_readable($absolutePath)) {
            return [];
        }

        $weights = str_ends_with(strtolower($absolutePath), '.svg')
            ? self::fromMarkup($absolutePath)
            : self::fromPixels($absolutePath);

        return self::share($weights);
    }

    /**
     * @param  array<string, float>  $weights
     * @return list<array{hex: string, share: float}>
     */
    private static function share(array $weights): array
    {
        $total = array_sum($weights);

        if ($total <= 0) {
            return [];
        }

        arsort($weights);
        $out = [];

        foreach (array_slice($weights, 0, self::MOST, true) as $hex => $weight) {
            $out[] = ['hex' => $hex, 'share' => round($weight / $total, 4)];
        }

        return $out;
    }

    /**
     * A raster's pixels, bucketed and counted. The opening is
     * `Placeholder::make`'s — the same header read, the same megapixel
     * refusal (decoding is what costs the memory, and the header says how
     * much) and the same `imagecreatefrom*` branch.
     *
     * @return array<string, float>
     */
    private static function fromPixels(string $path): array
    {
        if (! function_exists('imagecreatetruecolor')) {
            return [];
        }

        $info = @getimagesize($path);

        if (! $info || $info[0] < 1 || $info[1] < 1) {
            return [];
        }

        [$width, $height, $type] = $info;

        // The upload's own ceiling, when there is an application to ask. The
        // catch is for a unit test, which has no container: reading colours out
        // of a picture is arithmetic and must not need the framework booted.
        try {
            $maxMegapixels = UploadLimits::maxMegapixels();
        } catch (\Throwable) {
            $maxMegapixels = self::MAX_MEGAPIXELS;
        }

        if (($width * $height) / 1_000_000 > $maxMegapixels) {
            return [];
        }

        $source = match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            IMAGETYPE_PNG => @imagecreatefrompng($path),
            IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : false,
            IMAGETYPE_GIF => @imagecreatefromgif($path),
            default => false,
        };

        if (! $source) {
            return [];
        }

        $long = max($width, $height);
        $scale = $long > self::SAMPLE ? self::SAMPLE / $long : 1.0;
        $w = max(1, (int) round($width * $scale));
        $h = max(1, (int) round($height * $scale));

        $small = imagecreatetruecolor($w, $h);
        imagealphablending($small, false);
        imagesavealpha($small, true);
        imagefill($small, 0, 0, (int) imagecolorallocatealpha($small, 0, 0, 0, 127));
        imagecopyresampled($small, $source, 0, 0, 0, 0, $w, $h, $width, $height);
        imagedestroy($source);

        /** @var array<string, array{n: int, r: int, g: int, b: int}> $buckets */
        $buckets = [];

        for ($y = 0; $y < $h; $y++) {
            for ($x = 0; $x < $w; $x++) {
                $rgba = imagecolorat($small, $x, $y);
                // GD's alpha is 0 opaque to 127 clear, the opposite way round
                // from CSS; over half clear is not a colour of the logo's.
                if ((($rgba >> 24) & 0x7F) > 63) {
                    continue;
                }

                $r = ($rgba >> 16) & 0xFF;
                $g = ($rgba >> 8) & 0xFF;
                $b = $rgba & 0xFF;
                $key = implode(',', [
                    (int) (round($r / self::BUCKET) * self::BUCKET),
                    (int) (round($g / self::BUCKET) * self::BUCKET),
                    (int) (round($b / self::BUCKET) * self::BUCKET),
                ]);

                $bucket = $buckets[$key] ?? ['n' => 0, 'r' => 0, 'g' => 0, 'b' => 0];
                $buckets[$key] = ['n' => $bucket['n'] + 1, 'r' => $bucket['r'] + $r, 'g' => $bucket['g'] + $g, 'b' => $bucket['b'] + $b];
            }
        }

        imagedestroy($small);

        $weights = [];

        // The bucket's own mean, so the answer is a colour that is in the
        // picture rather than one rounded to a sixteenth.
        foreach ($buckets as $bucket) {
            $hex = Colour::hex(
                (int) round($bucket['r'] / $bucket['n']),
                (int) round($bucket['g'] / $bucket['n']),
                (int) round($bucket['b'] / $bucket['n']),
            );
            $weights[$hex] = ($weights[$hex] ?? 0) + $bucket['n'];
        }

        return $weights;
    }

    /**
     * An SVG's declared colours, weighed by how much of the drawing carries
     * each. A shape that states its own size contributes that area instead
     * of one element's worth, so a logo whose ground is one big rect does
     * not lose to a mark made of forty small paths.
     *
     * @return array<string, float>
     */
    private static function fromMarkup(string $path): array
    {
        $markup = (string) file_get_contents($path);

        if (trim($markup) === '') {
            return [];
        }

        $document = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        // The flags `SvgSanitiser::clean()` loads with: never the network.
        $parsed = $document->loadXML($markup, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $parsed) {
            return [];
        }

        $canvas = self::canvas($document);
        $weights = [];
        $add = function (?string $hex, float $weight) use (&$weights): void {
            if ($hex !== null) {
                $weights[$hex] = ($weights[$hex] ?? 0) + $weight;
            }
        };

        foreach ((new DOMXPath($document))->query('//*') ?: [] as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }

            $tag = strtolower(preg_replace('/^.*:/', '', $node->nodeName) ?? '');

            if ($tag === 'style') {
                // A class-driven logo — the common Illustrator export — states
                // its colours in a block and nowhere else. Weighed one each,
                // since a rule says nothing about how much it covers.
                foreach (self::declarations($node->textContent) as $hex) {
                    $add($hex, 1.0);
                }

                continue;
            }

            $weight = self::area($node, $tag, $canvas);

            foreach (self::COLOUR_ATTRIBUTES as $attribute) {
                if ($node->hasAttribute($attribute)) {
                    $add(Colour::fromCss($node->getAttribute($attribute)), $weight);
                }
            }

            if ($node->hasAttribute('style')) {
                foreach (self::declarations($node->getAttribute('style')) as $hex) {
                    $add($hex, $weight);
                }
            }
        }

        return $weights;
    }

    /**
     * The colours in a run of CSS declarations — a `style` attribute or a
     * `<style>` block, read the same way because a logo states its colours
     * the same way in both.
     *
     * @return list<string>
     */
    private static function declarations(string $css): array
    {
        $pattern = '/(?:'.implode('|', self::COLOUR_ATTRIBUTES).')\s*:\s*([^;{}"\']+)/i';

        if (preg_match_all($pattern, $css, $matches) === false) {
            return [];
        }

        $out = [];

        foreach ($matches[1] as $value) {
            $hex = Colour::fromCss($value);

            if ($hex !== null) {
                $out[] = $hex;
            }
        }

        return $out;
    }

    /**
     * What this element covers, as a share of the drawing — 1 for anything
     * that does not state its own size, which is every path.
     */
    private static function area(DOMElement $node, string $tag, float $canvas): float
    {
        if ($canvas <= 0) {
            return 1.0;
        }

        $number = static fn (string $name): float => (float) $node->getAttribute($name);

        $area = match ($tag) {
            'rect', 'image', 'svg' => $number('width') * $number('height'),
            'circle' => M_PI * $number('r') ** 2,
            'ellipse' => M_PI * $number('rx') * $number('ry'),
            default => 0.0,
        };

        // Its share of the canvas, counted as that many elements' worth, so
        // one full-bleed rect outweighs a few dozen small marks and a hairline
        // rule does not.
        return $area > 0 ? max(1.0, ($area / $canvas) * 100) : 1.0;
    }

    /** The `viewBox`'s area, or the root's width times height. */
    private static function canvas(DOMDocument $document): float
    {
        $root = $document->documentElement;

        if (! $root instanceof DOMElement) {
            return 0.0;
        }

        $box = preg_split('/[\s,]+/', trim($root->getAttribute('viewBox'))) ?: [];

        if (count($box) === 4) {
            return abs((float) $box[2] * (float) $box[3]);
        }

        return abs((float) $root->getAttribute('width') * (float) $root->getAttribute('height'));
    }
}
