<?php

namespace App\Support\SiteImport;

use App\Models\SiteImport;
use App\Support\Fonts\GoogleFontCatalogue;
use App\Support\Newsletter\EmailExtractor;
use App\Support\WordPress\Harvest;

/**
 * An old site's colours and fonts, read from the stylesheets it served and the
 * `<style>` blocks on its pages (0.164.0, `docs/site-import.md`, "Colours and
 * fonts").
 *
 * **Colours** are the six `theme_*` settings: Primary, Secondary, Accent,
 * Background, Text and Top bar. They are weighed by what a colour is used
 * *for* — a button's fill and a link's colour are the brand; a `--primary`
 * custom property is the brand said outright; `body`'s background and colour
 * are the ground and the ink; the header's background is the top bar — and
 * only a colour with some chroma can be a brand colour, so the white, the
 * black and the greys that are most of any stylesheet never are. A role the
 * stylesheets do not settle is left out, not guessed, and the site keeps its
 * own for it.
 *
 * **Fonts** are `body`'s and the headings' first family, matched by name to
 * the vendored faces (`FONTS` — pinned to `web/src/lib/font-choices.ts` by a
 * test, as `ReservedSlugs` is to the app folder). A family that is not
 * vendored but arrives as a same-site WOFF2 file is offered for one of the
 * two custom font slots (`CustomFonts`); one with neither is named in the
 * review and nothing is done about it.
 *
 * Nothing here writes anything. `BrandStep` applies a person's choice.
 */
final class Brand
{
    /**
     * Family name (lower-case) → the vendored face's id, and which of the
     * two roles it may fill — `body: false` is a face that is a headline face
     * only (`font-choices.ts` says why for each).
     *
     * @var array<string, array{id: string, display: bool, body: bool}>
     */
    public const FONTS = [
        'instrument sans' => ['id' => 'instrument', 'display' => true, 'body' => false],
        'inter' => ['id' => 'inter', 'display' => true, 'body' => true],
        'inter tight' => ['id' => 'inter-tight', 'display' => true, 'body' => true],
        'sora' => ['id' => 'sora', 'display' => true, 'body' => true],
        'manrope' => ['id' => 'manrope', 'display' => true, 'body' => true],
        'space grotesk' => ['id' => 'space-grotesk', 'display' => true, 'body' => true],
        'ibm plex sans' => ['id' => 'ibm-plex', 'display' => true, 'body' => true],
        'fraunces' => ['id' => 'fraunces', 'display' => true, 'body' => true],
        'public sans' => ['id' => 'public-sans', 'display' => true, 'body' => true],
        'source sans 3' => ['id' => 'source-sans', 'display' => true, 'body' => true],
        'source sans pro' => ['id' => 'source-sans', 'display' => true, 'body' => true],
        'source sans' => ['id' => 'source-sans', 'display' => true, 'body' => true],
        'work sans' => ['id' => 'work-sans', 'display' => true, 'body' => true],
        'dm sans' => ['id' => 'dm-sans', 'display' => true, 'body' => true],
        'plus jakarta sans' => ['id' => 'plus-jakarta', 'display' => true, 'body' => true],
        'figtree' => ['id' => 'figtree', 'display' => true, 'body' => true],
        'outfit' => ['id' => 'outfit', 'display' => true, 'body' => false],
        'red hat display' => ['id' => 'red-hat-display', 'display' => true, 'body' => false],
        'playfair display' => ['id' => 'playfair', 'display' => true, 'body' => false],
        'lora' => ['id' => 'lora', 'display' => true, 'body' => true],
    ];

    public const ROLES = ['primary', 'secondary', 'accent', 'background', 'text', 'topbar'];

    /** Families that are the browser's own, never a brand choice. */
    private const SYSTEM = ['inherit', 'initial', 'unset', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'arial', 'helvetica', 'helvetica neue', 'times new roman', 'times', 'georgia', 'verdana', 'tahoma', 'courier new'];

    /** Style blocks are read from this many pages. */
    private const STYLE_PAGES = 6;

