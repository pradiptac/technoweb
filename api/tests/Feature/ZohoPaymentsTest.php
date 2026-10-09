<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Payment;
use App\Models\Setting;
use App\Support\Store\Payments\ManualPayment;
use App\Support\Store\Payments\ManualRefund;
use App\Support\Store\Returns\ReturnActions;
use App\Support\Store\Zoho\ZohoInvoices;
use App\Support\Store\Zoho\ZohoPayments;
use App\Support\Store\Zoho\ZohoSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FakesZohoBooks;
use Tests\TestCase;

/**
 * Payments and credit notes in Zoho Books (0.136.0, docs/store.md "Zoho
 * Books: payments and credit notes").
 *
 * What the feature rests on, each asserted on its own:
 *
 *   1. **Money that moved is told to Zoho once.** A payment becomes a
 *      customer payment on the order's invoice, whichever of the two came
 *      first; a retry, a sweep or a crash recovered from never makes a
 *      second.
 *   2. **A refund is a credit note that says what it can.** The invoice's
 *      lines for a whole refund, the returned items for a return, one line
 *      for the amount otherwise — and it is used the way Zoho's own
 *      balances say: against what is owed, the rest paid back.
 *   3. **Zoho's books are the truth about Zoho.** An invoice already paid
 *      there is not paid twice.
 *   4. **Off, unconfigured or under an old consent means untouched** — and
 *      never in the way of an invoice.
 *
 * The fake Zoho is `FakesZohoBooks`, the one `ZohoBooksTest` drives.
 */
class ZohoPaymentsTest extends TestCase
{
    use FakesZohoBooks;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpZoho();

