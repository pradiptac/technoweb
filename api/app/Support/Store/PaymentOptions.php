<?php

namespace App\Support\Store;

use App\Enums\PaymentMethod;
use App\Models\Setting;
use Illuminate\Support\Facades\Storage;

/**
 * What the shop accepts, and what a customer has to be told to use it.
 *
 * One class because two screens ask nearly the same question and must not
 * answer it differently: the checkout asks *which* methods are offered, and the
 * order page asks *how* to pay by the one that was chosen. A second list built
 * for the second screen is a shop that offers a method its instructions page has
 * never heard of.
 *
 * **The instructions are only ever sent for the method the order actually
 * used.** Publishing the bank details to every visitor of the checkout would be
 * an invitation to pay for nothing, and the QR code is the same. So `forOrder()`
 * takes the order's own method, and the list the checkout gets carries labels
 * and blurbs and no account numbers at all.
 */
class PaymentOptions
{
    /**
     * The methods a customer may choose, for the checkout.
     *
     * Deliberately without the detail. A shop's account number is not a secret
     * in any strong sense — it is printed on invoices — but a checkout that
     * shows it to everybody who reaches the page is a shop that gets paid by
     * people who never ordered anything, and reconciling that is somebody's
     * afternoon.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function forCheckout(): array
    {
        return array_map(fn (PaymentMethod $m) => [
            'value' => $m->value,
            'label' => $m->label(),
            'blurb' => $m->blurb(),
            'settles_online' => $m->settlesOnline(),
            'permits_digital' => $m->permitsDigital(),
            // Sent so the checkout can grey the option out *with its reason*
            // rather than hiding it — a basket that cannot use cash on delivery
            // because of what is in it should say so.
            'max_paise' => $m === PaymentMethod::Cod ? self::codCeiling() : null,
        ], PaymentMethod::offered());
    }

    /**
     * How to pay for one order, or null when there is nothing to say.
     *
     * Null for a gateway order — it has its own button — and null once the money
     * has arrived, because instructions for a payment already made are how
     * somebody pays twice.
     *
     * @return array<string, mixed>|null
     */
    public static function forOrder(string $method, bool $alreadyPaid): ?array
    {
        $chosen = PaymentMethod::tryFrom($method);

        if ($chosen === null || $chosen->settlesOnline() || $alreadyPaid) {
            return null;
        }

        return match ($chosen) {
            PaymentMethod::Cod => [
                'method' => $chosen->value,
                'label' => $chosen->label(),
                'heading' => 'Pay when it arrives',
                'body' => 'Have the exact amount ready for the courier. Nothing has been charged.',
                'bank_details' => null,
                'upi_id' => null,
                'qr_url' => null,
                // Nothing to reconcile: the courier's receipt is the reference.
                'wants_reference' => false,
            ],
            PaymentMethod::BankTransfer => [
                'method' => $chosen->value,
                'label' => $chosen->label(),
                'heading' => 'Transfer the amount to this account',
                'body' => 'Quote the order number as the reference so we can match the payment. We start work once it arrives, usually the same working day.',
                'bank_details' => Setting::get('bank_account_details'),
                'upi_id' => null,
                'qr_url' => null,
                'wants_reference' => true,
            ],
            PaymentMethod::Upi => [
                'method' => $chosen->value,
                'label' => $chosen->label(),
                'heading' => 'Pay by UPI',
                'body' => 'Scan the code with any UPI app, or send to the ID below. Quote the order number if your app lets you add a note.',
                'bank_details' => null,
                'upi_id' => Setting::get('upi_id'),
                'qr_url' => self::qrUrl(),
                'wants_reference' => true,
            ],
            default => null,
        };
    }

    /** Zero means no ceiling, which is why this is nullable rather than 0. */
    public static function codCeiling(): ?int
    {
        $ceiling = (int) (Setting::get('cod_max_paise') ?? 0);

        return $ceiling > 0 ? $ceiling : null;
    }

    private static function qrUrl(): ?string
    {
        $path = Setting::get('upi_qr_path');

        return filled($path) ? Storage::disk('public')->url($path) : null;
    }
}
