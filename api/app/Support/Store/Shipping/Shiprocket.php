<?php

namespace App\Support\Store\Shipping;

use App\Models\Setting;
use App\Support\Money;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * The Shiprocket API, as far as this application uses it (0.143.0,
 * docs/store.md "Shiprocket"): sign in, list the pickup locations, create an
 * order, assign the courier and its AWB, request pickup, make the label,
 * track a shipment and cancel one — and, since 0.159.0, quote couriers,
 * make manifests and create the courier pickup of a return.
 *
 * Laravel's HTTP client and nothing else — no SDK, the rule every other
 * integration here follows — so every call is one line `Http::fake()` can
 * answer. **There is no Shiprocket sandbox: every call acts on the real
 * account**, which is why nothing in the tests or the probes reaches the
 * network, and why "Test the connection" does only the two read-only calls.
 *
 * What Shiprocket does that this class is written around:
 *
 *   - Many failures are **HTTP 200 with an error body** — `status: 404`,
 *     `track_status: 0`, an empty label URL, `label_created: 0`. A reply
 *     without the field a call needs is a refusal, reported in Shiprocket's
 *     words (`checked()` and each method's own field test).
 *   - The token is a JWT good for 10 days; it is cached for 9. A 401
 *     forgets it and signs in once more; a second 401 is the account's
 *     answer.
 *   - Weights go in kilograms and sizes in centimetres, and money in
 *     rupees: converted from grams and paise by the caller, on integers.
 *   - Ids: create returns Shiprocket's own `order_id` and a `shipment_id`;
 *     AWB, pickup and label want the shipment id (as an array), cancelling
 *     an order wants Shiprocket's order id.
 *
 * A refusal writes `shiprocket_error`, and a success clears it, the
 * `mail_error` pattern: the one place a failed call is visible when nobody is
 * looking at the order it concerned.
 */
final class Shiprocket
{
    public const BASE = 'https://apiv2.shiprocket.in/v1/external';

    /** The token is good for ten days; one day's margin. */
    private const TOKEN_DAYS = 9;

    /** @return string a bearer token, cached */
    public function token(bool $fresh = false): string
    {
        $key = $this->tokenKey();

        if ($fresh) {
            Cache::forget($key);
        }

        return Cache::remember($key, now()->addDays(self::TOKEN_DAYS), function (): string {
            return $this->login();
        });
    }

    /** Throws away the cached token — the sign-in changed, or Shiprocket refused it. */
    public function forgetToken(): void
    {
        Cache::forget($this->tokenKey());
    }

    /**
     * Prove the sign-in and read the pickup locations: the only two calls the
     * "Test the connection" button makes, both read-only.
     *
     * @return list<array{name: string, address: string, city: string, state: string, pin: string, verified: bool, contact: string, phone: string, email: string}>
     */
    public function pickupLocations(): array
    {
        return $this->guard(function (): array {
            $body = $this->send('get', '/settings/company/pickup')->json();

            // unverified against a real account: a missing list is read as a refusal, not as "no locations".
            $rows = $body['data']['shipping_address'] ?? null;

            if (! is_array($rows)) {
                throw new ShiprocketRefused($this->words($body, 'Shiprocket did not return its pickup locations.'));
            }

            return array_values(array_map(fn (array $a) => [
                'name' => (string) $a['pickup_location'],
                'address' => trim(($a['address'] ?? '').' '.($a['address_2'] ?? '')),
                'city' => (string) ($a['city'] ?? ''),
                'state' => (string) ($a['state'] ?? ''),
                'pin' => (string) ($a['pin_code'] ?? ''),
                // The seller's side of a return pickup (0.159.0): who the courier hands the parcel back to.
                'contact' => (string) ($a['name'] ?? ''),
                'phone' => (string) ($a['phone'] ?? ''),
                'email' => (string) ($a['email'] ?? ''),
                // unverified against a real account: whether an unverified location can be booked from.
                'verified' => (int) ($a['phone_verified'] ?? 1) === 1,
            ], array_filter($rows, fn ($a) => is_array($a) && filled($a['pickup_location'] ?? null))));
        });
    }

    /**
     * One pickup location by its nickname — the PIN a quote starts from and
     * the seller a return goes back to. The list is cached for five minutes:
     * it changes when somebody edits the account, not between two clicks.
     *
     * @return array{name: string, address: string, city: string, state: string, pin: string, verified: bool, contact: string, phone: string, email: string}
     */
    public function pickupLocation(string $name): array
    {
        $key = 'shiprocket.locations.'.sha1(strtolower(CourierSettings::email()));
        $all = Cache::remember($key, now()->addMinutes(5), fn () => $this->pickupLocations());

        foreach ($all as $location) {
            if ($location['name'] === $name) {
                return $location;
            }
        }

        throw new ShiprocketRefused("Shiprocket has no pickup location called \"{$name}\".");
    }

    /**
     * Which couriers can take a parcel between two PINs, and at what price
     * (0.159.0): a read-only quote, nothing is booked. Money arrives in
     * rupees and leaves as paise through a two-place string.
     *
     * @return list<array{courier_id: int, name: string, rate_paise: int, cod_charges_paise: int, etd: string|null, days: int|null, rating: float|null, recommended: bool}>
     */
    public function serviceability(string $pickupPin, string $deliveryPin, int $grams, bool $cod, ?int $declaredRupees = null, bool $isReturn = false): array
    {
        return $this->guard(function () use ($pickupPin, $deliveryPin, $grams, $cod, $declaredRupees, $isReturn): array {
            $query = [
                'pickup_postcode' => preg_replace('/\D/', '', $pickupPin),
                'delivery_postcode' => preg_replace('/\D/', '', $deliveryPin),
                'weight' => Shipments::kg($grams),
                'cod' => $cod ? 1 : 0,
            ];

            if ($declaredRupees !== null) {
                $query['declared_value'] = max(1, $declaredRupees);
            }

            if ($isReturn) {
                $query['is_return'] = 1;
            }

            $body = $this->send('get', '/courier/serviceability/', query: $query)->json();
            $rows = $body['data']['available_courier_companies'] ?? null;

            // A 200 with `status: 404` is caught in send(); an empty or missing list is "nobody can take it".
            if (! is_array($rows) || $rows === []) {
                throw new ShiprocketRefused($this->words($body, 'No courier can take a parcel between those two PINs.'));
            }

            $recommended = (int) ($body['data']['recommended_courier_company_id'] ?? 0);

            return array_values(array_map(fn (array $c) => [
                'courier_id' => (int) $c['courier_company_id'],
                'name' => (string) ($c['courier_name'] ?? ''),
                'rate_paise' => self::paise($c['rate'] ?? 0),
                'cod_charges_paise' => self::paise($c['cod_charges'] ?? 0),
                'etd' => filled($c['etd'] ?? null) ? (string) $c['etd'] : null,
                'days' => is_numeric($c['estimated_delivery_days'] ?? null) ? (int) $c['estimated_delivery_days'] : null,
                'rating' => is_numeric($c['rating'] ?? null) ? round((float) $c['rating'], 1) : null,
                'recommended' => $recommended > 0 && (int) $c['courier_company_id'] === $recommended,
            ], array_filter($rows, fn ($c) => is_array($c) && isset($c['courier_company_id']))));
        });
    }

    /** Rupees as Shiprocket writes them (54, 54.5, "54.50") to paise, through a two-place string. */
    private static function paise(mixed $rupees): int
    {
        return Money::fromRupeeString(is_numeric($rupees) ? sprintf('%.2F', (float) $rupees) : null) ?? 0;
    }

    /**
     * Create the order at Shiprocket. Called once per claim — a duplicate
     * `order_id` has no documented answer, so this is never retried here.
     *
     * @param  array<string, mixed>  $payload
     * @return array{order_id: string, shipment_id: string}
     */
    public function createOrder(array $payload): array
    {
        return $this->guard(function () use ($payload): array {
            $body = $this->send('post', '/orders/create/adhoc', json: $payload)->json();

            $orderId = $body['order_id'] ?? null;
            $shipmentId = $body['shipment_id'] ?? null;

            if (blank($orderId) || blank($shipmentId)) {
                throw new ShiprocketRefused($this->words($body, 'Shiprocket did not return the order it was asked to create.'));
            }

            return ['order_id' => (string) $orderId, 'shipment_id' => (string) $shipmentId];
        });
    }

    /**
     * Create the return order (0.159.0): `pickup_*` is the customer the
     * courier collects from, `shipping_*` the seller it goes back to. Once
     * per claim, like `createOrder()`.
     *
     * @param  array<string, mixed>  $payload
     * @return array{order_id: string, shipment_id: string}
     */
    public function createReturnOrder(array $payload): array
    {
        return $this->guard(function () use ($payload): array {
            $body = $this->send('post', '/orders/create/return', json: $payload)->json();

            if (blank($body['order_id'] ?? null) || blank($body['shipment_id'] ?? null)) {
                throw new ShiprocketRefused($this->words($body, 'Shiprocket did not return the return order it was asked to create.'));
            }

            return ['order_id' => (string) $body['order_id'], 'shipment_id' => (string) $body['shipment_id']];
        });
    }

    /**
     * Generate the manifest for shipments that have an AWB and a pickup. A
     * 400 "already generated" lists the ones that are — the state wanted, so
     * success — and any not on the list are generated by a second call. The
     * PDF address comes from `printManifest()`, the same for both outcomes.
     *
     * @param  list<int|string>  $shipmentIds
     */
    public function generateManifest(array $shipmentIds): void
    {
        $this->guard(function () use ($shipmentIds): void {
            $ids = array_map('intval', $shipmentIds);

            try {
                $body = $this->send('post', '/manifests/generate', json: ['shipment_id' => $ids])->json();
            } catch (ShiprocketRefused $e) {
                $done = array_map('intval', (array) ($e->body['already_manifested_shipment_ids'] ?? []));

                if ($e->status !== 400 || $done === []) {
                    throw $e;
                }

                $left = array_values(array_diff($ids, $done));

                if ($left !== []) {
                    $this->generateManifest($left);
                }

                return;
            }

            // unverified against a real account: a 200 with an empty URL is the documented "missing or invalid data".
            if (blank($body['manifest_url'] ?? null)) {
                throw new ShiprocketRefused($this->words($body, 'Shiprocket did not make the manifest.'));
            }
        });
    }

    /**
     * The manifest PDF for these Shiprocket orders (their order ids, not shipment ids).
     *
     * @param  list<int|string>  $srOrderIds
     */
    public function printManifest(array $srOrderIds): string
    {
        return $this->guard(function () use ($srOrderIds): string {
            $body = $this->send('post', '/manifests/print', json: ['order_ids' => array_map('intval', $srOrderIds)])->json();
            $url = $body['manifest_url'] ?? null;

            if (blank($url)) {
                throw new ShiprocketRefused($this->words($body, 'Shiprocket did not return the manifest.'));
            }

            return (string) $url;
        });
    }

    /**
     * Assign a courier and its AWB. With no `$courierId` Shiprocket picks
     * the account's default courier.
     *
     * @return array{awb: string, courier: string}
     */
    public function assignAwb(string $shipmentId, ?int $courierId = null, bool $isReturn = false): array
    {
        return $this->guard(function () use ($shipmentId, $courierId, $isReturn): array {
            $json = ['shipment_id' => (int) $shipmentId]
                + ($courierId !== null ? ['courier_id' => $courierId] : [])
                // Required by Shiprocket for the return leg.
                + ($isReturn ? ['is_return' => 1] : []);
            $body = $this->send('post', '/courier/assign/awb', json: $json)->json();

            $data = $body['response']['data'] ?? [];
            $awb = $data['awb_code'] ?? null;

            if ((int) ($body['awb_assign_status'] ?? 0) !== 1 || blank($awb)) {
                // unverified against a real account: the shape of a failed assignment (a low wallet, an unserviceable pincode).
                throw new ShiprocketRefused($this->words($body, 'Shiprocket did not assign a courier.', [
                    'response.data.awb_assignment_error', 'response.message', 'response.data.message',
                ]));
            }

            return ['awb' => (string) $awb, 'courier' => (string) ($data['courier_name'] ?? '')];
        });
    }

    /** Ask for the courier to collect the parcel. Returns Shiprocket's confirmation. */
    public function requestPickup(string $shipmentId): string
    {
        return $this->guard(function () use ($shipmentId): string {
            $body = $this->send('post', '/courier/generate/pickup', json: ['shipment_id' => [(int) $shipmentId]])->json();

            if ((int) ($body['pickup_status'] ?? 0) !== 1) {
                throw new ShiprocketRefused($this->words($body, 'Shiprocket did not book the pickup.', ['response.data', 'response.message']));
            }

            $said = $body['response']['data'] ?? null;

            return is_string($said) && $said !== '' ? $said : 'Pickup requested.';
        });
    }

    /** The shipping label's PDF address. */
    public function label(string $shipmentId): string
    {
        return $this->guard(function () use ($shipmentId): string {
            $body = $this->send('post', '/courier/generate/label', json: ['shipment_id' => [(int) $shipmentId]])->json();

            $url = $body['label_url'] ?? null;

            if ((int) ($body['label_created'] ?? 0) !== 1 || blank($url)) {
                throw new ShiprocketRefused($this->words($body, 'Shiprocket did not make the label.', ['response']));
            }

            return (string) $url;
        });
    }

    /**
     * Where a shipment is, by its AWB. Null when Shiprocket has no scans yet
     * (`track_status: 0`, a 200 — not a failure).
     *
     * @return array{status_id: int, label: string|null, delivered_at: string|null}|null
     */
    public function track(string $awb): ?array
    {
        return $this->guard(function () use ($awb): ?array {
            $body = $this->send('get', '/courier/track/awb/'.rawurlencode($awb))->json();
            $data = $body['tracking_data'] ?? null;

            if (! is_array($data)) {
                throw new ShiprocketRefused($this->words($body, 'Shiprocket did not return any tracking.'));
            }

            if ((int) ($data['track_status'] ?? 0) !== 1 || ! isset($data['shipment_status'])) {
                return null;
            }

            $track = $data['shipment_track'][0] ?? [];

            return [
                'status_id' => (int) $data['shipment_status'],
                'label' => isset($track['current_status']) ? (string) $track['current_status'] : null,
                'delivered_at' => filled($track['delivered_date'] ?? null) ? (string) $track['delivered_date'] : null,
            ];
        });
    }

    /**
     * Cancel a booked shipment before it is out for pickup, then the order.
     * Shiprocket cancels the AWB asynchronously; the answer to this call is
     * "accepted", and the webhook or the tracker confirms it.
     */
    public function cancel(string $orderId, ?string $awb): void
    {
        $this->guard(function () use ($orderId, $awb): void {
            if (filled($awb)) {
                $this->send('post', '/orders/cancel/shipment/awbs', json: ['awbs' => [$awb]]);
            }

            $this->send('post', '/orders/cancel', json: ['ids' => [(int) $orderId]]);
        });
    }

    /* -------------------------------------------------------------- plumbing */

    private function tokenKey(): string
    {
        return 'shiprocket.token.'.sha1(strtolower(CourierSettings::email()));
    }

    private function login(): string
    {
        try {
            $response = Http::acceptJson()->connectTimeout(5)->timeout(25)->post(self::BASE.'/auth/login', [
                'email' => CourierSettings::email(),
                'password' => CourierSettings::password(),
            ]);
        } catch (ConnectionException) {
            throw new ShiprocketRefused('Shiprocket could not be reached.', 0, true);
        }

        $token = $response->json('token');

        if ($response->failed() || blank($token)) {
            throw new ShiprocketRefused(
                $this->words($response->json() ?? [], 'Shiprocket refused the sign-in.'),
                $response->failed() ? $response->status() : 401,
            );
        }

        return (string) $token;
    }

    /**
     * One call, with the cached token; a 401 signs in once more and tries
     * again. Failures carry Shiprocket's own message.
     *
     * @param  array<string, mixed>|null  $json
     * @param  array<string, mixed>  $query
     */
    private function send(string $method, string $path, array $query = [], ?array $json = null): Response
    {
        $call = function (string $token) use ($method, $path, $query, $json): Response {
            $request = Http::acceptJson()->withToken($token)->connectTimeout(5)->timeout(30);
            $url = self::BASE.$path.($query === [] ? '' : '?'.http_build_query($query));

            return $method === 'post' ? $request->post($url, $json ?? []) : $request->get($url);
        };

        try {
            $response = $call($this->token());

            // unverified against a real account: that an expired token answers 401 on this host.
            if ($response->status() === 401) {
                $response = $call($this->token(fresh: true));
            }
        } catch (ConnectionException) {
            throw new ShiprocketRefused('Shiprocket could not be reached.', 0, true);
        }

        if ($response->failed()) {
            throw new ShiprocketRefused(
                $this->words($response->json() ?? [], "Shiprocket answered HTTP {$response->status()}."),
                $response->status(),
                // A server fault says nothing about whether the request was acted on.
                $response->serverError(),
                is_array($response->json()) ? $response->json() : [],
            );
        }

        // A 200 that is really an error: `{"status": 404, "message": "…"}`.
        $json = $response->json();

        if (is_array($json) && isset($json['status']) && is_int($json['status']) && $json['status'] >= 400) {
            throw new ShiprocketRefused($this->words($json, 'Shiprocket refused that.'), $json['status']);
        }

        return $response;
    }

    /**
     * Run a call, recording its outcome where the settings screen can see it.
     *
     * @template T
     *
     * @param  \Closure(): T  $call
     * @return T
     */
    private function guard(\Closure $call): mixed
    {
        try {
            $result = $call();
        } catch (ShiprocketRefused $e) {
            if ($e->isAuthorisation()) {
                $this->forgetToken();
            }

            $this->record($e->getMessage());

            throw $e;
        }

        $this->record(null);

        return $result;
    }

    /** Writes `shiprocket_error`, only when it changes — a settings read per call is enough. */
    private function record(?string $message): void
    {
        $message = $message === null ? null : mb_substr($message, 0, 500);

        if ((Setting::get('shiprocket_error') ?: null) !== $message) {
            Setting::put('shiprocket_error', $message);
        }
    }

    /**
     * Shiprocket's reason in its own words: `message`, then the first
     * validation error, then any extra paths the caller knows of.
     *
     * @param  list<string>  $extra  dotted paths tried after `message`
     */
    private function words(mixed $body, string $fallback, array $extra = []): string
    {
        if (! is_array($body)) {
            return $fallback;
        }

        $parts = [];

        foreach (array_merge(['message'], $extra) as $path) {
            $value = data_get($body, $path);

            if (is_string($value) && trim($value) !== '') {
                $parts[] = trim($value);
                break;
            }
        }

        foreach ((array) ($body['errors'] ?? []) as $field => $messages) {
            $first = is_array($messages) ? ($messages[0] ?? null) : $messages;

            if (is_string($first) && $first !== '') {
                $parts[] = $first;
                break;
            }
        }

        return $parts === [] ? $fallback : implode(' ', array_unique($parts));
    }
}
