<?php

namespace App\Support\Events;

use App\Enums\EventRegistrationStatus;
use App\Enums\WebhookEvent;
use App\Models\Customer;
use App\Models\Event;
use App\Models\EventRegistration;
use App\Models\User;
use App\Notifications\EventChanged;
use App\Notifications\EventRegistrationCancelled;
use App\Notifications\EventRegistrationConfirmed;
use App\Notifications\EventRegistrationReceived;
use App\Notifications\EventRegistrationWaitlisted;
use App\Support\Crm\LeadIntake;
use App\Support\Crm\PageContext;
use App\Support\Notifier;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Everything that changes a registration, in one place — the `VisitActions`
 * mould.
 *
 * Three doors reach the same moves: the public form, the registrant's own
 * link, and the console. A cancellation that promotes the waiting list from
 * one door and not another is the drift this codebase keeps paying for, so
 * the doors check who is asking and call here; this decides what the move
 * means.
 *
 * ### Capacity is decided under a lock
 *
 * Every move that can change how many seats are taken opens its transaction
 * by locking the **event row** (`lockForUpdate()`), counts again, and only
 * then writes. Two people taking the last seat at the same moment therefore
 * queue behind one another: the second counts after the first has written,
 * and finds the room gone. The availability endpoint is a courtesy to the
 * page; this is the guarantee. (The unique index on `(event_id, email)` is
 * the same guarantee for "one row per address".)
 *
 * ### The waiting list is a queue
 *
 * `promote()` walks it oldest first and stops at the first party that does
 * not fit — a single at the back does not overtake three at the front. It
 * runs whenever seats may have come free: a cancellation, a smaller party,
 * a registration deleted, a capacity raised.
 *
 * ### Nothing here fails the request
 *
 * Every mail goes through `Notifier`, the webhook through `Webhooks`, the
 * lead through `LeadIntake` — all guarded, and all **after** the transaction
 * has committed, so a registration that is saved is never reported as failed
 * because a mail server or somebody else's endpoint is down.
 */
final class EventActions
{
    /** The key every refusal about the registration as a whole is reported on. */
    public const FIELD = 'registration';

    /** How long one address is spared a second re-sent confirmation, per event. */
    public const RESEND_MINUTES = 10;

    /**
     * The public door: register an address for an event, and answer with
     * the status it was given.
     *
     * **A typed address proves nothing, so this door never changes and never
     * exposes a registration that already exists.** Anybody can type
     * anybody's address into a public form — the rule sign-in learnt
     * (`docs/customers.md`) — and the first cut of this method believed
     * them: a repeat replaced the stored name and seats and was handed the
     * registration's manage link, which is a way to shrink or cancel
     * somebody else's place. So:
     *
     * - **An address that already holds a live registration** (confirmed,
     *   waiting, attended, no-show) **writes nothing** — no name, no seats,
     *   no note, no lead, no webhook, no notice to the desk. The
     *   registration's own confirmation (or waiting-list message) is sent
     *   again to the address on file, at most once every
     *   `RESEND_MINUTES` per address per event, and that is all.
     * - **The answer is exactly what a brand-new address sending the same
     *   body would get at that moment**: the same status from the same
     *   count, or the same 422. The response therefore cannot say whether
     *   an address is registered. The cost is accepted and deliberate —
     *   somebody who presses Register twice on the last seat reads "This
     *   event is full." the second time, with their confirmation in their
     *   inbox both times. A response that reassured them would be a
     *   response that told a stranger who is coming.
     * - **A cancelled registration is no registration**: the row is revived
     *   with the details sent, subject to room exactly like a newcomer, and
     *   its **token is rotated**, so a link emailed for the cancelled one
     *   cannot manage the revived one. That is no more than anybody can do
     *   with any address that has never registered.
     *
     * There is no update path here for anybody, a signed-in customer
     * included: changing a party's size is cancelling through the manage
     * link and registering again, or asking the desk.
     *
     * @param  array<string, mixed>  $data  the validated fields: name, email, phone, company, seats, note
     */
    public static function register(Event $event, array $data, Request $request, ?Customer $customer = null): EventRegistrationStatus
    {
        $email = self::email($data);
        $details = self::details($data);

        /** @var array{status: EventRegistrationStatus|null, refusal: ValidationException|null, written: EventRegistration|null, resend: EventRegistration|null} $outcome */
        $outcome = DB::transaction(function () use ($event, $details, $email, $request, $customer) {
            // The first statement: the event row. Everything that counts
            // seats does so behind it.
            $locked = Event::query()->whereKey($event->id)->lockForUpdate()->firstOrFail();
            $existing = self::existing($locked, $email);
            $live = $existing !== null && $existing->status !== EventRegistrationStatus::Cancelled;

            // What a newcomer would be told, decided without looking at
            // whether this address is known: the existing row is not passed.
            try {
                $status = self::placement($locked, (int) $details['seats'], force: false);
            } catch (ValidationException $refusal) {
                if (! $live) {
                    throw $refusal;
                }

                return ['status' => null, 'refusal' => $refusal, 'written' => null, 'resend' => $existing];
            }

            if ($live) {
                return ['status' => $status, 'refusal' => null, 'written' => null, 'resend' => $existing];
            }

            $registration = self::write($locked, $existing, $email, $details, $status, [
                'customer_id' => $customer?->id,
                'source' => EventRegistration::SOURCE_PUBLIC,
                ...PageContext::from($request),
                'ip_address' => $request->ip(),
            ]);

            return ['status' => $status, 'refusal' => null, 'written' => $registration, 'resend' => null];
        }, 3);

        if ($outcome['written'] !== null) {
            self::arrived($outcome['written'], $event, $request, notify: true);
        }

        if ($outcome['resend'] !== null) {
            self::resend($outcome['resend'], $event);
        }

        if ($outcome['refusal'] !== null) {
            throw $outcome['refusal'];
        }

        return $outcome['status'] ?? EventRegistrationStatus::Confirmed;
    }

