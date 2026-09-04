<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Support\Address;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The address a customer keeps on their own account.
 *
 * The columns existed and the checkout wrote them; there was no way for a
 * customer to *see* or correct one, so an address could only ever be changed by
 * placing another order. That is the same shape as an endpoint with no control
 * behind it — stored data nothing can reach.
 *
 * What these pin is the agreement between the two screens that write it. Both
 * store `shipping_address` as **null** while it is the same as the billing one,
 * and both read that from an explicit answer rather than by comparing the two
 * blocks. If they ever disagree, a customer's delivery address silently changes
 * meaning depending on which screen they last used.
 */
class ProfileAddressTest extends TestCase
{
    use RefreshDatabase;

    private function customer(array $attributes = []): Customer
    {
        return Customer::create(array_merge([
            'name' => 'Neil Basu',
            'email' => 'neil@meridian-foods.test',
            'password' => bcrypt('irrelevant'),
            'status' => CustomerStatus::Active,
        ], $attributes));
    }

    private function billing(array $overrides = []): array
    {
        return array_merge([
            'line1' => '12 Example Road',
            'city' => 'Kolkata',
            'state' => 'West Bengal',
            'pin' => '700001',
            'country' => 'India',
        ], $overrides);
    }

    /* ------------------------------------------------------ writing one */

