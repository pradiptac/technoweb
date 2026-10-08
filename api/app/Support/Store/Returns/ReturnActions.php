<?php

namespace App\Support\Store\Returns;

use App\Enums\ReturnStatus;
use App\Enums\StockMovementReason;
use App\Enums\WebhookEvent;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderReturn;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Models\User;
use App\Notifications\ReturnRequestReceived;
use App\Notifications\ReturnStatusChanged;
use App\Support\Notifier;
use App\Support\Store\Payments\ManualRefund;
use App\Support\Store\StockLedger;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Everything that happens to a return (docs/store.md "Returns"): the request,
 * and the five moves the desk makes.
 *
 * Both doors a customer has — the order link and the portal — and every
 * console button come through here, so there is one place where a status
 * moves, stock goes back and somebody is told. Each move:
 *
 *   - locks the return's row and re-reads its status, so two presses of
 *     "Mark as received" put the stock back once;
 *   - is refused, with both states named, when `ReturnStatus` does not
 *     permit it;
 *   - writes a line in the **order's** trail, because that is where somebody
 *     looking at the order later reads what happened to it;
 *   - tells the customer after the commit, through `Notifier`, which never
 *     fails the request.
 *
 * Nothing here calls a payment gateway. A refund is `ManualRefund` — money
 * sent back some other way and recorded with its reference — linked to the
 * return it settles.
 */
class ReturnActions
{
    /**
     * A customer asks to send lines back.
     *
     * @param  array{reason: string, details?: string|null, items: list<array{order_item_id: int|string, quantity: int|string}>}  $data
     * @param  list<UploadedFile>  $photos
     */
    public static function request(Order $order, array $data, array $photos = [], ?Customer $customer = null): OrderReturn
    {
        $return = DB::transaction(function () use ($order, $data, $photos, $customer) {
            // The order row is the lock: two tabs asking to return the same
            // last unit are settled one after the other, and the second is
            // counted against what the first already holds.
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $locked->load('items');

            if (($refusal = ReturnPolicy::refusal($locked)) !== null) {
                throw ValidationException::withMessages(['return' => $refusal]);
            }

            $returnable = ReturnPolicy::returnable($locked);
            $lines = [];
            $errors = [];

            foreach ($data['items'] as $i => $row) {
                $id = (int) $row['order_item_id'];
                $quantity = (int) $row['quantity'];

                if (! array_key_exists($id, $returnable)) {
                    $errors["items.{$i}.order_item_id"] = 'That item is not on this order.';
                } elseif (isset($lines[$id])) {
                    $errors["items.{$i}.order_item_id"] = 'That item is listed twice.';
                } elseif ($returnable[$id] === 0) {
                    $item = $locked->items->firstWhere('id', $id);
                    $errors["items.{$i}.quantity"] = $item !== null && ReturnPolicy::lineReturns($item)
                        ? 'A return has already been asked for all of that item.'
                        : 'That item cannot be returned.';
                } elseif ($quantity > $returnable[$id]) {
                    $errors["items.{$i}.quantity"] = $returnable[$id] === 1
                        ? 'Only 1 of that item can be returned.'
                        : "Only {$returnable[$id]} of that item can be returned.";
                } else {
                    $lines[$id] = $quantity;
                }
            }

            if ($errors !== []) {
                throw ValidationException::withMessages($errors);
            }

            $return = OrderReturn::create([
                'order_id' => $locked->id,
                'customer_id' => $locked->customer_id ?? $customer?->id,
                'reason' => $data['reason'],
                'details' => filled($data['details'] ?? null) ? trim((string) $data['details']) : null,
            ]);

            foreach ($lines as $id => $quantity) {
                $return->items()->create(['order_item_id' => $id, 'quantity' => $quantity]);
            }

            self::trail($locked, "Return {$return->reference} requested by the customer: ".array_sum($lines).' item'.(array_sum($lines) === 1 ? '' : 's').', '.strtolower($return->reason->label()).'.', $locked->customer_name);

            // Last, so a failure before this point leaves no file behind.
            ReturnPhotos::store($return, $photos);

            return $return;
        });

        $return->load(['order', 'items.orderItem', 'photos']);

        Notifier::to($return->order->customer_email, new ReturnStatusChanged($return, ReturnStatusChanged::REQUESTED));
        Notifier::to(Setting::get('support_email'), new ReturnRequestReceived($return));
        Webhooks::emit(WebhookEvent::ReturnRequested, fn () => WebhookPayload::orderReturn($return));

        return $return;
    }

