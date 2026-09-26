<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\MessageChannel;
use App\Enums\MessageDeliveryStatus;
use App\Enums\MessageEvent;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TemplateApproval;
use App\Enums\TicketStatus;
use App\Jobs\SendChannelMessage;
use App\Models\Customer;
use App\Models\MessageAutomation;
use App\Models\MessageContact;
use App\Models\MessageDelivery;
use App\Models\MessageTemplate;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Support\Messaging\ChannelSender;
use App\Support\Messaging\Contacts;
use App\Support\Messaging\MessageRecipient;
use App\Support\Messaging\Messenger;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The messaging module's rules, each with a test that fails if it is quietly
 * dropped:
 *
 *   1. **Nothing is sent without an opt-in, an automation and an approved
 *      template on a configured channel.**
 *   2. **A promotional event waits for the quiet-hours window**, and is held
 *      rather than dropped.
 *   3. **An internal ticket note never reaches a phone**, only a
 *      customer-visible reply does.
 *   4. **Consent comes from the person**: the checkout box and the portal
 *      toggle opt in, a staff member viewing as a customer cannot, and no
 *      console route creates a contact.
 *   5. **Provider keys stay with administrators**; templates, automations
 *      and contacts are the campaign and store managers'.
 */
class MessagingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function staff(RoleEnum $role, string $email = 'staff@example.test'): User
    {
        $user = User::create(['name' => 'Staff '.$role->value, 'email' => $email, 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user->load('roles');
    }

    private function whatsAppReady(): void
    {
        Setting::put('messaging_whatsapp_provider', 'meta_cloud');
        Setting::put('whatsapp_meta_phone_number_id', '1055');
        Setting::put('whatsapp_meta_access_token', 'tok');
    }

    private function automate(MessageEvent $event, MessageChannel $channel, TemplateApproval $approval = TemplateApproval::Approved): MessageTemplate
    {
        $template = MessageTemplate::create([
            'channel' => $channel, 'key' => $event->value.'_'.$channel->value, 'name' => $event->label(),
            'body' => 'Hi {{first_name}}, {{order_number}} is on its way.', 'language' => 'en', 'category' => 'utility',
            'approval_status' => $channel->needsApproval() ? $approval : TemplateApproval::NotRequired,
        ]);

        MessageAutomation::create(['event' => $event, 'channel' => $channel, 'message_template_id' => $template->id, 'is_enabled' => true]);

        return $template;
    }

    public function test_the_quiet_hours_settings_are_seeded(): void
    {
        $this->assertSame('09:00', Setting::get('messaging_promo_start'));
        $this->assertSame('21:00', Setting::get('messaging_promo_end'));
        $this->assertTrue(Setting::query()->where('key', 'whatsapp_meta_access_token')->value('is_secret'));
    }

    public function test_nothing_is_queued_without_an_automation_an_opt_in_or_a_ready_channel(): void
    {
        Queue::fake();
        Contacts::optIn(MessageChannel::WhatsApp, '9876543210', null, 'checkout');

        // No automation.
        Messenger::notify(MessageEvent::OrderPaid, new MessageRecipient(null, '9876543210', 'Neil Basu'), ['order_number' => 'TW-1']);
        // An automation, but the channel is not configured.
        $this->automate(MessageEvent::OrderPaid, MessageChannel::WhatsApp);
        Messenger::notify(MessageEvent::OrderPaid, new MessageRecipient(null, '9876543210', 'Neil Basu'), ['order_number' => 'TW-1']);
        // Configured, but this number never opted in.
        $this->whatsAppReady();
        Messenger::notify(MessageEvent::OrderPaid, new MessageRecipient(null, '9123456780', 'Somebody Else'), ['order_number' => 'TW-1']);

        $this->assertSame(0, MessageDelivery::count());
        Queue::assertNothingPushed();
    }

    public function test_an_event_queues_one_delivery_per_active_contact_with_the_values_filled(): void
    {
        Queue::fake();
        $this->whatsAppReady();
        $template = $this->automate(MessageEvent::OrderPaid, MessageChannel::WhatsApp);
        $contact = Contacts::optIn(MessageChannel::WhatsApp, '+91 98765 43210', null, 'checkout');

        Messenger::notify(MessageEvent::OrderPaid, new MessageRecipient(null, '09876543210', 'Neil Basu'), ['order_number' => 'TW-10042']);

        $delivery = MessageDelivery::sole();
        $this->assertSame($contact->id, $delivery->message_contact_id);
        $this->assertSame($template->id, $delivery->message_template_id);
        $this->assertSame(MessageEvent::OrderPaid, $delivery->event);
        $this->assertEquals(['order_number' => 'TW-10042', 'customer_name' => 'Neil Basu', 'first_name' => 'Neil', 'site_name' => Setting::get('company_name', 'Technoware')], $delivery->vars);
        Queue::assertPushed(SendChannelMessage::class, fn (SendChannelMessage $job) => $job->deliveryId === $delivery->id);

        // The worker sends it through the provider and records the id.
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.1']]])]);
        $this->assertSame(ChannelSender::SENT, ChannelSender::deliver($delivery));
        $this->assertSame('wamid.1', $delivery->refresh()->provider_message_id);
        $this->assertSame(MessageDeliveryStatus::Sent, $delivery->status);
    }

    public function test_an_unapproved_whatsapp_template_sends_nothing(): void
    {
        Queue::fake();
        $this->whatsAppReady();
        $this->automate(MessageEvent::OrderPaid, MessageChannel::WhatsApp, TemplateApproval::Pending);
        Contacts::optIn(MessageChannel::WhatsApp, '9876543210', null, 'checkout');

        Messenger::notify(MessageEvent::OrderPaid, new MessageRecipient(null, '9876543210', 'Neil'), []);

        $this->assertSame(0, MessageDelivery::count());
    }

    public function test_a_promotional_event_after_nine_waits_for_nine_the_next_morning(): void
    {
        Queue::fake();
        $this->whatsAppReady();
        $this->automate(MessageEvent::CartReminder1, MessageChannel::WhatsApp);
        Contacts::optIn(MessageChannel::WhatsApp, '9876543210', null, 'checkout');

        $this->travelTo(Carbon::parse('2026-09-25 22:30', 'Asia/Kolkata'));
        Messenger::notify(MessageEvent::CartReminder1, new MessageRecipient(null, '9876543210', 'Neil'), ['basket_url' => 'https://x.test/b']);

        Queue::assertPushed(SendChannelMessage::class, function (SendChannelMessage $job) {
            return $job->delay !== null && Carbon::instance($job->delay)->equalTo(Carbon::parse('2026-09-26 09:00', 'Asia/Kolkata'));
        });

        // A transactional one at the same hour goes at once.
        $this->automate(MessageEvent::OrderDispatched, MessageChannel::WhatsApp);
        Messenger::notify(MessageEvent::OrderDispatched, new MessageRecipient(null, '9876543210', 'Neil'), []);
        Queue::assertPushed(SendChannelMessage::class, fn (SendChannelMessage $job) => $job->delay === null);

        // And the worker holds a promotional one reached outside the window.
        $held = MessageDelivery::query()->where('event', MessageEvent::CartReminder1->value)->sole();
        $this->assertSame(ChannelSender::LATER, ChannelSender::deliver($held));
        $this->assertSame(MessageDeliveryStatus::Pending, $held->refresh()->status);
    }

    public function test_the_worker_skips_a_contact_who_opted_out_after_it_was_queued(): void
    {
        Queue::fake();
        $this->whatsAppReady();
        $this->automate(MessageEvent::OrderPaid, MessageChannel::WhatsApp);
        Contacts::optIn(MessageChannel::WhatsApp, '9876543210', null, 'checkout');
        Messenger::notify(MessageEvent::OrderPaid, new MessageRecipient(null, '9876543210', 'Neil'), []);

        Contacts::optOut(MessageChannel::WhatsApp, '9876543210', 'stop');
        Http::fake();

        $delivery = MessageDelivery::sole();
        $this->assertSame(ChannelSender::SKIPPED, ChannelSender::deliver($delivery));
        $this->assertSame(MessageDeliveryStatus::Skipped, $delivery->refresh()->status);
        Http::assertNothingSent();
    }

    private function basket(): string
    {
        $product = StoreProduct::create([
            'name' => 'A switch', 'slug' => 'a-switch', 'type' => ProductType::Physical, 'status' => PublishStatus::Published,
            'price_paise' => 1180000, 'track_stock' => true, 'stock' => 5,
        ]);

        return $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertCreated()->json('data.token');
    }

    /** @return array<string, mixed> */
    private function checkoutDetails(array $extra = []): array
    {
        return $extra + [
            'name' => 'Neil Basu', 'email' => 'neil@example.test', 'phone' => '+91 98765 43210',
            'address' => ['line1' => '12 Example Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
        ];
    }

    public function test_the_checkout_box_opts_the_number_in_and_the_order_placed_message_reaches_it(): void
    {
        Queue::fake();
        $this->whatsAppReady();
        $this->automate(MessageEvent::OrderPlaced, MessageChannel::WhatsApp);

        $this->withHeaders(['X-Cart-Token' => $this->basket()])
            ->postJson('/api/v1/checkout', $this->checkoutDetails(['message_opt_in' => ['whatsapp', 'rcs']]))
            ->assertCreated();

        // WhatsApp is ready and RCS is not, so only WhatsApp is recorded.
        $contact = MessageContact::sole();
        $this->assertSame(MessageChannel::WhatsApp, $contact->channel);
        $this->assertSame('+919876543210', $contact->address);
        $this->assertSame('checkout', $contact->source);

        $delivery = MessageDelivery::sole();
        $this->assertSame(MessageEvent::OrderPlaced, $delivery->event);
        $this->assertStringStartsWith('ORD-', (string) $delivery->vars['order_number']);
        $this->assertStringContainsString('₹', (string) $delivery->vars['order_total']);
    }

    public function test_a_checkout_without_the_box_records_no_consent(): void
    {
        Queue::fake();
        $this->whatsAppReady();

        $this->withHeaders(['X-Cart-Token' => $this->basket()])->postJson('/api/v1/checkout', $this->checkoutDetails())->assertCreated();
        $this->withHeaders(['X-Cart-Token' => $this->basket2()])->postJson('/api/v1/checkout', $this->checkoutDetails(['message_opt_in' => ['email']]))
            ->assertStatus(422)->assertJsonValidationErrors('message_opt_in.0');

        $this->assertSame(0, MessageContact::count());
    }

    private function basket2(): string
    {
        return $this->postJson('/api/v1/cart/items', ['product_id' => StoreProduct::first()->id, 'quantity' => 1])->assertCreated()->json('data.token');
    }

    public function test_an_internal_note_never_reaches_a_phone_and_a_reply_does(): void
    {
        Queue::fake();
        $this->whatsAppReady();
        $this->automate(MessageEvent::TicketReplied, MessageChannel::WhatsApp);

        $customer = Customer::create(['name' => 'Neil Basu', 'email' => 'neil@example.test', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active, 'phone' => '9876543210']);
        Contacts::optIn(MessageChannel::WhatsApp, '9876543210', $customer->id, 'portal');
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);
        $ticket = Ticket::create(['customer_id' => $customer->id, 'ticket_category_id' => $category->id, 'subject' => 'Switch reboots', 'description' => 'Twice a day.', 'status' => TicketStatus::Open, 'priority' => 'normal']);

        Sanctum::actingAs($this->staff(RoleEnum::SupportEngineer), [], 'sanctum');

        $this->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => 'Engineering note: check the PSU.', 'is_internal' => true])->assertCreated();
        $this->assertSame(0, MessageDelivery::count());

        $this->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => 'We are sending an engineer.'])->assertCreated();
        $delivery = MessageDelivery::sole();
        $this->assertSame(MessageEvent::TicketReplied, $delivery->event);
        $this->assertSame($ticket->reference, $delivery->vars['reference']);
        $this->assertStringEndsWith('/portal/tickets/'.$ticket->reference, (string) $delivery->vars['ticket_url']);
    }

    private function pushReady(): void
    {
        Setting::put('messaging_push_provider', 'fcm');
        Setting::put('push_fcm_service_account', (string) json_encode(['client_email' => 'x@y.iam.gserviceaccount.com', 'private_key' => 'k', 'project_id' => 'p']));
    }

    public function test_the_push_bell_subscribes_a_guest_and_stamps_a_signed_in_customer(): void
    {
        $token = str_repeat('abc123_', 20);

        // Push is off: 202 and nothing written.
        $this->postJson('/api/v1/messaging/push/subscribe', ['token' => $token])->assertStatus(202);
        $this->assertSame(0, MessageContact::count());

        $this->pushReady();
        $this->postJson('/api/v1/messaging/push/subscribe', ['token' => $token])->assertStatus(202);
        $this->assertNull(MessageContact::sole()->customer_id);

        $customer = Customer::create(['name' => 'Neil Basu', 'email' => 'neil@example.test', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active]);
        $bearer = $customer->createToken('portal', ['portal'])->plainTextToken;
        $this->postJson('/api/v1/messaging/push/subscribe', ['token' => $token], ['Authorization' => 'Bearer '.$bearer])->assertStatus(202);
        $this->assertSame($customer->id, MessageContact::sole()->customer_id);

        $this->postJson('/api/v1/messaging/push/unsubscribe', ['token' => $token])->assertStatus(202);
        $this->assertFalse(MessageContact::sole()->isActive());
    }

    public function test_portal_preferences_opt_in_the_account_number_and_out_everywhere(): void
    {
        $this->whatsAppReady();
        $customer = Customer::create(['name' => 'Neil Basu', 'email' => 'neil@example.test', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active]);
        Sanctum::actingAs($customer, ['portal'], 'sanctum');

        $this->patchJson('/api/v1/messaging/preferences', ['whatsapp' => true])
            ->assertStatus(422)->assertJsonValidationErrors('whatsapp');

        $customer->update(['phone' => '98765 43210']);
        $this->patchJson('/api/v1/messaging/preferences', ['whatsapp' => true])->assertOk()
            ->assertJsonPath('data.channels.0.opted_in', true)->assertJsonPath('data.phone', '+919876543210');

        $this->getJson('/api/v1/messaging/preferences')->assertOk()->assertJsonPath('data.channels.0.live', true);

        $this->patchJson('/api/v1/messaging/preferences', ['whatsapp' => false])->assertOk()->assertJsonPath('data.channels.0.opted_in', false);
        $this->assertSame('portal', MessageContact::sole()->opt_out_reason);
    }

    public function test_a_staff_member_viewing_as_a_customer_cannot_opt_them_in(): void
    {
        $this->whatsAppReady();
        $customer = Customer::create(['name' => 'Neil Basu', 'email' => 'neil@example.test', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active, 'phone' => '9876543210']);
        Sanctum::actingAs($customer, ['portal', Customer::IMPERSONATION_ABILITY], 'sanctum');

        $this->patchJson('/api/v1/messaging/preferences', ['whatsapp' => true])->assertStatus(422)->assertJsonValidationErrors('whatsapp');
        $this->assertSame(0, MessageContact::count());
    }

    public function test_messaging_settings_are_validated_and_stay_secret(): void
    {
        Sanctum::actingAs($this->staff(RoleEnum::Admin, 'admin@example.test'), [], 'sanctum');

        $row = fn (string $key, ?string $value) => ['settings' => [['key' => $key, 'value' => $value]]];

        $this->patchJson('/api/v1/admin/settings', $row('messaging_whatsapp_provider', 'carrier_pigeon'))->assertStatus(422);
        $this->patchJson('/api/v1/admin/settings', $row('messaging_promo_start', '9am'))->assertStatus(422);
        $this->patchJson('/api/v1/admin/settings', $row('messaging_promo_end', '08:00'))->assertStatus(422);
        $this->patchJson('/api/v1/admin/settings', $row('push_fcm_service_account', '{"not":"a key"}'))->assertStatus(422);

        $this->patchJson('/api/v1/admin/settings', ['settings' => [
            ['key' => 'messaging_whatsapp_provider', 'value' => 'twilio'],
            ['key' => 'whatsapp_twilio_auth_token', 'value' => 'very-secret'],
            ['key' => 'messaging_promo_start', 'value' => '10:00'],
        ]])->assertOk();

        $all = collect($this->getJson('/api/v1/admin/settings')->assertOk()->json('data.messaging'));
        $this->assertNull($all->firstWhere('key', 'whatsapp_twilio_auth_token')['value']);
        $this->assertTrue($all->firstWhere('key', 'whatsapp_twilio_auth_token')['is_set']);
        $this->assertSame(['', 'meta_cloud', 'gupshup', 'twilio'], array_column($all->firstWhere('key', 'messaging_whatsapp_provider')['options'], 'value'));

        // The public map carries the browser half and the live bits, never a key.
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertArrayNotHasKey('whatsapp_twilio_auth_token', $public);
        $this->assertArrayNotHasKey('messaging_whatsapp_provider', $public);
        $this->assertSame('0', $public['messaging_whatsapp_live']);
        $this->assertSame('0', $public['push_live']);
    }

    public function test_the_channel_test_sends_a_fixed_body_and_keeps_the_banner_honest(): void
    {
        Sanctum::actingAs($this->staff(RoleEnum::Admin, 'admin@example.test'), [], 'sanctum');

        $this->postJson('/api/v1/admin/settings/messaging/test', ['channel' => 'whatsapp', 'to' => '9876543210'])->assertStatus(422);

        $this->whatsAppReady();
        Http::fake(['graph.facebook.com/*' => Http::sequence()
            ->push(['error' => ['message' => 'Invalid OAuth access token.']], 401)
            ->push(['messages' => [['id' => 'wamid.T']]])]);

        $this->postJson('/api/v1/admin/settings/messaging/test', ['channel' => 'whatsapp', 'to' => 'junk'])->assertStatus(422)->assertJsonValidationErrors('to');
        $this->postJson('/api/v1/admin/settings/messaging/test', ['channel' => 'whatsapp', 'to' => '9876543210'])
            ->assertStatus(422)->assertJsonPath('message', 'Meta answered 401: Invalid OAuth access token.');
        $this->assertStringStartsWith('Meta answered 401', (string) Setting::get('messaging_whatsapp_error'));

        $this->postJson('/api/v1/admin/settings/messaging/test', ['channel' => 'whatsapp', 'to' => '9876543210'])
            ->assertOk()->assertJsonPath('data.sent_to', '+919876543210');
        $this->assertNull(Setting::get('messaging_whatsapp_error'));

        $status = $this->getJson('/api/v1/admin/settings/messaging')->assertOk();
        $status->assertJsonPath('data.channels.0.provider', 'meta_cloud')->assertJsonPath('data.channels.0.ready', true);
        $this->assertStringEndsWith('/api/v1/messaging/webhooks/whatsapp/meta_cloud', $status->json('data.channels.0.providers.0.webhook_url'));
    }

    public function test_templates_and_automations_belong_to_campaign_and_store_managers_and_keys_to_admins(): void
    {
        foreach ([RoleEnum::CampaignManager, RoleEnum::StoreManager] as $i => $role) {
            Sanctum::actingAs($this->staff($role, "m{$i}@example.test"), [], 'sanctum');
            $this->getJson('/api/v1/admin/messaging/templates')->assertOk();
            $this->getJson('/api/v1/admin/messaging/automations')->assertOk();
            $this->getJson('/api/v1/admin/messaging/broadcasts')->assertOk();
            $this->getJson('/api/v1/admin/messaging/contacts')->assertOk();
            $this->getJson('/api/v1/admin/settings/messaging')->assertForbidden();
        }

        Sanctum::actingAs($this->staff(RoleEnum::SupportEngineer, 'se@example.test'), [], 'sanctum');
        $this->getJson('/api/v1/admin/messaging/templates')->assertForbidden();
    }

    public function test_a_template_edited_after_approval_goes_back_to_not_submitted(): void
    {
        Sanctum::actingAs($this->staff(RoleEnum::CampaignManager), [], 'sanctum');

        $id = $this->postJson('/api/v1/admin/messaging/templates', [
            'channel' => 'whatsapp', 'key' => 'order_paid', 'name' => 'Order paid', 'body' => 'Paid: {{order_number}}',
            'buttons' => [['type' => 'phone', 'text' => 'Call us', 'value' => '98765 43210']],
        ])->assertCreated()->assertJsonPath('data.approval_status', 'draft')->assertJsonPath('data.category', 'utility')
            ->assertJsonPath('data.buttons.0.value', '+919876543210')->json('data.id');

        // One key per channel; the same key on push is fine.
        $this->postJson('/api/v1/admin/messaging/templates', ['channel' => 'whatsapp', 'key' => 'order_paid', 'name' => 'x', 'body' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrors('key');
        $this->postJson('/api/v1/admin/messaging/templates', ['channel' => 'push', 'key' => 'order_paid', 'name' => 'x', 'body' => 'x'])
            ->assertCreated()->assertJsonPath('data.approval_status', 'not_required');

        $this->postJson('/api/v1/admin/messaging/templates', ['channel' => 'rcs', 'key' => 'bad_button', 'name' => 'x', 'body' => 'x', 'buttons' => [['type' => 'url', 'text' => 'Go', 'value' => 'http://plain.test']]])
            ->assertStatus(422)->assertJsonValidationErrors('buttons.0.value');

        MessageTemplate::find($id)->update(['approval_status' => TemplateApproval::Approved]);
        $this->patchJson("/api/v1/admin/messaging/templates/{$id}", ['name' => 'Renamed'])->assertOk()->assertJsonPath('data.approval_status', 'approved');
        $this->patchJson("/api/v1/admin/messaging/templates/{$id}", ['body' => 'Paid, thank you: {{order_number}}'])->assertOk()->assertJsonPath('data.approval_status', 'draft');
        $this->patchJson("/api/v1/admin/messaging/templates/{$id}", ['channel' => 'push'])->assertStatus(422);
    }

    public function test_the_automations_table_is_the_full_grid_and_refuses_a_switch_with_no_template(): void
    {
        Sanctum::actingAs($this->staff(RoleEnum::StoreManager), [], 'sanctum');
        $grid = $this->getJson('/api/v1/admin/messaging/automations')->assertOk()->json('data');
        $this->assertCount(count(MessageEvent::cases()) * count(MessageChannel::cases()), $grid);

        $push = MessageTemplate::create(['channel' => MessageChannel::Push, 'key' => 'p', 'name' => 'P', 'body' => 'x', 'approval_status' => TemplateApproval::NotRequired]);
        $wa = MessageTemplate::create(['channel' => MessageChannel::WhatsApp, 'key' => 'w', 'name' => 'W', 'body' => 'x', 'approval_status' => TemplateApproval::Pending]);

        $this->putJson('/api/v1/admin/messaging/automations', ['rows' => [['event' => 'order_paid', 'channel' => 'whatsapp', 'message_template_id' => null, 'is_enabled' => true]]])
            ->assertStatus(422)->assertJsonValidationErrors('rows.0.is_enabled');
        $this->putJson('/api/v1/admin/messaging/automations', ['rows' => [['event' => 'order_paid', 'channel' => 'whatsapp', 'message_template_id' => $push->id, 'is_enabled' => true]]])
            ->assertStatus(422)->assertJsonValidationErrors('rows.0.message_template_id');

        $rows = collect($this->putJson('/api/v1/admin/messaging/automations', ['rows' => [
            ['event' => 'order_paid', 'channel' => 'whatsapp', 'message_template_id' => $wa->id, 'is_enabled' => true],
        ]])->assertOk()->json('data'));

        $cell = $rows->first(fn ($r) => $r['event'] === 'order_paid' && $r['channel'] === 'whatsapp');
        $this->assertTrue($cell['is_enabled']);
        $this->assertFalse($cell['live']);
        $this->assertSame('WhatsApp is not configured.', $cell['reason']);
    }

    public function test_contacts_are_listed_by_channel_and_staff_can_only_record_an_opt_out(): void
    {
        Sanctum::actingAs($this->staff(RoleEnum::CampaignManager), [], 'sanctum');
        $contact = Contacts::optIn(MessageChannel::WhatsApp, '9876543210', null, 'checkout');
        Contacts::optIn(MessageChannel::Push, str_repeat('tok_', 20), null, 'push_bell');

        $this->getJson('/api/v1/admin/messaging/contacts?channel=push')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.address', 'tok_tok_tok_…')
            ->assertJsonPath('meta.channels.0.active', 1);

        $this->postJson("/api/v1/admin/messaging/contacts/{$contact->id}/opt-out")->assertOk()->assertJsonPath('data.is_active', false);
        $this->postJson('/api/v1/admin/messaging/contacts', [])->assertStatus(405);
        $this->getJson('/api/v1/admin/messaging/contacts?status=active')->assertJsonCount(1, 'data');
    }
}
