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
            /*
             * Rules generated to the depth this payload actually uses.
             *
             * Laravel validates nested arrays through wildcards, and a wildcard
             * has to be written out per level — so a fixed set of rules is a
             * fixed ceiling on nesting. Measuring the submission first is what
             * makes the depth a property of the menu rather than of this file.
             */
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
        if ($depth > $this->submittedDepth()) {
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
     * A guard against a malicious payload, not a product limit.
     *
     * A menu nests as deep as somebody builds it — every renderer walks the
     * tree now, so a fourth level is drawn rather than saved and never shown,
     * which is what the old cap of two existed to prevent.
     *
     * What remains is arithmetic rather than design: validation, tree-building
     * and rendering are all recursive, and recursion on attacker-controlled
     * input with no floor is how a request exhausts the stack. Twenty is far
     * past anything a navigation could mean — a menu twenty deep is not a
     * navigation — so this is a bound on abuse, and it is worth being clear
     * that it is not an opinion about menus.
     */
    public const MAX_DEPTH = 20;

    /**
     * How deep the submitted tree actually goes.
     *
     * Memoised, because `rules()` walks it once per level while generating
     * wildcards and the payload does not change between calls.
     */
    private ?int $depth = null;

    private function submittedDepth(): int
    {
        return $this->depth ??= min(
            self::MAX_DEPTH,
            max(1, self::depthOf((array) $this->input('items', []))),
        );
    }

    /** @param array<mixed> $items */
    private static function depthOf(array $items, int $level = 1): int
    {
        $deepest = $level;

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $children = $item['children'] ?? null;

            if (is_array($children) && $children !== []) {
                $deepest = max($deepest, self::depthOf($children, $level + 1));
            }
        }

        return $deepest;
    }

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

        /*
         * The abuse ceiling, and it says so.
         *
         * This used to be the product's own limit of two, with a sentence
         * explaining that a third level would never be rendered. Every renderer
         * walks the whole tree now, so the sentence would be false — and a
         * refusal that gives a wrong reason is worse than the limit it enforces.
         */
        if (is_array($children) && $children !== [] && $depth >= self::MAX_DEPTH) {
            $v->errors()->add(
                "$path.children",
                sprintf(
                    '“%s” is %d levels down, which is as deep as this will go. That is a limit on runaway '
                    .'nesting rather than on menus — anything this deep is almost certainly a mistake.',
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