        Setting::put('zoho_books_scope_version', (string) ZohoSettings::SCOPE_VERSION);
        Setting::put('zoho_books_account_gateway', self::CLEARING);
        Setting::put('zoho_books_account_cod', self::CASH);
        Setting::put('zoho_books_account_bank_transfer', self::BANK);
        Setting::put('zoho_books_account_upi', self::BANK);
    }

    /* ------------------------------------------------------------ helpers */

    /** A card order paid the way `Settlement` pays one: the payment row first, then the order moved to paid. */
    private function paid(array $overrides = []): Order
    {
        $order = $this->order($overrides);

        $order->payments()->create([
            'gateway' => 'razorpay', 'gateway_order_id' => 'order_Abc', 'gateway_payment_id' => 'pay_'.$order->id.'Xyz',
            'amount_paise' => $order->total_paise, 'currency' => 'INR', 'status' => PaymentStatus::Paid, 'method' => 'card', 'paid_at' => now(),
        ]);
        $order->moveTo(OrderStatus::Paid);

        return $order->fresh();
    }

    /** Paid by card and dispatched: the invoice is made, and the payment follows it. */
    private function paidAndDispatched(array $overrides = []): Order
    {
        $order = $this->paid($overrides);
        $order->moveTo(OrderStatus::Dispatched);

        return $order->fresh();
    }

    /** A cash-on-delivery order out for delivery: invoiced, not yet paid. */
    private function cashOrderDispatched(): Order
    {
        $order = $this->order(['payment_method' => 'cod', 'status' => OrderStatus::Confirmed]);
        $order->moveTo(OrderStatus::Dispatched);

        return $order->fresh();
    }

    private function payment(Order $order, PaymentStatus $status = PaymentStatus::Paid): Payment
    {
        return $order->payments()->where('status', $status->value)->latest('id')->firstOrFail();
    }

    /** @return list<string> the order's trail, oldest first */
    private function trail(Order $order): array
    {
        return $order->history()->orderBy('id')->pluck('note')->filter()->values()->all();
    }

    /* --------------------------------------------------------- payments in */

    public function test_a_payment_that_came_before_the_invoice_follows_it_into_zoho(): void
    {
        $order = $this->paid();

        // Paid, not yet dispatched: no invoice, so nothing to pay.
        $this->assertSame([], $this->called('POST', '/customerpayments'));
        $this->assertNull($this->payment($order)->zoho_status);

        $order->moveTo(OrderStatus::Dispatched);
        $payment = $this->payment($order);

        $sent = $this->called('POST', '/customerpayments');
        $this->assertCount(1, $sent);
        $this->assertSame('7001', $sent[0]['body']['customer_id']);
        $this->assertEquals(20000, $sent[0]['body']['amount']);
        $this->assertSame(self::CLEARING, $sent[0]['body']['account_id']);
        $this->assertSame('creditcard', $sent[0]['body']['payment_mode']);
        $this->assertSame("{$order->order_number}-P{$payment->id}", $sent[0]['body']['reference_number']);
        $this->assertSame('9001', $sent[0]['body']['invoices'][0]['invoice_id']);
        $this->assertEquals(20000, $sent[0]['body']['invoices'][0]['amount_applied']);
        $this->assertStringContainsString($payment->gateway_payment_id, $sent[0]['body']['description']);
        $this->assertSame('60001234567', $sent[0]['query']['organization_id']);

        $this->assertSame('sent', $payment->zoho_status);
        $this->assertSame('5001', $payment->zoho_id);
        $this->assertNotNull($payment->zoho_synced_at);
        $this->assertStringContainsString('recorded against invoice INV-000123', implode(' ', $this->trail($order)));
        $this->assertEquals(0, $this->invoiceBalance);
    }

    public function test_cash_banked_after_the_invoice_is_recorded_when_it_is_recorded(): void
    {
        $order = $this->cashOrderDispatched();
        $this->assertSame('created', $order->zoho_status);
        $this->assertSame([], $this->called('POST', '/customerpayments'));

        ManualPayment::record($order, $this->staff(RoleEnum::StoreManager), ['amount_paise' => 2000000, 'reference' => 'RCPT-4471']);

        $sent = $this->called('POST', '/customerpayments');
        $this->assertCount(1, $sent);
        $this->assertSame(self::CASH, $sent[0]['body']['account_id']);
        $this->assertSame('cash', $sent[0]['body']['payment_mode']);
        $this->assertStringContainsString('RCPT-4471', $sent[0]['body']['description']);
        $this->assertSame('sent', $this->payment($order)->zoho_status);
    }

    public function test_it_is_sent_once_however_often_it_is_tried(): void
    {
        $order = $this->paidAndDispatched();
        $payment = $this->payment($order);

        ZohoPayments::consider($payment);
        ZohoPayments::run($payment);
        ZohoPayments::forOrder($order);
        $this->travel(20)->minutes();
        ZohoPayments::sweep();

        $this->assertCount(1, $this->called('POST', '/customerpayments'));
    }

    public function test_a_payment_zoho_already_holds_is_adopted_not_repeated(): void
    {
        $this->answers['GET /customerpayments'] = fn () => [[
            'code' => 0,
            'customerpayments' => [['payment_id' => '5555', 'reference_number' => Order::first()->order_number.'-P'.Payment::first()->id]],
        ]];

        $order = $this->paidAndDispatched();

        $this->assertSame([], $this->called('POST', '/customerpayments'));
        $this->assertSame('sent', $this->payment($order)->zoho_status);
        $this->assertSame('5555', $this->payment($order)->zoho_id);
        $this->assertStringContainsString('linked to the one already recorded there', implode(' ', $this->trail($order)));
    }

    public function test_an_invoice_already_paid_in_zoho_is_not_paid_twice(): void
    {
        // The accountant recorded it by hand: nothing is owed on the invoice.
        $this->answers['GET /invoices/9001 json'] = [['code' => 0, 'invoice' => ['invoice_id' => '9001', 'customer_id' => '7001', 'balance' => 0]]];

        $order = $this->paidAndDispatched();

        $this->assertSame([], $this->called('POST', '/customerpayments'));
        $this->assertSame('skipped', $this->payment($order)->zoho_status);
        $this->assertStringContainsString('already paid there', implode(' ', $this->trail($order)));
    }

    public function test_with_no_account_chosen_nothing_is_sent_until_one_is(): void
    {
        Setting::put('zoho_books_account_cod', null);

        $order = $this->cashOrderDispatched();
        ManualPayment::record($order, $this->staff(RoleEnum::StoreManager), ['amount_paise' => 2000000, 'reference' => 'RCPT-1']);

        // The invoice was made regardless; the payment waits, unmarked.
        $this->assertSame('created', $order->fresh()->zoho_status);
        $this->assertSame([], $this->called('POST', '/customerpayments'));
        $this->assertNull($this->payment($order)->zoho_status);

        ZohoPayments::sweep();
        $this->assertSame([], $this->called('POST', '/customerpayments'));

        // Chosen later: the sweep picks the waiting payment up.
        Setting::put('zoho_books_account_cod', self::CASH);
        ZohoPayments::sweep();

        $this->assertCount(1, $this->called('POST', '/customerpayments'));
        $this->assertSame('sent', $this->payment($order)->zoho_status);
    }

    public function test_switched_off_or_under_an_old_consent_nothing_is_sent_and_the_invoice_still_is(): void
    {
        Setting::put('zoho_books_send_payments', '0');
        $first = $this->paidAndDispatched();
        $this->assertSame('created', $first->zoho_status);
        $this->assertNull($this->payment($first)->zoho_status);

        Setting::put('zoho_books_send_payments', '1');
        Setting::put('zoho_books_scope_version', null);
        ZohoPayments::sweep();

        $this->assertSame([], $this->called('POST', '/customerpayments'));
        $this->assertSame([], $this->called('GET', '/chartofaccounts'));
        $this->assertNull($this->payment($first)->zoho_status);
        $this->assertStringContainsString('connect it again', (string) ZohoPayments::refusal($first));
    }

    public function test_a_refusal_is_kept_in_zohos_words_and_tried_again_later(): void
    {
        $this->answers['POST /customerpayments'] = [['code' => 24016, 'message' => 'Please select a valid deposit account.'], 400];

        $order = $this->paidAndDispatched();
        $payment = $this->payment($order);

        // The dispatch and the invoice are untouched by it.
        $this->assertSame(OrderStatus::Dispatched, $order->status);
        $this->assertSame('created', $order->zoho_status);
        $this->assertSame('failed', $payment->zoho_status);
        $this->assertSame('Please select a valid deposit account.', $payment->zoho_error);
        $this->assertSame(1, $payment->zoho_attempts);

        // Not before its time.
        ZohoPayments::sweep();
        $this->assertCount(1, $this->called('POST', '/customerpayments'));

        unset($this->answers['POST /customerpayments']);
        $this->travel(6)->minutes();
        ZohoPayments::sweep();

        $this->assertCount(2, $this->called('POST', '/customerpayments'));
        $this->assertSame('sent', $payment->fresh()->zoho_status);
        $this->assertNull($payment->fresh()->zoho_error);
    }

    /* -------------------------------------------------------- credit notes */

    public function test_refunding_the_whole_order_makes_a_credit_note_of_the_invoices_lines_and_pays_it_back(): void
    {
        $order = $this->paidAndDispatched(['discount_paise' => 200000, 'subtotal_paise' => 2000000, 'total_paise' => 1800000]);
        $this->assertEquals(0, $this->invoiceBalance);

        ManualRefund::record($order, $this->staff(RoleEnum::StoreManager), ['amount_paise' => 1800000, 'reference' => 'rfnd_Q1']);
        $refund = $this->payment($order, PaymentStatus::Refunded);

        $note = $this->called('POST', '/creditnotes');
        $this->assertCount(1, $note);
        $this->assertSame('7001', $note[0]['body']['customer_id']);
        $this->assertSame("{$order->order_number}-R{$refund->id}", $note[0]['body']['reference_number']);
        $this->assertTrue($note[0]['body']['is_inclusive_tax']);
        $this->assertSame('WB', $note[0]['body']['place_of_supply']);
        $this->assertCount(1, $note[0]['body']['line_items']);
        $this->assertEquals(10000, $note[0]['body']['line_items'][0]['rate']);
        $this->assertSame(2, $note[0]['body']['line_items'][0]['quantity']);
        $this->assertSame(self::INTRA, $note[0]['body']['line_items'][0]['tax_id']);
        $this->assertEquals(2000, $note[0]['body']['discount']);

        // Nothing was owed on the invoice, so nothing is set against it: the
        // whole of it went back out of the account the card money came into.
        $this->assertSame([], $this->called('POST', '/creditnotes/6001/invoices'));
        $back = $this->called('POST', '/creditnotes/6001/refunds');
        $this->assertCount(1, $back);
        $this->assertEquals(18000, $back[0]['body']['amount']);
        $this->assertSame(self::CLEARING, $back[0]['body']['from_account_id']);
        $this->assertSame('rfnd_Q1', $back[0]['body']['reference_number']);

        $this->assertSame('sent', $refund->zoho_status);
        $this->assertSame('6001', $refund->zoho_id);
        $this->assertSame('CN-00001', $refund->zoho_number);
        $this->assertSame('6501', $refund->zoho_refund_id);
        $this->assertSame(OrderStatus::Refunded, $order->fresh()->status);
        $this->assertStringContainsString('credit note CN-00001', implode(' ', $this->trail($order)));
    }

    public function test_a_partial_refund_is_one_line_for_the_amount(): void
    {
        $order = $this->paidAndDispatched(['shipping_address' => ['line1' => '5 MG Road', 'city' => 'Pune', 'state' => 'Maharashtra', 'pin' => '411001']]);

        ManualRefund::record($order, $this->staff(RoleEnum::StoreManager), ['amount_paise' => 250000, 'reference' => 'rfnd_Q2']);

        $body = $this->called('POST', '/creditnotes')[0]['body'];
        $this->assertCount(1, $body['line_items']);
        $this->assertSame("Refund — order {$order->order_number}", $body['line_items'][0]['name']);
        $this->assertEquals(2500, $body['line_items'][0]['rate']);
        $this->assertSame(1, $body['line_items'][0]['quantity']);
        // Delivered to another state: IGST, as on the invoice.
        $this->assertSame(self::INTER, $body['line_items'][0]['tax_id']);
        $this->assertSame('MH', $body['place_of_supply']);
        $this->assertArrayNotHasKey('discount', $body);

        $this->assertEquals(2500, $this->called('POST', '/creditnotes/6001/refunds')[0]['body']['amount']);
        $this->assertSame(OrderStatus::Dispatched, $order->fresh()->status);
    }

    public function test_a_refund_from_a_return_lists_what_came_back(): void
    {
        $order = $this->paidAndDispatched();
        $staff = $this->staff(RoleEnum::StoreManager);

        $return = OrderReturn::create(['order_id' => $order->id, 'reason' => 'faulty']);
        $return->forceFill(['status' => 'received', 'received_at' => now()])->save();
        $return->items()->create(['order_item_id' => $order->items->first()->id, 'quantity' => 1, 'received_quantity' => 1]);

        ReturnActions::refund($return->fresh(), $staff, ['amount_paise' => 1000000, 'reference' => 'rfnd_R1']);

        $body = $this->called('POST', '/creditnotes')[0]['body'];
        $this->assertCount(1, $body['line_items']);
        $this->assertSame('Aruba 2930F switch — 24 port', $body['line_items'][0]['name']);
        $this->assertEquals(10000, $body['line_items'][0]['rate']);
        $this->assertSame(1, $body['line_items'][0]['quantity']);
        $this->assertStringContainsString($return->reference, $body['notes']);
        $this->assertSame('sent', $this->payment($order, PaymentStatus::Refunded)->zoho_status);
    }

    public function test_a_credit_note_is_set_against_an_invoice_that_is_still_owed_on(): void
    {
        // Zoho never took the payment, so the invoice still shows 20,000 owed.
        $this->answers['POST /customerpayments'] = [['code' => 24016, 'message' => 'Please select a valid deposit account.'], 400];
        $order = $this->paidAndDispatched();
        $this->assertEquals(20000, $this->invoiceBalance);

        ManualRefund::record($order, $this->staff(RoleEnum::StoreManager), ['amount_paise' => 500000, 'reference' => 'rfnd_Q3']);

        $applied = $this->called('POST', '/creditnotes/6001/invoices');
        $this->assertCount(1, $applied);
        $this->assertSame('9001', $applied[0]['body']['invoices'][0]['invoice_id']);
        $this->assertEquals(5000, $applied[0]['body']['invoices'][0]['amount_applied']);
        // All of it was used against the invoice: nothing is paid out.
        $this->assertSame([], $this->called('POST', '/creditnotes/6001/refunds'));
        $this->assertEquals(15000, $this->invoiceBalance);
        $this->assertSame('sent', $this->payment($order, PaymentStatus::Refunded)->zoho_status);
    }

    public function test_a_half_finished_credit_note_is_resumed_not_made_again(): void
    {
        $order = $this->paidAndDispatched();

        // Zoho makes the note, then refuses to pay it out.
        $this->answers['POST /creditnotes/{id}/refunds'] = [['code' => 1002, 'message' => 'The account is inactive.'], 400];
        ManualRefund::record($order, $this->staff(RoleEnum::StoreManager), ['amount_paise' => 2000000, 'reference' => 'rfnd_Q4']);
        $refund = $this->payment($order, PaymentStatus::Refunded);

        $this->assertSame('failed', $refund->zoho_status);
        $this->assertSame('The account is inactive.', $refund->zoho_error);
        $this->assertSame('6001', $refund->zoho_id);
        $this->assertNull($refund->zoho_refund_id);

        unset($this->answers['POST /creditnotes/{id}/refunds']);
        $this->travel(6)->minutes();
        ZohoPayments::sweep();

        // One credit note, ever; the pay-out is what was finished.
        $this->assertCount(1, $this->called('POST', '/creditnotes'));
        $this->assertCount(2, $this->called('POST', '/creditnotes/6001/refunds'));
        $this->assertSame('sent', $refund->fresh()->zoho_status);
        $this->assertSame('6501', $refund->fresh()->zoho_refund_id);
        $this->assertEquals(0, $this->creditBalances['6001']);
    }

    public function test_after_five_refusals_it_is_left_for_a_person_and_said_once_on_the_order(): void
    {
        $this->answers['POST /customerpayments'] = [['code' => 24016, 'message' => 'Please select a valid deposit account.'], 400];
        $order = $this->paidAndDispatched();

        foreach ([6, 31, 121, 721, 721, 721] as $minutes) {
            $this->travel($minutes)->minutes();
            ZohoPayments::sweep();
        }

        $payment = $this->payment($order);
        $this->assertSame(ZohoInvoices::MAX_ATTEMPTS, $payment->zoho_attempts);
        $this->assertCount(ZohoInvoices::MAX_ATTEMPTS, $this->called('POST', '/customerpayments'));
        $this->assertCount(1, array_filter($this->trail($order), fn ($note) => str_contains($note, 'payment for') && str_contains($note, 'not recorded')));
    }

    /* --------------------------------------------------------- the console */

    public function test_the_order_in_the_console_says_where_each_payment_stands_and_sends_one_on_request(): void
    {
        $this->answers['POST /customerpayments'] = [['code' => 24016, 'message' => 'Please select a valid deposit account.'], 400];
        $order = $this->paidAndDispatched();
        $payment = $this->payment($order);
        $other = $this->order();

        $this->as(RoleEnum::StoreManager)->getJson("/api/v1/admin/store/orders/{$order->order_number}")
            ->assertOk()
            ->assertJsonPath('data.payments.0.zoho.kind', 'payment')
            ->assertJsonPath('data.payments.0.zoho.status', 'failed')
            ->assertJsonPath('data.payments.0.zoho.error', 'Please select a valid deposit account.')
            ->assertJsonPath('data.payments.0.zoho.can_send', true);

        $this->getJson('/api/v1/admin/store/orders?zoho=failed')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/store/dashboard')->assertOk()->assertJsonPath('data.attention.zoho_failed', 1);

        // Still refused: Zoho's words come back, on the field and as the message.
        $this->postJson("/api/v1/admin/store/orders/{$order->order_number}/payments/{$payment->id}/zoho")
            ->assertStatus(422)->assertJsonPath('message', 'Please select a valid deposit account.');

        // A payment is addressed through its own order.
        $this->postJson("/api/v1/admin/store/orders/{$other->order_number}/payments/{$payment->id}/zoho")->assertNotFound();

        unset($this->answers['POST /customerpayments']);
        $this->postJson("/api/v1/admin/store/orders/{$order->order_number}/payments/{$payment->id}/zoho")
            ->assertOk()->assertJsonPath('data.status', 'sent');
        $this->postJson("/api/v1/admin/store/orders/{$order->order_number}/payments/{$payment->id}/zoho")
            ->assertStatus(422)->assertJsonPath('message', 'Zoho Books already has this one.');

        $this->getJson('/api/v1/admin/store/orders?zoho=failed')->assertOk()->assertJsonCount(0, 'data');

        $this->as(RoleEnum::ContentManager)
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/payments/{$payment->id}/zoho")->assertForbidden();

        // The customer's own read of the order says nothing about Zoho.
        $this->app['auth']->forgetGuards();
        $public = $this->withHeaders(['Authorization' => ''])->getJson("/api/v1/orders/{$order->order_number}?token={$order->access_token}")->assertOk()->json('data');
        $this->assertStringNotContainsString('zoho', json_encode($public));
    }

    public function test_the_settings_screen_is_offered_zohos_accounts_and_told_what_is_missing(): void
    {
        Setting::put('cod_enabled', '1');
        Setting::put('zoho_books_account_cod', null);

        $this->as(RoleEnum::Admin)->getJson('/api/v1/admin/settings/zoho-books')
            ->assertOk()
            ->assertJsonPath('data.ready', true)
            ->assertJsonPath('data.payments.enabled', true)
            ->assertJsonPath('data.payments.reconnect_needed', false)
            ->assertJsonCount(3, 'data.payments.accounts')
            ->assertJsonPath('data.payments.accounts.2.id', self::CLEARING)
            ->assertJsonPath('data.payments.methods.1.value', 'cod')
            ->assertJsonPath('data.payments.methods.1.offered', true)
            ->assertJsonPath('data.payments.methods.1.account_id', null)
            ->assertJsonPath('data.payments.methods.0.account_id', self::CLEARING)
            ->assertJsonPath('data.payments.missing', ['Choose the account for cash on delivery.']);

        // An id that is not one of Zoho's is refused on save.
        $save = fn (string $value) => $this->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'zoho_books_account_cod', 'value' => $value]]]);
        $save('8002; drop')->assertStatus(422);
        $save(self::CASH)->assertOk();

        // A consent from before payments: the accounts are not asked for, and the screen says to connect again.
        Setting::put('zoho_books_scope_version', null);
        $this->calls = [];
        $this->getJson('/api/v1/admin/settings/zoho-books')
            ->assertOk()
            ->assertJsonPath('data.ready', true)
            ->assertJsonPath('data.payments.reconnect_needed', true)
            ->assertJsonPath('data.payments.accounts', [])
            ->assertJsonPath('data.payments.missing.0', 'Disconnect and connect Zoho again, so this site may record payments and credit notes.');
        $this->assertSame([], $this->called('GET', '/chartofaccounts'));
    }

    public function test_connecting_asks_for_the_wider_consent_and_records_that_it_holds_it(): void
    {
        Setting::put('zoho_books_scope_version', null);
        $this->as(RoleEnum::Admin);

        $url = $this->postJson('/api/v1/admin/settings/zoho-books/authorize', ['redirect_uri' => 'http://localhost:3000/admin/store/settings/zoho/callback'])
            ->assertOk()->json('data.url');
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        foreach (['customerpayments.CREATE', 'creditnotes.CREATE', 'accountants.READ', 'invoices.CREATE'] as $scope) {
            $this->assertStringContainsString("ZohoBooks.{$scope}", $query['scope']);
        }

        $this->postJson('/api/v1/admin/settings/zoho-books/callback', ['code' => 'the-code', 'state' => $query['state']])->assertOk();
        $this->assertTrue(ZohoSettings::scopeCurrent());
    }
}
