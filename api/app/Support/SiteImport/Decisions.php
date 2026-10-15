<?php

namespace App\Support\SiteImport;

use App\Support\SiteImport\Steps\MenusStep;
use Illuminate\Validation\ValidationException;

/**
 * What the review asks a person to settle, and what it settled.
 *
 * `options()` is what the screen draws: the choices with their current value
 * and the facts they turn on. `validate()` checks what a `PATCH` sends back.
 * The stored decisions live on `site_imports.decisions` and the steps read
 * them through `Context::decision()`.
 *
 *  - **set_homepage** — make the imported home page the site's home page
 *    (`homepage_page_id`). Off unless ticked; the page is a draft until
 *    published, and the setting names it only while it is published.
 *  - **menus** — which of the menus found to bring across (all by default).
 *  - **kinds** — what each page becomes, by its old path: `page`, `post`,
 *    `product` or `skip`. Only a page the person changed is stored; every
 *    other page is what the rules (or the AI) found. It replaced 0.163.0's
 *    `skip` list, which is still accepted: a path in `skip` is `skip`.
 *  - **ai_assist** — whether the AI may place what the rules could not, and
 *    settle which kind an ambiguous page is. On by default only while the
 *    assistant is available.
 *  - **brand** — `{accept, colours, fonts}`: whether to apply the site's
 *    colours and fonts to this one, and which of the two. **Never applied
 *    unless `accept` is true**, which it is not until somebody ticks it.
 */
final class Decisions
{
    /** @return array<string, mixed> */
    public static function options(Context $ctx): array
    {
        $site = $ctx->site();
        $home = collect($ctx->rows)->first(fn (array $row) => $row['path'] === '/' && $row['action'] !== 'skip');
        $chosen = $ctx->decision('menus');
        $menus = [];

        foreach (MenusStep::NAMES as $key => $name) {
            $items = (array) (($site['menus'] ?? [])[$key] ?? []);

            if ($items !== []) {
                $menus[] = [
                    'key' => $key,
                    'label' => $name,
                    'items' => self::count($items),
                    'value' => $chosen === null || in_array($key, (array) $chosen, true),
                ];
            }
        }

        return [
            'set_homepage' => [
                'value' => (bool) $ctx->decision('set_homepage', false),
                'page' => $home === null ? null : ['path' => $home['path'], 'title' => $home['title']],
            ],
            'menus' => $ctx->import->wants('menus') ? $menus : [],
            'ai_assist' => [
                'value' => $ctx->aiOn(),
                'available' => AiSections::available(),
                'reason' => AiSections::reason(),
            ],
            'kinds' => [
                ['value' => PageKind::PAGE, 'label' => 'Page'],
                ['value' => PageKind::POST, 'label' => 'Blog post'],
                ['value' => PageKind::PRODUCT, 'label' => 'Catalogue product'],
                ['value' => PageKind::SKIP, 'label' => 'Leave out'],
            ],
            'brand' => self::brand($ctx),
        ];
    }

    /**
     * The brand the scan found, and the choice about it.
     *
     * @return array<string, mixed>
     */
    private static function brand(Context $ctx): array
    {
        $found = (array) ($ctx->site()['brand'] ?? []);
        $choice = self::brandChoice($ctx);

        return [
            'found' => (bool) ($found['found'] ?? false),
            'sheets' => (int) ($found['sheets'] ?? 0),
            'colours' => (array) ($found['colours'] ?? []),
            'fonts' => (array) ($found['fonts'] ?? []),
            'accept' => $choice['accept'],
            'use_colours' => $choice['colours'],
            'use_fonts' => $choice['fonts'],
        ];
    }

    /**
     * What was decided about the brand, with its defaults: not accepted, and —
     * once it is — both colours and fonts.
     *
     * @return array{accept: bool, colours: bool, fonts: bool}
     */
    public static function brandChoice(Context $ctx): array
    {
        $stored = (array) $ctx->decision('brand', []);

        return [
            'accept' => (bool) ($stored['accept'] ?? false),
            'colours' => (bool) ($stored['colours'] ?? true),
            'fonts' => (bool) ($stored['fonts'] ?? true),
        ];
    }

