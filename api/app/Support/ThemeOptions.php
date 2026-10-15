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
 * structural — a section background is one of five kinds, a colour is a
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
    public const KINDS = ['default', 'page', 'solid', 'gradient', 'image', 'scene'];

    /** An animation's id, as the frontend lists them (`lib/login-backdrop-choices.ts`). Shape only, the motion rule. */
    private const SCENE = '/^[a-z][a-z0-9-]{1,31}$/';

    /**
     * A decorative layer over any ground but the theme's own (2026-10-05):
     * film grain, a mesh of the palette's colours, a soft glow, a grid or a
     * dot field. The frontend draws it on a sibling layer behind the words,
     * so the ink is still graded against the ground; `none` stores nothing.
     */
    public const TEXTURES = ['none', 'grain', 'mesh', 'glow', 'grid', 'dots'];

    private const ID = '/^[a-z][a-z0-9_-]{0,31}$/';

    private const HEX = '/^#[0-9a-f]{6}$/i';

    /**
     * The shape of a section's reveal id (`fade-up`, `zoom-in`, `none`…),
     * shared with the builder's `SectionRules`. The list is the frontend's
     * `SECTION_REVEALS`, beside the CSS that draws each one.
     */
    public const REVEAL = '/^[a-z][a-z0-9-]{0,15}$/';

    /**
     * The parts a theme's header and footer are made of (0.160.0). Which of
     * them a given theme draws, and which it lets move, is the theme's
     * manifest on the frontend; the lists here are only the ids a row may
     * name at all. `cta` and `cta2` are switched in their own objects
     * (`header.cta.on`), so they are ids for `order` but not keys of `parts`.
     */
    public const HEADER_PARTS = ['topbar', 'phone', 'email', 'search', 'utility', 'cta', 'cta2', 'cart', 'scheme'];

    public const FOOTER_PARTS = ['brand', 'tagline', 'address', 'phone', 'social', 'columns', 'signup', 'legal', 'credit', 'scheme'];

    /** The longest button label a header will print. */
    public const CTA_LABEL_MAX = 30;

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

                // The homepage's sections in the order to draw them: a list of
                // section ids, each the shape of an id, duplicates dropped.
                if ($key === 'section_order') {
                    if (! is_array($value) || ! array_is_list($value)) {
                        throw new \InvalidArgumentException("The section order for \"{$theme}\" must be a list.");
                    }
                    $ids = [];
                    foreach ($value as $id) {
                        if (! is_string($id) || ! preg_match(self::ID, $id)) {
                            throw new \InvalidArgumentException("\"{$id}\" is not the shape of a section id.");
                        }
                        if (! in_array($id, $ids, true)) {
                            $ids[] = $id;
                        }
                    }
                    if (count($ids) > 64) {
                        throw new \InvalidArgumentException("The section order for \"{$theme}\" is longer than any homepage.");
                    }
                    $cleaned[$key] = $ids;

                    continue;
                }

                // The header's and the footer's parts (0.160.0).
                if ($key === 'header' || $key === 'footer') {
                    $chrome = self::cleanChrome($theme, $key, $value);
                    if ($chrome !== []) {
                        $cleaned[$key] = (object) $chrome;
                    }

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

    /**
     * One theme's `header` or `footer` object: `parts` (id → `{on: bool}`),
     * `order` (known ids, no repeats) and, for the header, `cta`/`cta2`
     * (`{label, href, on}`). Only what is present is kept and an empty
     * object stores nothing, so absent means the theme's own default — the
     * defaults live in the manifests, which is why the console sends
     * differences and this only refuses what is not a shape.
     *
     * @return array<string, mixed>
     *
     * @throws \InvalidArgumentException
     */
    private static function cleanChrome(string $theme, string $which, mixed $value): array
    {
        if (! is_array($value) || (array_is_list($value) && $value !== [])) {
            throw new \InvalidArgumentException("The {$which} options for \"{$theme}\" must be an object.");
        }

        $header = $which === 'header';
        $known = $header ? self::HEADER_PARTS : self::FOOTER_PARTS;
        // A header's cta/cta2 carry their own switch; they are not `parts` keys.
        $switchable = $header ? array_values(array_diff($known, ['cta', 'cta2'])) : $known;
        $out = [];

        foreach (array_keys($value) as $k) {
            if (! in_array($k, array_merge(['parts', 'order'], $header ? ['cta', 'cta2'] : []), true)) {
                throw new \InvalidArgumentException("\"{$k}\" is not something a {$which} can be set to.");
            }
        }

        if (isset($value['parts'])) {
            if (! is_array($value['parts'])) {
                throw new \InvalidArgumentException("The {$which} parts for \"{$theme}\" must be an object.");
            }
            $parts = [];
            foreach ($value['parts'] as $id => $part) {
                if (! in_array($id, $switchable, true)) {
                    throw new \InvalidArgumentException("\"{$id}\" is not a {$which} part.");
                }
                if (! is_array($part) || ! is_bool($part['on'] ?? null)) {
                    throw new \InvalidArgumentException("The \"{$id}\" part needs on or off.");
                }
                $parts[$id] = (object) ['on' => $part['on']];
            }
            if ($parts !== []) {
                $out['parts'] = (object) $parts;
            }
        }

        if (isset($value['order'])) {
            if (! is_array($value['order']) || ! array_is_list($value['order'])) {
                throw new \InvalidArgumentException("The {$which} order for \"{$theme}\" must be a list.");
            }
            $ids = [];
            foreach ($value['order'] as $id) {
                if (! in_array($id, $known, true)) {
                    throw new \InvalidArgumentException("\"{$id}\" is not a {$which} part.");
                }
                if (! in_array($id, $ids, true)) {
                    $ids[] = $id;
                }
            }
            if ($ids !== []) {
                $out['order'] = $ids;
            }
        }

        if ($header) {
            foreach (['cta', 'cta2'] as $button) {
                if (! isset($value[$button])) {
                    continue;
                }
                $row = self::cleanButton($button, $value[$button]);
                if ($row !== []) {
                    $out[$button] = (object) $row;
                }
            }
        }

        return $out;
    }

    /**
     * A header button: its label (plain text), its link (`LinkPattern`) and
     * its switch. A blank label or link means the theme's own, and is not
     * stored.
     *
     * @return array<string, mixed>
     *
     * @throws \InvalidArgumentException
     */
    private static function cleanButton(string $button, mixed $value): array
    {
        if (! is_array($value)) {
            throw new \InvalidArgumentException("The {$button} button must be an object.");
        }

        $row = [];

        $label = $value['label'] ?? null;
        if ($label !== null && $label !== '') {
            if (! is_string($label) || trim($label) === '' || mb_strlen($label) > self::CTA_LABEL_MAX || $label !== strip_tags($label)) {
                throw new \InvalidArgumentException('A button label is plain text of '.self::CTA_LABEL_MAX.' characters or fewer.');
            }
            $row['label'] = trim($label);
        }

        $href = $value['href'] ?? null;
        if ($href !== null && $href !== '') {
            if (! is_string($href) || ! LinkPattern::allows($href)) {
                throw new \InvalidArgumentException('A button links to a path on this site, an http(s) address, a mailto: or a tel:.');
            }
            $row['href'] = $href;
        }

        if (array_key_exists('on', $value)) {
            if (! is_bool($value['on'])) {
                throw new \InvalidArgumentException("The {$button} button needs on or off.");
            }
            $row['on'] = $value['on'];
        }

        return $row;
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

            $row = self::background($section, $bg);

            // How the section arrives on scroll (2026-09-27). Kept beside the
            // background rather than inside `background()`, which a builder
            // section shares and which has no business with motion; and kept
            // on a default-background row, which would otherwise store
            // nothing and lose the choice.
            $reveal = $bg['reveal'] ?? null;
            if ($reveal !== null && $reveal !== '' && $reveal !== 'none') {
                if (! is_string($reveal) || ! preg_match(self::REVEAL, $reveal)) {
                    throw new \InvalidArgumentException("How \"{$section}\" appears is not the shape of a reveal id.");
                }
                $row = ($row ?? ['kind' => 'default']) + ['reveal' => $reveal];
            }

            if ($row !== null) {
                $out[$section] = $row;
            }
        }

        return $out;
    }

    /**
     * One section background, cleaned — the rule a homepage section and a
     * page-builder section (`App\Support\PageSections\SectionRules`) share,
     * so a background means one thing wherever it is chosen. Null for the
     * theme's own ground when nothing else is said; throws with one sentence
     * naming `$label` otherwise.
     *
     * @return array<string, mixed>|null
     *
     * @throws \InvalidArgumentException
     */
    public static function background(string $label, mixed $bg): ?array
    {
        $section = $label;

        if (! is_array($bg)) {
            throw new \InvalidArgumentException("The background for \"{$section}\" must be an object.");
        }

        $kind = $bg['kind'] ?? 'default';

        if (! in_array($kind, self::KINDS, true)) {
            throw new \InvalidArgumentException("A section background is solid, gradient, image, animation, page or default — not \"{$kind}\".");
        }

        // Whether the section renders at all. Anything but an explicit
        // false is on: the switch must never be tripped by a value that
        // arrived as a string, a number or by accident.
        $enabled = ($bg['enabled'] ?? true) !== false;

        // A default carries nothing, so a row that is both default and
        // switched on stores nothing; a switched-off default is kept for
        // the switch alone.
        if ($kind === 'default') {
            return $enabled ? null : ['kind' => 'default', 'enabled' => false];
        }

        $row = ['kind' => $kind];
        if (! $enabled) {
            $row['enabled'] = false;
        }

        // An animation (0.126.0): one of the sign-in screen's canvas scenes
        // over the theme's dark band. It names a scene and carries nothing
        // else — no colour, since the ground is the theme's own, and no
        // texture, since the scene is the texture.
        if ($kind === 'scene') {
            $scene = $bg['scene'] ?? null;
            if (! is_string($scene) || ! preg_match(self::SCENE, $scene)) {
                throw new \InvalidArgumentException("Choose an animation for \"{$section}\".");
            }
            $row['scene'] = $scene;

            return $row;
        }

        $texture = $bg['texture'] ?? 'none';
        if (! is_string($texture) || ! in_array($texture, self::TEXTURES, true)) {
            throw new \InvalidArgumentException('A texture is grain, mesh, glow, grid, dots or none.');
        }
        if ($texture !== 'none') {
            $row['texture'] = $texture;
        }

        // "None" — the page's own ground — carries no colour at all.
        if ($kind === 'page') {
            return $row;
        }

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

        return $row;
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
                    $decoded[$theme]['sections'][$section]['image_url'] = MediaUrl::for($bg['image_path']);

                    // And the file's focal point beside it, when one is set —
                    // a section background is cropped to the band's height.
                    if (($focus = MediaMeta::focus($bg['image_path'])) !== null) {
                        $decoded[$theme]['sections'][$section]['image_focus'] = $focus;
                    }
                }
            }
        }

        return json_encode($decoded, JSON_UNESCAPED_SLASHES) ?: '{}';
    }
}
