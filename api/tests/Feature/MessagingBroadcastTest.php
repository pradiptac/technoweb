<?php

namespace Tests\Feature;

use App\Enums\BroadcastAudience;
use App\Enums\BroadcastStatus;
use App\Enums\CustomerStatus;
use App\Enums\MessageChannel;
use App\Enums\MessageDeliveryStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\SubscriberStatus;
use App\Enums\TemplateApproval;
use App\Jobs\SendBroadcastBatch;
use App\Models\Customer;
use App\Models\MessageBroadcast;
use App\Models\MessageDelivery;
use App\Models\MessageTemplate;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Messaging\Broadcasts;
use App\Support\Messaging\Contacts;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Broadcasts: an audience that is always narrowed to opt-ins, a send that
 * is refused rather than wasted, claimed once, batched, and held to the
 * quiet-hours window.
 */
class MessagingBroadcastTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Setting::put('messaging_whatsapp_provider', 'meta_cloud');
        Setting::put('whatsapp_meta_phone_number_id', '1055');
        Setting::put('whatsapp_meta_access_token', 'tok');
        $this->travelTo(Carbon::parse('2026-09-25 11:00', 'Asia/Kolkata'));
    }

    private function manager(): User
    {
        $user = User::create(['name' => 'Campaigns', 'email' => 'cm@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::CampaignManager->value], ['name' => 'Campaign manager']));

        return $user->load('roles');
    }

    private function customer(string $email, CustomerStatus $status = CustomerStatus::Active): Customer
    {
        return Customer::create(['name' => ucfirst(strtok($email, '@')).' Kumar', 'email' => $email, 'password' => 'password-for-tests', 'status' => $status]);
    }

    private function template(TemplateApproval $approval = TemplateApproval::Approved): MessageTemplate
    {
        return MessageTemplate::create([
            'channel' => MessageChannel::WhatsApp, 'key' => 'diwali', 'name' => 'Diwali sale', 'category' => 'marketing',
            'body' => 'Hi {{first_name}}, the Diwali sale is on.', 'approval_status' => $approval,
        ]);
    }

    public function test_every_audience_is_narrowed_to_opt_ins_on_the_channel(): void
    {
        $asha = $this->customer('asha@example.test');
        $ravi = $this->customer('ravi@example.test', CustomerStatus::Suspended);
        Contacts::optIn(MessageChannel::WhatsApp, '9876500001', $asha->id, 'portal');
        Contacts::optIn(MessageChannel::WhatsApp, '9876500002', $ravi->id, 'portal');
        Contacts::optIn(MessageChannel::WhatsApp, '9876500003', null, 'checkout');
        Contacts::optIn(MessageChannel::WhatsApp, '9876500004', null, 'checkout');
        Contacts::optOut(MessageChannel::WhatsApp, '9876500004', 'stop');
        Contacts::optIn(MessageChannel::Rcs, '9876500005', $asha->id, 'portal');

        $count = fn (BroadcastAudience $a, ?int $group = null, ?int $product = null) => Broadcasts::audience(MessageChannel::WhatsApp, $a, $group, $product)->count();

        $this->assertSame(3, $count(BroadcastAudience::OptIns));
        $this->assertSame(1, $count(BroadcastAudience::Customers), 'only an active account');

        $group = NewsletterGroup::create(['name' => 'Partners', 'slug' => 'partners', 'is_active' => true]);
        $sub = NewsletterSubscriber::firstOrCreate(['email' => 'asha@example.test'], ['status' => SubscriberStatus::Active]);
        $group->subscribers()->attach($sub->id);
        $this->assertSame(1, $count(BroadcastAudience::NewsletterGroup, $group->id));
        $this->assertSame(0, $count(BroadcastAudience::NewsletterGroup, null));

        // Wishlists are stream C's; until its tables exist this is nobody.
        $this->assertSame(0, $count(BroadcastAudience::Wishlist, null, 1));
    }

    public function test_a_send_is_refused_rather_than_wasted(): void
    {
        Sanctum::actingAs($this->manager(), [], 'sanctum');
        $pending = $this->template(TemplateApproval::Pending);

        $id = $this->postJson('/api/v1/admin/messaging/broadcasts', [
            'name' => 'Diwali', 'channel' => 'whatsapp', 'message_template_id' => $pending->id, 'audience' => 'opt_ins',
        ])->assertCreated()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.audience_count', 0)->json('data.id');

        $errors = $this->postJson("/api/v1/admin/messaging/broadcasts/{$id}/send")->assertStatus(422)->json('errors.send');
        $this->assertContains('The template is not approved yet — WhatsApp sends only approved templates.', $errors);
        $this->assertContains('Nobody in that audience has opted in on this channel.', $errors);

        $push = MessageTemplate::create(['channel' => MessageChannel::Push, 'key' => 'p', 'name' => 'P', 'body' => 'x', 'approval_status' => TemplateApproval::NotRequired]);
        $this->patchJson("/api/v1/admin/messaging/broadcasts/{$id}", ['message_template_id' => $push->id])
            ->assertStatus(422)->assertJsonValidationErrors('message_template_id');
        $this->patchJson("/api/v1/admin/messaging/broadcasts/{$id}", ['audience' => 'newsletter_group'])
            ->assertStatus(422)->assertJsonValidationErrors('newsletter_group_id');
    }

    public function test_sending_freezes_the_audience_once_and_the_batches_deliver_it(): void
    {
        Queue::fake();
        Sanctum::actingAs($this->manager(), [], 'sanctum');
        $asha = $this->customer('asha@example.test');
        Contacts::optIn(MessageChannel::WhatsApp, '9876500001', $asha->id, 'portal');
        Contacts::optIn(MessageChannel::WhatsApp, '9876500002', null, 'checkout');

        $id = $this->postJson('/api/v1/admin/messaging/broadcasts', [
            'name' => 'Diwali', 'channel' => 'whatsapp', 'message_template_id' => $this->template()->id, 'audience' => 'opt_ins',
        ])->assertCreated()->json('data.id');

        $this->getJson('/api/v1/admin/messaging/broadcasts/audience?channel=whatsapp&audience=opt_ins')->assertOk()->assertJsonPath('data.count', 2);

        $this->postJson("/api/v1/admin/messaging/broadcasts/{$id}/send")->assertOk()
            ->assertJsonPath('data.status', 'sending')->assertJsonPath('data.recipient_count', 2);
        // A second press finds it claimed.
        $this->postJson("/api/v1/admin/messaging/broadcasts/{$id}/send")->assertStatus(422);
        $this->assertNull(Broadcasts::queue(MessageBroadcast::find($id)));

        $this->assertSame(2, MessageDelivery::query()->where('message_broadcast_id', $id)->count());
        $this->assertSame('Asha Kumar', MessageDelivery::query()->where('address', '+919876500001')->sole()->vars['customer_name']);

        $pushed = [];
        Queue::assertPushed(SendBroadcastBatch::class, function (SendBroadcastBatch $job) use (&$pushed) {
            $pushed[] = $job;

            return true;
        });

        Http::fake(['graph.facebook.com/*' => Http::sequence()
            ->push(['messages' => [['id' => 'wamid.1']]])
            ->push(['error' => ['message' => 'Recipient phone number not in allowed list']], 400)]);

        $pushed[0]->handle();

        $broadcast = MessageBroadcast::find($id);
        $this->assertSame(BroadcastStatus::Sent, $broadcast->status);
        $report = $this->getJson("/api/v1/admin/messaging/broadcasts/{$id}")->assertOk()->json('data.report');
        $this->assertSame(1, $report['counts']['sent']);
        $this->assertSame(1, $report['counts']['failed']);
        $this->assertSame('Meta answered 400: Recipient phone number not in allowed list', $report['failures'][0]['error']);
        $this->assertSame(0.0, (float) $report['delivery_rate']);
    }

    public function test_a_batch_woken_outside_the_window_puts_itself_back(): void
    {
        Queue::fake();
        Contacts::optIn(MessageChannel::WhatsApp, '9876500001', null, 'checkout');
        $broadcast = MessageBroadcast::create(['name' => 'Late', 'channel' => MessageChannel::WhatsApp, 'message_template_id' => $this->template()->id, 'audience' => BroadcastAudience::OptIns, 'status' => BroadcastStatus::Draft]);
        Broadcasts::queue($broadcast);

        $this->travelTo(Carbon::parse('2026-09-25 23:30', 'Asia/Kolkata'));
        Http::fake();

        (new SendBroadcastBatch($broadcast->id, MessageDelivery::pluck('id')->all()))->handle();

        Http::assertNothingSent();
        $this->assertSame(MessageDeliveryStatus::Pending, MessageDelivery::sole()->status);
        Queue::assertPushed(SendBroadcastBatch::class, fn (SendBroadcastBatch $job) => $job->delay !== null
            && Carbon::instance($job->delay)->equalTo(Carbon::parse('2026-09-26 09:00', 'Asia/Kolkata')));
    }

    public function test_a_scheduled_broadcast_is_queued_by_the_command_and_cancelling_skips_the_rest(): void
    {
        Queue::fake();
        Sanctum::actingAs($this->manager(), [], 'sanctum');
        Contacts::optIn(MessageChannel::WhatsApp, '9876500001', null, 'checkout');

        $id = $this->postJson('/api/v1/admin/messaging/broadcasts', [
            'name' => 'Later', 'channel' => 'whatsapp', 'message_template_id' => $this->template()->id, 'audience' => 'opt_ins',
        ])->json('data.id');

        $this->postJson("/api/v1/admin/messaging/broadcasts/{$id}/send", ['scheduled_at' => '2026-09-25T15:00:00+05:30'])
            ->assertOk()->assertJsonPath('data.status', 'scheduled');
        $this->patchJson("/api/v1/admin/messaging/broadcasts/{$id}", ['name' => 'Edited'])->assertStatus(422);

        $this->artisan('technoware:send-broadcasts')->assertSuccessful();
        $this->assertSame(BroadcastStatus::Scheduled, MessageBroadcast::find($id)->status, 'not due yet');

        $this->travelTo(Carbon::parse('2026-09-25 15:01', 'Asia/Kolkata'));
        $this->artisan('technoware:send-broadcasts')->assertSuccessful();
        $this->assertSame(BroadcastStatus::Sending, MessageBroadcast::find($id)->status);

        $this->postJson("/api/v1/admin/messaging/broadcasts/{$id}/cancel")->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame(MessageDeliveryStatus::Skipped, MessageDelivery::sole()->status);
        $this->deleteJson("/api/v1/admin/messaging/broadcasts/{$id}")->assertNoContent();
    }
}