    /**
     * The staff door: the desk adds somebody — a telephone booking, a
     * colleague's guest.
     *
     * `$force` goes past the capacity, a closing date or the start; nothing
     * lets anybody register for an event whose mode is not `open`. An
     * address that already holds a live registration is **refused on
     * `email`, naming its status**: the desk has that row in front of it and
     * edits it, rather than a second form silently rewriting it. A
     * cancelled one is revived, as on the public door.
     *
     * @param  array<string, mixed>  $data  the validated fields: name, email, phone, company, seats, note
     */
    public static function add(Event $event, array $data, Request $request, User $by, bool $force = false, bool $notify = true): EventRegistration
    {
        $email = self::email($data);
        $details = self::details($data);

        /** @var EventRegistration $registration */
        $registration = DB::transaction(function () use ($event, $details, $email, $force) {
            $locked = Event::query()->whereKey($event->id)->lockForUpdate()->firstOrFail();
            $existing = self::existing($locked, $email);

            if ($existing !== null && $existing->status !== EventRegistrationStatus::Cancelled) {
                throw ValidationException::withMessages([
                    'email' => "This address already has a registration for this event ({$existing->status->label()}). Edit that one instead.",
                ]);
            }

            $status = self::placement($locked, (int) $details['seats'], $force);

            return self::write($locked, $existing, $email, $details, $status, [
                'customer_id' => $existing?->customer_id,
                'source' => EventRegistration::SOURCE_STAFF,
                // The desk's own address is not where this person came from.
                'source_url' => null, 'source_path' => null, 'source_title' => null, 'referrer' => null,
                'utm_source' => null, 'utm_medium' => null, 'utm_campaign' => null,
                'ip_address' => null,
            ]);
        }, 3);

        self::arrived($registration, $event, $request, $notify);

        return $registration;
    }