    /** Accept it: the customer is told how to send the goods back. */
    public static function approve(OrderReturn $return, User $actor, ?string $note = null): OrderReturn
    {
        $return = self::move($return, ReturnStatus::Approved, $actor, fn (OrderReturn $r) => [
            'decision_note' => filled($note) ? trim((string) $note) : null,
            'decided_by' => $actor->id,
            'approved_at' => $r->approved_at ?? now(),
        ], 'approved');

        self::tell($return, ReturnStatusChanged::APPROVED);

        return $return;
    }

    /** Refuse it, with the reason the customer will read. */
    public static function reject(OrderReturn $return, User $actor, string $note): OrderReturn
    {
        $return = self::move($return, ReturnStatus::Rejected, $actor, fn (OrderReturn $r) => [
            'decision_note' => trim($note),
            'decided_by' => $actor->id,
            'rejected_at' => $r->rejected_at ?? now(),
        ], 'not accepted');

        self::tell($return, ReturnStatusChanged::REJECTED);

        return $return;
    }

    /**
     * The goods arrived.
     *
     * `$lines` says, per return line, how many turned up and whether they go
     * back on the shelf; a line not named arrived whole and is not restocked
     * — putting stock back is a decision about the condition of what came
     * back, and nobody made it.
     *
     * @param  array<int, array{received_quantity?: int|string|null, restock?: bool|null}>  $lines  keyed by return line id
     */
    public static function receive(OrderReturn $return, User $actor, array $lines = []): OrderReturn
    {
        $return = DB::transaction(function () use ($return, $actor, $lines) {
            $locked = self::locked($return, ReturnStatus::Received);
            $locked->load(['items.orderItem', 'order']);
            $errors = [];
            $restocked = 0;

            foreach ($locked->items as $line) {
                $given = $lines[$line->id] ?? [];
                $received = array_key_exists('received_quantity', $given) && $given['received_quantity'] !== null && $given['received_quantity'] !== ''
                    ? (int) $given['received_quantity']
                    : (int) $line->quantity;

                if ($received < 0 || $received > $line->quantity) {
                    $errors["items.{$line->id}.received_quantity"] = "Between 0 and {$line->quantity}: that is how many were asked to come back.";

                    continue;
                }

                $back = ! empty($given['restock']) ? self::restock($locked, $line->orderItem, $received) : 0;
                $restocked += $back;

                $line->forceFill(['received_quantity' => $received, 'restocked_quantity' => $back])->save();
            }

            if ($errors !== []) {
                throw ValidationException::withMessages($errors);
            }

            $locked->forceFill(['status' => ReturnStatus::Received, 'received_at' => $locked->received_at ?? now()])->save();

            self::trail($locked->order, "Return {$locked->reference}: items received"
                .($restocked > 0 ? ", {$restocked} put back in stock." : ', nothing put back in stock.'), $actor->name, $actor->id);

            return $locked;
        });

        self::tell($return, ReturnStatusChanged::GOODS_RECEIVED);

        return $return;
    }

    /**
     * The money went back — recorded, never sent from here.
     *
     * @param  array{amount_paise: int, reference: string, note?: string|null}  $details
     */
    public static function refund(OrderReturn $return, User $actor, array $details): OrderReturn
    {
        $return = DB::transaction(function () use ($return, $actor, $details) {
            $locked = self::locked($return, ReturnStatus::Refunded);
            $locked->load('order');

            // `ManualRefund` owns the rules about money: nothing to refund on
            // an unpaid order, never more than was paid less what has gone
            // back. Its refusals are keyed `amount_paise`, the field's name.
            $payment = ManualRefund::record($locked->order, $actor, [
                'amount_paise' => (int) $details['amount_paise'],
                'reference' => $details['reference'],
                'note' => trim("Return {$locked->reference}. ".($details['note'] ?? '')),
            ]);

            $locked->forceFill([
                'status' => ReturnStatus::Refunded,
                'refund_payment_id' => $payment->id,
                'refund_paise' => (int) $details['amount_paise'],
                'refunded_at' => $locked->refunded_at ?? now(),
            ])->save();

            return $locked;
        });

        self::tell($return, ReturnStatusChanged::REFUNDED);

        return $return;
    }

