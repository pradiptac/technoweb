<?php

namespace App\Support;

/**
 * Generates the placeholder artwork the demo content uses.
 *
 * SVG on purpose. These stand in for photography that does not exist yet, and
 * an SVG panel carrying the item's own name is honest about that — nobody
 * mistakes it for a product shot, which a stock photo or a generated image
 * would invite. It also costs nothing to produce, scales to any container and
 * uses the real brand tokens, so the layouts look designed rather than broken
 * while the real assets are being gathered.
 *
 * Replace these with real photography before launch; see the "must not ship"
 * list in CLAUDE.md.
 */
class PlaceholderImage
{
    private const BRAND_900 = '#22290f';
    private const BRAND_700 = '#3d4a23';
    private const BRAND_500 = '#6f8641';
    private const BRAND_300 = '#b0c184';
    private const BRAND_50 = '#f4f6ec';

    /** A wide banner — blog covers, case-study covers, solution heroes. */
    public static function banner(string $title, string $kicker = '', int $w = 1200, int $h = 630): string
    {
        return self::render($title, $kicker, $w, $h, 46, 15);
    }

    /** A square-ish tile — product images. */
    public static function tile(string $title, string $kicker = '', int $w = 800, int $h = 600): string
    {
        return self::render($title, $kicker, $w, $h, 34, 13);
    }

    private static function render(string $title, string $kicker, int $w, int $h, int $size, int $kickerSize): string
    {
        $lines = self::wrap($title, (int) floor($w / ($size * 0.56)));
        $lineHeight = (int) round($size * 1.18);
        $blockHeight = count($lines) * $lineHeight;
        $top = (int) round(($h - $blockHeight) / 2 + $size * 0.8);

        $text = '';
        foreach ($lines as $i => $line) {
            $y = $top + $i * $lineHeight;
            $text .= sprintf(
                '<text x="%d" y="%d" fill="%s" font-family="Inter, Segoe UI, sans-serif" font-size="%d" font-weight="600" letter-spacing="-0.02em">%s</text>',
                (int) round($w * 0.07), $y, self::BRAND_50, $size, self::esc($line)
            );
        }

        $kickerMarkup = $kicker === '' ? '' : sprintf(
            '<text x="%d" y="%d" fill="%s" font-family="Inter, Segoe UI, sans-serif" font-size="%d" font-weight="600" letter-spacing="0.13em">%s</text>',
            (int) round($w * 0.07), $top - $blockHeight - (int) round($size * 0.3),
            self::BRAND_300, $kickerSize, self::esc(mb_strtoupper($kicker))
        );

        // Escaped, not interpolated raw: an ampersand in a title — "Storage &
        // NAS", "Hospital Wi-Fi & device segmentation" — is invalid XML in an
        // attribute, and a browser then refuses to parse the whole file rather
        // than rendering it imperfectly.
        $label = self::esc($title);

        // The grid echoes the decorative background used on PageHero.
        return <<<SVG
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {$w} {$h}" width="{$w}" height="{$h}" role="img" aria-label="{$label}">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="{self::BRAND_900}"/>
              <stop offset="100%" stop-color="{self::BRAND_700}"/>
            </linearGradient>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="{self::BRAND_500}" stroke-opacity="0.22" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="{$w}" height="{$h}" fill="url(#g)"/>
          <rect width="{$w}" height="{$h}" fill="url(#grid)"/>
          <rect x="0" y="0" width="6" height="{$h}" fill="{self::BRAND_500}"/>
          {$kickerMarkup}
          {$text}
        </svg>
        SVG;
    }

    /** @return string[] */
    private static function wrap(string $text, int $perLine): array
    {
        $lines = explode("\n", wordwrap($text, max(8, $perLine), "\n", true));

        // Three lines is all the panel has room for.
        return array_slice($lines, 0, 3);
    }

    private static function esc(string $s): string
    {
        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
