<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\Store\OrderResource;
use App\Models\Order;
use App\Notifications\OrderDispatched;
use App\Support\Notifier;
use App\Support\Store\DigitalFulfilment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Working the order queue.
 *
 * Bound by **order number** rather than id, unlike every CMS entity here — an
 * order number never changes, is what a customer reads out on the telephone,
 * and is what staff search for. The rule those entities follow ("bind by id,
 * because the edit form changes the slug it is addressed by") does not apply:
 * nothing about an order can change its number.
 *
 * **Nothing here can mark an order paid.** That is the difference between a
 * shop and a way of giving stock away, and it is enforced by
 * `OrderStatus::allowedTransitions()` rather than by this controller
 * remembering — an order becomes paid because a payment was verified
 * server-side, never because somebody chose it from a dropdown.
 */
class OrderController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $orders = Order::query()
            ->with('items')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            /*
             * The two filters this screen is actually opened for.
             *
             * "What needs doing" is not a status — a paid order waiting on a
             * licence key and one waiting to be boxed are different jobs in
             * the same state, and neither is visible from the status column.
             */
            ->when($request->boolean('unpaid'), fn ($q) => $q->where('status', OrderStatus::PendingPayment))
            ->when($request->boolean('open'), fn ($q) => $q->whereNotIn('status', [
                OrderStatus::Completed->value,
                OrderStatus::Cancelled->value,
                OrderStatus::Refunded->value,
            ]))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('order_number', 'like', "%{$term}%")
                    ->orWhere('customer_name', 'like', "%{$term}%")
                    ->orWhere('customer_email', 'like', "%{$term}%")
                    ->orWhere('tracking_number', 'like', "%{$term}%"));
            })
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 20), 100))
            ->withQueryString();

        return OrderResource::collection($orders)->additional(['meta' => [
            'statuses' => OrderStatus::options(),
            // Counted over the whole table, not the page: it is a headline
            // figure, and a count of what happens to be on screen is not one.
            'pending_payment' => Order::where('status', OrderStatus::PendingPayment)->count(),
        ]]);
    }

    public function show(Order $order): JsonResource
    {
        return new OrderResource($order->load(['items', 'payments', 'history', 'notes']));
    }

    /**
     * Move it on, and write down that it moved.
     *
     * The move is checked against the enum, so an illegal one is a 422 naming
     * both states rather than a silently wrong order. Same shape as
     * `TicketStatus::canTransitionTo()`, and for a stronger reason: a ticket in
     * the wrong state reads oddly, an order in the wrong state is stock
     * committed twice or a parcel sent for money nobody received.
     */
    public function status(Request $request, Order $order): JsonResource
    {
        $data = $request->validate([
            'status' => ['required', Rule::enum(OrderStatus::class)],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $next = OrderStatus::from($data['status']);

        abort_if(
            ! $order->status->canTransitionTo($next),
            422,
            "An order cannot go from {$order->status->label()} to {$next->label()}.",
        );

        $order->moveTo($next, $data['note'] ?? null, $request->user());

        /*
         * The dispatch notice, sent on the move rather than on the tracking
         * form.
         *
         * Tracking is often typed *before* the status changes — the parcel is
         * labelled, then handed over — so sending on the form would tell
         * somebody their order had shipped while it sat on a desk. The status
         * is the moment it actually left.
         */
        if ($next === OrderStatus::Dispatched) {
            Notifier::to($order->customer_email, new OrderDispatched($order->fresh()));
        }

        return new OrderResource($order->fresh(['items', 'payments', 'history', 'notes']));
    }

    /**
     * The courier, entered by hand — there is no shipping API by the brief.
     *
     * `tracking_url` is pattern-checked because it becomes an `href` on a page
     * of ours: the same reasoning as the contact page's map embed and a
     * slider's video. An unchecked URL from a form is somebody else's site
     * behind our name.
     */
    public function shipping(Request $request, Order $order): JsonResource
    {
        $data = $request->validate([
            'courier' => ['nullable', 'string', 'max:120'],
            'tracking_number' => ['nullable', 'string', 'max:120'],
            'tracking_url' => ['nullable', 'string', 'max:500', 'regex:#^https?://#i'],
            'shipping_notes' => ['nullable', 'string', 'max:2000'],
        ], [
            'tracking_url.regex' => 'A tracking link has to start with http:// or https://.',
        ]);

        $order->update($data);

        /*
         * Recorded in the trail as well as written to the row.
         *
         * "When was this dispatched" is answered by the timestamp; "who typed
         * this tracking number, and when did it change" is answered only by a
         * trail, and it is the question asked when a parcel goes missing.
         */
        if (filled($data['tracking_number'] ?? null)) {
            $order->history()->create([
                'to_status' => $order->status->value,
                'note' => 'Tracking set: '.trim(($data['courier'] ?? '').' '.$data['tracking_number']),
                'user_id' => $request->user()?->id,
                'actor_name' => $request->user()?->name,
            ]);
        }

        return new OrderResource($order->fresh(['items', 'payments', 'history', 'notes']));
    }

    /**
     * The manual invoice, uploaded.
     *
     * The brief is explicit that no GST invoice is generated here — it is
     * prepared outside and attached. It goes to the **private** disk and is
     * streamed by an authorised route, like a CV and a ticket attachment: an
     * invoice carries a name, an address and a GSTIN, and a public URL for one
     * is a document anybody who guesses a filename can read.
     */
    public function invoice(Request $request, Order $order): JsonResource
    {
        $data = $request->validate([
            'invoice_number' => ['nullable', 'string', 'max:64'],
            'invoice_date' => ['nullable', 'date'],
            // `mimes:` and `mimetypes:` together, the rule the careers form
            // documents: a `.php` renamed `.pdf` passes the first and fails
            // the second.
            'invoice' => ['nullable', 'file', 'mimes:pdf', 'mimetypes:application/pdf', 'max:10240'],
        ]);

        $attributes = [
            'invoice_number' => $data['invoice_number'] ?? $order->invoice_number,
            'invoice_date' => $data['invoice_date'] ?? $order->invoice_date,
        ];

        if ($request->hasFile('invoice')) {
            // The old one goes when a new one arrives: two invoices for one
            // order is a question nobody can answer later.
            if (filled($order->invoice_path)) {
                Storage::disk('local')->delete($order->invoice_path);
            }

            $attributes['invoice_path'] = $request->file('invoice')
                ->store("orders/{$order->order_number}", 'local');
        }

        $order->update($attributes);

        $order->history()->create([
            'to_status' => $order->status->value,
            'note' => $request->hasFile('invoice') ? 'Invoice uploaded.' : 'Invoice details updated.',
            'user_id' => $request->user()?->id,
            'actor_name' => $request->user()?->name,
        ]);

        return new OrderResource($order->fresh(['items', 'payments', 'history', 'notes']));
    }

    /** Streams the invoice to staff. The only way to read one. */
    public function downloadInvoice(Order $order)
    {
        abort_unless(filled($order->invoice_path) && Storage::disk('local')->exists($order->invoice_path), 404);

        return Storage::disk('local')->download(
            $order->invoice_path,
            "invoice-{$order->order_number}.pdf",
        );
    }

    /**
     * A note for colleagues, which never reaches the customer.
     *
     * The customer's own resource has no `notes` key at all — the guard is
     * structural rather than a flag somebody has to remember to check, which is
     * the lesson the ticket module's internal notes taught.
     */
    public function note(Request $request, Order $order): JsonResource
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:2000'],
        ]);

        $order->notes()->create([
            'body' => $data['body'],
            'user_id' => $request->user()?->id,
            'actor_name' => $request->user()?->name,
        ]);

        return new OrderResource($order->fresh(['items', 'payments', 'history', 'notes']));
    }

    /**
     * Issue the activation codes for a paid order, by hand.
     *
     * `force` — this is somebody deciding, so it runs whether or not automatic
     * fulfilment is switched on. It cannot issue anything for an unpaid order:
     * that check is inside `fulfil()` rather than here, so every caller gets it.
     */
    public function fulfil(Request $request, Order $order): JsonResponse
    {
        $result = DigitalFulfilment::fulfil($order, force: true);

        return response()->json([
            'data' => new OrderResource($order->fresh(['items', 'payments', 'history', 'notes'])),
            'meta' => $result,
        ]);
    }
}
