<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Http\Controllers\Concerns\StoresTicketAttachments;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkTicketRequest;
use App\Http\Requests\StoreTicketMessageRequest;
use App\Http\Requests\UpdateTicketRequest;
use App\Http\Resources\TicketMessageResource;
use App\Http\Resources\TicketResource;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Models\User;
use App\Notifications\TicketMerged;
use App\Notifications\TicketReplied;
use App\Support\ListSort;
use App\Support\Messaging\OrderMessages;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

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
            ->with(['customer', 'category', 'assignee', 'mergedInto'])
            ->withCount(['messages as reported_messages_count' => fn ($q) => $q->whereNotNull('reported_at')])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            // One customer's tickets: what the merge picker on a ticket page
            // lists, with `?open=1` beside it.
            ->when($request->filled('customer'), fn ($q) => $q->where('customer_id', $request->integer('customer')))
            ->when($request->filled('priority'), fn ($q) => $q->where('priority', $request->string('priority')))
            ->when($request->filled('assigned_to'), fn ($q) => $q->where('assigned_to', $request->integer('assigned_to')))
            ->when($request->boolean('unassigned'), fn ($q) => $q->whereNull('assigned_to'))
            // The dashboard's "Open tickets" figure is `Ticket::open()`, so the
            // tile links here with `?open=1` and the two cannot disagree.
            ->when($request->boolean('open'), fn ($q) => $q->open())
            ->when($request->boolean('overdue'), fn ($q) => $q->overdue())
            // Replies the customer has reported: the queue's own filter, so a
            // report is a row somebody opens rather than a flag in a thread.
            ->when($request->boolean('reported'), fn ($q) => $q->reported())
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('reference', 'like', "%{$term}%")
                    ->orWhere('subject', 'like', "%{$term}%")
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$term}%")
                        ->orWhere('company', 'like', "%{$term}%")));
            })
            // Critical first, then oldest — the queue a support desk actually
            // works — unless a column header asked for another order.
            // FIELD() is MySQL-specific; swap for a CASE expression if this
            // ever has to run on another driver.
            ->tap(fn ($q) => ListSort::apply($q, $request, [
                'created' => 'created_at',
                'due' => 'due_at',
                'subject' => 'subject',
                'status' => 'status',
                'priority' => fn ($q, $dir) => $q->orderByRaw(
                    "FIELD(priority, 'critical', 'high', 'normal', 'low') ".($dir === 'desc' ? 'DESC' : 'ASC')
                ),
            ], fn ($q) => $q->orderByRaw("FIELD(priority, 'critical', 'high', 'normal', 'low')")->orderBy('created_at')))
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return TicketResource::collection($tickets);
    }

    public function show(Ticket $ticket): JsonResource
    {
        // Staff see everything, internal notes included.
        $ticket->load([
            'customer', 'category', 'assignee', 'attachments', 'mergedInto',
            'messages.author', 'messages.attachments', 'events.user',
        ]);

        return new TicketResource($ticket);
    }

    /**
     * Merge this ticket into another of the same customer's.
     *
     * One transaction: the messages and attachments are re-pointed at the
     * target, the source is closed with `merged_into_id` set, an event goes
     * on each side, and an internal note on the target names what arrived.
     * Then one `TicketMerged` to the customer, through `Notifier`, so a
     * dead mail server cannot undo a merge that is already committed.
     *
     * Every refusal is a 422 on `into` with a sentence — the same ticket,
     * another customer's, a source already merged, a target that is not
     * open, a reference nothing answers to. **Across customers is refused,
     * not confirmable**: it would put one customer's messages on another's
     * ticket, which is the one thing the portal's ownership check exists to
     * make impossible.
     */
    public function merge(Request $request, Ticket $ticket): JsonResource
    {
        $request->validate(['into' => ['required', 'string', 'max:32']]);

        $into = strtoupper(trim($request->string('into')->value()));
        $target = Ticket::with('customer')->where('reference', $into)->first();
        $staff = $request->user();
        abort_unless($staff instanceof User, 403);

        if ($target === null) {
            $this->refuseMerge("There is no ticket {$into}.");
        }
        if ($target->is($ticket)) {
            $this->refuseMerge('A ticket cannot be merged into itself.');
        }
        if ($ticket->isMerged()) {
            $ticket->loadMissing('mergedInto');
            $this->refuseMerge("{$ticket->reference} has already been merged into {$ticket->mergedInto?->reference}.");
        }
        if ((int) $target->customer_id !== (int) $ticket->customer_id) {
            $this->refuseMerge("{$target->reference} belongs to a different customer — merging across customers would put one customer's messages on another's ticket.");
        }
        if (! $target->status->isOpen()) {
            $this->refuseMerge("{$target->reference} is {$target->status->label()}. Merge into a ticket that is still open, or reopen that one first.");
        }

        DB::transaction(function () use ($ticket, $target, $staff) {
            TicketMessage::where('ticket_id', $ticket->id)->update(['ticket_id' => $target->id]);
            TicketAttachment::where('ticket_id', $ticket->id)->update(['ticket_id' => $target->id]);

            $ticket->logEvent('merged_into', null, $target->reference, $staff->id);
            $target->logEvent('merged_from', $ticket->reference, null, $staff->id);

            /*
             * Closed directly, without `canTransitionTo()`. Every state may
             * make this one move: a merge is not the ticket being worked to a
             * close, it is the ticket ceasing to be where the work is, and a
             * source in PendingCustomer must end up closed exactly as one in
             * Open must. `apply()` refuses to move it out of Closed again.
             */
            $ticket->forceFill([
                'merged_into_id' => $target->id,
                'status' => TicketStatus::Closed,
                'closed_at' => now(),
            ])->save();

            // The original request lives on the source's `description`, which
            // no message row carries — so the note that says what arrived
            // carries it too, and nobody has to follow the link to read it.
            $note = $target->messages()->make([
                'body' => "Merged from {$ticket->reference} — {$ticket->subject}\n\nOriginal request on {$ticket->reference}:\n{$ticket->description}",
                'is_internal' => true,
                // The note quotes a description that may be sealed; it is sealed too.
                'is_sensitive' => (bool) $ticket->is_sensitive,
            ]);
            $note->author()->associate($staff);
            $note->save();
        });

        Notifier::send($target->customer, new TicketMerged($ticket, $target));

        return new TicketResource($target->fresh(['customer', 'category', 'assignee', 'mergedInto']));
    }

    /** A 422 on `into`, so the console's form shows it under the field. */
    private function refuseMerge(string $why): never
    {
        throw ValidationException::withMessages(['into' => [$why]]);
    }

    public function update(UpdateTicketRequest $request, Ticket $ticket): JsonResource
    {
        DB::transaction(fn () => $this->apply($ticket, $request->validated(), $request->user()->id));

        return new TicketResource($ticket->fresh(['customer', 'category', 'assignee', 'mergedInto']));
    }

    /**
     * The same changes on several tickets at once — assign five to yourself,
     * resolve a batch — each ticket its own transaction and its own verdict.
     *
     * A refused move on one ticket must not undo the four beside it: the desk
     * pressed one button meaning "these", and "three of those could not move
     * from Closed" is the answer it wants, ticket by ticket, rather than
     * nothing having happened. So this never answers 422 for the batch; it
     * answers 200 with `updated` and `refused`, and each refusal carries the
     * sentence `update()` would have given for that ticket alone.
     */
    public function bulk(BulkTicketRequest $request): JsonResponse
    {
        $staffId = $request->user()->id;
        $changes = $request->safe()->except('ids');
        $updated = [];
        $refused = [];

        foreach (Ticket::whereIn('id', $request->input('ids'))->with('assignee')->get() as $ticket) {
            try {
                DB::transaction(fn () => $this->apply($ticket, $changes, $staffId));
                $updated[] = $ticket->reference;
            } catch (HttpException $e) {
                $refused[] = ['reference' => $ticket->reference, 'message' => $e->getMessage()];
            }
        }

        return response()->json(['updated' => $updated, 'refused' => $refused]);
    }

    /**
     * One ticket's status, priority, assignee and category, from the fields a
     * request carried — shared by `update()` and `bulk()` so the two cannot
     * disagree about what a move is allowed to do. Aborts 422 on an illegal
     * transition, naming both states.
     *
     * @param  array<string, mixed>  $input
     */
    /**
     * A staff member's name for the event trail, looked up once per request.
     *
     * `bulk()` assigns up to fifty tickets to — almost always — one engineer,
     * and `apply()` used to `User::find()` that same row once per ticket for
     * the sake of a name in the log line.
     *
     * @var array<int,string|null>
     */
    private array $staffNames = [];

    private function staffName(int $id): ?string
    {
        return $this->staffNames[$id] ??= User::find($id)?->name;
    }

    private function apply(Ticket $ticket, array $input, int $staffId): void
    {
        if (array_key_exists('status', $input)) {
            $next = TicketStatus::from((string) $input['status']);

            // A merged ticket is closed for good: its conversation is on the
            // target, and reopening it would make a live ticket with nothing
            // on it. The one move `merge()` made is the one this cannot undo.
            // The target is loaded inside the branch, not read in an
            // `abort_if` message — that string is built whether or not the
            // condition holds, and `bulk()` hands in models the lazy-load
            // guard is armed on.
            if ($ticket->isMerged() && $ticket->status !== $next) {
                $ticket->loadMissing('mergedInto');
                abort(422, "{$ticket->reference} was merged into {$ticket->mergedInto?->reference} — work on that ticket.");
            }

            abort_unless(
                $ticket->status === $next || $ticket->status->canTransitionTo($next),
                422,
                "A ticket cannot move from {$ticket->status->label()} to {$next->label()}."
            );

            if ($ticket->status !== $next) {
                $ticket->logEvent('status_changed', $ticket->status->value, $next->value, $staffId);

                $ticket->status = $next;

                /*
                 * Stamp on arrival; clear only on a reopen.
                 *
                 * This was a pair of ternaries reading "now() if we are
                 * moving to this status, null otherwise" — and the normal
                 * lifecycle is resolved → closed, where the second clause
                 * fires. So every ticket that was closed lost the moment it
                 * had been resolved: the dashboard's resolved series could
                 * only ever count tickets sitting in Resolved, and the
                 * median resolution time was computed over everything
                 * *except* the tickets that had actually been finished.
                 *
                 * Reopening is the one thing that may clear them, which is
                 * exactly what the customer-facing reopen() has always done
                 * explicitly. `isOpen()` is what the two now agree on.
                 */
                if ($next === TicketStatus::Resolved) {
                    $ticket->resolved_at = now();
                }

                if ($next === TicketStatus::Closed) {
                    $ticket->closed_at = now();
                }

                if ($next->isOpen()) {
                    $ticket->resolved_at = null;
                    $ticket->closed_at = null;
                }
            }
        }

        if (array_key_exists('priority', $input) && (string) $input['priority'] !== $ticket->priority->value) {
            $ticket->logEvent('priority_changed', $ticket->priority->value, (string) $input['priority'], $staffId);
            // The enum, not its value: the attribute is cast, and the request validated the value against the enum.
            $ticket->priority = TicketPriority::from((string) $input['priority']);
        }

        if (array_key_exists('assigned_to', $input) && (int) $input['assigned_to'] !== (int) $ticket->assigned_to) {
            $to = (int) $input['assigned_to'] ?: null;
            $ticket->logEvent(
                'assigned',
                $ticket->assignee?->name,
                $to ? $this->staffName($to) : null,
                $staffId
            );
            $ticket->assigned_to = $to;

            // Picking up an unassigned ticket moves it out of the open pile.
            if ($to && $ticket->status === TicketStatus::Open) {
                $ticket->logEvent('status_changed', TicketStatus::Open->value, TicketStatus::Assigned->value, $staffId);
                $ticket->status = TicketStatus::Assigned;
            }
        }

        if (array_key_exists('ticket_category_id', $input)) {
            $ticket->ticket_category_id = (int) $input['ticket_category_id'] ?: null;
        }

        $ticket->save();
    }

    public function reply(StoreTicketMessageRequest $request, Ticket $ticket): JsonResponse
    {
        $isInternal = $request->boolean('is_internal');

        $message = DB::transaction(function () use ($request, $ticket, $isInternal) {
            $message = $ticket->messages()->make([
                'body' => $request->string('body'),
                'is_internal' => $isInternal,
                'is_sensitive' => $request->boolean('is_sensitive'),
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

        // The is_internal guard lives here, at the call site, rather than
        // inside the notification. An internal note reaching a customer inbox
        // is the single worst failure this system has, and the check belongs
        // where anyone reading the reply path will see it.
        if (! $isInternal) {
            $ticket->loadMissing('customer');
            Notifier::send($ticket->customer, new TicketReplied($ticket, $message, toCustomer: true));
            // Inside the same `! $isInternal` guard: a note never reaches a phone either.
            OrderMessages::ticketReplied($ticket);
        }

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
