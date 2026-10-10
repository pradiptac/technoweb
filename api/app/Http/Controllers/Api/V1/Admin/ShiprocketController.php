<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Setting;
use App\Support\Store\Shipping\CourierSettings;
use App\Support\Store\Shipping\Shiprocket;
use App\Support\Store\Shipping\ShiprocketRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Shiprocket connection screen's two calls (0.143.0, docs/store.md
 * "Shiprocket"): where things stand, and a test.
 *
 * `role:admin`, like every other connection — this is where a password for
 * the company's courier account is kept. The credentials themselves are
 * ordinary `is_secret` settings written through `PATCH /admin/settings`;
 * nothing here accepts or returns one.
 *
 * **Reading the pickup locations is a call to Shiprocket**, so `status`
 * makes it only while the provider is on and a sign-in is saved — an
 * install on `manual` is asked nothing, however often the screen is opened.
 * The test button is the deliberate exception: it signs in afresh and lists
 * the pickup locations, the only two read-only calls there are, and books
 * nothing.
 */
class ShiprocketController extends Controller
{
    /** Shiprocket refuses a webhook address containing any of these, so the console says when ours does. */
    private const FORBIDDEN_IN_WEBHOOK = ['shiprocket', 'kartrocket', 'sr', 'kr'];

    public function status(Request $request): JsonResponse
    {
        $locations = [];
        $readError = null;

        if (CourierSettings::provider() === CourierSettings::SHIPROCKET && CourierSettings::email() !== '' && CourierSettings::password() !== '') {
            try {
                $locations = (new Shiprocket)->pickupLocations();
            } catch (ShiprocketRefused $e) {
                // The screen still draws, and says what Shiprocket said.
                $readError = $e->getMessage();
            }
        }

        $webhook = route('api.v1.store.shipping.webhook');

        return response()->json(['data' => [
            'provider' => CourierSettings::provider(),
            'active' => CourierSettings::active(),
            'missing' => CourierSettings::provider() === CourierSettings::SHIPROCKET ? CourierSettings::missing() : [],
            'credentials_saved' => CourierSettings::email() !== '' && CourierSettings::password() !== '',
            'email' => CourierSettings::email() ?: null,
            'pickup_location' => CourierSettings::pickupLocation() ?: null,
            'locations' => $locations,
            'parcel' => CourierSettings::parcel(),
            'webhook_url' => $webhook,
            'webhook_url_ok' => $this->webhookUrlOk($webhook),
            'webhook_token_set' => CourierSettings::webhookToken() !== '',
            'error' => Setting::get('shiprocket_error') ?? $readError,
            'booked' => Order::query()->where('shipment_booking', 'created')->count(),
            'in_trouble' => Order::query()->shipmentTrouble()->count(),
        ]]);
    }

    /** Sign in afresh and list the pickup locations. Reads only. */
    public function test(Request $request): JsonResponse
    {
        if (CourierSettings::email() === '' || CourierSettings::password() === '') {
            return response()->json(['message' => 'Save the API user\'s email and password first.'], 422);
        }

        $client = new Shiprocket;
        $client->forgetToken();

        try {
            $locations = $client->pickupLocations();
        } catch (ShiprocketRefused $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $chosen = CourierSettings::pickupLocation();
        $known = collect($locations)->contains(fn (array $l) => $l['name'] === $chosen);

        return response()->json(['data' => [
            'locations' => $locations,
            'pickup_location_found' => $chosen === '' || $known,
            'message' => $locations === []
                ? 'Signed in, but the account has no pickup locations. Add one in Shiprocket first.'
                : 'Signed in. '.count($locations).' pickup '.(count($locations) === 1 ? 'location' : 'locations').' found.'
                    .($chosen !== '' && ! $known ? " The saved location \"{$chosen}\" is not among them." : ''),
        ]]);
    }

    private function webhookUrlOk(string $url): bool
    {
        $lower = strtolower($url);

        foreach (self::FORBIDDEN_IN_WEBHOOK as $word) {
            if (str_contains($lower, $word)) {
                return false;
            }
        }

        return true;
    }
}
