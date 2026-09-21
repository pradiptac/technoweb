<?php

namespace App\Support\Webhooks;

use App\Http\Resources\Admin\LeadResource;
use App\Http\Resources\Admin\NewsletterSubscriberResource;
use App\Http\Resources\Admin\Store\OrderResource;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\FormSubmissionResource;
use App\Http\Resources\TicketMessageResource;
use App\Http\Resources\TicketResource;
use App\Models\Customer;
use App\Models\FormSubmission;
use App\Models\Lead;
use App\Models\NewsletterSubscriber;
use App\Models\Order;
use App\Models\Ticket;
use App\Models\TicketMessage;
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
