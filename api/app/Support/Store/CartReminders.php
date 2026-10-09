<?php

namespace App\Support\Store;

use App\Enums\MessageEvent;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\NewsletterSuppression;
use App\Models\Setting;
use App\Notifications\CartReminder;
use App\Support\Messaging\MessageRecipient;
use App\Support\Messaging\Messenger;
use App\Support\Money;
use App\Support\Notifier;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * Reminding somebody about a basket they left.
 *
 * Two reminders at most, the client's decision (2026-09-24): the first after
 * `store_cart_reminder_1_hours` of inactivity, the second after
 * `store_cart_reminder_2_days`, which may carry a coupon. Off by default —
 * an email about a basket is marketing, and a shop has to decide to send it.
 *
 * **"Idle" is `carts.updated_at`**, the column every basket action already
 * touches and the prune already reads. Nothing here moves it: a reminder is
 * written with a plain query that leaves the timestamps alone, or the second
 * reminder's clock would restart from the first and the prune would keep a
 * basket alive by mailing about it.
 *
 * **Who is asked**, in the order the query and then the loop ask it: a basket
 * with lines in it; with a contact — an address typed at the checkout beside
 * the line saying a reminder may follow, or an account; not already turned
 * into an order; at the right stage and idle long enough; and whose address is
 * not on `newsletter_suppressions`. The suppression list is the site's one
 * do-not-mail list, and a basket reminder is exactly the kind of message it
 * exists to stop.
 *
 * **Promotional, so it waits for the window.** `QuietHours::allows()` is asked
 * once per run; outside it the command does nothing and the next run, ten
 * minutes later, asks again. A reminder due at 11pm goes at 9am.
 */
final class CartReminders
{
    /** The second reminder must fall before `technoware:prune-carts` deletes the basket at thirty days. */
    public const MAX_SECOND_DAYS = 25;

    /** A first reminder within three days of leaving, or it is not a reminder. */
    public const MAX_FIRST_HOURS = 72;

    /**
     * A basket idle longer than this never gets its *first* reminder.
     *
     * The case is a shop switching reminders on for the first time with a
     * month of abandoned baskets behind it: mailing all of them at nine the
     * next morning is a spam run about baskets nobody remembers.
     */
    public const STALE_DAYS = 7;

    /**
     * The least time between the two reminders, whatever the delays say.
     *
     * With a second delay of one day and a basket first reminded late — the
     * quiet hours held it overnight — the two would otherwise land an hour
     * apart.
     */
    public const MIN_GAP_HOURS = 12;

    /** How many baskets one run takes per stage; the next run takes the rest. */
    public const BATCH = 200;

    public static function enabled(): bool
    {
        return (bool) Setting::get('store_cart_reminders_enabled', false);
    }

    public static function firstDelayHours(): int
    {
        return max(1, min(self::MAX_FIRST_HOURS, (int) (Setting::get('store_cart_reminder_1_hours') ?: 1)));
    }

    public static function secondDelayDays(): int
    {
        return max(1, min(self::MAX_SECOND_DAYS, (int) (Setting::get('store_cart_reminder_2_days') ?: 1)));
    }

    /**
     * The baskets due a reminder of this number, before the suppression list.
     *
     * @param  1|2  $number
     * @return Builder<Cart>
     */
    public static function due(int $number, ?Carbon $now = null): Builder
    {
        $now ??= now();

        $query = Cart::query()
            ->whereNull('recovered_order_id')
            ->where('reminders_sent', $number - 1)
            ->whereHas('items')
            ->where(fn (Builder $q) => $q
                ->where(fn (Builder $q) => $q->whereNotNull('email')->whereNotNull('contact_consent_at'))
                ->orWhereNotNull('customer_id'));

        if ($number === 1) {
            return $query
                ->where('updated_at', '<=', $now->copy()->subHours(self::firstDelayHours()))
                ->where('updated_at', '>', $now->copy()->subDays(self::STALE_DAYS));
        }

        return $query
            ->where('updated_at', '<=', $now->copy()->subDays(self::secondDelayDays()))
            ->where('last_reminded_at', '<=', $now->copy()->subHours(self::MIN_GAP_HOURS));
    }

    /**
     * Send one reminder, if this basket is still owed it.
     *
     * Claimed with a conditional UPDATE on `reminders_sent` before anything is
     * sent: two overlapping runs cannot both win, and a basket is never told
     * twice. Written through the query builder, so `updated_at` — the idle
     * clock — does not move.
     *
     * @param  1|2  $number
     */
    public static function send(Cart $cart, int $number): bool
    {
        $cart->loadMissing(['customer', 'items.product', 'items.variation']);

        $email = $cart->reminderEmail();

        if (blank($email) || NewsletterSuppression::has($email)) {
            return false;
        }

        $summary = Basket::summarise($cart);

        // Every line gone from the shop since: nothing left to remind about.
        if ($summary['item_count'] === 0) {
            return false;
        }

        $claimed = Cart::whereKey($cart->id)
            ->where('reminders_sent', $number - 1)
            ->whereNull('recovered_order_id')
            ->toBase()
            ->update(['reminders_sent' => $number, 'last_reminded_at' => now()]);

        if ($claimed !== 1) {
            return false;
        }

        $restore = $cart->ensureRestoreToken();
        $coupon = $number === 2 ? self::coupon($summary['subtotal_paise'], $email) : null;

        Notifier::to($email, new CartReminder($cart, $number, $coupon?->code));

        Messenger::notify(
            $number === 1 ? MessageEvent::CartReminder1 : MessageEvent::CartReminder2,
            new MessageRecipient(
                customerId: $cart->customer_id,
                phone: $cart->phone ?? $cart->customer?->phone,
                name: $cart->customer?->name,
            ),
            [
                'basket_url' => self::restoreUrl($restore),
                'item_count' => $summary['item_count'],
                // Goods less discount: see CartReminder::summary().
                'basket_total' => Money::format($summary['subtotal_paise'] - $summary['discount_paise']),
                'coupon_code' => $coupon !== null ? $coupon->code : '',
            ],
        );

        return true;
    }

    /**
     * The second reminder's coupon, when one is set and this basket could use it.
     *
     * Checked with the same `refusalFor()` the basket and the checkout use, so
     * an email never offers a code the basket would then refuse: expired,
     * fully used, used by this address already, or needing a bigger order —
     * any of those and the reminder goes without it.
     */
    public static function coupon(int $subtotalPaise, ?string $email): ?Coupon
    {
        $code = Setting::get('store_cart_reminder_coupon');

        if (blank($code)) {
            return null;
        }

        $coupon = Coupon::where('code', Coupon::normalise((string) $code))->first();

        return $coupon !== null && $coupon->refusalFor($subtotalPaise, $email) === null ? $coupon : null;
    }

    public static function restoreUrl(string $token): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/store/basket/restore/'.$token;
    }

    /** The newsletter's own unsubscribe page, which accepts a basket's restore token. */
    public static function unsubscribeUrl(string $token): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/newsletter/unsubscribe/'.$token;
    }
}
