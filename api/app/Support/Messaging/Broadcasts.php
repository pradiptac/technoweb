<?php

namespace App\Support\Messaging;

use App\Enums\BroadcastAudience;
use App\Enums\BroadcastStatus;
use App\Enums\CustomerStatus;
use App\Enums\MessageChannel;
use App\Enums\MessageDeliveryStatus;
use App\Enums\SubscriberStatus;
use App\Jobs\SendBroadcastBatch;
use App\Models\MessageBroadcast;
use App\Models\MessageContact;
use App\Models\MessageDelivery;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who a broadcast reaches, and sending it — the campaign sender's shape.
 *
 * The audience is **always narrowed to active contacts on the broadcast's
 * channel**: a newsletter group or a wishlist says who is interested, and
 * only an opt-in says who agreed to be messaged there. It is frozen into
 * `message_deliveries` rows when the broadcast is claimed, so the report
 * describes what was attempted.
 */
final class Broadcasts
{
    public const BATCH = 100;

    /** Seconds between batches, so a provider's rate limit is not the throttle. */
    public const SPACING = 10;

    /**
     * @return Builder<MessageContact>
     */
    public static function audience(MessageChannel $channel, BroadcastAudience $source, ?int $groupId = null, ?int $productId = null): Builder
    {
        $query = MessageContact::query()->active()->where('channel', $channel->value);

        return match ($source) {
            BroadcastAudience::OptIns => $query,
            BroadcastAudience::Customers => $query->whereNotNull('customer_id')
                ->whereIn('customer_id', DB::table('customers')->select('id')->where('status', CustomerStatus::Active->value)),
            BroadcastAudience::NewsletterGroup => $groupId === null ? $query->whereRaw('1 = 0') : $query->whereIn(
                'customer_id',
                DB::table('customers')->select('customers.id')
                    ->join('newsletter_subscribers', 'newsletter_subscribers.email', '=', 'customers.email')
                    ->join('newsletter_group_subscriber', 'newsletter_group_subscriber.newsletter_subscriber_id', '=', 'newsletter_subscribers.id')
                    ->where('newsletter_group_subscriber.newsletter_group_id', $groupId)
                    ->where('newsletter_subscribers.status', SubscriberStatus::Active->value),
            ),
            /*
             * Stream C's wishlists. Until its migration has run there is no
             * table to read, and the honest audience is nobody — a no-op, not
             * an error, so this can ship before the wishlist does.
             */
            BroadcastAudience::Wishlist => $productId === null || ! Schema::hasTable('wishlist_items') || ! Schema::hasTable('wishlists')
                ? $query->whereRaw('1 = 0')
                : $query->whereIn(
                    'customer_id',
                    DB::table('wishlists')->select('wishlists.customer_id')
                        ->join('wishlist_items', 'wishlist_items.wishlist_id', '=', 'wishlists.id')
                        ->where('wishlist_items.store_product_id', $productId)
                        ->whereNotNull('wishlists.customer_id'),
                ),
        };
    }

    /** @return Builder<MessageContact> */
    public static function audienceFor(MessageBroadcast $broadcast): Builder
    {
        return self::audience($broadcast->channel, $broadcast->audience, $broadcast->newsletter_group_id, $broadcast->store_product_id);
    }

