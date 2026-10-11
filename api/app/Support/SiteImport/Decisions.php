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
 *  - **skip** — pages to leave out, by their old path.
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
        ];
    }

    /**
     * The decisions a `PATCH` may set, checked. Unknown keys are dropped.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function validate(array $input): array
    {
        $out = [];

        if (array_key_exists('set_homepage', $input)) {
            $out['set_homepage'] = filter_var($input['set_homepage'], FILTER_VALIDATE_BOOLEAN);
        }

        if (array_key_exists('menus', $input)) {
            $menus = array_values(array_unique(array_map('strval', (array) $input['menus'])));

            if (array_diff($menus, array_keys(MenusStep::NAMES)) !== []) {
                throw ValidationException::withMessages(['menus' => 'Choose from the menus that were found.']);
            }

            $out['menus'] = $menus;
        }

        if (array_key_exists('skip', $input)) {
            $skip = array_values(array_unique(array_map('strval', (array) $input['skip'])));

            foreach ($skip as $path) {
                if (! str_starts_with($path, '/') || mb_strlen($path) > 300) {
                    throw ValidationException::withMessages(['skip' => 'A page to leave out is named by its address, starting with a slash.']);
                }
            }

            $out['skip'] = array_slice($skip, 0, 2000);
        }

        return $out;
    }

    /** @param  list<array<string, mixed>>  $items */
    private static function count(array $items): int
    {
        return array_sum(array_map(fn (array $i) => 1 + self::count($i['children'] ?? []), $items));
    }
}
