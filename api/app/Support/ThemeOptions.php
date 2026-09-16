<?php

namespace App\Support;

/**
 * The shape of `site_theme_options`, one JSON row holding every theme's
 * choices: `{ "<theme id>": { "menu_style": "...", "hero_style": "...",
 * "sections": { "<section id>": { "kind": "solid", "colour": "#0b1020", ... } } } }`.
 *
 * Checked for **shape**, the rule `site_theme` and the motion group follow:
 * the themes, the menu styles and the section ids are lists on the
 * frontend, where the code that renders them lives, and a copy here would
 * be the drift nothing type-checks across the wire. What *is* fixed here is
 * structural — a section background is one of four kinds, a colour is a
 * hex, an angle is degrees, an overlay is a percentage — because a value
 * outside those is not "an id the frontend does not know" but a shape the
 * frontend cannot render at all.
 *
 * `withUrls()` is the other half: a section's `image_path` is a media path,
 * and the frontend cannot turn a path into a URL — every `_path` setting is
 * published with its `_url` for that reason, and a path buried in JSON
 * needs the same service.
 */
final class ThemeOptions
{
    public const KINDS = ['default', 'solid', 'gradient', 'image'];

    private const ID = '/^[a-z][a-z0-9_-]{0,31}$/';

    private const HEX = '/^#[0-9a-f]{6}$/i';

    /** The most a row may hold — a few themes' worth, not a document. */
    private const MAX_BYTES = 32768;

    /**
     * Validate and normalise. Returns the cleaned JSON, or throws with one
     * sentence a person can act on.
     *
     * @throws \InvalidArgumentException
     */
    public static function clean(string $json): string
    {
        if (strlen($json) > self::MAX_BYTES) {
            throw new \InvalidArgumentException('The theme options are too large to store.');
        }

        $decoded = json_decode($json, true);

        if (! is_array($decoded) || array_is_list($decoded) && $decoded !== []) {
            throw new \InvalidArgumentException('The theme options must be an object keyed by theme.');
        }

        $out = [];

        foreach ($decoded as $theme => $options) {
            if (! is_string($theme) || ! preg_match(self::ID, $theme)) {
                throw new \InvalidArgumentException("\"{$theme}\" is not the shape of a theme id.");
            }

            if (! is_array($options)) {
                throw new \InvalidArgumentException("The options for \"{$theme}\" must be an object.");
            }

            $cleaned = [];

            foreach ($options as $key => $value) {
                if (! is_string($key) || ! preg_match(self::ID, $key)) {
                    throw new \InvalidArgumentException("\"{$key}\" is not the shape of an option key.");
                }

                if ($key === 'sections') {
                    $cleaned[$key] = (object) self::cleanSections($theme, $value);

                    continue;
                }

                // Every other option is a choice id: the list lives with the
                // theme that declares it.
                if (! is_string($value) || ! preg_match(self::ID, $value)) {
                    throw new \InvalidArgumentException("The \"{$key}\" option for \"{$theme}\" is not the shape of a choice.");
                }

                $cleaned[$key] = $value;
            }

            $out[$theme] = (object) $cleaned;
        }

        return json_encode((object) $out, JSON_UNESCAPED_SLASHES) ?: '{}';
    }

    /** @return array<string, array<string, mixed>> */
    private static function cleanSections(string $theme, mixed $sections): array
    {
        if (! is_array($sections)) {
            throw new \InvalidArgumentException("The section backgrounds for \"{$theme}\" must be an object.");
        }

        $out = [];

        foreach ($sections as $section => $bg) {
            if (! is_string($section) || ! preg_match(self::ID, $section)) {
                throw new \InvalidArgumentException("\"{$section}\" is not the shape of a section id.");
            }

            if (! is_array($bg)) {
                throw new \InvalidArgumentException("The background for \"{$section}\" must be an object.");
            }

            $kind = $bg['kind'] ?? 'default';

            if (! in_array($kind, self::KINDS, true)) {
                throw new \InvalidArgumentException("A section background is solid, gradient, image or default — not \"{$kind}\".");
            }

            // A default carries nothing; storing it at all is only so an
            // editor's row survives a save with the kind put back.
            if ($kind === 'default') {
                continue;
            }

            $row = ['kind' => $kind];

            // A second colour belongs to a gradient alone; a solid or a
            // picture that arrived with one (the console keeps a value the
            // editor typed before switching kind) stores it nowhere.
            foreach ($kind === 'gradient' ? ['colour', 'colour2'] : ['colour'] as $c) {
                if (isset($bg[$c]) && $bg[$c] !== '') {
                    if (! is_string($bg[$c]) || ! preg_match(self::HEX, $bg[$c])) {
                        throw new \InvalidArgumentException("The {$c} for \"{$section}\" must be a #rrggbb colour.");
                    }
                    $row[$c] = strtolower($bg[$c]);
                }
            }

            if ($kind !== 'image' && ! isset($row['colour'])) {
                throw new \InvalidArgumentException("The background for \"{$section}\" needs a colour.");
            }

            if ($kind === 'gradient' && ! isset($row['colour2'])) {
                throw new \InvalidArgumentException("The gradient for \"{$section}\" needs a second colour.");
            }

            if (isset($bg['angle']) && $bg['angle'] !== '') {
                $angle = filter_var($bg['angle'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 360]]);
                if ($angle === false) {
                    throw new \InvalidArgumentException("The angle for \"{$section}\" must be 0–360 degrees.");
                }
                $row['angle'] = $angle;
            }

            if ($kind === 'image') {
                $path = $bg['image_path'] ?? null;
                if (! is_string($path) || $path === '' || strlen($path) > 255 || str_contains($path, '..') || str_starts_with($path, '/')) {
                    throw new \InvalidArgumentException("The picture for \"{$section}\" must be a media library path.");
                }
                $row['image_path'] = $path;

                $overlay = filter_var($bg['overlay'] ?? 60, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 90]]);
                if ($overlay === false) {
                    throw new \InvalidArgumentException("The overlay for \"{$section}\" must be 0–90 percent.");
                }
                $row['overlay'] = $overlay;
            }

            $out[$section] = $row;
        }

        return $out;
    }

    /**
     * The stored JSON with an `image_url` beside every `image_path`, for the
     * two responses that publish it. A row that does not parse — hand-edited
     * in the database — is returned as `{}`, because the frontend's fallback
     * for "no options" is the theme's defaults and the alternative is a page
     * that cannot render.
     *
     * @return non-empty-string
     */
    public static function withUrls(?string $json): string
    {
        $decoded = is_string($json) ? json_decode($json, true) : null;

        if (! is_array($decoded)) {
            return '{}';
        }

        foreach ($decoded as $theme => $options) {
            if (! is_array($options) || ! is_array($options['sections'] ?? null)) {
                continue;
            }

            foreach ($options['sections'] as $section => $bg) {
                if (is_array($bg) && is_string($bg['image_path'] ?? null) && $bg['image_path'] !== '') {
                    $decoded[$theme]['sections'][$section]['image_url'] = asset('storage/'.$bg['image_path']);
                }
            }
        }

        return json_encode($decoded, JSON_UNESCAPED_SLASHES) ?: '{}';
    }
}
