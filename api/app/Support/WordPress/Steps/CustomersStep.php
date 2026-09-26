<?php

namespace App\Support\WordPress\Steps;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Support\Address;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use App\Support\WordPress\WooAddress;
use Illuminate\Support\Str;

/**
 * WooCommerce customers, as portal accounts.
 *
 * **Active, unconfirmed, and with a password nobody knows.** WordPress's
 * password hashes are not this application's scheme, and the client chose
 * sign-in by emailed code over carrying a second one. A code proves the
 * inbox, which is exactly what `markEmailVerified()` waits for — and that
 * confirmation then joins the customer's paid guest orders to the account,
 * the rule every account here already follows. A customer who prefers a
 * password sets one through "forgot password".
 *
 * **An address already here keeps what it has**: the import fills blank
 * fields only and never changes a status — the rule a guest order follows
 * against a saved account. Its name, phone and addresses are WooCommerce's
 * billing details, and the delivery address is kept only when it differs.
 *
 * Saving a customer joins them to the newsletter's "Existing customers"
 * group through the model's own hook, as the client decided; the review said
 * how many and which sequences before anything was written.
 */
class CustomersStep extends Step
{
    public function key(): string
    {
        return 'customers';
    }

    public function label(): string
    {
        return 'Customers';
    }

    public function section(): string
    {
        return 'customers';
    }

    public function mapType(): ?string
    {
        return 'customer';
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $email = strtolower(trim((string) ($record['email'] ?? '')));

        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return Outcome::skip($email ?: '(no address) #'.($record['id'] ?? '?'), 'Has no valid email address to sign in with.');
        }

        $existing = $ctx->map->model('customer', $record['id'], Customer::class)
            ?? Customer::query()->where('email', $email)->first();

        return Outcome::upsert($existing !== null, $email, ['email' => $email, 'existing' => $existing?->id]);
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $billing = WooAddress::from($record['billing'] ?? null);
        $shipping = WooAddress::from($record['shipping'] ?? null);

        if ($shipping !== null && $billing !== null && Address::same($billing, $shipping)) {
            $shipping = null;
        }

        $name = WooAddress::name($record) ?? WooAddress::name($record['billing'] ?? null)
            ?? (trim((string) ($record['username'] ?? '')) ?: Str::before($outcome->data['email'], '@'));

        $values = [
            'name' => Str::limit($name, 190, ''),
            'company' => Str::limit(trim((string) ($record['billing']['company'] ?? '')), 190, '') ?: null,
            'phone' => Str::limit(trim((string) ($record['billing']['phone'] ?? '')), 32, '') ?: null,
            'billing_address' => $billing,
            'shipping_address' => $shipping,
        ];

        $customer = $outcome->data['existing'] ? Customer::query()->find($outcome->data['existing']) : null;

        if ($customer === null) {
            $customer = new Customer;
            $customer->fill($values + [
                'email' => $outcome->data['email'],
                'password' => Str::random(40),
                'status' => CustomerStatus::Active,
            ]);

            if ($created = self::date($record['date_created_gmt'] ?? null)) {
                $customer->forceFill(['created_at' => $created]);
            }

            $customer->save();
        } else {
            // Blanks only: what the account already says, it keeps.
            $blanks = array_filter($values, fn ($value, $key) => $value !== null && blank($customer->getAttribute($key)), ARRAY_FILTER_USE_BOTH);

            if ($blanks !== []) {
                $customer->fill($blanks)->save();
            }
        }

        $ctx->map->put('customer', $record['id'], $customer);
    }
}
