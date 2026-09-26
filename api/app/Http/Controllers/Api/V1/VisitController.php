<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreVisitRequest;
use App\Http\Resources\VisitRequestResource;
use App\Models\Customer;
use App\Models\Location;
use App\Models\Service;
use App\Models\Solution;
use App\Models\VisitRequest;
use App\Support\Visits\PreferredTimes;
use App\Support\Visits\VisitActions;
use App\Support\Visits\VisitSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Engineer visit requests, from the public side (2026-09-26).
 *
 * The client chose "request a time, staff confirm": nothing here books
 * anything. A request is a wish list of up to three dates with a part of the
 * day each, and the desk picks the appointment in the console.
 *
 * A guest reaches their own request with the token handed out **once**, on
 * create — the order's rule — and every read or change compares it with
 * `hash_equals`. A wrong token and a wrong reference are the same 404: a 403
 * would confirm the reference exists, and references are sequential.
 */
class VisitController extends Controller
{
    /** What the form offers. Public and cacheable: nothing in it is anybody's. */
    public function options(): JsonResponse
    {
        $services = Service::published()
            ->with(['locations' => fn ($q) => $q->where('is_active', true)->select('locations.id')])
            ->orderBy('sort_order')->orderBy('title')
            ->get(['id', 'title', 'slug']);

        return response()->json(['data' => [
            ...VisitSettings::publicOptions(),
            'services' => $services->map(fn (Service $s) => [
                'id' => $s->id,
                'title' => $s->title,
                'slug' => $s->slug,
                // Where a service is declared offered — the landing pages'
                // pivot. Empty means "not declared", never "nowhere".
                'location_ids' => $s->locations->pluck('id')->values(),
            ])->values(),
            'solutions' => Solution::published()->orderBy('sort_order')->orderBy('title')
                ->get(['id', 'title', 'slug'])
                ->map(fn (Solution $s) => ['id' => $s->id, 'title' => $s->title, 'slug' => $s->slug])->values(),
            'locations' => Location::active()->orderBy('name')
                ->get(['id', 'name', 'slug'])
                ->map(fn (Location $l) => ['id' => $l->id, 'name' => $l->name, 'slug' => $l->slug])->values(),
        ]])->header('Cache-Control', 'public, max-age=300');
    }

    public function store(StoreVisitRequest $request): JsonResponse
    {
        abort_unless(VisitSettings::enabled(), 403, 'Visit requests are not being taken online at the moment. Please call us.');

        $visit = VisitActions::place($request->validated(), $request, self::customer($request));

        return response()->json([
            'message' => 'Thank you — we have your request and will confirm a time by email.',
            'data' => [
                'reference' => $visit->reference,
                // Handed out here and nowhere else.
                'access_token' => $visit->access_token,
            ],
        ], 201);
    }

    public function show(Request $request, string $reference): VisitRequestResource
    {
        return new VisitRequestResource(self::guest($request, $reference));
    }

    public function cancel(Request $request, string $reference): VisitRequestResource
    {
        $visit = self::guest($request, $reference);

        VisitActions::cancelByCustomer($visit);

        return new VisitRequestResource($visit->refresh());
    }

    public function reschedule(Request $request, string $reference): VisitRequestResource
    {
        $visit = self::guest($request, $reference);

        $data = self::validatePreferred($request);
        VisitActions::rescheduleByCustomer($visit, $data['preferred'], $data['note'] ?? null);

        return new VisitRequestResource($visit->refresh());
    }

    /**
     * The new times, checked the way a new request's are.
     *
     * @return array{preferred: array<int, mixed>, note?: string|null}
     */
    public static function validatePreferred(Request $request): array
    {
        $validator = Validator::make($request->all(), [
            ...PreferredTimes::rules(),
            'note' => ['nullable', 'string', 'max:500'],
        ], PreferredTimes::messages());

        $validator->after(fn ($v) => PreferredTimes::check($v));

        /** @var array{preferred: array<int, mixed>, note?: string|null} */
        return $validator->validate();
    }

    /**
     * The request this token opens, or a 404 — the same 404 for a wrong
     * reference and a wrong token.
     */
    private static function guest(Request $request, string $reference): VisitRequest
    {
        $visit = VisitRequest::where('reference', $reference)->first();

        abort_if($visit === null || ! $visit->tokenMatches($request->input('token') ?? $request->query('token')), 404);

        return $visit;
    }

    /**
     * A signed-in customer is stamped onto the request, read by naming the
     * guard — on a public route `$request->user()` is always null (CLAUDE.md,
     * "reads as working"). A staff member's "View as" session is **not**:
     * a request filed under somebody's account should be one they made.
     */
    private static function customer(Request $request): ?Customer
    {
        $user = $request->user('sanctum');

        return $user instanceof Customer && ! $user->isImpersonated() ? $user : null;
    }
}
