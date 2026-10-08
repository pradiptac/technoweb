<?php

namespace App\Support\Webhooks;

use App\Http\Resources\Admin\EventRegistrationResource;
use App\Http\Resources\Admin\LeadResource;
use App\Http\Resources\Admin\MeetingResource;
use App\Http\Resources\Admin\NewsletterSubscriberResource;
use App\Http\Resources\Admin\Store\OrderResource;
use App\Http\Resources\Admin\Store\OrderReturnResource;
use App\Http\Resources\Admin\VisitRequestResource;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\FormSubmissionResource;
use App\Http\Resources\TicketMessageResource;
use App\Http\Resources\TicketResource;
use App\Models\Customer;
use App\Models\EventRegistration;
use App\Models\FormSubmission;
use App\Models\Lead;
use App\Models\Meeting;
use App\Models\NewsletterSubscriber;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\VisitRequest;
use App\Support\Events\EventText;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Routing\Route;

/**
 * What each event carries, built from the admin resources rather than by
 * hand.
 *
 * A second description of a ticket written for webhooks would be a second
 * description free to drift from the one the console reads — the
 * `admin_path` and `schema_type_options` drift, one more time. So every
 * payload is the existing resource resolved to an array, with the relations
 * it serialises loaded first (`preventLazyLoading` is on outside production
 * and would throw otherwise), and the shape a webhook consumer sees is the
 * shape `GET /admin/…/{id}` answers.
 *
 * Which is also what keeps the withholdings: `CustomerResource` is the
 * customer's own view of themselves and has no `status_note`; the ticket
 * resource carries `publicMessages` only when asked for them and the
 * `ticket.replied` payload never includes an internal note because the
 * hook that emits it refuses one; the order resource has no `access_token`.
 */
class WebhookPayload
{
    /** @return array<string, mixed> */
    /** What a sensitive ticket's description reads as in a webhook payload. */
    public const REDACTED = 'Marked sensitive; open the ticket to read it.';

    public static function ticket(Ticket $ticket): array
    {
        self::settled($ticket, 'status', 'priority');
        $ticket->loadMissing(['customer', 'category', 'assignee']);

        $data = self::resolve(new TicketResource($ticket));

        // A ticket marked sensitive is announced without its request: the
        // delivery row holds the payload in clear and the delivery screen
        // shows it. Redacted rather than withheld, unlike a sensitive
        // *message* (which emits nothing) — "a ticket exists" is what an
        // integration is told, and the reference, subject and customer are
        // still that; a message is its body, and there is nothing left.
        if ($ticket->is_sensitive) {
            $data['description'] = self::REDACTED;
        }

        return $data;
    }

    /**
     * @param  array<string, mixed>  $extra  `{from, to}` for a status change
     * @return array<string, mixed>
     */
    public static function ticketWith(Ticket $ticket, array $extra): array
    {
        return self::ticket($ticket) + $extra;
    }

    /** @return array<string, mixed> */
    public static function ticketMessage(TicketMessage $message): array
    {
        $message->loadMissing(['ticket.customer', 'ticket.category', 'ticket.assignee', 'author', 'attachments']);

        return self::ticket($message->ticket) + ['message' => self::resolve(new TicketMessageResource($message))];
    }

    /** @return array<string, mixed> */
    public static function order(Order $order, array $extra = []): array
    {
        self::settled($order, 'status');
        $order->loadMissing(['items']);

        return self::resolve(new OrderResource($order)) + $extra;
    }

    /** @return array<string, mixed> */
    public static function lead(Lead $lead): array
    {
        self::settled($lead, 'status');
        $lead->loadMissing(['assignee']);

        return self::resolve(new LeadResource($lead));
    }

    /** @return array<string, mixed> */
    public static function customer(Customer $customer): array
    {
        return self::resolve(new CustomerResource($customer));
    }

    /** @return array<string, mixed> */
    public static function formSubmission(FormSubmission $submission): array
    {
        return self::resolve(new FormSubmissionResource($submission));
    }

