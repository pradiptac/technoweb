<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Setting;
use App\Support\OAuth\CallbackPath;
use App\Support\OAuth\OAuthConnection;
use App\Support\Store\Zoho\ZohoBooks;
use App\Support\Store\Zoho\ZohoInvoices;
use App\Support\Store\Zoho\ZohoPayments;
use App\Support\Store\Zoho\ZohoRefused;
use App\Support\Store\Zoho\ZohoSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Connecting Zoho Books (0.134.0, docs/store.md "Zoho Books invoices"): the
 * consent round trip on its own OAuth slot, what the settings screen needs
 * to offer its pickers, and a test.
 *
 * `role:admin`, the rule every other connection follows — this is where a
 * credential for the company's accounts is kept. The organisation and the
 * taxes are read from Zoho when the screen is opened rather than stored as
 * lists: they are Zoho's, and a copy here would be stale the day an
 * accountant adds a tax.
 */
class ZohoBooksController extends Controller
{
    public const CALLBACK = '/admin/store/settings/zoho/callback';

    public function status(Request $request): JsonResponse
    {
        $connected = ZohoSettings::connected();
        $organizations = [];
        $taxes = [];
        $accounts = [];
        $readError = null;

        if ($connected) {
            $zoho = new ZohoBooks;

            try {
                $organizations = $zoho->organizations();
                $taxes = ZohoSettings::organizationId() !== '' ? $zoho->taxes() : [];
            } catch (ZohoRefused $e) {
                // The screen still draws: it says what Zoho said, and the
                // saved choices stay selected rather than vanishing.
                $readError = $e->getMessage();
            }

            // Its own try: a consent from before 0.136.0 cannot read the
            // accounts, and that must not take the taxes off the screen.
            if ($readError === null && ZohoSettings::organizationId() !== '' && ZohoSettings::scopeCurrent()) {
                try {
                    $accounts = $zoho->accounts();
                } catch (ZohoRefused $e) {
                    $readError = $e->getMessage();
                }
            }
        }

        $offered = array_map(fn (PaymentMethod $m) => $m->value, PaymentMethod::offered());

        return response()->json(['data' => [
            'enabled' => ZohoSettings::enabled(),
            'ready' => ZohoSettings::ready(),
            'missing' => ZohoSettings::missing(),
            'is_connected' => $connected,
            'account' => Setting::get('zoho_books_oauth_account'),
            'connected_at' => Setting::get('zoho_books_oauth_connected_at'),
            'client_configured' => filled(Setting::get('zoho_books_oauth_client_id')) && filled(Setting::get('zoho_books_oauth_client_secret')),
            'data_centre' => ZohoSettings::dataCentre(),
            'organization_id' => ZohoSettings::organizationId() ?: null,
            'organizations' => $organizations,
            'taxes' => $taxes,
            'error' => Setting::get('zoho_books_error') ?? $readError,
            'callback_path' => self::CALLBACK,
            'waiting' => Order::query()->whereIn('zoho_status', ['pending', 'creating'])->count(),
            'failed' => Order::query()->where('zoho_status', 'failed')->count(),
            // Payments and credit notes (0.136.0).
            'payments' => [
                'enabled' => ZohoSettings::sendsPayments(),
                'reconnect_needed' => $connected && ! ZohoSettings::scopeCurrent(),
                'accounts' => $accounts,
                'methods' => array_map(fn (string $method) => [
                    'value' => $method,
                    // Short, lower-case, and the words the "still to do" sentences use.
                    'label' => ZohoSettings::ACCOUNT_METHODS[$method],
                    'setting' => 'zoho_books_account_'.$method,
                    'account_id' => ZohoSettings::accountFor($method) ?: null,
                    'offered' => in_array($method, $offered, true),
                ], array_keys(ZohoSettings::ACCOUNT_METHODS)),
                'missing' => ZohoSettings::paymentsMissing($offered),
                'waiting' => Payment::query()->whereIn('zoho_status', ['pending', 'sending'])->count(),
                'failed' => Payment::query()->where('zoho_status', 'failed')->count(),
            ],
        ]]);
    }

