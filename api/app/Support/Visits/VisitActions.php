<?php

namespace App\Support\Visits;

use App\Enums\MessageChannel;
use App\Enums\MessageEvent;
use App\Enums\VisitStatus;
use App\Enums\WebhookEvent;
use App\Models\Customer;
use App\Models\User;
use App\Models\VisitRequest;
use App\Notifications\VisitCancelled;
use App\Notifications\VisitConfirmed;
use App\Notifications\VisitRequested;
use App\Notifications\VisitRequestReceived;
use App\Support\Address;
use App\Support\Crm\LeadIntake;
use App\Support\Crm\PageContext;
use App\Support\Messaging\Contacts;
use App\Support\Notifier;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Everything that changes a visit request, in one place.
 *
 * Three doors reach the same moves — the guest link, the portal and the
 * console — and a cancellation that emails the desk from one door and not
 * another is the drift this codebase keeps paying for. So the doors check
 * who is asking and call here; this decides what the move means.
 *
 * Every mail goes through `Notifier`, every channel message through
 * `Messenger`, every webhook through `Webhooks` — all three guarded, so a
 * visit that is saved is never reported as failed because a mail server or
 * somebody else's endpoint is down.
 */
final class VisitActions
{
    /**
     * A new request, from the public form.
     *
     * @param  array<string, mixed>  $data  the validated request
     */
    public static function place(array $data, Request $request, ?Customer $customer): VisitRequest
    {
        $visit = VisitRequest::create([
            'customer_id' => $customer?->id,
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'],
            'company' => $data['company'] ?? null,
            'site_address' => Address::normalise((array) ($data['site_address'] ?? [])),
            'service_id' => $data['service_id'] ?? null,
            'solution_id' => $data['solution_id'] ?? null,
            'location_id' => $data['location_id'] ?? null,
            'notes' => filled($data['notes'] ?? null) ? trim((string) $data['notes']) : null,
            'preferred' => PreferredTimes::normalise((array) $data['preferred']),
            'status' => VisitStatus::Requested,
            ...PageContext::from($request),
            'ip_address' => $request->ip(),
        ]);

        $visit->record('requested', note: count($visit->preferred).' preferred '.(count($visit->preferred) === 1 ? 'time' : 'times'));

        // The pipeline record before the announcement, the enquiry's order:
        // `LeadIntake` never throws, and a lead it could not write is logged.
        $lead = LeadIntake::fromVisit($visit, $request);

        if ($lead !== null) {
            $visit->forceFill(['lead_id' => $lead->id])->saveQuietly();
        }

        self::optIn($visit, (array) ($data['message_opt_in'] ?? []));

        self::toDesk(new VisitRequestReceived($visit, $lead));
        Notifier::to($visit->email, new VisitRequested($visit));
        VisitText::notify(MessageEvent::VisitRequested, $visit);
        Webhooks::emit(WebhookEvent::VisitRequested, fn () => WebhookPayload::visit($visit));

        return $visit;
    }

    /** The customer calls it off, from their link or the portal. */
    public static function cancelByCustomer(VisitRequest $visit): void
    {
        self::refuseUnlessOpen($visit, 'cancel');

        $from = $visit->status;

        $visit->forceFill([
            'status' => VisitStatus::Cancelled,
            'cancelled_at' => $visit->cancelled_at ?? now(),
        ])->save();

        $visit->record('cancelled_by_customer', null, $from->value, VisitStatus::Cancelled->value);

        Notifier::to($visit->email, new VisitCancelled($visit, byCustomer: true));
        self::toDesk(new VisitRequestReceived($visit, null, 'The customer cancelled this visit'
            .($from === VisitStatus::Confirmed ? ' — it was confirmed for '.VisitText::date($visit->scheduled_start_at).', '.VisitText::time($visit).'.' : '.')));
    }

    /**
     * The customer asks for other times. Back to `Requested`, because the
     * desk has to choose again and the queue is how it finds out; a time
     * that was agreed is no longer agreed, so it is cleared from the record
     * and kept in the trail.
     *
     * @param  array<int, mixed>  $preferred  already validated
     */
    public static function rescheduleByCustomer(VisitRequest $visit, array $preferred, ?string $note = null): void
    {
        self::refuseUnlessOpen($visit, 'change');

        $from = $visit->status;
        $was = $visit->scheduled_start_at
            ? VisitText::date($visit->scheduled_start_at).', '.VisitText::time($visit)
            : null;

        $visit->forceFill([
            'status' => VisitStatus::Requested,
            'preferred' => PreferredTimes::normalise($preferred),
            'scheduled_start_at' => null,
            'scheduled_end_at' => null,
        ])->save();

        $visit->record('new_times_requested', null, $from->value, VisitStatus::Requested->value,
            trim(($was ? "Was confirmed for {$was}. " : '').(string) $note) ?: null);

        self::toDesk(new VisitRequestReceived($visit, null, 'The customer asked for other times'
            .($was ? " — it was confirmed for {$was}." : '.')));
    }

