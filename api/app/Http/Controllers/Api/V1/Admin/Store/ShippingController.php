<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Models\ShippingZone;
use App\Models\StoreProduct;
use App\Support\IndianStates;
use App\Support\Store\Fulfilment;
use App\Support\Store\ShippingQuote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The shipping screen (0.142.0, docs/store.md "Delivery charges and shipping
 * zones"): how delivery is charged, the zones and their weight slabs.
 *
 * `role:store_manager`, like the rest of the shop. The mode and the flat
 * charge are settings, but they are written here rather than through
 * `PATCH /admin/settings` (an administrator's door): changing what customers
 * are charged is the store manager's decision, and "zones" must be refused
 * until there is something to quote from, which a generic settings write
 * cannot know.
 *
 * Every rule about a zone is checked against what the zone *will be* after the
 * write, not against the payload — a PATCH naming one field is judged with the
 * stored rest. And after any write, if zones mode is on, the whole arrangement
 * is checked again inside the transaction: deleting, deactivating or emptying
 * the default zone while customers are being quoted from it rolls back.
 */
class ShippingController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->payload()]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mode' => ['sometimes', 'string', 'in:'.Fulfilment::MODE_FLAT.','.Fulfilment::MODE_ZONES],
            'flat_paise' => ['sometimes', 'integer', 'min:0', 'max:100000000'],
            'default_weight_grams' => ['sometimes', 'integer', 'min:1', 'max:1000000'],
        ]);

        if (($data['mode'] ?? null) === Fulfilment::MODE_ZONES && ! ShippingQuote::zonesReady()) {
            throw ValidationException::withMessages([
                'mode' => 'Zones need a default zone — "Rest of India" — that delivers and has at least one weight slab. '.$this->missingSentence(),
            ]);
        }

        foreach ([
            'mode' => 'store_shipping_mode',
            'flat_paise' => 'store_shipping_paise',
            'default_weight_grams' => 'store_default_weight_grams',
        ] as $field => $key) {
            if (array_key_exists($field, $data)) {
                $this->write($key, (string) $data[$field]);
            }
        }

        Setting::flushCache();

        return response()->json(['message' => 'Delivery settings saved.', 'data' => $this->payload()]);
    }

    public function store(Request $request): JsonResponse
    {
        $zone = DB::transaction(function () use ($request) {
            $zone = new ShippingZone;
            $this->fill($zone, $this->validated($request, null));
            $this->afterWrite();

            return $zone;
        });

        return response()->json(['data' => $this->zone($zone->fresh('rates'))], 201);
    }

    public function update(Request $request, ShippingZone $zone): JsonResponse
    {
        DB::transaction(function () use ($request, $zone) {
            $this->fill($zone, $this->validated($request, $zone));
            $this->afterWrite();
        });

        return response()->json(['data' => $this->zone($zone->fresh('rates'))]);
    }

    public function destroy(ShippingZone $zone): JsonResponse
    {
        DB::transaction(function () use ($zone) {
            $zone->delete();
            $this->afterWrite();
        });

        return response()->json(['message' => 'Zone deleted.', 'data' => $this->payload()]);
    }

    /** Move a zone one place earlier or later in the list. */
    public function move(Request $request, ShippingZone $zone): JsonResponse
    {
        $direction = $request->validate(['direction' => ['required', 'in:up,down']])['direction'];

        DB::transaction(function () use ($zone, $direction) {
            $ids = ShippingZone::query()->orderBy('sort_order')->orderBy('id')->pluck('id')->all();
            $at = array_search($zone->id, $ids, true);
            $to = $direction === 'up' ? $at - 1 : $at + 1;

            if ($at === false || $to < 0 || $to >= count($ids)) {
                return;
            }

            [$ids[$at], $ids[$to]] = [$ids[$to], $ids[$at]];

            foreach ($ids as $position => $id) {
                ShippingZone::whereKey($id)->update(['sort_order' => $position]);
            }
        });

        return response()->json(['data' => $this->payload()]);
    }

    /* ------------------------------------------------------------ internals */

    /**
     * The zone as it will be, validated: rules judged on the merged result.
     *
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?ShippingZone $zone): array
    {
        $partial = $zone !== null;
        $some = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'name' => [$some, 'string', 'max:120'],
            'is_default' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'delivers' => ['sometimes', 'boolean'],
            'states' => ['sometimes', 'nullable', 'array', 'max:40'],
            'states.*' => ['string'],
            'free_above_paise' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100000000000'],
            'extra_per_kg_paise' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100000000'],
            'rates' => ['sometimes', 'nullable', 'array', 'max:20'],
            'rates.*.up_to_grams' => ['required', 'integer', 'min:1', 'max:10000000'],
            'rates.*.charge_paise' => ['required', 'integer', 'min:0', 'max:100000000'],
        ]);

        $errors = [];

        // What the zone will be: the stored row overlaid with the request.
        $isDefault = (bool) ($data['is_default'] ?? $zone->is_default ?? false);
        $delivers = $isDefault ? true : (bool) ($data['delivers'] ?? $zone->delivers ?? true);
        $active = $isDefault ? true : (bool) ($data['is_active'] ?? $zone->is_active ?? true);

        $states = $isDefault ? [] : $this->stateCodes(
            array_key_exists('states', $data) ? (array) ($data['states'] ?? []) : (array) ($zone->states ?? []),
            $errors,
        );

        $rates = array_key_exists('rates', $data)
            ? array_values((array) ($data['rates'] ?? []))
            : ($zone?->rates->map(fn ($r) => ['up_to_grams' => $r->up_to_grams, 'charge_paise' => $r->charge_paise])->all() ?? []);

        if (! $delivers) {
            $rates = [];
        }

        $free = array_key_exists('free_above_paise', $data) ? $data['free_above_paise'] : $zone?->free_above_paise;
        $extra = array_key_exists('extra_per_kg_paise', $data) ? $data['extra_per_kg_paise'] : $zone?->extra_per_kg_paise;

        if (! $delivers) {
            $free = null;
            $extra = null;
        }

        // Exactly one default zone.
        if ($isDefault) {
            $other = ShippingZone::query()->where('is_default', true)
                ->when($zone, fn ($q) => $q->whereKeyNot($zone->id))->first();

            if ($other !== null) {
                $errors['is_default'] = "“{$other->name}” is already the default zone. There can be only one.";
            }
        }

        if ($delivers) {
            if ($rates === []) {
                $errors['rates'] = 'A zone that delivers needs at least one weight slab.';
            }

            // A slab limit twice is two prices for one weight.
            $limits = array_column($rates, 'up_to_grams');

            foreach ($limits as $i => $limit) {
                if (array_search($limit, $limits, true) !== $i) {
                    $errors["rates.{$i}.up_to_grams"] = 'Two slabs end at the same weight.';
                }
            }

            if ($rates !== [] && $extra === null) {
                $errors['extra_per_kg_paise'] = 'Say what each extra started kilogram above the top slab costs — 0 for nothing extra.';
            }
        }

        if (! $isDefault && $states === [] && empty($errors['states'])) {
            $errors['states'] = 'Choose at least one state. A zone for every other state is the default zone.';
        }

        // A state belongs to at most one active zone.
        if ($active && ! $isDefault) {
            $others = ShippingZone::query()->active()->where('is_default', false)
                ->when($zone, fn ($q) => $q->whereKeyNot($zone->id))->get();

            foreach ($states as $code) {
                $holder = $others->first(fn (ShippingZone $o) => $o->coversState($code));

                if ($holder !== null) {
                    $errors['states'] = IndianStates::name($code)." is already in “{$holder->name}”. A state can be in only one active zone.";
                    break;
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $name = $data['name'] ?? $zone?->name;

        return [
            'name' => trim((string) $name),
            'states' => $states,
            'delivers' => $delivers,
            'free_above_paise' => $free,
            'extra_per_kg_paise' => $extra,
            'is_default' => $isDefault,
            'is_active' => $active,
            'rates' => $rates,
        ];
    }

    /**
     * Codes, from codes or names, known and without repeats.
     *
     * @param  array<int, mixed>  $values
     * @param  array<string, string>  $errors
     * @return list<string>
     */
    private function stateCodes(array $values, array &$errors): array
    {
        $codes = [];

        foreach ($values as $value) {
            $code = IndianStates::code((string) $value);

            if ($code === null) {
                $errors['states'] = '“'.$value.'” is not a state or union territory we know.';

                continue;
            }

            $codes[$code] = $code;
        }

        return array_values($codes);
    }

    /** @param  array<string, mixed>  $values */
    private function fill(ShippingZone $zone, array $values): void
    {
        $rates = $values['rates'];
        unset($values['rates']);

        if (! $zone->exists) {
            $values['sort_order'] = (int) ShippingZone::query()->max('sort_order') + 1;
        }

        $zone->fill($values)->save();

        // Slabs are replaced wholesale and nothing points at one.
        $zone->rates()->delete();

        foreach ($rates as $rate) {
            $zone->rates()->create([
                'up_to_grams' => (int) $rate['up_to_grams'],
                'charge_paise' => (int) $rate['charge_paise'],
            ]);
        }
    }

    /**
     * Zones mode is checked again after every write, inside the transaction.
     *
     * Deleting the default zone, switching it off, taking its slabs away or
     * marking it as not the default would leave customers being quoted from
     * nothing. It cannot be allowed to commit while zones mode is on.
     */
    private function afterWrite(): void
    {
        if (Setting::get('store_shipping_mode') === Fulfilment::MODE_ZONES && ! ShippingQuote::zonesReady()) {
            throw ValidationException::withMessages([
                'zone' => 'Customers are being charged by zone, which needs a default zone — "Rest of India" — that delivers and has a weight slab. Switch to a flat charge first, then change it.',
            ]);
        }
    }

    private function missingSentence(): string
    {
        $defaults = ShippingZone::query()->where('is_default', true)->with('rates')->get();

        return match (true) {
            $defaults->isEmpty() => 'There is no default zone yet.',
            $defaults->count() > 1 => 'There is more than one default zone.',
            ! $defaults->first()->is_active => 'The default zone is switched off.',
            $defaults->first()->rates->isEmpty() => 'The default zone has no weight slab.',
            default => '',
        };
    }

    private function write(string $key, string $value): void
    {
        if (! Setting::put($key, $value)) {
            Setting::create(['group' => 'store', 'key' => $key, 'value' => $value, 'type' => 'string']);
        }
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
        $zones = ShippingZone::query()->with('rates')->orderBy('sort_order')->orderBy('id')->get();

        return [
            'mode' => Fulfilment::shippingMode(),
            'stored_mode' => (string) Setting::get('store_shipping_mode', Fulfilment::MODE_FLAT),
            'flat_paise' => Fulfilment::shippingPaise(),
            'default_weight_grams' => Fulfilment::defaultWeightGrams(),
            'zones_ready' => ShippingQuote::zonesReady(),
            'zones_missing' => ShippingQuote::zonesReady() ? '' : $this->missingSentence(),
            'zones' => $zones->map(fn (ShippingZone $z) => $this->zone($z))->all(),
            'states' => IndianStates::options(),
            'products_without_weight' => StoreProduct::query()->withoutWeight()->count(),
        ];
    }

    /** @return array<string, mixed> */
    private function zone(ShippingZone $zone): array
    {
        return [
            'id' => $zone->id,
            'name' => $zone->name,
            'states' => $zone->stateCodes(),
            'delivers' => $zone->delivers,
            'free_above_paise' => $zone->free_above_paise,
            'extra_per_kg_paise' => $zone->extra_per_kg_paise,
            'is_default' => $zone->is_default,
            'is_active' => $zone->is_active,
            'sort_order' => $zone->sort_order,
            'rates' => $zone->rates->map(fn ($r) => [
                'up_to_grams' => $r->up_to_grams,
                'charge_paise' => $r->charge_paise,
            ])->values()->all(),
        ];
    }
}
