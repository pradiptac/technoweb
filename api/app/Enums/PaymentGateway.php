<?php

namespace App\Enums;

use App\Models\Setting;

/**
 * The payment providers, and what each one needs to work.
 *
 * Shaped exactly like `MailTransport`, and for the same reason that one earns
 * its shape: **the enum is the only list.** It owns each provider's label, the
 * settings it reads, and whether this install has been given them — so the
 * settings screen, the checkout and the webhook route are all built from one
 * place rather than from four that then have to agree.
 *
 * Razorpay and Cashfree are implemented (Cashfree since 2026-09-18, on
 * `CashfreeProvider`). Paytm is present and reports itself not built, which
 * is the same treatment SES gets in the mail panel: an option rendered
 * disabled with the reason is a question somebody can answer, where a
 * missing option is a question they have to go and ask a colleague.
 */
enum PaymentGateway: string
{
    case Razorpay = 'razorpay';
    case Cashfree = 'cashfree';
    case Paytm = 'paytm';

    public function label(): string
    {
        return match ($this) {
            self::Razorpay => 'Razorpay',
            self::Cashfree => 'Cashfree',
            self::Paytm => 'Paytm',
        };
    }

    /**
     * Whether this provider can actually take a payment on this server.
     *
     * A live check of the stored settings rather than a constant, so it
     * describes *this install* — the same rule `MailTransport::isAvailable()`
     * follows with `class_exists`. Better than discovering a missing key at the
     * moment somebody presses Pay.
     */
    public function isConfigured(): bool
    {
        return match ($this) {
            self::Razorpay => filled(Setting::get('razorpay_key_id')) && filled(Setting::get('razorpay_key_secret')),
            self::Cashfree => filled(Setting::get('cashfree_app_id')) && filled(Setting::get('cashfree_secret_key')),
            // Not implemented yet. Reporting it as configurable would be a
            // promise the checkout cannot keep.
            self::Paytm => false,
        };
    }

    /** Whether the code to drive it exists at all, as against being unconfigured. */
    public function isImplemented(): bool
    {
        return $this === self::Razorpay || $this === self::Cashfree;
    }

    /** What to say beside a provider that cannot be chosen. */
    public function unavailableReason(): ?string
    {
        if (! $this->isImplemented()) {
            return 'Not built yet. Razorpay and Cashfree are the gateways this store can use.';
        }

        if (! $this->isConfigured()) {
            return 'Add the key id and secret in Settings before choosing this.';
        }

        return null;
    }

    /**
     * The settings each provider reads.
     *
     * The console builds its form from this, so adding a provider is a case
     * here rather than a change in the enum, the settings screen, the seeder
     * and the provider factory that then have to be kept in step.
     *
     * @return array<int, array<string, mixed>>
     */
    public function fields(): array
    {
        return match ($this) {
            self::Razorpay => [
                ['key' => 'razorpay_key_id', 'label' => 'Key ID', 'secret' => false,
                    'hint' => 'Starts rzp_test_ or rzp_live_. It is sent to the browser, so it is not a secret.'],
                ['key' => 'razorpay_key_secret', 'label' => 'Key secret', 'secret' => true,
                    'hint' => 'Never leaves this server. Used to sign and to verify what comes back.'],
                ['key' => 'razorpay_webhook_secret', 'label' => 'Webhook secret', 'secret' => true,
                    'hint' => 'A different secret from the key secret. Set the same value in the Razorpay dashboard.'],
            ],
            self::Cashfree => [
                ['key' => 'cashfree_app_id', 'label' => 'App ID', 'secret' => false,
                    'hint' => 'The client id from the Cashfree dashboard. Sent to the browser with the checkout, so it is not a secret.'],
                ['key' => 'cashfree_secret_key', 'label' => 'Secret key', 'secret' => true,
                    'hint' => 'Never leaves this server. Opens the payment, confirms it, and verifies the webhook — Cashfree has no separate webhook secret.'],
                ['key' => 'cashfree_environment', 'label' => 'Environment', 'secret' => false,
                    'hint' => 'Sandbox keys only work against the sandbox and live keys only against production; the dashboard issues each pair separately.',
                    'options' => [['value' => 'sandbox', 'label' => 'Sandbox (test)'], ['value' => 'production', 'label' => 'Production (live)']]],
            ],
            self::Paytm => [],
        };
    }

    /** @return array<int, array<string, mixed>> For the settings screen. */
    public static function options(): array
    {
        return array_map(fn (self $g) => [
            'value' => $g->value,
            'label' => $g->label(),
            'implemented' => $g->isImplemented(),
            'configured' => $g->isConfigured(),
            'reason' => $g->unavailableReason(),
            'fields' => $g->fields(),
        ], self::cases());
    }

    /**
     * The chosen gateway, or null when the shop cannot take a payment.
     *
     * Null is a real answer and the storefront must be able to render it: an
     * install with no keys yet should say "payment is not set up" rather than
     * offer a button that throws.
     */
    public static function active(): ?self
    {
        $chosen = self::tryFrom((string) Setting::get('payment_gateway'));

        return $chosen?->isConfigured() ? $chosen : null;
    }
}
