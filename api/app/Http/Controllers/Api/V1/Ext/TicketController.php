<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Enums\TicketStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\TicketMessageResource;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Support\Webhooks\WebhookPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TicketController extends Controller
{
    private const WITH = ['customer', 'category', 'assignee'];

    public function index(Request $request): JsonResponse
    {
        $query = Ticket::query()->with(self::WITH);
        ExtList::status($request, $query, TicketStatus::class);

        return ExtList::page($request, $query, fn (Ticket $t) => WebhookPayload::ticket($t));
    }

    /** The ticket and its customer-visible conversation: an internal note is never in `publicMessages`. */
    public function show(string $reference): JsonResponse
    {
        $ticket = Ticket::with([...self::WITH, 'publicMessages' => fn ($q) => $q->with('author')->oldest()->oldest('id')])
            ->where('reference', $reference)->first();
        if ($ticket === null) {
            return ExtList::notFound();
        }

        $messages = $ticket->publicMessages->map(function (TicketMessage $m) {
            $data = WebhookPayload::resolve(new TicketMessageResource($m));
            // As on a sensitive ticket's description: the body is not for an integration.
            if ($m->is_sensitive) {
                $data['body'] = WebhookPayload::REDACTED;
            }

            return $data;
        })->values();

        return response()->json(['data' => WebhookPayload::ticket($ticket) + ['messages' => $messages]]);
    }
}
