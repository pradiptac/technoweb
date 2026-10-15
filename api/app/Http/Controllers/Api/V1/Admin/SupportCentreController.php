<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\SupportCentreKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\SupportCentreRequest;
use App\Http\Resources\Admin\SupportCentreResource;
use App\Models\SupportCentre;
use App\Support\Countries;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * The support network's centres (0.170.0, docs/support-network.md). Behind
 * auth:sanctum + role:admin: a centre tags staff accounts, and deciding where
 * somebody is shown to work is the staff screen's business.
 */
class SupportCentreController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $rows = SupportCentre::query()
            ->withCount('staff')
            ->when($request->filled('q'), fn ($q) => $q->where(function ($w) use ($request) {
                $term = '%'.addcslashes($request->string('q')->value(), '%_\\').'%';
                $w->where('name', 'like', $term)->orWhere('city', 'like', $term)->orWhere('region', 'like', $term);
            }))
            ->when($request->filled('country'), fn ($q) => $q->where('country_code', strtoupper($request->string('country')->value())))
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->inListOrder()
            ->paginate(min(max($request->integer('per_page', 25), 1), 100))
            ->withQueryString();

        return SupportCentreResource::collection($rows)->additional(['meta' => self::meta()]);
    }

    public function store(SupportCentreRequest $request): JsonResponse
    {
        $centre = DB::transaction(function () use ($request) {
            $centre = SupportCentre::create(collect($request->validated())->except('staff')->all());
            $this->syncStaff($centre, $request);

            return $centre;
        });

        return (new SupportCentreResource($centre->load('staff')))->additional(['meta' => self::meta()])
            ->response()->setStatusCode(201);
    }

    public function show(SupportCentre $supportCentre): JsonResource
    {
        return (new SupportCentreResource($supportCentre->load('staff')))->additional(['meta' => self::meta()]);
    }

    public function update(SupportCentreRequest $request, SupportCentre $supportCentre): JsonResource
    {
        DB::transaction(function () use ($request, $supportCentre) {
            $supportCentre->update(collect($request->validated())->except('staff')->all());
            $this->syncStaff($supportCentre, $request);
        });

        return (new SupportCentreResource($supportCentre->fresh()->load('staff')))->additional(['meta' => self::meta()]);
    }

    public function destroy(SupportCentre $supportCentre): JsonResponse
    {
        $supportCentre->delete();

        return response()->json(null, 204);
    }

    /** `staff` replaced wholesale when sent; absent leaves it alone. */
    private function syncStaff(SupportCentre $centre, SupportCentreRequest $request): void
    {
        if (! $request->has('staff')) {
            return;
        }
        $rows = [];
        foreach ((array) $request->validated('staff', []) as $i => $row) {
            $rows[(int) $row['user_id']] = [
                'title' => isset($row['title']) && trim((string) $row['title']) !== '' ? trim((string) $row['title']) : null,
                'is_public' => array_key_exists('is_public', $row) ? (bool) $row['is_public'] : true,
                'sort_order' => $i,
            ];
        }
        $centre->staff()->sync($rows);
        $centre->touch();
    }

    /** @return array<string, mixed> */
    public static function meta(): array
    {
        return ['kinds' => SupportCentreKind::options(), 'countries' => Countries::options()];
    }
}
