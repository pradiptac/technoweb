<?php

namespace App\Http\Requests;

use App\Enums\MenuItemType;
use App\Enums\MenuLocation;
use App\Support\SiteSection;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A menu and the whole tree beneath it, in one request.
 *
 * The items arrive **nested**, exactly as the console drew them, and are
 * replaced wholesale — the rule `faqs`, `slides` and every other repeater
 * here follows. Omitting the key leaves the menu's items alone; sending `[]`
 * empties it, which has to be possible or the last item could never be
 * removed.
 */
class MenuRequest extends FormRequest
{
    public function rules(): array
    {
        $menu = $this->route('menu');

        return [
            'name' => [$this->isMethod('POST') ? 'required' : 'sometimes', 'string', 'max:120'],

            /*
             * Unique when set, ignoring nulls.
             *
             * Two menus claiming the header is a question with no answer, and
             * the frontend would have to pick one silently. Nullable because a
             * menu being built belongs nowhere yet.
             */
            'location' => [
                'nullable',
                Rule::enum(MenuLocation::class),
                Rule::unique('menus', 'location')->ignore($menu?->id),
            ],

            'items' => ['sometimes', 'array'],
            ...$this->itemRules('items.*', 1),
        ];
    }

    /**
     * The same rules at every level, generated rather than written twice.
     *
     * Depth is capped at what a location renders, and the cap is enforced by
     * there being **no rules for a fourth level** — plus the explicit check in
     * `withValidator`, which is what produces a sentence somebody can act on
     * rather than "items.0.children.0.children.0.children is not allowed".
     */
    private function itemRules(string $prefix, int $depth): array
    {
        if ($depth > self::MAX_DEPTH) {
            return [];
        }

        return [
            "$prefix.label" => ['required', 'string', 'max:80'],
            "$prefix.type" => ['required', Rule::enum(MenuItemType::class)],
            "$prefix.target_id" => ['nullable', 'integer'],
            /*
             * Validated against the allowlist rather than accepted as a
             * string, which is the entire reason this type exists: a custom
             * link is checked for *shape*, so `/blogs` saves happily and 404s
             * in the header of every page on the site.
             */
            "$prefix.target_key" => ['nullable', 'string', Rule::in(SiteSection::keys())],

            /*
             * A custom link's URL, and the one place a menu stores an address.
             *
             * Relative paths are the common case and are what the console
             * produces for an internal route with no record behind it, such as
             * /support. An absolute URL is allowed for an outbound link.
             * Anything else — `javascript:`, `data:` — is refused here, because
             * this string becomes an `href` on every page of the site.
             */
            "$prefix.url" => ['nullable', 'string', 'max:2048', 'regex:#^(/[^\s]*|https?://[^\s]+|mailto:[^\s]+|tel:[^\s]+)$#i'],

            "$prefix.icon" => ['nullable', 'string', 'max:60'],
            "$prefix.description" => ['nullable', 'string', 'max:160'],
            "$prefix.open_in_new_tab" => ['boolean'],
            "$prefix.is_active" => ['boolean'],
            "$prefix.children" => ['sometimes', 'array'],
            ...$this->itemRules("$prefix.children.*", $depth + 1),
        ];
    }

    /**
     * Two levels, because two levels is what either location renders.
     *
     * Storing a third would be data an editor arranges carefully and never
     * sees — the same failure as a CMS page template the frontend does not
     * know, which this API refuses with a 422 rather than falling back
     * silently.
     */
    public const MAX_DEPTH = 2;

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            foreach ((array) $this->input('items', []) as $i => $item) {
                $this->checkItem($v, $item, "items.$i", 1);
            }
        });
    }

    private function checkItem(Validator $v, mixed $item, string $path, int $depth): void
    {
        if (! is_array($item)) {
            return;
        }

        $type = MenuItemType::tryFrom($item['type'] ?? '');

        /*
         * A record type needs a record, and a custom link needs a URL.
         *
         * Neither is expressible as a field rule, because which one applies
         * depends on a sibling field — and an item that satisfies neither is
         * saved happily and then dropped at render, which reads as the menu
         * losing entries by itself.
         */
        if ($type === MenuItemType::Section && blank($item['target_key'] ?? null)) {
            $v->errors()->add("$path.target_key", 'Choose which part of the site this links to.');
        }

        if (
            $type !== null
            && $type !== MenuItemType::Custom
            && $type !== MenuItemType::Section
            && blank($item['target_id'] ?? null)
        ) {
            $v->errors()->add("$path.target_id", 'Choose which '.strtolower($type->label()).' this links to.');
        }

        if ($type === MenuItemType::Custom && blank($item['url'] ?? null)) {
            $v->errors()->add("$path.url", 'A custom link needs an address.');
        }

        $children = $item['children'] ?? [];

        if (is_array($children) && $children !== [] && $depth >= self::MAX_DEPTH) {
            $v->errors()->add(
                "$path.children",
                sprintf(
                    '“%s” is already as deep as a menu goes. Both places a menu can appear render %d levels — '
                    .'the top-level items and their children — so anything under this would be saved and never shown.',
                    $item['label'] ?? 'This item',
                    self::MAX_DEPTH,
                ),
            );

            return;
        }

        foreach ((array) $children as $i => $child) {
            $this->checkItem($v, $child, "$path.children.$i", $depth + 1);
        }
    }
}
