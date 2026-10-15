<?php

namespace App\Support\Store;

use App\Models\ShippingZone;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Support\IndianStates;
use App\Support\Money;
use Illuminate\Support\Collection;

/**
 * What it costs to deliver a basket (0.142.0, docs/store.md "Delivery charges
 * and shipping zones").
 *
 * One answer, asked from three places that must never disagree: the basket's
 * summary (so the figure on the screen is the figure at the till), the
 * checkout (which re-quotes under its row lock from the real address, and is
 * the only place a number becomes a charge) and the console's quote preview.
 * Nothing downstream re-quotes: the order snapshots the charge, the zone's
 * name and the weight, and every gateway, refund and report reads those.
 *
 * Two modes. `flat` charges `store_shipping_paise` on any order that ships,
 * so an install left at 0 is exactly what it was. `zones` finds the zone the
 * delivery state belongs to, weighs the basket, picks the slab, and adds
 * `extra_per_kg_paise` for every started kilogram above the top slab.
 *
 * **Coupons never discount delivery**, and `free_above_paise` is judged on the
 * goods *after* the discount: a code that drags a basket under the line
 * should not leave it free. A basket with nothing physical in it has no
 * delivery and no destination question.
 */
final class ShippingQuote
{
    public function __construct(
        public readonly string $mode,
        /** Whether anything in the basket is put in a box. False: no delivery at all. */
        public readonly bool $ships,
        public readonly int $chargePaise,
        public readonly ?string $zone,
        public readonly int $weightGrams,
        /** The zone delivers there. False means refuse the order. */
        public readonly bool $deliverable,
        /** Zones mode only: false while the destination is not known yet. */
        public readonly bool $known,
        /** The zone's free-delivery line was crossed. */
        public readonly bool $free,
        public readonly ?string $stateCode,
    ) {}

    /**
     * @param  iterable<array{shipped: bool, quantity: int, weight_grams: int}>  $lines  `weight_grams` is one unit's, already resolved
     * @param  int  $payablePaise  subtotal less discount — what `free_above_paise` is judged on
     */
    public static function for(iterable $lines, ?string $stateCode, int $payablePaise): self
    {
        $weight = 0;
        $ships = false;

        foreach ($lines as $line) {
            if (! $line['shipped']) {
                continue;
            }

            $ships = true;
            $weight += max(0, (int) $line['quantity']) * max(0, (int) $line['weight_grams']);
        }

        $mode = Fulfilment::shippingMode();
        $stateCode = IndianStates::isCode($stateCode) ? $stateCode : null;

        if (! $ships) {
            return new self($mode, false, 0, null, 0, true, true, false, $stateCode);
        }

        if ($mode === Fulfilment::MODE_FLAT) {
            return new self($mode, true, Fulfilment::shippingPaise(), null, $weight, true, true, false, $stateCode);
        }

        if ($stateCode === null) {
            return new self($mode, true, 0, null, $weight, true, false, false, null);
        }

        $zone = self::zoneFor($stateCode);

        if ($zone === null || ! $zone->delivers) {
            return new self($mode, true, 0, $zone?->name, $weight, false, true, false, $stateCode);
        }

        if ($zone->free_above_paise !== null && $payablePaise >= $zone->free_above_paise) {
            return new self($mode, true, 0, $zone->name, $weight, true, true, true, $stateCode);
        }

        $charge = self::chargeFor($zone, $weight);

        // A deliverable zone with no slabs cannot be quoted. The console will
        // not save one; failing closed here keeps a database edit from
        // turning into free delivery.
        if ($charge === null) {
            return new self($mode, true, 0, $zone->name, $weight, false, true, false, $stateCode);
        }

        return new self($mode, true, $charge, $zone->name, $weight, true, true, false, $stateCode);
    }

    /**
     * One unit's weight in grams: the variation's own, else the product's,
     * else the shop's default. Zero means "unset" at both levels.
     */
    public static function unitWeight(StoreProduct $product, ?StoreProductVariation $variation = null): int
    {
        $grams = (int) ($variation->weight_grams ?? 0);

        if ($grams <= 0) {
            $grams = (int) ($product->weight_grams ?? 0);
        }

        return $grams > 0 ? $grams : Fulfilment::defaultWeightGrams();
    }

    /** Whether this unit's weight is a guess, because nobody entered one. */
    public static function weightIsDefault(StoreProduct $product, ?StoreProductVariation $variation = null): bool
    {
        return (int) ($variation->weight_grams ?? 0) <= 0 && (int) ($product->weight_grams ?? 0) <= 0;
    }

    /**
     * The zone a state belongs to: an active zone that lists it, else the
     * default. A state is in at most one active zone (the console enforces
     * it); if the data says otherwise the first in the screen's order wins.
     */
    public static function zoneFor(string $stateCode): ?ShippingZone
    {
        $zones = self::activeZones();

        foreach ($zones->where('is_default', false) as $zone) {
            if ($zone->coversState($stateCode)) {
                return $zone;
            }
        }

        return $zones->firstWhere('is_default', true);
    }

    /**
     * The charge for a weight in this zone, or null when it has no slabs.
     *
     * The first slab whose limit is at or above the weight applies — the
     * limit itself is inside the slab. Past the top slab it is that slab's
     * charge plus `extra_per_kg_paise` per *started* kilogram of the excess,
     * in integers.
     */
    public static function chargeFor(ShippingZone $zone, int $weightGrams): ?int
    {
        $rates = $zone->rates;

        if ($rates->isEmpty()) {
            return null;
        }

        foreach ($rates as $rate) {
            if ($weightGrams <= $rate->up_to_grams) {
                return $rate->charge_paise;
            }
        }

        $top = $rates->last();
        $excess = $weightGrams - $top->up_to_grams;
        $kilos = intdiv($excess + 999, 1000);

        return $top->charge_paise + $kilos * (int) ($zone->extra_per_kg_paise ?? 0);
    }

    /**
     * Whether zones mode can be used: exactly one active default zone that
     * delivers and has a slab to quote from.
     */
    public static function zonesReady(): bool
    {
        $defaults = ShippingZone::query()->active()->where('is_default', true)->with('rates')->get();

        return $defaults->count() === 1
            && $defaults->first()->delivers
            && $defaults->first()->rates->isNotEmpty();
    }

    /** @return Collection<int, ShippingZone> */
    private static function activeZones(): Collection
    {
        return ShippingZone::query()->active()->with('rates')->orderBy('sort_order')->orderBy('id')->get();
    }

    /** The customer-facing words for a quote on the basket and the order. */
    public function label(): ?string
    {
        if (! $this->ships) {
            return null;
        }

        if (! $this->known) {
            return 'Worked out at checkout';
        }

        if (! $this->deliverable) {
            return $this->stateCode !== null
                ? 'We do not deliver to '.IndianStates::name($this->stateCode).' yet'
                : 'We do not deliver there yet';
        }

        return $this->chargePaise === 0 ? 'Free' : Money::format($this->chargePaise);
    }

    /** The charge to add to a total — zero while it is not known. */
    public function addPaise(): int
    {
        return $this->ships && $this->known && $this->deliverable ? $this->chargePaise : 0;
    }
}