    public function authorize(Request $request): JsonResponse
    {
        $data = $request->validate(['redirect_uri' => ['required', 'url', 'max:300']]);
        $redirect = CallbackPath::assert($data['redirect_uri'], self::CALLBACK);

        try {
            $result = OAuthConnection::zohoBooks()->authorizeUrl($redirect);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['url' => $result['url']]]);
    }

    public function callback(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:4000'],
            'state' => ['required', 'string', 'max:200'],
        ]);

        try {
            $oauth = OAuthConnection::zohoBooks();
            $stored = $oauth->consumeState($data['state']);
            $oauth->exchange($data['code'], $stored['redirect']);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        // Zoho's token names nobody, so the connection is labelled with what
        // it can reach. One organisation is the usual case, and choosing it
        // for the administrator saves a step they could only get one way.
        $account = 'Zoho Books';

        try {
            $organizations = (new ZohoBooks)->organizations();

            if (count($organizations) === 1) {
                Setting::put('zoho_books_organization_id', $organizations[0]['id']);
            }
            if ($organizations !== []) {
                $account = implode(', ', array_column($organizations, 'name'));
            }
        } catch (ZohoRefused) {
            // Connected, but the organisations could not be read just now;
            // the screen offers them once they can.
        }

        Setting::put('zoho_books_oauth_account', mb_substr($account, 0, 190));
        // Which consent this connection holds: payments and credit notes
        // need the one asked for since 0.136.0.
        Setting::put('zoho_books_scope_version', (string) ZohoSettings::SCOPE_VERSION);

        return response()->json(['data' => ['account' => $account]]);
    }

    public function disconnect(Request $request): JsonResponse
    {
        OAuthConnection::zohoBooks()->disconnect();

        return response()->json(['data' => ['is_connected' => false]]);
    }

    /** Read the chosen organisation's taxes with what is saved: proof the connection and the choices work. */
    public function test(Request $request): JsonResponse
    {
        if (! ZohoSettings::connected()) {
            return response()->json(['message' => 'Connect a Zoho account first.'], 422);
        }

        if (ZohoSettings::organizationId() === '') {
            return response()->json(['message' => 'Choose the Zoho Books organisation and save, then test.'], 422);
        }

        try {
            $taxes = (new ZohoBooks)->taxes();
        } catch (ZohoRefused $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $ids = array_column($taxes, 'id');
        $stale = array_values(array_filter([
            filled(Setting::get('zoho_books_tax_intra')) && ! in_array(Setting::get('zoho_books_tax_intra'), $ids, true) ? 'the tax for sales inside your state' : null,
            filled(Setting::get('zoho_books_tax_inter')) && ! in_array(Setting::get('zoho_books_tax_inter'), $ids, true) ? 'the tax for sales to other states' : null,
        ]));

        if ($stale !== []) {
            return response()->json(['message' => 'Zoho Books no longer has '.implode(' or ', $stale).'. Choose again and save.'], 422);
        }

        Setting::put('zoho_books_error', null);

        return response()->json(['data' => [
            'taxes' => count($taxes),
            'ready' => ZohoSettings::ready(),
            'missing' => ZohoSettings::missing(),
        ]]);
    }

    /**
     * "Create the Zoho invoice now" on an order — `role:store_manager`, on
     * the order's own routes. Runs in the request so whoever pressed it sees
     * the invoice number, or Zoho's reason, at once.
     */
    public function createForOrder(Request $request, Order $order): JsonResponse
    {
        if (! ZohoSettings::ready()) {
            return response()->json([
                'message' => ZohoSettings::enabled()
                    ? 'Zoho Books is not fully set up yet. An administrator can finish it under Store → Settings.'
                    : 'Zoho Books invoices are switched off.',
            ], 422);
        }

        if ($order->zoho_status === 'created') {
            return response()->json(['message' => "This order already has Zoho invoice {$order->invoice_number}."], 422);
        }

        $order = ZohoInvoices::run($order, $request->user());

        if ($order->zoho_status === 'failed') {
            return response()->json(['message' => (string) $order->zoho_error, 'errors' => ['zoho' => [(string) $order->zoho_error]]], 422);
        }

        return response()->json(['data' => [
            'status' => $order->zoho_status,
            'invoice_number' => $order->invoice_number,
        ]]);
    }

    /**
     * "Send to Zoho now" on one payment or refund (0.136.0). Runs in the
     * request, so whoever pressed it sees the result or Zoho's reason. A
     * payment addressed through another order is a 404.
     */
    public function sendPayment(Request $request, Order $order, int $payment): JsonResponse
    {
        $row = $order->payments()->whereKey($payment)->firstOrFail();

        if (! ZohoPayments::sendable($row)) {
            return response()->json(['message' => 'Only a payment that arrived, or a refund, is sent to Zoho Books.'], 422);
        }

        if ($row->zoho_status === 'sent') {
            return response()->json(['message' => 'Zoho Books already has this one.'], 422);
        }

        if ($refusal = ZohoPayments::refusal($order)) {
            return response()->json(['message' => $refusal], 422);
        }

        $row = ZohoPayments::run($row, $request->user());

        if ($row->zoho_status === 'failed') {
            return response()->json(['message' => (string) $row->zoho_error, 'errors' => ['zoho' => [(string) $row->zoho_error]]], 422);
        }

        return response()->json(['data' => [
            'status' => $row->zoho_status,
            'number' => $row->zoho_number,
        ]]);
    }
}
