<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\TicketStatus;
use App\Http\Controllers\Concerns\StoresTicketAttachments;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTicketMessageRequest;
use App\Http\Requests\UpdateTicketRequest;
use App\Http\Resources\TicketMessageResource;
use App\Http\Resources\TicketResource;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Staff ticket queue. Reachable only behind auth:sanctum + role:support_engineer
 * (admins pass implicitly).
 */
class TicketController extends Controller
{
    use StoresTicketAttachments;

    public function index(Request $request): AnonymousResourceCollection
    {
        $tickets = Ticket::query()
            ->with(['customer', 'category', 'assignee'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('priority'), fn ($q) => $q->where('priority', $request->string('priority')))
            ->when($request->filled('assigned_to'), fn ($q) => $q->where('assigned_to', $request->integer('assigned_to')))
            ->when($request->boolean('unassigned'), fn ($q) => $q->whereNull('assigned_to'))
            ->when($request->boolean('overdue'), fn ($q) => $q->overdue())
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('reference', 'like', "%{$term}%")
                    ->orWhere('subject', 'like', "%{$term}%")
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$term}%")
                        ->orWhere('company', 'like', "%{$term}%")));
            })
            // Critical first, then oldest — the queue a support desk actually
            // works. FIELD() is MySQL-specific; swap for a CASE expression if
            // this ever has to run on another driver.
            ->orderByRaw("FIELD(priority, 'critical', 'high', 'normal', 'low')")
            ->orderBy('created_at')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return TicketResource::collection($tickets);
    }

    public function show(Ticket $ticket): JsonResource
    {
        // Staff see everything, internal notes included.
        $ticket->load([
            'customer', 'category', 'assignee', 'attachments',
            'messages.author', 'messages.attachments', 'events.user',
        ]);

        return new TicketResource($ticket);
    }

    public function update(UpdateTicketRequest $request, Ticket $ticket): JsonResource
    {
        DB::transaction(function () use ($request, $ticket) {
            $staffId = $request->user()->id;

            if ($request->has('status')) {
                $next = TicketStatus::from($request->string('status')->value());

                abort_unless(
                    $ticket->status === $next || $ticket->status->canTransitionTo($next),
                    422,
                    "A ticket cannot move from {$ticket->status->label()} to {$next->label()}."
                );

                if ($ticket->status !== $next) {
                    $ticket->logEvent('status_changed', $ticket->status->value, $next->value, $staffId);

                    $ticket->status = $next;
                    $ticket->resolved_at = $next === TicketStatus::Resolved ? now() : null;
                    $ticket->closed_at = $next === TicketStatus::Closed ? now() : null;
                }
            }

            if ($request->has('priority') && $request->string('priority')->value() !== $ticket->priority->value) {
                $ticket->logEvent('priority_changed', $ticket->priority->value, $request->string('priority')->value(), $staffId);
                $ticket->priority = $request->string('priority')->value();
            }

            if ($request->has('assigned_to') && $request->integer('assigned_to') !== $ticket->assigned_to) {
                $to = $request->integer('assigned_to') ?: null;
                $ticket->logEvent(
                    'assigned',
                    $ticket->assignee?->name,
                    $to ? User::find($to)?->name : null,
                    $staffId
                );
                $ticket->assigned_to = $to;

                // Picking up an unassigned ticket moves it out of the open pile.
                if ($to && $ticket->status === TicketStatus::Open) {
                    $ticket->logEvent('status_changed', TicketStatus::Open->value, TicketStatus::Assigned->value, $staffId);
                    $ticket->status = TicketStatus::Assigned;
                }
            }

            if ($request->has('ticket_category_id')) {
                $ticket->ticket_category_id = $request->integer('ticket_category_id') ?: null;
            }

            $ticket->save();
        });

        return new TicketResource($ticket->fresh(['customer', 'category', 'assignee']));
    }

    public function reply(StoreTicketMessageRequest $request, Ticket $ticket): JsonResponse
    {
        $isInternal = $request->boolean('is_internal');

        $message = DB::transaction(function () use ($request, $ticket, $isInternal) {
            $message = $ticket->messages()->make([
                'body' => $request->string('body'),
                'is_internal' => $isInternal,
            ]);
            $message->author()->associate($request->user());
            $message->save();

            $this->storeAttachments($request, $ticket, $message);

            // Only a customer-visible reply stops the first-response SLA clock.
            if (! $isInternal && ! $ticket->first_responded_at) {
                $ticket->forceFill(['first_responded_at' => now()])->save();
            }

            if (! $isInternal && $ticket->status === TicketStatus::Open) {
                $ticket->update(['status' => TicketStatus::InProgress]);
                $ticket->logEvent('status_changed', TicketStatus::Open->value, TicketStatus::InProgress->value, $request->user()->id);
            }

            return $message;
        });

        return response()->json(['data' => new TicketMessageResource($message->load(['author', 'attachments']))], 201);
    }

    /**
     * Staff download every attachment on every ticket, including ones hanging
     * off an internal note — unlike the customer endpoint, there is no
     * ownership check and no is_internal guard.
     */
    public function downloadAttachment(TicketAttachment $attachment): StreamedResponse
    {
        return Storage::disk($attachment->disk)->download($attachment->path, $attachment->filename);
    }
}
