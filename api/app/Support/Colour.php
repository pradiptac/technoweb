<?php

namespace App\Support;

/**
 * Colour arithmetic in OKLCH (0.173.0, `docs/theming.md`), for the places
 * that need the same sums: `Media\LogoColours` reading a logo, and
 * `Media\BrandPalette` deciding which of its colours is a brand colour.
 *
 * **OKLCH rather than HSL**, because HSL's "saturation" calls `#ffff00` and
 * `#000080` equally saturated — so a chroma floor written in HSL lets a
 * logo's near-white and its near-black through as brand colours and keeps
 * no ordering honest. The frontend's `lib/palette.ts` generates in OKLCH
 * for the same reason, so a colour judged here is judged the way the
 * generator will treat it.
 *
 * Every hex in and out is lower-case `#rrggbb`. **A colour under half
 * opaque is not a colour**: a logo's ground is usually a transparent black,
 * and counting it would make black the brand of every logo with a margin.
 */
final class Colour
{
    /**
     * The CSS colour keywords, lower-case. A logo exported by hand often
     * names its colours this way.
     *
     * @var array<string, string>
     */
    private const KEYWORDS = [
        'aliceblue' => '#f0f8ff', 'antiquewhite' => '#faebd7', 'aqua' => '#00ffff',
        'aquamarine' => '#7fffd4', 'azure' => '#f0ffff', 'beige' => '#f5f5dc',
        'bisque' => '#ffe4c4', 'black' => '#000000', 'blanchedalmond' => '#ffebcd',
        'blue' => '#0000ff', 'blueviolet' => '#8a2be2', 'brown' => '#a52a2a',
        'burlywood' => '#deb887', 'cadetblue' => '#5f9ea0', 'chartreuse' => '#7fff00',
        'chocolate' => '#d2691e', 'coral' => '#ff7f50', 'cornflowerblue' => '#6495ed',
        'cornsilk' => '#fff8dc', 'crimson' => '#dc143c', 'cyan' => '#00ffff',
        'darkblue' => '#00008b', 'darkcyan' => '#008b8b', 'darkgoldenrod' => '#b8860b',
        'darkgray' => '#a9a9a9', 'darkgreen' => '#006400', 'darkgrey' => '#a9a9a9',
        'darkkhaki' => '#bdb76b', 'darkmagenta' => '#8b008b', 'darkolivegreen' => '#556b2f',
        'darkorange' => '#ff8c00', 'darkorchid' => '#9932cc', 'darkred' => '#8b0000',
        'darksalmon' => '#e9967a', 'darkseagreen' => '#8fbc8f', 'darkslateblue' => '#483d8b',
        'darkslategray' => '#2f4f4f', 'darkslategrey' => '#2f4f4f', 'darkturquoise' => '#00ced1',
        'darkviolet' => '#9400d3', 'deeppink' => '#ff1493', 'deepskyblue' => '#00bfff',
        'dimgray' => '#696969', 'dimgrey' => '#696969', 'dodgerblue' => '#1e90ff',
        'firebrick' => '#b22222', 'floralwhite' => '#fffaf0', 'forestgreen' => '#228b22',
        'fuchsia' => '#ff00ff', 'gainsboro' => '#dcdcdc', 'ghostwhite' => '#f8f8ff',
        'gold' => '#ffd700', 'goldenrod' => '#daa520', 'gray' => '#808080',
        'green' => '#008000', 'greenyellow' => '#adff2f', 'grey' => '#808080',
        'honeydew' => '#f0fff0', 'hotpink' => '#ff69b4', 'indianred' => '#cd5c5c',
        'indigo' => '#4b0082', 'ivory' => '#fffff0', 'khaki' => '#f0e68c',
        'lavender' => '#e6e6fa', 'lavenderblush' => '#fff0f5', 'lawngreen' => '#7cfc00',
        'lemonchiffon' => '#fffacd', 'lightblue' => '#add8e6', 'lightcoral' => '#f08080',
        'lightcyan' => '#e0ffff', 'lightgoldenrodyellow' => '#fafad2', 'lightgray' => '#d3d3d3',
        'lightgreen' => '#90ee90', 'lightgrey' => '#d3d3d3', 'lightpink' => '#ffb6c1',
        'lightsalmon' => '#ffa07a', 'lightseagreen' => '#20b2aa', 'lightskyblue' => '#87cefa',
        'lightslategray' => '#778899', 'lightslategrey' => '#778899', 'lightsteelblue' => '#b0c4de',
        'lightyellow' => '#ffffe0', 'lime' => '#00ff00', 'limegreen' => '#32cd32',
        'linen' => '#faf0e6', 'magenta' => '#ff00ff', 'maroon' => '#800000',
        'mediumaquamarine' => '#66cdaa', 'mediumblue' => '#0000cd', 'mediumorchid' => '#ba55d3',
        'mediumpurple' => '#9370db', 'mediumseagreen' => '#3cb371', 'mediumslateblue' => '#7b68ee',
        'mediumspringgreen' => '#00fa9a', 'mediumturquoise' => '#48d1cc', 'mediumvioletred' => '#c71585',
        'midnightblue' => '#191970', 'mintcream' => '#f5fffa', 'mistyrose' => '#ffe4e1',
        'moccasin' => '#ffe4b5', 'navajowhite' => '#ffdead', 'navy' => '#000080',
        'oldlace' => '#fdf5e6', 'olive' => '#808000', 'olivedrab' => '#6b8e23',
        'orange' => '#ffa500', 'orangered' => '#ff4500', 'orchid' => '#da70d6',
        'palegoldenrod' => '#eee8aa', 'palegreen' => '#98fb98', 'paleturquoise' => '#afeeee',
        'palevioletred' => '#db7093', 'papayawhip' => '#ffefd5', 'peachpuff' => '#ffdab9',
        'peru' => '#cd853f', 'pink' => '#ffc0cb', 'plum' => '#dda0dd',
        'powderblue' => '#b0e0e6', 'purple' => '#800080', 'rebeccapurple' => '#663399',
        'red' => '#ff0000', 'rosybrown' => '#bc8f8f', 'royalblue' => '#4169e1',
        'saddlebrown' => '#8b4513', 'salmon' => '#fa8072', 'sandybrown' => '#f4a460',
        'seagreen' => '#2e8b57', 'seashell' => '#fff5ee', 'sienna' => '#a0522d',
        'silver' => '#c0c0c0', 'skyblue' => '#87ceeb', 'slateblue' => '#6a5acd',
        'slategray' => '#708090', 'slategrey' => '#708090', 'snow' => '#fffafa',
        'springgreen' => '#00ff7f', 'steelblue' => '#4682b4', 'tan' => '#d2b48c',
        'teal' => '#008080', 'thistle' => '#d8bfd8', 'tomato' => '#ff6347',
        'turquoise' => '#40e0d0', 'violet' => '#ee82ee', 'wheat' => '#f5deb3',
        'white' => '#ffffff', 'whitesmoke' => '#f5f5f5', 'yellow' => '#ffff00',
        'yellowgreen' => '#9acd32',
    ];

