<?php

namespace App\Enums;

use App\Models\Setting;

/**
 * How the money is meant to arrive.
 *
 * The list, the way `MailTransport` owns the list of mail transports: each case
 * carries its own label, the settings it reads, whether it is switched on, and
 * the two rules that actually matter — whether it settles online, and whether
 * it may carry a digital product.
 *
 * **Only `gateway` settles by itself.** The other three end with a person
 * confirming that money arrived: cash handed over at the door, a transfer that
 * shows up on a bank statement, a UPI payment that shows up in an app. That is
 * a real difference and it is why `Order::scopePaid()` had to stop being derived
 * from the status — a cash-on-delivery order is dispatched *before* the money
 * exists, so "has it progressed past payment" and "did we get paid" stopped
 * being the same question the moment this enum was added.
 *
 * **Cash on delivery cannot carry a digital product.** There is nothing to hand
 * over at a door, and the alternative — issuing a licence key and hoping — is
 * giving stock away. `permitsDigital()` is checked at the checkout rather than
 * left to the shop to remember.
 */
enum PaymentMethod: string
{
    /** Razorpay, or whichever gateway is configured. Verified server-side. */
    case Gateway = 'gateway';

    case Cod = 'cod';

    case BankTransfer = 'bank_transfer';

    case Upi = 'upi';

    public function label(): string
    {
        return match ($this) {
            self::Gateway => 'Card, netbanking or wallet',
            self::Cod => 'Cash on delivery',
            self::BankTransfer => 'Bank transfer (NEFT / IMPS / RTGS)',
            self::Upi => 'UPI',
        };
    }

    /** What the customer is told will happen next. */
    public function blurb(): string
    {
        return match ($this) {
            self::Gateway => 'Pay now. You will be taken to a secure payment page.',
            self::Cod => 'Pay the courier when the order arrives.',
            self::BankTransfer => 'We will show you our account details. Your order is held until the transfer arrives.',
            self::Upi => 'We will show you a QR code and a UPI ID. Your order is held until the payment arrives.',
        };
    }

    /**
     * Whether the money is verified without anybody looking.
     *
     * The one that decides almost everything downstream: an online settlement
     * writes its own payment row from a signed callback, and an offline one is a
     * person reading a bank statement and saying so.
     */
    public function settlesOnline(): bool
    {
        return $this === self::Gateway;
    }

    /**
     * Whether an order paid this way may contain a licence key.
     *
     * No for cash on delivery, which has nothing to collect at a door for a
     * thing that arrives by email. Bank transfer and UPI are fine: the order
     * simply waits, unfulfilled, until somebody confirms the money — which is
     * exactly what an unpaid gateway order does.
     */
    public function permitsDigital(): bool
    {
        return $this !== self::Cod;
    }

    /**
     * Whether the shop starts work before the money arrives.
     *
     * True only for cash on delivery, and it is what `OrderStatus::Confirmed`
     * exists for: a COD order is not an abandoned basket sitting at
     * `pending_payment`, it is an order somebody is expected to pack.
     */
    public function fulfilsBeforePayment(): bool
    {
        return $this === self::Cod;
    }

    /** The setting that switches it on. `gateway` has its own configuration. */
    public function settingKey(): ?string
    {
        return match ($this) {
            self::Gateway => null,
            self::Cod => 'cod_enabled',
            self::BankTransfer => 'bank_transfer_enabled',
            self::Upi => 'upi_enabled',
        };
    }

    /**
     * Whether this is offered at the checkout right now.
     *
     * The gateway answers for its own configuration — offering "pay by card" on
     * a shop with no keys is a button that fails after the customer has typed
     * their address. The other three are a switch plus the detail they cannot
     * work without: a bank transfer with no account number is instructions
     * nobody can follow, and a UPI option with neither an ID nor a QR code is
     * the same.
     */
    public function isAvailable(): bool
    {
        return match ($this) {
            self::Gateway => Setting::get('payment_gateway') !== null
                && Setting::get('razorpay_key_id') !== null,
            self::Cod => (bool) Setting::get('cod_enabled'),
            self::BankTransfer => (bool) Setting::get('bank_transfer_enabled')
                && filled(Setting::get('bank_account_details')),
            self::Upi => (bool) Setting::get('upi_enabled')
                && (filled(Setting::get('upi_id')) || filled(Setting::get('upi_qr_path'))),
        };
    }

    /**
     * Why it is not offered, for the console rather than for a customer.
     *
     * The same treatment SES gets in the mail panel: an option that is disabled
     * and says what is missing is a question somebody can answer, and one that
     * has simply vanished is a question they have to go and ask a colleague.
     */
    public function unavailableReason(): ?string
    {
        if ($this->isAvailable()) {
            return null;
        }

        return match ($this) {
            self::Gateway => 'No gateway is configured. Choose one and enter its keys above.',
            self::Cod => 'Switched off.',
            self::BankTransfer => (bool) Setting::get('bank_transfer_enabled')
                ? 'Switched on, but there are no account details for the customer to pay into.'
                : 'Switched off.',
            self::Upi => (bool) Setting::get('upi_enabled')
                ? 'Switched on, but there is neither a UPI ID nor a QR code.'
                : 'Switched off.',
        };
    }

    /** @return array<int, self> */
    public static function offered(): array
    {
        return array_values(array_filter(self::cases(), fn (self $m) => $m->isAvailable()));
    }
}