    /**
     * The desk sets the appointment. Confirming a visit that has been
     * confirmed before is a **move**: the status stays or becomes
     * `Confirmed`, the trail says `rescheduled`, and the customer gets the
     * "moved" message with a calendar file whose UID updates the old event.
     *
     * A change of engineer alone sends nothing — the customer was told a
     * time, not a name.
     */
    public static function confirm(VisitRequest $visit, Carbon $start, int $minutes, ?int $assignedTo, User $by): void
    {
        if (! in_array($visit->status, [VisitStatus::Requested, VisitStatus::Confirmed], true)) {
            throw ValidationException::withMessages([
                'start_at' => "A {$visit->status->label()} visit cannot be given a time. Reopen it first.",
            ]);
        }

        $end = $start->copy()->addMinutes($minutes);
        $timeChanged = $visit->scheduled_start_at === null
            || ! $visit->scheduled_start_at->equalTo($start)
            || ! $visit->scheduled_end_at?->equalTo($end);
        $rescheduled = $visit->confirmed_at !== null;
        $from = $visit->status;
        $was = $visit->scheduled_start_at ? VisitText::date($visit->scheduled_start_at).', '.VisitText::time($visit) : null;

        if ($assignedTo !== $visit->assigned_to) {
            $to = $assignedTo ? User::find($assignedTo) : null;
            $visit->record('assigned', $by, null, $to !== null ? $to->name : 'Unassigned');
        }

        $visit->forceFill([
            'status' => VisitStatus::Confirmed,
            'scheduled_start_at' => $start,
            'scheduled_end_at' => $end,
            'assigned_to' => $assignedTo,
            'confirmed_at' => $visit->confirmed_at ?? now(),
        ]);

        if ($timeChanged) {
            /*
             * The reminder belongs to a time. A visit moved to a new day is
             * owed a new reminder, and one confirmed less than a day ahead
             * has just been told everything the reminder would say — so the
             * confirmation stands in for it, rather than a second email
             * arriving fifteen minutes later.
             */
            $visit->reminded_at = $start->lte(now()->addDay()) ? now() : null;
        }

        $visit->save();

        if (! $timeChanged && $from === VisitStatus::Confirmed) {
            return;
        }

        $when = VisitText::date($start).', '.VisitText::time($visit);
        $visit->record($rescheduled ? 'rescheduled' : 'confirmed', $by, $was, $when);

        Notifier::to($visit->email, new VisitConfirmed($visit, $rescheduled));
        VisitText::notify(MessageEvent::VisitConfirmed, $visit);
    }

    /**
     * A status move from the console's select — never to `Confirmed`, which
     * only `confirm()` reaches.
     */
    public static function move(VisitRequest $visit, VisitStatus $next, User $by, ?string $reason = null): void
    {
        if ($next === $visit->status) {
            return;
        }

        if (! $visit->status->canTransitionTo($next)) {
            throw ValidationException::withMessages([
                'status' => "A visit cannot go from {$visit->status->label()} to {$next->label()}"
                    .($next === VisitStatus::Confirmed ? ' here — set a time to confirm it.' : '.'),
            ]);
        }

        $from = $visit->status;
        $visit->status = $next;

        match ($next) {
            VisitStatus::Cancelled => $visit->forceFill([
                'cancelled_at' => $visit->cancelled_at ?? now(),
                'cancel_reason' => filled($reason) ? mb_substr(trim((string) $reason), 0, 500) : $visit->cancel_reason,
            ]),
            VisitStatus::Completed => $visit->completed_at ??= now(),
            // Back to the queue: the agreed time no longer stands.
            VisitStatus::Requested => $visit->forceFill(['scheduled_start_at' => null, 'scheduled_end_at' => null]),
            default => null,
        };

        $visit->save();
        $visit->record('status', $by, $from->value, $next->value, $next === VisitStatus::Cancelled ? $visit->cancel_reason : null);

        if ($next === VisitStatus::Cancelled) {
            Notifier::to($visit->email, new VisitCancelled($visit));
        }
    }

    /**
     * The checkout's opt-in, for the number on the request: a phone channel
     * that is live records a contact, sourced `visit`. Never fails the
     * request — a consent row that could not be written is not a reason to
     * lose the visit.
     *
     * @param  array<int, mixed>  $channels
     */
    private static function optIn(VisitRequest $visit, array $channels): void
    {
        try {
            foreach ($channels as $value) {
                $channel = MessageChannel::tryFrom((string) $value);

                if ($channel !== null && $channel->addressKind() === 'phone' && $channel->ready()) {
                    Contacts::optIn($channel, $visit->phone, $visit->customer_id, 'visit', $visit->name);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('A visit messaging opt-in could not be recorded', ['visit' => $visit->reference, 'error' => $e->getMessage()]);
        }
    }

    /** To the visits address, else the sales inbox, else the site's sender. */
    private static function toDesk(VisitRequestReceived $notification): void
    {
        Notifier::route('visits_email', $notification, Notifier::setting('sales_email'));
    }

    private static function refuseUnlessOpen(VisitRequest $visit, string $verb): void
    {
        if (! $visit->status->isOpen()) {
            throw ValidationException::withMessages([
                'status' => "This visit is {$visit->status->label()}, so there is nothing to {$verb}.",
            ]);
        }
    }
}