    public function test_a_customer_can_save_a_billing_address_and_gstin(): void
    {
        $customer = $this->customer();

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/auth/profile', [
                'billing_address' => $this->billing(),
                'gstin' => '27AAPFU0939F1ZV',
            ])
            ->assertOk()
            ->assertJsonPath('data.billing_address.line1', '12 Example Road')
            ->assertJsonPath('data.gstin', '27AAPFU0939F1ZV');

        $this->assertSame('Kolkata', $customer->fresh()->billing_address['city']);
    }

    /**
     * Every part is present, whatever the form posted — including the ones it
     * left out, so nothing downstream has to guess whether a missing key means
     * "empty" or "not asked for".
     *
     * The *order* is deliberately not asserted, and that is the finding rather
     * than a weakened test. `normalise()` writes a fixed order for a reader's
     * benefit, and **MySQL does not keep it**: its JSON type sorts object keys
     * by length and then alphabetically, so this comes back as
     * `pin, city, line1, line2, state, country` — the trap `SpecSheet` already
     * exists for. An earlier version of this test asserted the written order
     * and failed, which is how the `===` comparison in `Checkout` was found to
     * be resting on something that is not true.
     */
    public function test_an_address_is_stored_whole(): void
    {
        $customer = $this->customer();

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/auth/profile', [
                // Deliberately out of order and missing three keys.
                'billing_address' => ['pin' => '700001', 'line1' => '12 Example Road', 'city' => 'Kolkata'],
            ])->assertOk();

        $stored = $customer->fresh()->billing_address;

        $this->assertEqualsCanonicalizing(
            ['line1', 'line2', 'city', 'state', 'pin', 'country'],
            array_keys($stored),
        );
        $this->assertSame('700001', $stored['pin']);
        $this->assertNull($stored['state']);
        $this->assertSame('India', $stored['country']);
    }

    /**
     * Two identical addresses compare equal **across a database round trip**.
     *
     * This is the control for the bug above. `===` on the two arrays answers
     * false here — one is in the order a form posted it, the other in the
     * order MySQL chose — so anything deciding "is the delivery address the
     * same as the billing one" that way stores a duplicate for every customer
     * who does not have a second address.
     */
    public function test_addresses_compare_equal_after_a_round_trip(): void
    {
        $customer = $this->customer();

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/auth/profile', ['billing_address' => $this->billing()])
            ->assertOk();

        $stored = $customer->fresh()->billing_address;
        $fresh = Address::normalise($this->billing());

        $this->assertNotSame($fresh, $stored, 'If these are identical, MySQL kept the key order and this test proves nothing.');
        $this->assertTrue(Address::same($fresh, $stored));
    }

    /** Nobody typed anything, so there is no address — not six null keys. */
    public function test_a_blank_address_is_stored_as_null(): void
    {
        $customer = $this->customer(['billing_address' => $this->billing()]);

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/auth/profile', ['billing_address' => ['line1' => '', 'city' => '']])
            ->assertOk();

        $this->assertNull($customer->fresh()->billing_address);
    }

    /* -------------------------------------------- the delivery question */

    /** Ticked "same as billing" stores null, never a copy. */
    public function test_the_same_delivery_address_is_stored_as_null(): void
    {
        $customer = $this->customer();

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/auth/profile', [
                'billing_address' => $this->billing(),
                'shipping_same' => true,
                // Sent and ignored, exactly as a form leaving the block mounted would.
                'shipping_address' => ['line1' => 'Unit 4, Sector V', 'city' => 'Salt Lake'],
            ])->assertOk();

        $this->assertNull($customer->fresh()->shipping_address);
    }

    public function test_a_separate_delivery_address_is_kept(): void
    {
        $customer = $this->customer();

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/auth/profile', [
                'billing_address' => $this->billing(),
                'shipping_same' => false,
                'shipping_address' => [
                    'line1' => 'Unit 4, Sector V',
                    'city' => 'Salt Lake',
                    'state' => 'West Bengal',
                    'pin' => '700091',
                ],
            ])->assertOk();

        $this->assertSame('Unit 4, Sector V', $customer->fresh()->shipping_address['line1']);
    }

    /** Re-ticking the box clears the one that was there. */
    public function test_going_back_to_one_address_clears_the_other(): void
    {
        $customer = $this->customer([
            'billing_address' => $this->billing(),
            'shipping_address' => ['line1' => 'Unit 4, Sector V', 'city' => 'Salt Lake'],
        ]);

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/auth/profile', [
                'billing_address' => $this->billing(),
                'shipping_same' => true,
            ])->assertOk();

        $this->assertNull($customer->fresh()->shipping_address);
    }

    /**
     * A request that says nothing about delivery leaves it alone.
     *
     * This is the one that stops the profile screen becoming destructive:
     * changing a telephone number must not silently clear an address, and
     * neither must any other partial write.
     */
    public function test_a_request_that_omits_the_addresses_changes_neither(): void
    {
        $customer = $this->customer([
            'billing_address' => $this->billing(),
            'shipping_address' => ['line1' => 'Unit 4, Sector V', 'city' => 'Salt Lake'],
        ]);

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/auth/profile', ['phone' => '+91 98765 43210'])
            ->assertOk();

        $fresh = $customer->fresh();

        $this->assertSame('12 Example Road', $fresh->billing_address['line1']);
        $this->assertSame('Unit 4, Sector V', $fresh->shipping_address['line1']);
    }

    /* ----------------------------------------------------------- refusals */

    public function test_a_malformed_gstin_is_refused(): void
    {
        $this->actingAs($this->customer(), 'sanctum')
            ->patchJson('/api/v1/auth/profile', ['gstin' => 'NOT-A-GSTIN'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['gstin']);
    }

    /** Clearing it is not the same as getting it wrong. */
    public function test_a_gstin_can_be_cleared(): void
    {
        $customer = $this->customer(['gstin' => '27AAPFU0939F1ZV']);

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/auth/profile', ['gstin' => null])
            ->assertOk();

        $this->assertNull($customer->fresh()->gstin);
    }

    /** An address is a convenience, never a condition of saving the form. */
    public function test_an_address_is_never_required(): void
    {
        $this->actingAs($this->customer(), 'sanctum')
            ->patchJson('/api/v1/auth/profile', ['name' => 'Neil B'])
            ->assertOk();
    }

    /** Somebody else's account is not reachable from this endpoint. */
    public function test_it_needs_a_customer_session(): void
    {
        $this->patchJson('/api/v1/auth/profile', ['gstin' => '27AAPFU0939F1ZV'])
            ->assertUnauthorized();
    }
}
