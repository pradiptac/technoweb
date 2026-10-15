<?php

namespace App\Support\Store;

use App\Models\Setting;

/**
 * What the shop promises about getting something to somebody, and taking it
 * back.
 *
 * One resolver, because four things have to make the same claim and two of them
 * are read by machines: the shipping line on a product page, `g:shipping` and
 * the handling times in the Google feed, `shippingDetails` in the Offer markup,
 * and the returns page. Stated separately, they drift — and the drift is not
 * cosmetic here: a delivery charge advertised on the page that disagrees with
 * the one declared to Merchant Center is a mismatch between the landing page
 * and the feed, which is the single most common reason an account is
 * suspended.
 *
 * It replaced a sentence hard-coded in the frontend's `content/site.ts`
 * ("Free Shipping — On every order across India — no minimum spend"), which was
 * a promise the API could not read and therefore could not honour anywhere
 * else.
 *
 * **Everything here is cast, never trusted as a string.** Settings are stored
 * as text, so `'0'` is a real answer and `''` is a missing one — the trap
 * `settingEnabled()` documents on the frontend, one layer down.
 */
class Fulfilment
{
    /** Free is a real answer and the shop's current one, not a missing value. */
    public static function shippingPaise(): int
    {
        return max(0, (int) Setting::get('store_shipping_paise', 0));
    }

    public static function isFreeShipping(): bool
    {
        return self::shippingPaise() === 0;
    }

    public const MODE_FLAT = 'flat';

    public const MODE_ZONES = 'zones';

    /**
     * How a delivery charge is worked out (0.142.0): `flat` charges
     * `store_shipping_paise` on any order that ships, `zones` quotes it from
     * the delivery state and the basket's weight.
     *
     * `zones` is honoured only while a default zone with a rate exists. The
     * console refuses to save it otherwise and refuses to delete the zone it
     * leans on, so this is a belt over braces: a stored `zones` with nothing
     * to quote from reads as `flat` rather than as free delivery by accident.
     */
    public static function shippingMode(): string
    {
        if (Setting::get('store_shipping_mode', self::MODE_FLAT) === self::MODE_ZONES && ShippingQuote::zonesReady()) {
            return self::MODE_ZONES;
        }

        return self::MODE_FLAT;
    }

    public static function usesZones(): bool
    {
        return self::shippingMode() === self::MODE_ZONES;
    }

    /**
     * What a product with no weight of its own weighs, in grams.
     *
     * Floored at one: zero is how a product says "unset", and a default of
     * zero would make an unweighed basket weigh nothing and ride the
     * cheapest slab for free.
     */
    public static function defaultWeightGrams(): int
    {
        $grams = (int) Setting::get('store_default_weight_grams', 500);

        return $grams > 0 ? $grams : 500;
    }

    /**
     * Working days between the money arriving and the parcel leaving.
     *
     * Floored at zero rather than at one: same-day dispatch is a claim a shop
     * is entitled to make, and Merchant Center accepts `0`.
     */
    public static function handlingDays(): int
    {
        return max(0, (int) Setting::get('store_handling_days', 2));
    }

    /** The named delivery service, as Merchant Center lists it beside the price. */
    public static function shippingService(): string
    {
        $name = trim((string) Setting::get('store_shipping_service', 'Standard Shipping'));

        return $name !== '' ? $name : 'Standard Shipping';
    }

    /**
     * The transit window in working days — after handling, courier to door.
     *
     * The maximum is never below the minimum, whatever was typed: a window
     * that runs backwards is not a shorter promise, it is a form error, and
     * Merchant Center refuses it.
     *
     * @return array{min: int, max: int}
     */
    public static function transitDays(): array
    {
        $min = max(0, (int) Setting::get('store_transit_days_min', 3));
        $max = max($min, (int) Setting::get('store_transit_days_max', 7));

        return ['min' => $min, 'max' => $max];
    }

    /**
     * The return window, in days.
     *
     * Floored at one. Zero would render as "you have zero days to return this",
     * which is not a shorter window — it is a different claim, and the field
     * for that claim is `returnable` on the product.
     */
    public static function returnDays(): int
    {
        return max(1, (int) Setting::get('store_return_days', 7));
    }

    /**
     * The two-letter country this shop ships to.
     *
     * A constant rather than a setting, deliberately. It is not a preference
     * somebody adjusts — it is where the business is, it is what every address
     * in `App\Support\Address` already defaults to, and a shop that starts
     * shipping abroad needs rather more than one field changed.
     */
    public const COUNTRY = 'IN';
}