    /** The address a registration is keyed on: trimmed and lower-cased, so one mailbox is one row. */
    private static function email(array $data): string
    {
        return mb_strtolower(trim((string) $data['email']));
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{name: string, phone: string|null, company: string|null, note: string|null, seats: int}
     */
    private static function details(array $data): array
    {
        return [
            'name' => trim((string) $data['name']),
            'phone' => filled($data['phone'] ?? null) ? trim((string) $data['phone']) : null,
            'company' => filled($data['company'] ?? null) ? trim((string) $data['company']) : null,
            'note' => filled($data['note'] ?? null) ? trim((string) $data['note']) : null,
            'seats' => max(1, (int) ($data['seats'] ?? 1)),
        ];
    }

    private static function existing(Event $event, string $email): ?EventRegistration
    {
        return EventRegistration::query()->where('event_id', $event->id)->where('email', $email)->first();
    }

    /**
     * Where a party of this size is placed **as a newcomer**, or the
     * refusal a newcomer would get. Read from the locked event and a fresh
     * count, and from nothing about who is asking — which is what lets the
     * public door give a known address and an unknown one the same answer.
     */
    private static function placement(Event $event, int $seats, bool $force): EventRegistrationStatus
    {
        $counts = EventCounts::for($event);

        self::refuseAtTheDoor(Availability::for($event, $counts), $force);

        $left = $event->capacity === null ? null : max(0, $event->capacity - $counts->heldSeats);

        return self::placeFor($event, $left === null || $seats <= $left, $left, $force);
    }

    /**
     * Write a new registration — or revive a cancelled one as if it were
     * new: the details sent, the status just decided, the stamps that go
     * with it, and a **new token**, so nothing emailed for the cancelled
     * registration can manage this one.
     *
     * @param  array{name: string, phone: string|null, company: string|null, note: string|null, seats: int}  $details
     * @param  array<string, mixed>  $door  what the door knows: the customer, the source, the page
     */
    private static function write(Event $event, ?EventRegistration $cancelled, string $email, array $details, EventRegistrationStatus $status, array $door): EventRegistration
    {
        $registration = $cancelled ?? new EventRegistration(['event_id' => $event->id, 'email' => $email]);

        $registration->fill([...$details, ...$door]);
        $registration->forceFill([
            'status' => $status,
            'waitlisted_at' => $status === EventRegistrationStatus::Waitlisted ? now() : null,
            'reminded_at' => $status === EventRegistrationStatus::Confirmed ? self::reminderStamp($event) : null,
            'cancelled_at' => null,
        ]);

        if ($cancelled !== null) {
            $registration->token = bin2hex(random_bytes(32));
        }

        $registration->save();

        return $registration;
    }

    /**
     * Everything that follows a registration being written, after the
     * transaction has committed: the lead, the desk's notice, the webhook,
     * and the registrant's own message. A revival is an arrival like any
     * other — the row is treated as new, so the pipeline hears of it again.
     */
    private static function arrived(EventRegistration $registration, Event $event, Request $request, bool $notify): void
    {
        $registration->setRelation('event', $event->forgetRegistrationCounts());

        // The pipeline record before the announcements, the visits' order:
        // `LeadIntake` never throws, and a lead it could not write is logged.
        $lead = LeadIntake::fromEvent($registration, $event, $request);

        if ($lead !== null) {
            $registration->forceFill(['lead_id' => $lead->id])->saveQuietly();
        }

        Notifier::route('events_email', new EventRegistrationReceived($registration, $lead), Notifier::setting('sales_email'));
        Webhooks::emit(WebhookEvent::EventRegistered, fn () => WebhookPayload::eventRegistration($registration));

        if ($notify) {
            self::tell($registration);
        }
    }

    /** The registrant's own message for where they stand: confirmed, or waiting. */
    private static function tell(EventRegistration $registration): void
    {
        Notifier::to($registration->email, $registration->status === EventRegistrationStatus::Confirmed
            ? new EventRegistrationConfirmed($registration)
            : new EventRegistrationWaitlisted($registration));
    }

    /**
     * Send a live registration its own message again — to the address on
     * file, which is the address that was typed — because somebody
     * registered with it a second time.
     *
     * This is how a registrant who lost the email gets their manage link
     * back, and how the owner of a mailbox learns somebody is using it.
     * **At most once every `RESEND_MINUTES` per address per event**, by an
     * atomic `Cache::add`, so the form cannot be used to fill an inbox: the
     * route's own throttle bounds one caller, and this bounds what any
     * number of callers can do to one address. Attended and no-show are
     * sent nothing — the event has happened.
     */
    private static function resend(EventRegistration $registration, Event $event): void
    {
        if (! $registration->status->isActive()) {
            return;
        }

        $key = 'events:resend:'.$event->id.':'.sha1($registration->email);

        if (! Cache::add($key, 1, now()->addMinutes(self::RESEND_MINUTES))) {
            return;
        }

        $registration->setRelation('event', $event);
        self::tell($registration);
    }

    /**
     * Cancel a registration.
     *
     * The registrant's own door (`$by` null) is closed once the event has
     * started and for anything already marked attended or no-show; the desk
     * may cancel whenever `EventRegistrationStatus::canTransitionTo()` lets
     * it. Cancelling one that is already cancelled changes nothing and sends
     * nothing — a link pressed twice is not a second cancellation.
     */
    public static function cancel(EventRegistration $registration, ?User $by = null, bool $notify = true): EventRegistration
    {
        $registration->loadMissing('event');
        $event = $registration->event;

        /** @var array{cancelled: bool, held: bool} $outcome */
        $outcome = DB::transaction(function () use ($registration, $event, $by) {
            $locked = Event::query()->whereKey($event->id)->lockForUpdate()->firstOrFail();
            $row = EventRegistration::query()->whereKey($registration->id)->lockForUpdate()->firstOrFail();

            if ($row->status === EventRegistrationStatus::Cancelled) {
                return ['cancelled' => false, 'held' => false];
            }

            if ($by === null) {
                if ($row->status->isSettled()) {
                    throw ValidationException::withMessages([self::FIELD => 'This registration can no longer be cancelled — the event has taken place.']);
                }

                if ($locked->hasStarted()) {
                    throw ValidationException::withMessages([self::FIELD => 'The event has already started, so this registration can no longer be cancelled.']);
                }
            }

            $held = $row->status === EventRegistrationStatus::Confirmed;

            self::applyStatus($row, EventRegistrationStatus::Cancelled, $locked);
            $row->save();

            return ['cancelled' => true, 'held' => $held];
        }, 3);

        $registration->refresh()->setRelation('event', $event->forgetRegistrationCounts());

        if (! $outcome['cancelled']) {
            return $registration;
        }

        if ($notify) {
            Notifier::to($registration->email, new EventRegistrationCancelled($registration));
        }

        if ($outcome['held']) {
            self::promote($event);
        }

        return $registration;
    }

    /**
     * Give free seats to the waiting list, oldest first, **stopping at the
     * first party that does not fit** — and tell each one promoted.
     *
     * A no-op for an event that has started (there is nobody to tell in
     * time) or whose mode is no longer `open`. With the capacity removed
     * altogether, everybody waiting gets in.
     *
     * @return list<EventRegistration> who was promoted
     */
    public static function promote(Event $event): array
    {
        /** @var list<EventRegistration> $promoted */
        $promoted = DB::transaction(function () use ($event) {
            $locked = Event::query()->whereKey($event->id)->lockForUpdate()->firstOrFail();

            if (! $locked->takesRegistrations() || $locked->hasStarted()) {
                return [];
            }

            $left = $locked->capacity === null ? null : max(0, $locked->capacity - EventCounts::for($locked)->heldSeats);
            $promoted = [];

            $waiting = EventRegistration::query()
                ->where('event_id', $locked->id)
                ->where('status', EventRegistrationStatus::Waitlisted)
                ->orderBy('waitlisted_at')
                ->orderBy('id')
                ->get();

            foreach ($waiting as $row) {
                if ($left !== null && (int) $row->seats > $left) {
                    break;
                }

                self::applyStatus($row, EventRegistrationStatus::Confirmed, $locked);
                $row->save();

                if ($left !== null) {
                    $left -= (int) $row->seats;
                }

                $promoted[] = $row;
            }

            return $promoted;
        }, 3);

        $event->forgetRegistrationCounts();

        foreach ($promoted as $registration) {
            $registration->setRelation('event', $event);
            Notifier::to($registration->email, new EventRegistrationConfirmed($registration, promoted: true));
        }

        return $promoted;
    }

    /**
     * A status move from the console's select.
     *
     * `attended` and `no_show` are what happened on the day, so neither is
     * accepted before the event has started. `confirmed` is held to the room
     * unless `$force` — the desk may overbook, but only by saying so.
     */
    public static function move(EventRegistration $registration, EventRegistrationStatus $next, User $by, bool $force = false): EventRegistration
    {
        $registration->loadMissing('event');
        $event = $registration->event;
        $from = $registration->status;

        if ($next === $from) {
            return $registration;
        }

        if (! $from->canTransitionTo($next)) {
            throw ValidationException::withMessages([
                'status' => "A registration cannot go from {$from->label()} to {$next->label()}.",
            ]);
        }

        if ($next->isSettled() && ! $event->hasStarted()) {
            throw ValidationException::withMessages([
                'status' => "A registration can be marked {$next->label()} only once the event has started.",
            ]);
        }

        if ($next === EventRegistrationStatus::Cancelled) {
            return self::cancel($registration, $by);
        }

        DB::transaction(function () use ($registration, $event, $next, $from, $force) {
            $locked = Event::query()->whereKey($event->id)->lockForUpdate()->firstOrFail();
            $row = EventRegistration::query()->whereKey($registration->id)->lockForUpdate()->firstOrFail();

            // Taking seats that were not held: is there room?
            if ($next === EventRegistrationStatus::Confirmed && ! $from->holdsSeat() && ! $force && $locked->capacity !== null) {
                $left = max(0, $locked->capacity - EventCounts::for($locked)->heldSeats);

                if ((int) $row->seats > $left) {
                    throw ValidationException::withMessages([
                        'status' => self::onlyLeft($left).' This registration is for '.EventText::seats((int) $row->seats)
                            .' — raise the capacity or reduce the seats first.',
                    ]);
                }
            }

            self::applyStatus($row, $next, $locked);
            $row->save();
        }, 3);

        $registration->refresh()->setRelation('event', $event->forgetRegistrationCounts());

        // Told only when it is news to them: a place they did not have.
        if ($next === EventRegistrationStatus::Confirmed && ! $from->holdsSeat()) {
            Notifier::to($registration->email, new EventRegistrationConfirmed($registration, promoted: $from === EventRegistrationStatus::Waitlisted));
        }

        if ($next === EventRegistrationStatus::Waitlisted) {
            Notifier::to($registration->email, new EventRegistrationWaitlisted($registration));
        }

        return $registration;
    }

    /**
     * The desk changes the size of a party. A confirmed one growing is held
     * to the room unless `$force`; one shrinking lets the queue move.
     */
    public static function changeSeats(EventRegistration $registration, int $seats, bool $force = false): EventRegistration
    {
        $registration->loadMissing('event');
        $event = $registration->event;
        $seats = max(1, $seats);

        /** @var bool $freed */
        $freed = DB::transaction(function () use ($registration, $event, $seats, $force) {
            $locked = Event::query()->whereKey($event->id)->lockForUpdate()->firstOrFail();
            $row = EventRegistration::query()->whereKey($registration->id)->lockForUpdate()->firstOrFail();
            $own = (int) $row->seats;
            $holds = $row->status->holdsSeat();

            if ($holds && $seats > $own && ! $force && $locked->capacity !== null) {
                $room = max(0, $locked->capacity - EventCounts::for($locked)->heldSeats) + $own;

                if ($seats > $room) {
                    throw ValidationException::withMessages(['seats' => self::onlyLeft($room)]);
                }
            }

            $row->seats = $seats;
            $row->save();

            return $holds && $seats < $own;
        }, 3);

        $registration->refresh()->setRelation('event', $event->forgetRegistrationCounts());

        if ($freed || $registration->status === EventRegistrationStatus::Waitlisted) {
            self::promote($event);
            $registration->refresh()->setRelation('event', $event);
        }

        return $registration;
    }

    /** Delete a registration for good. No email: the desk removed a row, nobody cancelled. */
    public static function remove(EventRegistration $registration): void
    {
        $registration->loadMissing('event');
        $event = $registration->event;
        $held = $registration->status->holdsSeat();

        $registration->delete();
        $event->forgetRegistrationCounts();

        if ($held) {
            self::promote($event);
        }
    }

    /**
     * "Tell everyone registered": the event as it now stands, to each
     * confirmed registrant. Returns how many were told.
     */
    public static function announceChange(Event $event): int
    {
        $told = 0;

        EventRegistration::query()
            ->where('event_id', $event->id)
            ->where('status', EventRegistrationStatus::Confirmed)
            ->orderBy('id')
            ->each(function (EventRegistration $registration) use ($event, &$told) {
                $registration->setRelation('event', $event);
                Notifier::to($registration->email, new EventChanged($registration));
                $told++;
            });

        return $told;
    }

    /**
     * The start moved: the reminder belongs to a time, so every confirmed
     * registrant is owed one for the new time — unless they were just told
     * about it and it is already inside the reminder's window, where a
     * second email a quarter of an hour later says nothing new.
     *
     * Through the query builder, so `updated_at` does not move.
     */
    public static function resetReminders(Event $event, bool $announced): void
    {
        EventRegistration::query()
            ->where('event_id', $event->id)
            ->where('status', EventRegistrationStatus::Confirmed)
            ->toBase()
            ->update(['reminded_at' => $announced ? self::reminderStamp($event) : null]);
    }

    /**
     * Where a newcomer's party is placed: confirmed when it fits and nobody
     * is already waiting, the waiting list when there is one, and otherwise
     * refused with the number left.
     */
    private static function placeFor(Event $event, bool $fits, ?int $left, bool $force): EventRegistrationStatus
    {
        if ($force) {
            return EventRegistrationStatus::Confirmed;
        }

        if ($fits && ! self::queueWaiting($event)) {
            return EventRegistrationStatus::Confirmed;
        }

        if ($event->waitlist_enabled) {
            return EventRegistrationStatus::Waitlisted;
        }

        // Full with no waiting list was refused at the door; this is a
        // party larger than what is left.
        throw ValidationException::withMessages(['seats' => self::onlyLeft((int) $left)]);
    }

    /**
     * Whether anybody is on the waiting list. A newcomer — or a cancelled
     * registration coming back — joins behind all of them rather than
     * taking a free seat, or the list is not a queue.
     */
    private static function queueWaiting(Event $event): bool
    {
        return $event->waitlist_enabled && EventRegistration::query()
            ->where('event_id', $event->id)
            ->where('status', EventRegistrationStatus::Waitlisted)
            ->exists();
    }

    /**
     * Set a status and the stamps that go with it. `waitlisted_at` is the
     * queue position, so it is set on joining the list and cleared on
     * leaving it; `cancelled_at` describes a cancelled registration and is
     * cleared when one is revived, so the console never shows a confirmed
     * row with a cancellation date.
     */
    private static function applyStatus(EventRegistration $registration, EventRegistrationStatus $status, Event $event): void
    {
        $from = $registration->status;

        if ($from === $status) {
            return;
        }

        $registration->status = $status;

        match ($status) {
            EventRegistrationStatus::Waitlisted => $registration->forceFill(['waitlisted_at' => now(), 'cancelled_at' => null]),
            EventRegistrationStatus::Cancelled => $registration->forceFill(['waitlisted_at' => null, 'cancelled_at' => now()]),
            EventRegistrationStatus::Confirmed => $registration->forceFill([
                'waitlisted_at' => null,
                'cancelled_at' => null,
                // A place they did not have: the message about it stands in
                // for the reminder when the event is already that close.
                'reminded_at' => $from->holdsSeat() ? $registration->reminded_at : self::reminderStamp($event),
            ]),
            default => null,
        };
    }

    /**
     * What `reminded_at` starts as for somebody confirmed now: stamped when
     * the event is already inside the reminder's window — the confirmation
     * has just told them everything the reminder would — and null otherwise.
     */
    private static function reminderStamp(Event $event): ?Carbon
    {
        $hours = EventSettings::reminderHours();

        return $hours > 0 && $event->starts_at->lte(now()->addHours($hours)) ? now() : null;
    }

    /**
     * The door: states in which nobody new gets in, whatever they ask for.
     *
     * An event that does not register here refuses everybody, the desk
     * with `force` included. Full, closed and started refuse a newcomer —
     * and on the public door everybody is a newcomer, because who is asking
     * is not read before the answer is decided.
     */
    private static function refuseAtTheDoor(Availability $availability, bool $force): void
    {
        $neverHere = in_array($availability->state, [Availability::NONE, Availability::EXTERNAL], true);

        if ($neverHere || ($availability->refuses() && ! $force)) {
            throw ValidationException::withMessages([self::FIELD => $availability->refusal()]);
        }
    }

    private static function onlyLeft(int $left): string
    {
        return match (true) {
            $left <= 0 => 'No seats are left.',
            $left === 1 => 'Only 1 seat is left.',
            default => "Only {$left} seats are left.",
        };
    }
}