    /**
     * @return array{found: bool, sheets: int, colours: array<string, ?string>, fonts: array<string, array<string, mixed>|null>}
     */
    public static function detect(SiteImport $import): array
    {
        $css = '';
        $sheets = 0;
        $faces = [];

        foreach (Harvest::read($import, 'assets') as $asset) {
            $text = (string) ($asset['css'] ?? '');
            $css .= "\n".$text;
            $faces = [...$faces, ...self::faces($text, (string) ($asset['url'] ?? ''))];
            $sheets++;
        }

        $pages = 0;
        foreach (Harvest::read($import, 'pages') as $page) {
            if ($pages++ >= self::STYLE_PAGES) {
                break;
            }

            if (preg_match_all('#<style[^>]*>(.*?)</style>#is', (string) $page['html'], $m)) {
                foreach ($m[1] as $block) {
                    $css .= "\n".$block;
                    $faces = [...$faces, ...self::faces($block, (string) $page['url'])];
                }
            }
        }

        return self::read($css, $faces, $sheets);
    }

    /**
     * @param  list<array{family: string, weight: int, url: string}>  $faces
     * @return array{found: bool, sheets: int, colours: array<string, ?string>, fonts: array<string, array<string, mixed>|null>}
     */
    public static function read(string $css, array $faces = [], int $sheets = 0): array
    {
        $css = (string) preg_replace('#/\*.*?\*/#s', '', $css);
        $rules = self::rules($css);
        $vars = self::variables($rules);
        $colours = self::colours($rules, $vars);
        $fonts = self::fonts($rules, $vars, $faces);

        return [
            'found' => count(array_filter($colours)) > 0 || count(array_filter($fonts)) > 0,
            'sheets' => $sheets,
            'colours' => $colours,
            'fonts' => $fonts,
        ];
    }

    /**
     * @return list<array{0: string, 1: array<string, string>}> selector, declarations
     */
    private static function rules(string $css): array
    {
        $rules = [];

        if (preg_match_all('/([^{}]+)\{([^{}]*)\}/', $css, $m, PREG_SET_ORDER)) {
            foreach ($m as $rule) {
                $declarations = [];

                foreach (explode(';', $rule[2]) as $declaration) {
                    $parts = explode(':', $declaration, 2);

                    if (count($parts) === 2 && trim($parts[0]) !== '') {
                        $declarations[strtolower(trim($parts[0]))] = trim((string) preg_replace('/\s*!important\s*$/i', '', $parts[1]));
                    }
                }

                $rules[] = [trim((string) preg_replace('/\s+/', ' ', $rule[1])), $declarations];
            }
        }

        return $rules;
    }

    /**
     * The custom properties set where they apply to the page.
     *
     * @param  list<array{0: string, 1: array<string, string>}>  $rules
     * @return array<string, string>
     */
    private static function variables(array $rules): array
    {
        $vars = [];

        foreach ($rules as [$selector, $declarations]) {
            if (! preg_match('/(^|,)\s*(:root|html|body|\*)\s*(,|$)/i', $selector)) {
                continue;
            }

            foreach ($declarations as $name => $value) {
                if (str_starts_with($name, '--')) {
                    $vars[$name] = $value;
                }
            }
        }

        return $vars;
    }

    /** A value with its `var(--x)` references followed (a few levels). */
    private static function resolve(string $value, array $vars, int $depth = 0): string
    {
        if ($depth > 4 || ! str_contains($value, 'var(')) {
            return $value;
        }

        return self::resolve((string) preg_replace_callback('/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/', fn (array $m) => $vars[$m[1]] ?? ($m[2] ?? ''), $value), $vars, $depth + 1);
    }