    /**
     * A CSS colour value as `#rrggbb`, or null for anything that is not a
     * colour this code can use — `none`, `currentColor`, a gradient
     * reference, a name nobody has, or a colour too transparent to count.
     */
    public static function fromCss(string $value): ?string
    {
        $value = strtolower(trim($value));

        if ($value === '' || in_array($value, ['none', 'currentcolor', 'inherit', 'transparent'], true)) {
            return null;
        }

        if (isset(self::KEYWORDS[$value])) {
            return self::KEYWORDS[$value];
        }

        if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/', $value, $m) === 1) {
            $hex = $m[1];

            return '#'.(strlen($hex) === 3
                ? $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2]
                : $hex);
        }

        // `rgb(1 2 3 / 50%)` and `rgba(1,2,3,.5)` are one function with two
        // spellings; the alpha is optional in both.
        if (preg_match('/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,\/]\s*([\d.]+%?)\s*)?\)$/', $value, $m) === 1) {
            if (($m[4] ?? '') !== '' && self::alpha($m[4]) < 0.5) {
                return null;
            }

            return self::hex((int) round((float) $m[1]), (int) round((float) $m[2]), (int) round((float) $m[3]));
        }

        return null;
    }

    /** Three channels as `#rrggbb`, each clamped to 0–255. */
    public static function hex(int $r, int $g, int $b): string
    {
        return sprintf('#%02x%02x%02x', max(0, min(255, $r)), max(0, min(255, $g)), max(0, min(255, $b)));
    }

    /** How much colour there is in it: under `BrandPalette::MIN_CHROMA` is a grey. */
    public static function chroma(string $hex): float
    {
        return self::oklch($hex)[1];
    }

    /** 0 is black, 1 is white. */
    public static function lightness(string $hex): float
    {
        return self::oklch($hex)[0];
    }

    /**
     * The same colour at another hue, as strong and as light as it was —
     * which is how a one-colour logo is given a Secondary and an Accent that
     * read as a palette somebody chose rather than two tints of one thing.
     */
    public static function rotate(string $hex, float $degrees): string
    {
        [$l, $c, $h] = self::oklch($hex);

        return self::fromOklch($l, $c, fmod(fmod($h + $degrees, 360) + 360, 360));
    }

    /** @return array{float, float, float} Lightness 0–1, chroma, hue in degrees. */
    private static function oklch(string $hex): array
    {
        [$r, $g, $b] = self::channels($hex);
        [$r, $g, $b] = [self::toLinear($r), self::toLinear($g), self::toLinear($b)];

        $l = 0.4122214708 * $r + 0.5363325363 * $g + 0.0514459929 * $b;
        $m = 0.2119034982 * $r + 0.6806995451 * $g + 0.1073969566 * $b;
        $s = 0.0883024619 * $r + 0.2817188376 * $g + 0.6299787005 * $b;

        [$l, $m, $s] = [self::cbrt($l), self::cbrt($m), self::cbrt($s)];

        $lightness = 0.2104542553 * $l + 0.7936177850 * $m - 0.0040720468 * $s;
        $a = 1.9779984951 * $l - 2.4285922050 * $m + 0.4505937099 * $s;
        $bb = 0.0259040371 * $l + 0.7827717662 * $m - 0.8086757660 * $s;

        $chroma = sqrt($a * $a + $bb * $bb);
        $hue = $chroma < 1e-6 ? 0.0 : fmod(rad2deg(atan2($bb, $a)) + 360, 360);

        return [$lightness, $chroma, $hue];
    }

    private static function fromOklch(float $lightness, float $chroma, float $hue): string
    {
        $a = $chroma * cos(deg2rad($hue));
        $b = $chroma * sin(deg2rad($hue));

        $l = ($lightness + 0.3963377774 * $a + 0.2158037573 * $b) ** 3;
        $m = ($lightness - 0.1055613458 * $a - 0.0638541728 * $b) ** 3;
        $s = ($lightness - 0.0894841775 * $a - 1.2914855480 * $b) ** 3;

        return self::hex(
            (int) round(self::fromLinear(4.0767416621 * $l - 3.3077115913 * $m + 0.2309699292 * $s) * 255),
            (int) round(self::fromLinear(-1.2684380046 * $l + 2.6097574011 * $m - 0.3413193965 * $s) * 255),
            (int) round(self::fromLinear(-0.0041960863 * $l - 0.7034186147 * $m + 1.7076147010 * $s) * 255),
        );
    }

    /** @return array{float, float, float} Each channel 0–1. */
    private static function channels(string $hex): array
    {
        $hex = ltrim(strtolower(trim($hex)), '#');

        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }

        if (strlen($hex) !== 6 || preg_match('/^[0-9a-f]{6}$/', $hex) !== 1) {
            return [0.0, 0.0, 0.0];
        }

        return [
            hexdec(substr($hex, 0, 2)) / 255,
            hexdec(substr($hex, 2, 2)) / 255,
            hexdec(substr($hex, 4, 2)) / 255,
        ];
    }

    private static function toLinear(float $c): float
    {
        return $c <= 0.04045 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
    }

    private static function fromLinear(float $c): float
    {
        $c = $c <= 0.0031308 ? $c * 12.92 : 1.055 * $c ** (1 / 2.4) - 0.055;

        return max(0.0, min(1.0, $c));
    }

    /** PHP's `**` cannot take a cube root of a negative, and these go negative. */
    private static function cbrt(float $v): float
    {
        return $v < 0 ? -((-$v) ** (1 / 3)) : $v ** (1 / 3);
    }

    private static function alpha(string $value): float
    {
        return str_ends_with($value, '%')
            ? ((float) rtrim($value, '%')) / 100
            : (float) $value;
    }
}
