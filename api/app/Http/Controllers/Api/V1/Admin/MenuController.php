<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MenuItemType;
use App\Enums\MenuLocation;
use App\Http\Controllers\Controller;
use App\Http\Requests\MenuRequest;
use App\Http\Resources\Admin\MenuResource;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Support\DefaultMenu;
use App\Support\SiteSection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Menus, and the tree each one holds.
 *
 * Bound by **id**, like every other CMS entity here: a menu's name is editable
 * and a route keyed on something the form can change breaks mid-save.
 */
class MenuController extends Controller
{
    public function index(): JsonResource
    {
        $menus = Menu::withCount('items')->orderBy('name')->get();

        return MenuResource::collection($menus)->additional([
            'meta' => [
                'locations' => MenuLocation::options(),
                'types' => MenuItemType::options(),
                // Sent by the API, never listed in TypeScript -- the rule
                // `schema_type_options` and `meta.transitions` already follow.
                'sections' => SiteSection::options(),
                'max_depth' => MenuRequest::MAX_DEPTH,
            ],
        ]);
    }

    /**
     * The records an item can point at, for the builder's picker.
     *
     * Searched and capped rather than dumped: a catalogue runs to hundreds of
     * products, and a select holding all of them is one an editor cannot find
     * anything in — the same reasoning that keeps `iconMap` to 88 icons rather
     * than re-exporting Lucide's 1,600.
     *
     * `url` comes back with each row so the console can show where a choice
     * will actually go before it is made, built by the same enum the renderer
     * uses. Two implementations of "where does a solution live" is exactly the
     * drift that put `blog-posts` in `admin_path` while the console served
     * `/admin/blog`.
     */
    public function targets(Request $request): JsonResponse
    {
        $type = MenuItemType::tryFrom((string) $request->query('type'));

        if ($type === null || $type->model() === null) {
            return response()->json(['data' => []]);
        }

        $model = $type->model();
        $title = $type->titleColumn();
        $term = trim((string) $request->query('q'));

        $rows = $model::query()
            ->when($term !== '', fn ($q) => $q->where($title, 'like', '%'.$term.'%'))
            ->orderBy($title)
            ->limit(50)
            ->get();

        return response()->json([
            'data' => $rows->map(fn ($row) => [
                'id' => $row->id,
                'label' => $row->{$title},
                'url' => $type->url($row),
            ])->values(),
        ]);
    }

    public function store(MenuRequest $request): JsonResponse
    {
        $menu = Menu::create($request->safe()->only(['name', 'location']));

        $this->syncItems($menu, $request->input('items'));

        // `->response()` rather than `response()->json($resource)`: the second
        // serialises the resource without its `data` wrapper, so a created menu
        // came back shaped unlike every other read of the same thing.
        return (new MenuResource($this->load($menu)))->response()->setStatusCode(201);
    }

    public function show(Menu $menu): JsonResource
    {
        return new MenuResource($this->load($menu));
    }

    public function update(MenuRequest $request, Menu $menu): JsonResource
    {
        $menu->update($request->safe()->only(['name', 'location']));

        $this->syncItems($menu, $request->input('items'));

        return new MenuResource($this->load($menu));
    }

    public function destroy(Menu $menu): JsonResponse
    {
        $menu->delete();

        return response()->json(null, 204);
    }

    /**
     * Rebuild a location's menu from the catalogue as it stands today.
     *
     * **Destructive, and the only thing in this module that is.** It discards
     * whatever an editor arranged for that location and replaces it with the
     * navigation the site renders when no menu is assigned. That is the point —
     * it is the way back from a menu somebody has made a mess of — but it is
     * also why the console asks first.
     *
     * The menu row is **kept**: same id, same name, same `location`. Deleting
     * and recreating would unassign the live navigation for however long
     * nobody noticed, and would break every link into `/admin/menus/{id}`.
     *
     * Creates one if the location has none, so the button works on an install
     * that has never run `technoware:seed-menus`.
     */
    public function rebuild(string $location): JsonResponse
    {
        $where = MenuLocation::tryFrom($location);

        if ($where === null) {
            return response()->json(['message' => 'There is no such menu location.'], 422);
        }

        $menu = Menu::where('location', $where)->first()
            ?? Menu::create([
                'name' => $where->defaultName(),
                'location' => $where,
            ]);

        $warnings = DB::transaction(fn () => DefaultMenu::rebuild($menu, $where->value));

        return response()->json([
            'data' => [
                'id' => $menu->id,
                'items' => $menu->items()->count(),
                /*
                 * What was left out and why — a footer short of a link is
                 * exactly the kind of thing nobody notices, so it is returned
                 * rather than swallowed.
                 */
                'warnings' => $warnings,
            ],
        ]);
    }