    /**
     * What a page was told to become, or null when nothing was said (the
     * rules decide). 0.163.0's `skip` list still counts.
     */
    public static function kindFor(Context $ctx, string $path): ?string
    {
        $kinds = (array) $ctx->decision('kinds', []);

        if (isset($kinds[$path]) && in_array($kinds[$path], PageKind::CHOICES, true)) {
            return (string) $kinds[$path];
        }

        return in_array($path, (array) $ctx->decision('skip', []), true) ? PageKind::SKIP : null;
    }

    /**
     * The decisions a `PATCH` may set, checked. Unknown keys are dropped.
     *
     * `skip` is the old name for pages left out and is read as `kinds`
     * entries of `skip`, added to the kinds already chosen.
     *
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $stored  the decisions already stored
     * @return array<string, mixed>
     */
    public static function validate(array $input, array $stored = []): array
    {
        $out = [];

        if (array_key_exists('set_homepage', $input)) {
            $out['set_homepage'] = filter_var($input['set_homepage'], FILTER_VALIDATE_BOOLEAN);
        }

        if (array_key_exists('ai_assist', $input)) {
            $out['ai_assist'] = filter_var($input['ai_assist'], FILTER_VALIDATE_BOOLEAN);
        }

        if (array_key_exists('menus', $input)) {
            $menus = array_values(array_unique(array_map('strval', (array) $input['menus'])));

            if (array_diff($menus, array_keys(MenusStep::NAMES)) !== []) {
                throw ValidationException::withMessages(['menus' => 'Choose from the menus that were found.']);
            }

            $out['menus'] = $menus;
        }

        if (array_key_exists('kinds', $input)) {
            $out['kinds'] = self::kinds((array) $input['kinds']);
            // The old list is superseded by the map the screen holds.
            $out['skip'] = [];
        }

        if (array_key_exists('skip', $input)) {
            $skip = array_values(array_unique(array_map('strval', (array) $input['skip'])));

            foreach ($skip as $path) {
                self::path($path, 'skip');
            }

            // The old list is `kinds` entries of `skip`, added to the choices already made —
            // and, sent without `kinds`, to the pages 0.163.0 left out.
            $kinds = array_key_exists('kinds', $out) ? $out['kinds'] : (array) ($stored['kinds'] ?? []);

            foreach (array_slice([...(array_key_exists('kinds', $out) ? [] : (array) ($stored['skip'] ?? [])), ...$skip], 0, 2000) as $path) {
                $kinds[$path] = PageKind::SKIP;
            }

            $out['kinds'] = $kinds;
            $out['skip'] = [];
        }

        if (array_key_exists('brand', $input)) {
            $brand = (array) $input['brand'];
            $out['brand'] = [];

            foreach (['accept', 'colours', 'fonts'] as $key) {
                if (array_key_exists($key, $brand)) {
                    $out['brand'][$key] = filter_var($brand[$key], FILTER_VALIDATE_BOOLEAN);
                }
            }

            // Replaced key by key at the top, so a partial brand keeps what it did not mention.
            $out['brand'] = array_replace((array) ($stored['brand'] ?? []), $out['brand']);
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $kinds
     * @return array<string, string>
     */
    private static function kinds(array $kinds): array
    {
        $out = [];

        foreach (array_slice($kinds, 0, 3000, true) as $path => $kind) {
            self::path((string) $path, 'kinds');

            if (! in_array($kind, PageKind::CHOICES, true)) {
                throw ValidationException::withMessages(['kinds' => 'A page becomes a page, a blog post, a catalogue product, or is left out.']);
            }

            $out[(string) $path] = (string) $kind;
        }

        return $out;
    }

    private static function path(string $path, string $field): void
    {
        if (! str_starts_with($path, '/') || mb_strlen($path) > 300) {
            throw ValidationException::withMessages([$field => 'A page is named by its address, starting with a slash.']);
        }
    }

    /** @param  list<array<string, mixed>>  $items */
    private static function count(array $items): int
    {
        return array_sum(array_map(fn (array $i) => 1 + self::count($i['children'] ?? []), $items));
    }
}
