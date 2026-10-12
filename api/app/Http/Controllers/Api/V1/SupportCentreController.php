<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\SupportCentreResource;
use App\Models\SupportCentre;
use App\Support\StructuredData;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The support network as the website shows it (0.170.0,
 * docs/support-network.md): active centres, country then city, with the
 * staff marked to show. A plain collection that answers 200 when empty —
 * the `/popups` argument. `meta.schema` is the page's graph.
 */
class SupportCentreController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $centres = SupportCentre::query()
            ->active()
            ->with(['staff' => fn ($q) => $q->select('users.id', 'users.name', 'users.is_active')])
            ->inListOrder()
            ->get();

        return SupportCentreResource::collection($centres)->additional([
            'meta' => ['schema' => StructuredData::supportNetwork($centres)],
        ]);
    }
}