    /**
     * Finished without a refund recorded here: a replacement went out, the
     * customer changed their mind, the order was never paid for. Nobody is
     * mailed — whatever closed it was said some other way.
     */
    public static function close(OrderReturn $return, User $actor, ?string $note = null): OrderReturn
    {
        return self::move($return, ReturnStatus::Closed, $actor, fn (OrderReturn $r) => [
            'closed_at' => $r->closed_at ?? now(),
            ...(filled($note) ? ['staff_note' => trim(trim((string) $r->staff_note)."\n".'Closed: '.trim((string) $note))] : []),
        ], 'closed'.(filled($note) ? ' — '.trim((string) $note) : ''));
    }

    /**
     * The sum of what was received, at the price each line was sold for —
     * what the refund form starts on. An order-level discount is not taken
     * off: `ManualRefund` refuses anything over what is left to refund, in a
     * sentence that says how much that is.
     */
    public static function suggestedRefundPaise(OrderReturn $return): int
    {
        $return->loadMissing('items.orderItem');

        return (int) $return->items->sum(fn ($line) => ($line->received_quantity ?? $line->quantity) * (int) ($line->orderItem->unit_price_paise ?? 0));
    }

    /**
     * Put returned units back on the shelf, and write the movement. Returns
     * how many went back — zero for a product that has since been deleted or
     * does not track stock, where there is no shelf to put them on.
     */
    private static function restock(OrderReturn $return, ?OrderItem $item, int $quantity): int
    {
        if ($item === null || $quantity < 1 || $item->store_product_id === null) {
            return 0;
        }

        $product = StoreProduct::query()->whereKey($item->store_product_id)->where('track_stock', true)->first();

        if ($product === null) {
            return 0;
        }

        $variation = $item->store_product_variation_id !== null
            ? StoreProductVariation::query()->whereKey($item->store_product_variation_id)->first()
            : null;

        // A line sold as a variation that has since been removed has no
        // shelf of its own, and the parent's column is not where it lived.
        if ($item->store_product_variation_id !== null && $variation === null) {
            return 0;
        }

        // On the affected row count, the rule every movement follows.
        $moved = $variation !== null
            ? StoreProductVariation::query()->whereKey($variation->id)->increment('stock', $quantity)
            : StoreProduct::query()->whereKey($product->id)->increment('stock', $quantity);

        if ($moved < 1) {
            return 0;
        }

        $balance = $variation !== null
            ? (int) StoreProductVariation::query()->whereKey($variation->id)->value('stock')
            : (int) StoreProduct::query()->whereKey($product->id)->value('stock');

        StockLedger::record($product, $variation, $quantity, StockMovementReason::Return, $balance, $return->order, "Returned: {$return->reference}");

        return $quantity;
    }

    /**
     * One status move with nothing else to it.
     *
     * @param  \Closure(OrderReturn): array<string, mixed>  $attributes
     */
    private static function move(OrderReturn $return, ReturnStatus $to, User $actor, \Closure $attributes, string $said): OrderReturn
    {
        return DB::transaction(function () use ($return, $to, $actor, $attributes, $said) {
            $locked = self::locked($return, $to);
            $locked->load('order');

            $locked->forceFill(['status' => $to, ...$attributes($locked)])->save();

            self::trail($locked->order, "Return {$locked->reference} {$said}.", $actor->name, $actor->id);

            return $locked;
        });
    }

    /** The return's row, locked, and refused unless it may move to `$to`. */
    private static function locked(OrderReturn $return, ReturnStatus $to): OrderReturn
    {
        $locked = OrderReturn::query()->whereKey($return->id)->lockForUpdate()->firstOrFail();

        if (! $locked->status->canTransitionTo($to)) {
            throw ValidationException::withMessages([
                'status' => "A return that is {$locked->status->label()} cannot be moved to {$to->label()}.",
            ]);
        }

        return $locked;
    }

    private static function trail(Order $order, string $note, ?string $actorName = null, ?int $actorId = null): void
    {
        $order->history()->create([
            'to_status' => $order->status->value,
            'note' => $note,
            'user_id' => $actorId,
            'actor_name' => $actorName,
        ]);
    }

    private static function tell(OrderReturn $return, string $key): void
    {
        $return->load(['order', 'items.orderItem', 'refundPayment']);

        Notifier::to($return->order->customer_email, new ReturnStatusChanged($return, $key));
    }
}
