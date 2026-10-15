<?php

namespace App\Support\Store\Zoho;

use App\Models\Setting;
use App\Support\IndianStates;
use App\Support\OAuth\OAuthConnection;

/**
 * The one reader of the `zoho_books` settings group (0.134.0, docs/store.md
 * "Zoho Books invoices"; payments and credit notes since 0.136.0).
 *
 * `ready()` is the single answer to "may an invoice be made": the switch, a
 * connected account, an organisation, the state the business is registered
 * in and both taxes. Anything short of that and nothing is asked of Zoho and
 * no order is marked — an install that never opens this screen behaves
 * exactly as it did.
 */
final class ZohoSettings
{
    /**
     * Zoho keeps each customer's data in one region, and both its sign-in
     * and its API live on that region's own domain. An Indian business is on
     * `.in` unless its account predates that data centre.
     *
     * The sign-in half is `OAuthProvider::Zoho`'s, keyed on the same two codes.
     *
     * @var array<string, array{label: string, api: string}>
     */
    public const DATA_CENTRES = [
        'in' => ['label' => 'India (zoho.in)', 'api' => 'https://www.zohoapis.in'],
        'com' => ['label' => 'United States (zoho.com)', 'api' => 'https://www.zohoapis.com'],
    ];

    /** When an order's invoice is made. */
    public const WHEN = [
        ['value' => 'dispatched', 'label' => 'When the order is dispatched', 'description' => 'An order with nothing to ship — a licence, a service — is invoiced when it is paid.'],
        ['value' => 'paid', 'label' => 'When the order is paid', 'description' => 'A cash-on-delivery order is invoiced once the cash is recorded.'],
    ];

    /**
     * The consent this application asks Zoho for, as a number that rises
     * when it asks for more. 2 added payments, credit notes and the chart of
     * accounts (0.136.0); a connection made before that cannot do those, and
     * the screen says to connect again rather than letting Zoho refuse each
     * payment one at a time.
     */
    public const SCOPE_VERSION = 2;

    /** The ways of paying a deposit account is chosen for — `PaymentMethod`'s values. */
    public const ACCOUNT_METHODS = [
        'gateway' => 'card and online payments',
        'cod' => 'cash on delivery',
        'bank_transfer' => 'bank transfers',
        'upi' => 'UPI payments',
    ];

    public static function enabled(): bool
    {
        return (bool) Setting::get('zoho_books_enabled', false);
    }

    public static function dataCentre(): string
    {
        $dc = (string) Setting::get('zoho_books_dc', 'in');

        return isset(self::DATA_CENTRES[$dc]) ? $dc : 'in';
    }

    public static function apiBase(): string
    {
        return self::DATA_CENTRES[self::dataCentre()]['api'].'/books/v3';
    }

    public static function organizationId(): string
    {
        return trim((string) Setting::get('zoho_books_organization_id', ''));
    }

    public static function homeState(): ?string
    {
        $state = (string) Setting::get('zoho_books_home_state', '');

        return IndianStates::isCode($state) ? $state : null;
    }

    /** `dispatched` or `paid`. */
    public static function when(): string
    {
        return Setting::get('zoho_books_invoice_when') === 'paid' ? 'paid' : 'dispatched';
    }

    /** The tax to put on a line: the group for a sale inside the home state, IGST for one outside it. */
    public static function taxFor(?string $placeOfSupply): string
    {
        $inside = $placeOfSupply === null || $placeOfSupply === self::homeState();

        return trim((string) Setting::get($inside ? 'zoho_books_tax_intra' : 'zoho_books_tax_inter', ''));
    }

    /** Whether payments and refunds are sent at all (0.136.0). On unless switched off. */
    public static function sendsPayments(): bool
    {
        return (bool) Setting::get('zoho_books_send_payments', true);
    }

    /** Whether the saved consent covers payments and credit notes. */
    public static function scopeCurrent(): bool
    {
        return (int) Setting::get('zoho_books_scope_version', 1) >= self::SCOPE_VERSION;
    }

    /** The Zoho account money paid this way is deposited to and refunded from, or '' when none is chosen. */
    public static function accountFor(?string $method): string
    {
        return isset(self::ACCOUNT_METHODS[(string) $method])
            ? trim((string) Setting::get('zoho_books_account_'.$method, ''))
            : '';
    }

