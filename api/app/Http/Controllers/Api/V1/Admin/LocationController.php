<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\LocationRequest;
use App\Http\Resources\Admin\LocationResource;
use App\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The places the company works in. Behind auth:sanctum + role:seo_manager.
 *
 * Bound by id rather than by slug, the rule every CMS entity here follows: the
 * edit form can change the slug it is addressed by, and a slug-bound route
 * breaks mid-save.
 */
class LocationController extends Controller
{
    private const WITH = ['parent', 'services', 'solutions'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $locations = Location::query()
            ->with(self::WITH)
            ->withCount(['landingPages', 'children'])
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where('name', 'like', "%{$term}%");
            })
            ->when($request->filled('level'), fn ($q) => $q->where('level', $request->string('level')))
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            /*
             * Broadest first, then by name, so a parent always arrives before
             * its children and the console can render the nesting as it reads.
             *
             * **Ordered by depth, not by the column.** `level` is a string, so
             * `orderBy('level')` sorts it alphabetically — area, city, country,
             * state — which is very nearly the reverse of what is wanted and
             * looks plausible enough in a three-row list to survive review. Salt
             * Lake came out above the Kolkata it belongs to.
             */
            ->orderByRaw("field(level, 'country', 'state', 'city', 'area')")
            ->orderBy('sort_order')->orderBy('name')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        return LocationResource::collection($locations);
    }

    public function show(Location $location): JsonResource
    {
        return new LocationResource(
            $location->load(self::WITH)->loadCount(['landingPages', 'children']),
        );
    }

    public function store(LocationRequest $request): JsonResponse
    {
        $data = $request->validated();
        $location = Location::create($this->columns($data));
        $this->writeRelations($location, $data);

        return response()->json([
            'data' => new LocationResource($location->load(self::WITH)->loadCount(['landingPages', 'children'])),
        ], 201);
    }

    public function update(LocationRequest $request, Location $location): JsonResource
    {
        $data = $request->validated();
        $location->update($this->columns($data));
        $this->writeRelations($location, $data);

        return new LocationResource(
            $location->fresh()->load(self::WITH)->loadCount(['landingPages', 'children']),
        );
    }

    /**
     * Refused while anything depends on it.
     *
     * Two reasons, and they fail differently. Landing pages hold `location_id`
     * as `nullOnDelete`, so deleting one would leave a live URL resolving to a
     * page that no longer knows which city it is about. Children hold
     * `parent_id` as `restrictOnDelete`, so the database would refuse anyway —
     * but a foreign-key error reaches the console as "something went wrong",
     * and what somebody needs to be told is that Salt Lake and New Town are
     * inside this and have to be moved first.
     *
     * Deactivating is the answer to "we do not work there any more": it stops
     * new pages being proposed and leaves the existing ones to be dealt with
     * deliberately.
     */
    public function destroy(Location $location): JsonResponse
    {
        $pages = $location->landingPages()->count();
        $children = $location->children()->count();

        if ($children > 0) {
            $names = $location->children()->limit(4)->pluck('name')->implode(', ');

            return response()->json([
                'message' => "{$children} ".($children === 1 ? 'place sits' : 'places sit')." inside {$location->name} ({$names}). Move them somewhere else first, or switch this one off instead.",
            ], 422);
        }

        if ($pages > 0) {
            return response()->json([
                'message' => "{$pages} landing ".($pages === 1 ? 'page is' : 'pages are')." about {$location->name}. Delete or re-point those first, or switch this location off instead.",
            ], 422);
        }

        $location->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    /* ------------------------------------------------------------ plumbing */

    private function columns(array $data): array
    {
        return array_intersect_key($data, array_flip([
            'parent_id', 'name', 'slug', 'level', 'country',
            'office_address', 'response_time', 'summary', 'sort_order', 'is_active',
        ]));
    }

    /**
     * What is offered here.
     *
     * `sync`, so the list is replaced wholesale — the rule every relation in
     * this project follows. Omitting the key leaves it alone, which matters:
     * the location form and a future bulk edit both write through here, and a
     * partial payload must not silently empty a list somebody spent an
     * afternoon ticking.
     */
    private function writeRelations(Location $location, array $data): void
    {
        if (array_key_exists('service_ids', $data)) {
            $location->services()->sync($data['service_ids'] ?? []);
        }

        if (array_key_exists('solution_ids', $data)) {
            $location->solutions()->sync($data['solution_ids'] ?? []);
        }
    }
}
