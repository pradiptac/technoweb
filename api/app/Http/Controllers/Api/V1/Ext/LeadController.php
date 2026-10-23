<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Enums\LeadStatus;
use App\Http\Controllers\Controller;
use App\Models\Lead;
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
}