    /**
     * Load the whole tree, to whatever depth it goes.
     *
     * `preventLazyLoading` is on outside production, so anything the resource
     * touches has to be loaded — including `target`, which is a morph and is
     * what `resolved_url` is built from. `Menu::tree()` does both in one query.
     */
    private function load(Menu $menu): Menu
    {
        /*
         * The tree is built in PHP and attached as `roots`, because a menu
         * nests without limit: `roots.children.target` is two levels written
         * as a query, and every deeper level would be another clause here.
         *
         * `MenuItemResource` recurses through `whenLoaded('children')`, which
         * `tree()` sets on every item — so the resource is unchanged and works
         * to any depth.
         */
        $menu->setRelation('roots', $menu->tree());

        return $menu->loadCount('items');
    }

    /**
     * Replace the whole tree with the one submitted.
     *
     * Wholesale, like `slides` and `faqs`, and here it buys something extra:
     * the structure arrives nested, so `parent_id` and `sort_order` are read
     * off the shape of the payload rather than trusted from it. **A cycle is
     * therefore unrepresentable** — the thing `Location` needs a `wouldCycle()`
     * check for cannot be expressed in a nested array at all.
     *
     * `null` means the key was absent: leave the items alone. `[]` means empty
     * the menu, which has to be a real instruction or the last item could
     * never be deleted.
     *
     * In a transaction because a half-written navigation is on every page of
     * the site. Deleting the old rows and inserting the new ones is two
     * statements, and a failure between them would leave the header empty.
     */
    private function syncItems(Menu $menu, ?array $items): void
    {
        if ($items === null) {
            return;
        }

        DB::transaction(function () use ($menu, $items) {
            // Roots only: `parent_id` cascades, so the subtrees go with them.
            $menu->items()->whereNull('parent_id')->get()->each->delete();

            $this->createLevel($menu, $items, null);
        });
    }

    private function createLevel(Menu $menu, array $items, ?int $parentId): void
    {
        foreach (array_values($items) as $i => $item) {
            $type = MenuItemType::from($item['type']);

            $created = MenuItem::create([
                'menu_id' => $menu->id,
                'parent_id' => $parentId,
                // The order the editor dragged them into, not a number they
                // maintain — the same rule the slider's slides follow.
                'sort_order' => $i,
                'label' => $item['label'],
                'type' => $type,
                /*
                 * The morph alias, never a class name. `enforceMorphMap`
                 * throws for anything unregistered, and the enum's values
                 * *are* the aliases — which is why it has no second list.
                 */
                /*
                 * A section is record-less like a custom link, so it carries
                 * no morph at all. Writing `'section'` here would look tidy and
                 * throw: `enforceMorphMap` refuses an alias it does not know,
                 * and `section` is not a model.
                 */
                'target_type' => $type->model() === null ? null : $type->value,
                'target_id' => $type->model() === null ? null : ($item['target_id'] ?? null),
                'target_key' => $type === MenuItemType::Section ? ($item['target_key'] ?? null) : null,
                'url' => $type === MenuItemType::Custom ? ($item['url'] ?? null) : null,
                'icon' => $item['icon'] ?? null,
                'description' => $item['description'] ?? null,
                'open_in_new_tab' => (bool) ($item['open_in_new_tab'] ?? false),
                'is_active' => (bool) ($item['is_active'] ?? true),
            ]);

            if (! empty($item['children'])) {
                $this->createLevel($menu, $item['children'], $created->id);
            }
        }
    }
}
