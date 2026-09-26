<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\VisitRequestResource;
use App\Models\Customer;
use App\Models\VisitRequest;
use App\Support\Visits\VisitActions;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * A signed-in customer's own visit requests, under `my/` for the reason
 * `my/orders` gives: `visits/{reference}` is the guest route, authorised by a
 * secret in a link, and this is authorised by a session.
 *
 * Scoped by `customer_id` and nothing else. A request made as a guest with
 * the same address is not pulled in by email — an address is not an
 * account, and the guest still has their own link.
 */
class CustomerVisitController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $visits = VisitRequest::query()
            ->where('customer_id', self::me($request)->id)
            ->with(['service:id,title,slug', 'solution:id,title,slug'])
            ->latest('id')
            ->paginate(min($request->integer('per_page', 20), 50));

        return VisitRequestResource::collection($visits);
    }

    public function show(Request $request, string $reference): VisitRequestResource
    {
        return new VisitRequestResource(self::own($request, $reference));
    }

    public function cancel(Request $request, string $reference): VisitRequestResource
    {
        $visit = self::own($request, $reference);
        VisitActions::cancelByCustomer($visit);

        return new VisitRequestResource($visit->refresh());
    }

    public function reschedule(Request $request, string $reference): VisitRequestResource
    {
        $visit = self::own($request, $reference);
        $data = VisitController::validatePreferred($request);
        VisitActions::rescheduleByCustomer($visit, $data['preferred'], $data['note'] ?? null);

        return new VisitRequestResource($visit->refresh());
    }

    private static function me(Request $request): Customer
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);

        return $customer;
    }

    /** Another customer's request is a 404, never a 403 — a 403 confirms it exists. */
    private static function own(Request $request, string $reference): VisitRequest
    {
        $visit = VisitRequest::where('reference', $reference)->where('customer_id', self::me($request)->id)->first();
        abort_if($visit === null, 404);

        return $visit;
    }
}