    /**
     * @param  list<array{0: string, 1: array<string, string>}>  $rules
     * @param  array<string, string>  $vars
     * @return array<string, ?string>
     */
    private static function colours(array $rules, array $vars): array
    {
        $primary = [];
        $pool = [];
        $named = ['secondary' => [], 'accent' => [], 'background' => [], 'text' => [], 'topbar' => []];
        $page = ['background' => null, 'text' => null];

        $add = function (array &$into, ?array $c, int $weight) {
            if ($c !== null) {
                $into[$c['hex']] = ($into[$c['hex']] ?? 0) + $weight;
            }
        };

        foreach ($vars as $name => $value) {
            $c = self::colour(self::resolve($value, $vars));

            if ($c === null) {
                continue;
            }

            $role = match (true) {
                (bool) preg_match('/(text|foreground|ink|body-color|font-color)/', $name) => 'text',
                (bool) preg_match('/(header|nav|topbar)/', $name) => 'topbar',
                (bool) preg_match('/(background|bg|surface|body-bg)/', $name) => 'background',
                (bool) preg_match('/secondary/', $name) => 'secondary',
                (bool) preg_match('/(accent|highlight)/', $name) => 'accent',
                (bool) preg_match('/(primary|brand|main|theme)/', $name) => 'primary',
                default => null,
            };

            if ($role === 'primary' && $c['chroma']) {
                $add($primary, $c, 6);
                $add($pool, $c, 2);
            } elseif ($role !== null && $role !== 'primary') {
                $add($named[$role], $c, 6);
            }
        }

        foreach ($rules as [$selector, $d]) {
            foreach (array_filter(array_map('trim', explode(',', $selector))) as $single) {
                $fill = self::colour(self::resolve($d['background-color'] ?? self::backgroundValue($d), $vars));
                $ink = self::colour(self::resolve($d['color'] ?? '', $vars));
                $border = self::colour(self::resolve($d['border-color'] ?? '', $vars));
                $lower = strtolower($single);

                if (preg_match('/^(html|body)$/', $lower)) {
                    $page['background'] ??= $fill['hex'] ?? null;
                    $page['text'] ??= $ink['hex'] ?? null;

                    continue;
                }

                $isButton = (bool) preg_match('/(^|[\s.>+~])(\.?btn|\.button|button|\.cta|input\[type=["\']?submit|\.wp-block-button)/', $lower);
                $isLink = (bool) preg_match('/^a(:hover|:focus|:visited|:active)?$/', $lower);
                $isBar = (bool) preg_match('/(^|[\s.>+~])(header|nav|\.header|\.navbar|\.nav|\.topbar|\.site-header|\.masthead|\.menu)([\s.:#>+~\[]|$)/', $lower) && ! str_contains($lower, 'button');

                if ($isButton) {
                    $add($primary, $fill !== null && $fill['chroma'] ? $fill : null, 4);
                    $add($primary, $border !== null && $border['chroma'] ? $border : null, 1);
                } elseif ($isLink) {
                    $add($primary, $ink !== null && $ink['chroma'] ? $ink : null, 3);
                } elseif ($isBar && $fill !== null) {
                    $add($named['topbar'], $fill, 2);
                }

                foreach ([$fill, $ink, $border] as $c) {
                    $add($pool, $c !== null && $c['chroma'] ? $c : null, 1);
                }
            }
        }

        $best = fn (array $weights, array $except = []) => (function () use ($weights, $except) {
            arsort($weights);

            foreach (array_keys($weights) as $hex) {
                if (! in_array($hex, $except, true) && self::apart($hex, $except)) {
                    return $hex;
                }
            }

            return null;
        })();

        $main = $best($primary ?: $pool);
        $second = $best($named['secondary'] ?: $pool, array_filter([$main]));
        $accent = $best($named['accent'] ?: $pool, array_filter([$main, $second]));
        $ground = $page['background'] ?? $best($named['background']);
        $topbar = $best($named['topbar']);

        return [
            'primary' => $main,
            'secondary' => $second,
            'accent' => $accent,
            'background' => $ground,
            'text' => $page['text'] ?? $best($named['text']),
            'topbar' => $topbar !== null && $topbar !== $ground ? $topbar : null,
        ];
    }

    /** @param  array<string, string>  $d */
    private static function backgroundValue(array $d): string
    {
        $value = $d['background'] ?? '';

        return str_contains(strtolower($value), 'gradient(') || str_contains(strtolower($value), 'url(') ? '' : $value;
    }

