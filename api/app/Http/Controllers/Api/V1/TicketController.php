<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\TicketStatus;
use App\Http\Controllers\Concerns\StoresTicketAttachments;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTicketMessageRequest;
use App\Http\Requests\StoreTicketRequest;
use App\Http\Resources\TicketMessageResource;
use App\Http\Resources\TicketResource;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Customer-facing ticket endpoints. Every query is scoped to the authenticated
 * customer — there is no code path here that can reach another customer's data.
 */
class TicketController extends Controller
{
    use StoresTicketAttachments;

    public function index(Request $request): AnonymousResourceCollection
    {
        $tickets = $request->user()->tickets()
            ->with(['category', 'assignee'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest()
            ->paginate(min($request->integer('per_page', 20), 50));

        return TicketResource::collection($tickets);
    }

    /** Counts for the portal dashboard, in one query rather than four. */
    public function summary(Request $request): JsonResponse
    {
        $counts = $request->user()->tickets()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'data' => [
                'open' => (int) ($counts['open'] ?? 0) + (int) ($counts['assigned'] ?? 0),
                'in_progress' => (int) ($counts['in_progress'] ?? 0),
                'pending' => (int) ($counts['pending_customer'] ?? 0),
                'resolved' => (int) ($counts['resolved'] ?? 0),
                'closed' => (int) ($counts['closed'] ?? 0),
            ],
        ]);
    }

    public function store(StoreTicketRequest $request): JsonResponse
    {
        $ticket = DB::transaction(function () use ($request) {
            $ticket = $request->user()->tickets()->create([
                'subject' => $request->string('subject'),
                'description' => $request->string('description'),
                'ticket_category_id' => $request->integer('ticket_category_id') ?: null,
                'priority' => $request->string('priority'),
                'status' => TicketStatus::Open,
            ]);

            $this->storeAttachments($request, $ticket);

            $ticket->logEvent('created', null, TicketStatus::Open->value);

            return $ticket;
        });

        // TODO(phase 4): dispatch TicketCreated notification to the support desk.

        return response()->json(
            ['data' => new TicketResource($ticket->load(['category', 'attachments']))],
            201
        );
    }

    public function show(Request $request, Ticket $ticket): JsonResource
    {
        $this->authorizeTicket($request, $ticket);

        // publicMessages, not messages — internal notes must never leak here.
        $ticket->load([
            'category', 'assignee', 'attachments',
            'publicMessages.author', 'publicMessages.attachments',
        ]);
        $ticket->setRelation('messages', $ticket->publicMessages);

        return new TicketResource($ticket);
    }

    public function storeMessage(StoreTicketMessageRequest $request, Ticket $ticket): JsonResponse
    {
        $this->authorizeTicket($request, $ticket);

        abort_if(
            $ticket->status === TicketStatus::Closed,
            422,
            'This ticket is closed. Reopen it before adding a reply.'
        );

        $message = DB::transaction(function () use ($request, $ticket) {
            // associate() rather than a literal author_type — the morph map
            // stores "customer", and hard-coding the FQCN would bypass it.
            $message = $ticket->messages()->make([
                'body' => $request->string('body'),
                'is_internal' => false,   // customers can never write internal notes
            ]);
            $message->author()->associate($request->user());
            $message->save();

            $this->storeAttachments($request, $ticket, $message);

            // A customer reply on a pending ticket puts the ball back with us.
            if ($ticket->status === TicketStatus::PendingCustomer) {
                $ticket->update(['status' => TicketStatus::InProgress]);
                $ticket->logEvent('status_changed', TicketStatus::PendingCustomer->value, TicketStatus::InProgress->value);
            }

            return $message;
        });

        return response()->json(
            ['data' => new TicketMessageResource($message->load(['author', 'attachments']))],
            201
        );
    }

    public function close(Request $request, Ticket $ticket): JsonResource
    {
        $this->authorizeTicket($request, $ticket);

        abort_unless(
            $ticket->status->canTransitionTo(TicketStatus::Closed),
            422,
            'This ticket cannot be closed from its current status.'
        );

        $from = $ticket->status->value;
        $ticket->update(['status' => TicketStatus::Closed, 'closed_at' => now()]);
        $ticket->logEvent('closed_by_customer', $from, TicketStatus::Closed->value);

        return new TicketResource($ticket->fresh());
    }

    public function reopen(Request $request, Ticket $ticket): JsonResource
    {
        $this->authorizeTicket($request, $ticket);

        abort_unless(
            $ticket->status->canTransitionTo(TicketStatus::InProgress),
            422,
            'This ticket cannot be reopened.'
        );

        $from = $ticket->status->value;
        $ticket->update([
            'status' => TicketStatus::InProgress,
            'closed_at' => null,
            'resolved_at' => null,
        ]);
        $ticket->logEvent('reopened_by_customer', $from, TicketStatus::InProgress->value);

        return new TicketResource($ticket->fresh());
    }

    public function downloadAttachment(Request $request, TicketAttachment $attachment): StreamedResponse
    {
        $attachment->load(['ticket', 'message']);

        // 404 rather than 403 on someone else's attachment — a 403 would
        // confirm the id exists.
        abort_unless($attachment->ticket?->customer_id === $request->user()->id, 404);

        // An attachment hanging off an internal note is staff-only.
        abort_if($attachment->message?->is_internal, 404);

        return Storage::disk($attachment->disk)->download($attachment->path, $attachment->filename);
    }

    private function authorizeTicket(Request $request, Ticket $ticket): void
    {
        abort_unless($ticket->customer_id === $request->user()->id, 404);
    }
}