    /** @return array<string, mixed> */
    public static function subscriber(NewsletterSubscriber $subscriber): array
    {
        self::settled($subscriber, 'status', 'verification');
        $subscriber->loadMissing(['groups']);

        return self::resolve(new NewsletterSubscriberResource($subscriber));
    }

    /** @return array<string, mixed> */
    /**
     * A return as the desk reads it, less the note written for colleagues.
     * Photographs are counted and never sent: they are a stranger's upload
     * on the private disk.
     *
     * @return array<string, mixed>
     */
    public static function orderReturn(OrderReturn $return): array
    {
        self::settled($return, 'status');
        $return->loadMissing(['order', 'items.orderItem', 'photos', 'decider', 'refundPayment']);

        $data = self::resolve((new OrderReturnResource($return))->detail());
        unset($data['staff_note']);

        return $data;
    }

    public static function visit(VisitRequest $visit): array
    {
        self::settled($visit, 'status');
        $visit->loadMissing(['service', 'solution', 'location', 'assignee']);

        return self::resolve(new VisitRequestResource($visit));
    }

    /**
     * A meeting as the console reads it, less the two things an integration
     * is never told: the staff note (a judgement written for colleagues) and
     * the trail. The access token is on no resource at all. The Meet link is
     * included — it is what a CRM wants to put beside the contact.
     *
     * @return array<string, mixed>
     */
    public static function meeting(Meeting $meeting): array
    {
        self::settled($meeting, 'status', 'source', 'google_status');
        $meeting->loadMissing(['meetingType', 'host']);

        $data = self::resolve(new MeetingResource($meeting));
        unset($data['staff_note'], $data['trail']);

        return $data;
    }

    /**
     * A registration for an event, as the console reads it, less the staff
     * note — and with the event it is for beside it, because the resource
     * carries only the id and a receiver wants the name and the date.
     *
     * The manage token is on no resource at all. The join link is not in
     * the `event` block either: it goes to the registrant, not to whoever
     * holds a webhook URL.
     *
     * @return array<string, mixed>
     */
    public static function eventRegistration(EventRegistration $registration): array
    {
        self::settled($registration, 'status');
        $registration->loadMissing('event');
        $event = $registration->event;

        $data = self::resolve(new EventRegistrationResource($registration));
        // The desk's note, and the console's dropdown: neither is news.
        unset($data['staff_note'], $data['allowed_next']);

        return $data + ['event' => [
            'id' => $event->id,
            'title' => $event->title,
            'slug' => $event->slug,
            'starts_at' => EventText::iso($event->starts_at),
            'ends_at' => EventText::iso($event->ends_at),
            'format' => $event->format->value,
            'public_path' => $event->publicPath(),
        ]];
    }

    /**
     * Re-read a row whose in-memory copy is missing a column the database
     * defaulted.
     *
     * A `created` hook sees the model exactly as `create()` was called: a
     * subscriber made without an explicit `status` carries null there while
     * the row holds `active`, and the resource's `$this->status->value` throws
     * on the null. One `refresh()` — only when a named column is actually
     * null, so the common case costs nothing — hands the resource the row as
     * the console would read it.
     */
    private static function settled(Model $model, string ...$columns): void
    {
        foreach ($columns as $column) {
            if ($model->getAttribute($column) === null) {
                $model->refresh();

                return;
            }
        }
    }

    /**
     * A resource resolved as its detail read.
     *
     * Several resources gate their heavier fields on `$request->routeIs('*.show')`
     * — a ticket's description, an order's addresses — and a webhook payload
     * wants those: the description *is* the ticket. There is no route here,
     * so the request handed to the resource carries a stand-in named
     * `webhook.show`, which those gates read as the detail view. Anything
     * gated on an explicit `withDetail()` call stays as the list row, on
     * purpose: a lead's siblings and its full conversation are a screen, not
     * an announcement.
     *
     * @return array<string, mixed>
     */
    public static function resolve(JsonResource $resource): array
    {
        $request = Request::create('/webhook', 'GET');
        $request->setRouteResolver(fn () => (new Route('GET', '/webhook', []))->name('webhook.show'));

        /** @var array<string, mixed> $data */
        $data = $resource->resolve($request);

        return $data;
    }
}