    /** Whether a colour's hue is clear of every colour already chosen. */
    private static function apart(string $hex, array $chosen): bool
    {
        $c = self::colour($hex);

        foreach ($chosen as $other) {
            $o = self::colour($other);

            if ($c !== null && $o !== null) {
                $d = abs($c['hue'] - $o['hue']);

                if (min($d, 360 - $d) < 25) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * The first colour in a value: `#rgb`, `#rrggbb`, `rgb()`, `hsl()` —
     * with its hue, and whether it has enough chroma and a middling lightness
     * to be anyone's brand.
     *
     * @return ?array{hex: string, hue: float, chroma: bool}
     */
    private static function colour(string $value): ?array
    {
        $value = trim($value);

        if (preg_match('/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i', $value, $m)) {
            $h = strtolower($m[1]);
            $h = strlen($h) <= 4 ? $h[0].$h[0].$h[1].$h[1].$h[2].$h[2] : substr($h, 0, 6);
            [$r, $g, $b] = [hexdec(substr($h, 0, 2)), hexdec(substr($h, 2, 2)), hexdec(substr($h, 4, 2))];
        } elseif (preg_match('/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i', $value, $m)) {
            [$r, $g, $b] = [min(255, (int) $m[1]), min(255, (int) $m[2]), min(255, (int) $m[3])];
        } elseif (preg_match('/hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i', $value, $m)) {
            [$r, $g, $b] = self::fromHsl(fmod((float) $m[1] + 360, 360), (float) $m[2] / 100, (float) $m[3] / 100);
        } else {
            return null;
        }

        [$hue, $sat, $light] = self::toHsl($r, $g, $b);

        return [
            'hex' => sprintf('#%02x%02x%02x', $r, $g, $b),
            'hue' => $hue,
            'chroma' => $sat >= 0.25 && $light >= 0.12 && $light <= 0.88,
        ];
    }

    /** @return array{0: float, 1: float, 2: float} */
    private static function toHsl(int $r, int $g, int $b): array
    {
        [$r, $g, $b] = [$r / 255, $g / 255, $b / 255];
        $max = max($r, $g, $b);
        $min = min($r, $g, $b);
        $l = ($max + $min) / 2;

        if ($max === $min) {
            return [0.0, 0.0, $l];
        }

        $d = $max - $min;
        $s = $l > 0.5 ? $d / (2 - $max - $min) : $d / ($max + $min);
        $h = match (true) {
            $max === $r => fmod(($g - $b) / $d + 6, 6),
            $max === $g => ($b - $r) / $d + 2,
            default => ($r - $g) / $d + 4,
        };

        return [$h * 60, $s, $l];
    }

    /** @return array{0: int, 1: int, 2: int} */
    private static function fromHsl(float $h, float $s, float $l): array
    {
        $c = (1 - abs(2 * $l - 1)) * $s;
        $x = $c * (1 - abs(fmod($h / 60, 2) - 1));
        $m = $l - $c / 2;
        [$r, $g, $b] = match (true) {
            $h < 60 => [$c, $x, 0], $h < 120 => [$x, $c, 0], $h < 180 => [0, $c, $x],
            $h < 240 => [0, $x, $c], $h < 300 => [$x, 0, $c], default => [$c, 0, $x],
        };

        return [(int) round(($r + $m) * 255), (int) round(($g + $m) * 255), (int) round(($b + $m) * 255)];
    }

    // ── fonts ──────────────────────────────────────────────────────────

    /**
     * Every `@font-face` that serves a WOFF2 file: family, weight, address.
     *
     * @return list<array{family: string, weight: int, url: string}>
     */
    private static function faces(string $css, string $base): array
    {
        $faces = [];

        foreach (self::rules((string) preg_replace('#/\*.*?\*/#s', '', $css)) as [$selector, $d]) {
            if (strtolower($selector) !== '@font-face' || ! preg_match('/url\(\s*[\'"]?([^\'")]+\.woff2)(?:\?[^\'")]*)?[\'"]?\s*\)/i', $d['src'] ?? '', $m)) {
                continue;
            }

            $family = self::family($d['font-family'] ?? '');
            $url = EmailExtractor::resolve($base, $m[1]);
            $weight = (int) (preg_match('/\d{3}/', $d['font-weight'] ?? '400', $w) ? $w[0] : (str_contains(strtolower($d['font-weight'] ?? ''), 'bold') ? 700 : 400));

            if ($family !== null && $url !== null && ! str_contains(strtolower($d['font-style'] ?? ''), 'italic')) {
                $faces[] = ['family' => $family, 'weight' => $weight, 'url' => $url];
            }
        }

        return $faces;
    }

    /** The first family of a `font-family` value that is not the browser's own. */
    private static function family(string $value): ?string
    {
        foreach (explode(',', $value) as $part) {
            $name = trim(trim($part), '"\' ');

            if ($name !== '' && ! in_array(strtolower($name), self::SYSTEM, true) && ! str_starts_with($name, 'var(')) {
                return mb_substr($name, 0, 60);
            }
        }

        return null;
    }

    /**
     * @param  list<array{0: string, 1: array<string, string>}>  $rules
     * @param  array<string, string>  $vars
     * @param  list<array{family: string, weight: int, url: string}>  $faces
     * @return array<string, array<string, mixed>|null>
     */
    private static function fonts(array $rules, array $vars, array $faces): array
    {
        $body = null;
        $heading = null;

        foreach ($rules as [$selector, $d]) {
            $value = self::resolve($d['font-family'] ?? '', $vars);
            $family = $value !== '' ? self::family($value) : null;

            if ($family === null) {
                continue;
            }

            foreach (array_map('trim', explode(',', strtolower($selector))) as $single) {
                if (in_array($single, ['html', 'body'], true)) {
                    $body ??= $family;
                } elseif (preg_match('/^h[1-3]$/', $single)) {
                    $heading ??= $family;
                }
            }
        }

        foreach ($vars as $name => $value) {
            $family = self::family(self::resolve($value, $vars));

            if ($family !== null && preg_match('/font/', $name)) {
                if (preg_match('/(heading|display|title)/', $name)) {
                    $heading ??= $family;
                } elseif (preg_match('/(body|text|base|sans|primary)/', $name)) {
                    $body ??= $family;
                }
            }
        }

        $heading ??= $body;

        return [
            'display' => $heading === null ? null : self::face($heading, 'display', $faces),
            'body' => $body === null ? null : self::face($body, 'body', $faces),
        ];
    }

    /**
     * @param  list<array{family: string, weight: int, url: string}>  $faces
     * @return array<string, mixed>
     */
    private static function face(string $family, string $role, array $faces): array
    {
        $known = self::FONTS[strtolower($family)] ?? null;

        if ($known !== null && $known[$role]) {
            return ['family' => $family, 'id' => $known['id'], 'custom' => null];
        }

        // A Google font (0.179.0): copied here on commit, which beats putting
        // the site's own file in a custom slot — the slots stay free, and
        // Google's copy carries every weight and script.
        if ($known === null && ($google = GoogleFontCatalogue::find(GoogleFontCatalogue::slug($family))) !== null) {
            return ['family' => $family, 'id' => 'g-'.$google['slug'], 'custom' => null];
        }

        $mine = array_values(array_filter($faces, fn (array $f) => strcasecmp($f['family'], $family) === 0));

        if ($known === null && $mine !== []) {
            usort($mine, fn (array $a, array $b) => abs($a['weight'] - 400) <=> abs($b['weight'] - 400));
            $bold = array_values(array_filter($mine, fn (array $f) => $f['weight'] >= 600));

            return ['family' => $family, 'id' => null, 'custom' => [
                'regular' => $mine[0]['url'],
                'bold' => $bold !== [] && $bold[0]['url'] !== $mine[0]['url'] ? $bold[0]['url'] : null,
            ]];
        }

        return ['family' => $family, 'id' => null, 'custom' => null];
    }
}