    /** @return list<string> the ways of paying that have an account chosen */
    public static function methodsWithAccounts(): array
    {
        return array_values(array_filter(array_keys(self::ACCOUNT_METHODS), fn (string $m) => self::accountFor($m) !== ''));
    }

    /**
     * Whether a payment made this way may be sent now: invoices are being
     * made, payments are switched on, the consent covers them and there is
     * an account to put the money in.
     */
    public static function paymentsReady(?string $method): bool
    {
        return self::ready() && self::sendsPayments() && self::scopeCurrent() && self::accountFor($method) !== '';
    }

    /**
     * What stands between this install and payments reaching Zoho. Never
     * part of `missing()`: an invoice needs none of it.
     *
     * @param  list<string>  $offered  the ways of paying the shop offers
     * @return list<string>
     */
    public static function paymentsMissing(array $offered): array
    {
        if (! self::sendsPayments() || ! self::connected()) {
            return [];
        }

        $missing = [];

        if (! self::scopeCurrent()) {
            $missing[] = 'Disconnect and connect Zoho again, so this site may record payments and credit notes.';
        }

        foreach ($offered as $method) {
            if (isset(self::ACCOUNT_METHODS[$method]) && self::accountFor($method) === '') {
                $missing[] = 'Choose the account for '.self::ACCOUNT_METHODS[$method].'.';
            }
        }

        return $missing;
    }

    public static function connected(): bool
    {
        return OAuthConnection::zohoBooks()->isConnected();
    }

    /** What is still missing, in the order somebody would set it up. Empty when invoices can be made. */
    public static function missing(): array
    {
        $missing = [];

        if (! self::connected()) {
            if (blank(Setting::get('zoho_books_oauth_client_id')) || blank(Setting::get('zoho_books_oauth_client_secret'))) {
                $missing[] = 'Save the client ID and secret.';
            }
            $missing[] = 'Connect a Zoho account.';
        }
        if (self::organizationId() === '') {
            $missing[] = 'Choose the Zoho Books organisation.';
        }
        if (self::homeState() === null) {
            $missing[] = 'Choose the state your business is registered in.';
        }
        if (blank(Setting::get('zoho_books_tax_intra')) || blank(Setting::get('zoho_books_tax_inter'))) {
            $missing[] = 'Choose both taxes.';
        }

        return $missing;
    }

    public static function ready(): bool
    {
        return self::enabled() && self::missing() === [];
    }

    /** @return list<array{value: string, label: string, description?: string}>|null */
    public static function options(string $key): ?array
    {
        return match ($key) {
            'zoho_books_dc' => array_map(
                fn (string $dc) => ['value' => $dc, 'label' => self::DATA_CENTRES[$dc]['label']],
                array_keys(self::DATA_CENTRES),
            ),
            'zoho_books_invoice_when' => self::WHEN,
            'zoho_books_home_state' => IndianStates::options(),
            default => null,
        };
    }

    /**
     * Why a value cannot be saved, or null. The organisation and the two
     * taxes are Zoho's own ids — digits — and are chosen from lists Zoho
     * sends, so the only check here is that nothing else got in.
     */
    public static function refusalFor(string $key, mixed $value): ?string
    {
        if (blank($value)) {
            return null;
        }

        $value = (string) $value;

        return match ($key) {
            'zoho_books_dc' => isset(self::DATA_CENTRES[$value]) ? null : 'Choose one of the data centres listed.',
            'zoho_books_invoice_when' => in_array($value, ['dispatched', 'paid'], true) ? null : 'Choose when the invoice is made.',
            'zoho_books_home_state' => IndianStates::isCode($value) ? null : 'Choose a state from the list.',
            'zoho_books_organization_id', 'zoho_books_tax_intra', 'zoho_books_tax_inter',
            'zoho_books_account_gateway', 'zoho_books_account_cod', 'zoho_books_account_bank_transfer',
            'zoho_books_account_upi' => preg_match('/^\d{1,30}$/', $value) === 1
                ? null
                : 'Choose from the list — that is not one of Zoho\'s ids.',
            default => null,
        };
    }
}
