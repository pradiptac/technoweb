<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Enums\LeadStatus;
use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthenticateApiKey;
use App\Http\Requests\Ext\StoreExtLeadRequest;
use App\Models\Lead;
use App\Support\Crm\LeadIntake;
use App\Support\Webhooks\WebhookPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Lead::query()->with('assignee');
        ExtList::status($request, $query, LeadStatus::class);

        return ExtList::page($request, $query, fn (Lead $l) => WebhookPayload::lead($l));
    }

    public function show(string $lead): JsonResponse
    {
        $row = ctype_digit($lead) ? Lead::with('assignee')->find($lead) : null;

        return $row === null ? ExtList::notFound() : response()->json(['data' => WebhookPayload::lead($row)]);
    }

    /** `lead.created` fires from `Lead`'s own hook, as for every lead. */
    public function store(StoreExtLeadRequest $request): JsonResponse
    {
        $lead = LeadIntake::fromApi(AuthenticateApiKey::key($request), $request->validated(), $request);

        return $lead === null
            ? response()->json(['message' => 'The lead could not be filed.'], 500)
            : response()->json(['data' => WebhookPayload::lead($lead)], 201);
    }
}