    /**
     * Claim the broadcast and freeze its audience. Returns how many were
     * queued, or null when somebody else claimed it first.
     *
     * Claimed with a conditional UPDATE from `draft` or `scheduled`, so two
     * presses — or a press and the scheduler — cannot both freeze a list.
     */
    public static function queue(MessageBroadcast $broadcast): ?int
    {
        $claimed = MessageBroadcast::query()->whereKey($broadcast->id)
            ->whereIn('status', [BroadcastStatus::Draft->value, BroadcastStatus::Scheduled->value])
            ->update(['status' => BroadcastStatus::Sending->value, 'started_at' => now(), 'updated_at' => now()]);

        if ($claimed === 0) {
            return null;
        }

        $broadcast->refresh();
        $template = $broadcast->template;
        $provider = $broadcast->channel->current()?->id();
        $count = 0;

        self::audienceFor($broadcast)->with('customer:id,name')->orderBy('id')->chunkById(500, function ($contacts) use ($broadcast, $template, $provider, &$count) {
            $now = now();
            $rows = [];

            foreach ($contacts as $contact) {
                $rows[] = [
                    'channel' => $broadcast->channel->value,
                    'provider' => $provider,
                    'message_broadcast_id' => $broadcast->id,
                    'message_template_id' => $template?->id,
                    'message_contact_id' => $contact->id,
                    'address' => $contact->address,
                    'vars' => json_encode(Messenger::withDefaults([], $contact->customer->name ?? $contact->name)),
                    'status' => MessageDeliveryStatus::Pending->value,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            MessageDelivery::query()->insert($rows);
            $count += count($rows);
        });

        $broadcast->update(['recipient_count' => $count]);

        $ids = MessageDelivery::query()->where('message_broadcast_id', $broadcast->id)
            ->where('status', MessageDeliveryStatus::Pending->value)->orderBy('id')->pluck('id');

        $start = QuietHours::nextOpening();

        foreach ($ids->chunk(self::BATCH)->values() as $i => $chunk) {
            dispatch(new SendBroadcastBatch($broadcast->id, $chunk->values()->all()))
                ->delay($start->addSeconds($i * self::SPACING));
        }

        self::completeIfDone($broadcast);

        return $count;
    }

    /** Sent once nothing is left waiting. */
    public static function completeIfDone(MessageBroadcast $broadcast): void
    {
        $waiting = MessageDelivery::query()->where('message_broadcast_id', $broadcast->id)
            ->where('status', MessageDeliveryStatus::Pending->value)->exists();

        if (! $waiting) {
            MessageBroadcast::query()->whereKey($broadcast->id)->where('status', BroadcastStatus::Sending->value)
                ->update(['status' => BroadcastStatus::Sent->value, 'completed_at' => now(), 'updated_at' => now()]);
        }
    }

    /**
     * The figures on the report: counts by status, rates over what was sent,
     * and null rather than zero before anything has been.
     *
     * @return array<string, mixed>
     */
    public static function report(MessageBroadcast $broadcast): array
    {
        $counts = MessageDelivery::query()->where('message_broadcast_id', $broadcast->id)
            ->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status')
            ->map(fn ($n) => (int) $n)->all();

        $by = fn (MessageDeliveryStatus $s) => $counts[$s->value] ?? 0;
        $reached = $by(MessageDeliveryStatus::Sent) + $by(MessageDeliveryStatus::Delivered) + $by(MessageDeliveryStatus::Read);
        $delivered = $by(MessageDeliveryStatus::Delivered) + $by(MessageDeliveryStatus::Read);

        return [
            'counts' => array_combine(
                array_map(fn (MessageDeliveryStatus $s) => $s->value, MessageDeliveryStatus::cases()),
                array_map($by, MessageDeliveryStatus::cases()),
            ),
            'total' => array_sum($counts),
            'sent' => $reached,
            'delivery_rate' => $reached > 0 ? round($delivered / $reached, 4) : null,
            'read_rate' => $reached > 0 ? round($by(MessageDeliveryStatus::Read) / $reached, 4) : null,
            'failures' => MessageDelivery::query()->where('message_broadcast_id', $broadcast->id)
                ->where('status', MessageDeliveryStatus::Failed->value)->latest('id')->limit(20)
                ->get(['id', 'address', 'error', 'updated_at'])
                ->map(fn (MessageDelivery $d) => ['id' => $d->id, 'address' => $d->address, 'error' => $d->error, 'at' => $d->updated_at?->toIso8601String()])
                ->all(),
        ];
    }
}
