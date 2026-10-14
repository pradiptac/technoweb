<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Models\Order;
use App\Models\Setting;
use App\Support\IndianStates;
use App\Support\Money;
use App\Support\Store\Invoice\Invoices;
use App\Support\Store\Invoice\InvoiceSettings;
use App\Support\Store\Tax;
use App\Support\Store\Zoho\ZohoSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Tax and invoicing, from the Store section of the console (0.176.0).
 *
 * The narrow door `PromoController` opened and this follows exactly:
 * settings as a whole are `role:admin`, because the SMTP password and the
 * portal switch live in the same table, and that does not change. The GST
 * rate a shop charges and the name on its invoices are a store manager's
 * business, though, and routing those through an administrator is the queue
 * `customer_approval_required` was moved off.
 *
 * So this reads and writes **fifteen named keys and no others**, refusing
 * anything else by name rather than ignoring it — an ignored key is a save
 * that reports success and did nothing. `PATCH /admin/settings` still
 * accepts all fifteen for an administrator; nothing was taken away there.
 *
 * The checks are per key rather than by suffix, unlike the promo screen's:
 * there is no family here, each of these is its own rule, and a GSTIN
 * checked by a pattern that also has to fit a telephone number is a GSTIN
 * nobody checked.
 */
class InvoicingController extends Controller
{
    /** The whole of what this endpoint may touch. The allowlist is the door. */
    public const KEYS = [
        'store_gst_percent',
        'store_price_basis',
        'invoice_enabled',
        'invoice_legal_name',
        'invoice_gstin',
        'invoice_state',
        'invoice_address',
        'invoice_email',
        'invoice_phone',
        'invoice_prefix',
        'invoice_hsn_default',
        'invoice_terms',
        'invoice_declaration',
        'invoice_signatory',
        'invoice_signature_path',
    ];

    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->rows(), 'meta' => $this->meta()]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'in:'.implode(',', self::KEYS)],
            'settings.*.value' => ['nullable', 'string', 'max:4000'],
        ]);

        foreach ($validated['settings'] as $i => $row) {
            $this->check($row['key'], $row['value'] ?? null, "settings.{$i}.value");
        }

        DB::transaction(function () use ($validated) {
            $existing = Setting::query()->whereIn('key', self::KEYS)->get()->keyBy('key');

            foreach ($validated['settings'] as $row) {
                $setting = $existing->get($row['key']);

                // Seeded rows; absent only on an install that has not run
                // the seeder, where the general endpoint skips them too.
                if (! $setting) {
                    continue;
                }

                $setting->setPlainValue($this->clean($row['key'], $row['value'] ?? null));
                $setting->save();
            }
        });

        Setting::flushCache();

        return response()->json([
            'message' => 'Tax and invoicing saved.',
            'data' => $this->rows(),
            'meta' => $this->meta(),
        ]);
    }

    /**
     * What a value must be, one key at a time.
     *
     * Every refusal names the field a person would look at and says what is
     * wanted, because each of these is typed from a document somebody is
     * holding and "invalid" against a fifteen-character registration number
     * is a message nobody can act on.
     */
    private function check(string $key, ?string $value, string $field): void
    {
        $value = $value === null ? null : trim($value);

        $fail = static function (string $message) use ($field): never {
            throw ValidationException::withMessages([$field => $message]);
        };

        // Blank clears a row, and only the two that cannot be blank say so.
        if (blank($value)) {
            if (in_array($key, ['store_gst_percent', 'store_price_basis'], true)) {
                $fail('Choose one of the options.');
            }

            return;
        }

        match ($key) {
            'store_gst_percent' => in_array($value, Tax::RATES, true)
                ? null
                : $fail('Choose one of the GST rates.'),

            'store_price_basis' => in_array($value, Tax::BASES, true)
                ? null
                : $fail('Choose whether your prices include GST or have it added.'),

            'invoice_enabled' => in_array($value, ['0', '1'], true)
                ? null
                : $fail('The switch is 1 for on or 0 for off.'),

            'invoice_gstin' => preg_match(InvoiceSettings::GSTIN_PATTERN, strtoupper($value)) === 1
                ? null
                : $fail('That is not a GSTIN. It is fifteen characters — two state digits, a PAN, and three more.'),

            'invoice_state' => $this->stateCode($value) !== null
                ? null
                : $fail('Choose the state you are registered in.'),

            'invoice_email' => filter_var($value, FILTER_VALIDATE_EMAIL) !== false
                ? null
                : $fail('Enter a valid email address.'),

            // Letters, digits, a slash or a dash. It goes into every invoice
            // number, which has to stay a filename and a thing read aloud.
            'invoice_prefix' => preg_match('/^[A-Za-z0-9\/-]{1,10}$/', $value) === 1
                ? null
                : $fail('The prefix is up to ten letters, digits, slashes or dashes.'),

            // 4, 6 or 8 digits for HSN; 6 for SAC. Both are digits only.
            'invoice_hsn_default' => preg_match('/^[0-9]{4,8}$/', $value) === 1
                ? null
                : $fail('An HSN or SAC code is four to eight digits.'),

            // A path with no media row behind it is a picture that silently
            // never renders — the rule a campaign's attachment follows.
            'invoice_signature_path' => Media::withTrashed()->where('path', $value)->exists()
                ? null
                : $fail('Choose the signature image from the media library.'),

            default => null,
        };
    }

    /** Stored tidy: the two that are read back by machines are upper-cased. */
    private function clean(string $key, ?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        if (blank($value)) {
            return null;
        }

        return match ($key) {
            'invoice_gstin', 'invoice_prefix' => strtoupper($value),
            'invoice_state' => $this->stateCode($value),
            default => $value,
        };
    }

    /** A state given as a code or as a name, stored as the code. */
    private function stateCode(string $value): ?string
    {
        return IndianStates::isCode(strtoupper($value))
            ? strtoupper($value)
            : IndianStates::code($value);
    }

    /**
     * What the screen needs to draw itself and to say where it stands.
     *
     * `ready` and `missing` are `Invoices`' own answers rather than a second
     * reading of the same rows, so the screen, the button on an order and
     * the endpoint all say the same thing about whether an invoice can be
     * issued. `zoho_active` is why the switch may be on and nothing
     * generated: two systems numbering one series is two series.
     */
    private function meta(): array
    {
        return [
            'ready' => Invoices::ready(),
            'missing' => InvoiceSettings::missing(),
            'zoho_active' => ZohoSettings::ready(),
            'rates' => array_map(static fn (string $r) => [
                'value' => $r,
                'label' => $r.'%',
            ], Tax::RATES),
            'bases' => [
                ['value' => Tax::BASIS_INCLUSIVE, 'label' => 'Prices include GST', 'blurb' => 'The price on a product is what a customer pays, and the tax is taken out of it.'],
                ['value' => Tax::BASIS_EXCLUSIVE, 'label' => 'GST is added at the checkout', 'blurb' => 'The price on a product is before tax, and the tax is a row of its own in the basket.'],
            ],
            'states' => IndianStates::options(),
            'rate' => Money::ratePercent(Tax::rate()).'%',
            // How many products name a rate of their own, so the screen can
            // say that the store-wide one is not the whole answer.
            'products_with_own_rate' => DB::table('store_products')->whereNotNull('gst_percent')->count(),
            'products_without_hsn' => DB::table('store_products')
                ->whereNull('hsn')
                ->where('type', '!=', 'service')
                ->count(),
            'issued' => Order::query()->where('invoice_source', Invoices::SOURCE)->count(),
            'financial_year' => Invoices::financialYear(now()),
        ];
    }

    /** The rows in the settings screen's own shape, so one set of controls draws both. */
    private function rows(): array
    {
        return Setting::query()
            ->whereIn('key', self::KEYS)
            ->get()
            ->sortBy(fn (Setting $s) => array_search($s->key, self::KEYS, true))
            ->values()
            ->map(fn (Setting $s) => [
                'key' => $s->key,
                'value' => $s->value,
                'type' => $s->type,
                'is_secret' => false,
                'is_set' => filled($s->value),
                'url' => $s->key === 'invoice_signature_path' && filled($s->value)
                    ? asset('storage/'.$s->value)
                    : null,
                'options' => match ($s->key) {
                    'store_gst_percent' => array_map(static fn (string $r) => ['value' => $r, 'label' => $r.'%'], Tax::RATES),
                    'store_price_basis' => [
                        ['value' => Tax::BASIS_INCLUSIVE, 'label' => 'Prices include GST'],
                        ['value' => Tax::BASIS_EXCLUSIVE, 'label' => 'GST is added at the checkout'],
                    ],
                    'invoice_state' => IndianStates::options(),
                    default => null,
                },
            ])
            ->all();
    }
}
