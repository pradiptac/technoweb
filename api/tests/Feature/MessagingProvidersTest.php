<?php

namespace Tests\Feature;

use App\Enums\MessageChannel;
use App\Enums\MessageDeliveryStatus;
use App\Enums\TemplateApproval;
use App\Models\MessageContact;
use App\Models\MessageDelivery;
use App\Models\MessageTemplate;
use App\Models\Setting;
use App\Support\Messaging\ChannelSender;
use App\Support\Messaging\Contacts;
use App\Support\Messaging\Providers\Fcm;
use App\Support\Messaging\Providers\GoogleRbm;
use App\Support\Messaging\Providers\GupshupRcs;
use App\Support\Messaging\Providers\GupshupWhatsApp;
use App\Support\Messaging\Providers\MetaCloudWhatsApp;
use App\Support\Messaging\Providers\OutgoingMessage;
use App\Support\Messaging\Providers\ProviderException;
use App\Support\Messaging\Providers\TwilioWhatsApp;
use App\Support\Messaging\TemplateSync;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use ReflectionClassConstant;
use Tests\TestCase;

/**
 * Every provider against faked responses — no SDK, so `Http::fake()` sees
 * exactly what goes on the wire. Each has its send, its test, what it
 * reads back (template sync, a webhook) and the refusal that matters:
 * a webhook that does not verify writes nothing, and a dead push token
 * opts its contact out.
 */
class MessagingProvidersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    /** @param  array<string, string>  $values */
    private function configure(array $values): void
    {
        foreach ($values as $key => $value) {
            $this->assertTrue(Setting::put($key, $value), "{$key} is not a seeded setting.");
        }
    }

    private function serviceAccount(): string
    {
        return (string) json_encode([
            'client_email' => 'rbm@project.iam.gserviceaccount.com',
            'private_key' => (new ReflectionClassConstant(SearchConsoleTest::class, 'TEST_KEY'))->getValue(),
            'project_id' => 'technoware-push',
        ]);
    }

    private function template(MessageChannel $channel, array $attributes = []): MessageTemplate
    {
        return MessageTemplate::create($attributes + [
            'channel' => $channel,
            'key' => 'order_paid',
            'name' => 'Order paid',
            'body' => 'Hi {{first_name}}, we have your payment for {{order_number}} — {{order_total}}. Thank you, {{first_name}}.',
            'language' => 'en',
            'category' => 'utility',
            'approval_status' => $channel->needsApproval() ? TemplateApproval::Approved : TemplateApproval::NotRequired,
        ]);
    }

    private function message(MessageTemplate $template, string $to = '+919876543210'): OutgoingMessage
    {
        return new OutgoingMessage($to, $template, ['first_name' => 'Neil', 'order_number' => 'TW-10042', 'order_total' => '₹12,400'], 'https://api.example.test/cb');
    }

    public function test_meta_sends_a_named_parameter_template_and_its_test_is_hello_world(): void
    {
        $this->configure(['whatsapp_meta_phone_number_id' => '1055', 'whatsapp_meta_access_token' => 'EAAG-token']);
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.ABC']]])]);

        $client = new MetaCloudWhatsApp;
        $this->assertTrue($client->configured());
        $this->assertSame('wamid.ABC', $client->send($this->message($this->template(MessageChannel::WhatsApp))));
        $client->test('+919876543210');

        Http::assertSent(function (ClientRequest $r) {
            $body = $r->data();

            return $r->url() === MetaCloudWhatsApp::BASE.'/1055/messages'
                && $r->hasHeader('Authorization', 'Bearer EAAG-token')
                && $body['to'] === '919876543210'
                && $body['template']['name'] === 'order_paid'
                // Each name once, in order of first use.
                && array_column($body['template']['components'][0]['parameters'], 'parameter_name') === ['first_name', 'order_number', 'order_total']
                && $body['template']['components'][0]['parameters'][1]['text'] === 'TW-10042';
        });

        Http::assertSent(fn (ClientRequest $r) => ($r->data()['template']['name'] ?? null) === 'hello_world');
    }

    public function test_meta_refusal_carries_its_own_words_and_a_401_is_a_configuration_failure(): void
    {
        $this->configure(['whatsapp_meta_phone_number_id' => '1055', 'whatsapp_meta_access_token' => 'expired']);
        Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['message' => 'Error validating access token: Session has expired']], 401)]);

        try {
            (new MetaCloudWhatsApp)->test('+919876543210');
            $this->fail('A 401 must throw.');
        } catch (ProviderException $e) {
            $this->assertSame('Meta answered 401: Error validating access token: Session has expired', $e->getMessage());
            $this->assertTrue($e->config);
        }
    }

    public function test_meta_submits_and_syncs_templates(): void
    {
        $this->configure(['whatsapp_meta_phone_number_id' => '1055', 'whatsapp_meta_access_token' => 'tok', 'whatsapp_meta_business_account_id' => '9001']);
        $meta = MessageChannel::WhatsApp->settingKey();
        $this->configure([$meta => 'meta_cloud']);

        $template = $this->template(MessageChannel::WhatsApp, ['approval_status' => TemplateApproval::Draft, 'buttons' => [['type' => 'url', 'text' => 'Track', 'value' => 'https://www.technoware.in/store']]]);

        Http::fake([
            'graph.facebook.com/v21.0/9001/message_templates?*' => Http::response(['data' => [
                ['id' => '777', 'name' => 'order_paid', 'language' => 'en', 'status' => 'REJECTED', 'rejected_reason' => 'INVALID_FORMAT'],
                ['id' => '778', 'name' => 'something_else', 'language' => 'en', 'status' => 'APPROVED'],
            ]]),
            'graph.facebook.com/v21.0/9001/message_templates' => Http::response(['id' => '777', 'status' => 'PENDING', 'category' => 'UTILITY']),
        ]);

        TemplateSync::submit($template);
        $this->assertSame(TemplateApproval::Pending, $template->refresh()->approval_status);
        $this->assertSame('777', $template->provider_template_id);

        Http::assertSent(function (ClientRequest $r) {
            $body = $r->data();

            return $r->method() === 'POST' && ($body['parameter_format'] ?? null) === 'NAMED'
                && $body['components'][0]['example']['body_text_named_params'][0] === ['param_name' => 'first_name', 'example' => 'Neil']
                && $body['components'][1]['buttons'][0] === ['type' => 'URL', 'text' => 'Track', 'url' => 'https://www.technoware.in/store'];
        });

        $result = TemplateSync::run(MessageChannel::WhatsApp);
        $this->assertSame(['matched' => 1, 'unknown' => ['something_else']], $result);
        $this->assertSame(TemplateApproval::Rejected, $template->refresh()->approval_status);
        $this->assertSame('INVALID_FORMAT', $template->approval_reason);
    }

    public function test_gupshup_renumbers_the_body_and_sends_by_template_id(): void
    {
        $this->configure(['whatsapp_gupshup_api_key' => 'gs-key', 'whatsapp_gupshup_app_name' => 'technoware', 'whatsapp_gupshup_source' => '919000000000', 'whatsapp_gupshup_app_id' => 'app-1']);
        Http::fake([
            'api.gupshup.io/wa/api/v1/template/msg' => Http::response(['status' => 'submitted', 'messageId' => 'gs-1']),
            'api.gupshup.io/wa/app/app-1/template' => Http::response(['status' => 'success', 'template' => ['id' => 'uuid-9', 'status' => 'PENDING']]),
        ]);

        $template = $this->template(MessageChannel::WhatsApp, ['provider_template_id' => 'uuid-9']);
        $this->assertSame('Hi {{1}}, we have your payment for {{2}} — {{3}}. Thank you, {{1}}.', $template->positionalBody());

        $this->assertSame('gs-1', (new GupshupWhatsApp)->send($this->message($template)));

        Http::assertSent(function (ClientRequest $r) {
            if (! str_ends_with($r->url(), '/template/msg')) {
                return false;
            }
            $template = json_decode($r->data()['template'], true);

            return $r->hasHeader('apikey', 'gs-key') && $r->data()['destination'] === '919876543210'
                && $template === ['id' => 'uuid-9', 'params' => ['Neil', 'TW-10042', '₹12,400']];
        });

        (new GupshupWhatsApp)->submitTemplate($template);
        Http::assertSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/wa/app/app-1/template')
            && $r->data()['content'] === 'Hi {{1}}, we have your payment for {{2}} — {{3}}. Thank you, {{1}}.'
            && $r->data()['example'] === 'Hi Neil, we have your payment for TW-10042 — ₹12,400. Thank you, Neil.');
    }

    public function test_gupshup_without_a_template_id_refuses_before_calling(): void
    {
        $this->configure(['whatsapp_gupshup_api_key' => 'gs-key', 'whatsapp_gupshup_app_name' => 'technoware', 'whatsapp_gupshup_source' => '919000000000']);
        Http::fake();

        $this->expectException(ProviderException::class);
        (new GupshupWhatsApp)->send($this->message($this->template(MessageChannel::WhatsApp)));
    }

    public function test_twilio_sends_content_variables_and_verifies_its_signature(): void
    {
        $this->configure(['whatsapp_twilio_account_sid' => 'AC123', 'whatsapp_twilio_auth_token' => 'twilio-secret', 'whatsapp_twilio_from' => '+14155550100']);
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM1'], 201)]);

        $this->assertSame('SM1', (new TwilioWhatsApp)->send($this->message($this->template(MessageChannel::WhatsApp, ['provider_template_id' => 'HX1']))));

        Http::assertSent(fn (ClientRequest $r) => $r->url() === TwilioWhatsApp::API.'/Accounts/AC123/Messages.json'
            && $r->data()['From'] === 'whatsapp:+14155550100'
            && $r->data()['To'] === 'whatsapp:+919876543210'
            && json_decode($r->data()['ContentVariables'], true) === ['1' => 'Neil', '2' => 'TW-10042', '3' => '₹12,400']
            && $r->data()['StatusCallback'] === 'https://api.example.test/cb');

        // A signed STOP from the number opts the contact out; an unsigned one does nothing.
        Contacts::optIn(MessageChannel::WhatsApp, '9876543210', null, 'checkout');
        Setting::put('messaging_whatsapp_provider', 'twilio');

        $url = route('api.v1.messaging.webhook', ['channel' => 'whatsapp', 'provider' => 'twilio']);
        $fields = ['Body' => 'STOP', 'From' => 'whatsapp:+919876543210', 'MessageSid' => 'SM9'];

        $this->post($url, $fields, ['X-Twilio-Signature' => 'forged'])->assertOk();
        $this->assertTrue(MessageContact::first()->isActive());

        ksort($fields);
        $data = $url;
        foreach ($fields as $k => $v) {
            $data .= $k.$v;
        }
        $this->post($url, $fields, ['X-Twilio-Signature' => base64_encode(hash_hmac('sha1', $data, 'twilio-secret', true))])->assertOk();
        $this->assertFalse(MessageContact::first()->isActive());
        $this->assertSame('stop', MessageContact::first()->opt_out_reason);
    }

    public function test_meta_webhook_fails_closed_verifies_and_moves_status_forward_only(): void
    {
        $this->configure(['messaging_whatsapp_provider' => 'meta_cloud', 'whatsapp_meta_verify_token' => 'handshake']);
        $url = '/api/v1/messaging/webhooks/whatsapp/meta_cloud';

        // The subscription handshake.
        $this->get($url.'?hub.mode=subscribe&hub.verify_token=handshake&hub.challenge=4242')->assertOk()->assertSee('4242');
        $this->get($url.'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=4242')->assertOk()->assertDontSee('4242');

        $delivery = MessageDelivery::create(['channel' => 'whatsapp', 'address' => '+919876543210', 'status' => MessageDeliveryStatus::Sent, 'provider_message_id' => 'wamid.X']);
        $payload = ['entry' => [['changes' => [['field' => 'messages', 'value' => ['statuses' => [['id' => 'wamid.X', 'status' => 'read']]]]]]]];
        $raw = (string) json_encode($payload);

        // No app secret configured: nothing is accepted, whatever it carries.
        $this->call('POST', $url, [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $raw, '')], $raw)->assertOk();
        $this->assertSame(MessageDeliveryStatus::Sent, $delivery->refresh()->status);

        $this->configure(['whatsapp_meta_app_secret' => 'app-secret']);
        $sign = fn (string $body) => ['CONTENT_TYPE' => 'application/json', 'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $body, 'app-secret')];

        $this->call('POST', $url, [], [], [], $sign($raw), $raw)->assertOk();
        $this->assertSame(MessageDeliveryStatus::Read, $delivery->refresh()->status);
        $this->assertNotNull($delivery->read_at);

        // A late `delivered` does not walk it back.
        $late = (string) json_encode(['entry' => [['changes' => [['field' => 'messages', 'value' => ['statuses' => [['id' => 'wamid.X', 'status' => 'delivered']]]]]]]]);
        $this->call('POST', $url, [], [], [], $sign($late), $late)->assertOk();
        $this->assertSame(MessageDeliveryStatus::Read, $delivery->refresh()->status);

        // A template approved at Meta.
        $template = $this->template(MessageChannel::WhatsApp, ['approval_status' => TemplateApproval::Pending]);
        $approved = (string) json_encode(['entry' => [['changes' => [['field' => 'message_template_status_update', 'value' => ['event' => 'APPROVED', 'message_template_name' => 'order_paid', 'message_template_language' => 'en', 'reason' => 'NONE']]]]]]);
        $this->call('POST', $url, [], [], [], $sign($approved), $approved)->assertOk();
        $this->assertSame(TemplateApproval::Approved, $template->refresh()->approval_status);
    }

    public function test_gupshup_webhook_needs_the_shared_secret_and_reads_a_stop(): void
    {
        $this->configure(['messaging_whatsapp_provider' => 'gupshup']);
        Contacts::optIn(MessageChannel::WhatsApp, '+919876543210', null, 'checkout');
        $body = ['type' => 'message', 'payload' => ['source' => '919876543210', 'type' => 'text', 'payload' => ['text' => ' Stop ']]];

        // No secret saved: fail closed, even with a token on the URL.
        $this->postJson('/api/v1/messaging/webhooks/whatsapp/gupshup?token=anything', $body)->assertOk();
        $this->assertTrue(MessageContact::first()->isActive());

        $this->configure(['messaging_webhook_secret' => 'shared-secret']);
        $this->postJson('/api/v1/messaging/webhooks/whatsapp/gupshup?token=wrong', $body)->assertOk();
        $this->assertTrue(MessageContact::first()->isActive());

        $this->postJson('/api/v1/messaging/webhooks/whatsapp/gupshup?token=shared-secret', $body)->assertOk();
        $this->assertFalse(MessageContact::first()->isActive());

        // Anything else from the person is just a reply.
        $this->assertFalse(Contacts::isStop('Please stop by tomorrow'));
        $this->assertTrue(Contacts::isStop('UNSUBSCRIBE.'));
    }

    public function test_google_rbm_sends_with_the_service_account_and_verifies_the_goog_signature(): void
    {
        $this->configure(['rcs_rbm_agent_id' => 'technoware_agent', GoogleRbm::KEY => $this->serviceAccount(), 'messaging_rcs_provider' => 'google_rbm']);
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.rbm']),
            'rcsbusinessmessaging.googleapis.com/*' => Http::response(['name' => 'phones/+919876543210/agentMessages/x']),
        ]);

        $template = $this->template(MessageChannel::Rcs, ['buttons' => [['type' => 'url', 'text' => 'Open', 'value' => 'https://www.technoware.in']]]);
        $id = (new GoogleRbm)->send($this->message($template));

        Http::assertSent(fn (ClientRequest $r) => str_starts_with($r->url(), GoogleRbm::BASE.'/phones/%2B919876543210/agentMessages?')
            && str_contains($r->url(), 'messageId='.$id) && str_contains($r->url(), 'agentId=technoware_agent')
            && $r->hasHeader('Authorization', 'Bearer ya29.rbm')
            && $r->data()['contentMessage']['text'] === 'Hi Neil, we have your payment for TW-10042 — ₹12,400. Thank you, Neil.'
            && $r->data()['contentMessage']['suggestions'][0]['action']['openUrlAction']['url'] === 'https://www.technoware.in');

        // The webhook: handshake, then a signed delivery report.
        $url = '/api/v1/messaging/webhooks/rcs/google_rbm';
        $this->postJson($url, ['clientToken' => 'client-token', 'secret' => 'echo-me'])->assertOk()->assertDontSee('echo-me');
        $this->configure(['rcs_rbm_client_token' => 'client-token']);
        $this->postJson($url, ['clientToken' => 'client-token', 'secret' => 'echo-me'])->assertOk()->assertExactJson(['secret' => 'echo-me']);

        $delivery = MessageDelivery::create(['channel' => 'rcs', 'address' => '+919876543210', 'status' => MessageDeliveryStatus::Sent, 'provider_message_id' => $id]);
        $data = (string) json_encode(['senderPhoneNumber' => '+919876543210', 'messageId' => $id, 'eventType' => 'DELIVERED']);
        $b64 = base64_encode($data);

        $this->postJson($url, ['message' => ['data' => $b64]], ['X-Goog-Signature' => 'bad'])->assertOk();
        $this->assertSame(MessageDeliveryStatus::Sent, $delivery->refresh()->status);

        $this->postJson($url, ['message' => ['data' => $b64]], ['X-Goog-Signature' => base64_encode(hash_hmac('sha512', $data, 'client-token', true))])->assertOk();
        $this->assertSame(MessageDeliveryStatus::Delivered, $delivery->refresh()->status);
    }

    public function test_google_rbm_404_is_a_failure_not_an_opt_out(): void
    {
        $this->configure(['rcs_rbm_agent_id' => 'agent', GoogleRbm::KEY => $this->serviceAccount()]);
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29']),
            'rcsbusinessmessaging.googleapis.com/*' => Http::response(['error' => ['message' => 'Requested entity was not found.']], 404),
        ]);

        try {
            (new GoogleRbm)->test('+919876543210');
            $this->fail('A 404 must throw.');
        } catch (ProviderException $e) {
            $this->assertFalse($e->revoke);
            $this->assertStringContainsString('cannot receive RCS', $e->getMessage());
        }
    }

    public function test_gupshup_rcs_sends_a_template_code_through_the_enterprise_gateway(): void
    {
        $this->configure(['rcs_gupshup_userid' => '2000', 'rcs_gupshup_password' => 'pw', 'rcs_gupshup_bot_id' => 'bot-1']);
        Http::fake(['enterprise.smsgupshup.com/*' => Http::response(['response' => ['id' => '4845-3906', 'phone' => '919876543210', 'status' => 'success', 'details' => '']])]);

        $id = (new GupshupRcs)->send($this->message($this->template(MessageChannel::Rcs, ['provider_template_name' => 'order_paid_v1'])));

        $this->assertSame('4845-3906', $id);
        Http::assertSent(fn (ClientRequest $r) => $r->data()['method'] === 'SendMessage' && $r->data()['send_to'] === '919876543210'
            && $r->data()['botId'] === 'bot-1'
            && json_decode($r->data()['msg'], true)['contentMessage']['templateMessage'] === [
                'templateCode' => 'order_paid_v1',
                'customParam' => ['first_name' => 'Neil', 'order_number' => 'TW-10042', 'order_total' => '₹12,400'],
            ]);
    }

    public function test_fcm_sends_a_notification_and_unregistered_revokes_the_token(): void
    {
        $token = str_repeat('fcmtoken_', 12);
        $this->configure([Fcm::KEY => $this->serviceAccount(), 'messaging_push_provider' => 'fcm']);
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.fcm']),
            'fcm.googleapis.com/*' => Http::sequence()
                ->push(['name' => 'projects/technoware-push/messages/1'])
                ->push(['error' => ['code' => 404, 'message' => 'Requested entity was not found.', 'status' => 'NOT_FOUND',
                    'details' => [['@type' => 'type.googleapis.com/google.firebase.fcm.v1.FcmError', 'errorCode' => 'UNREGISTERED']]]], 404),
        ]);

        $template = $this->template(MessageChannel::Push, ['push_title' => 'Paid: {{order_number}}', 'push_link' => '/store/orders/{{order_number}}']);
        $this->assertSame('projects/technoware-push/messages/1', (new Fcm)->send($this->message($template, $token)));

        Http::assertSent(fn (ClientRequest $r) => $r->url() === 'https://fcm.googleapis.com/v1/projects/technoware-push/messages:send'
            && $r->data()['message']['token'] === $token
            && $r->data()['message']['notification']['title'] === 'Paid: TW-10042'
            && str_ends_with($r->data()['message']['data']['link'], '/store/orders/TW-10042'));

        // The second send answers UNREGISTERED: the delivery fails and the contact is opted out.
        $contact = Contacts::optIn(MessageChannel::Push, $token, null, 'push_bell');
        $delivery = MessageDelivery::create([
            'channel' => 'push', 'address' => $token, 'message_contact_id' => $contact->id,
            'message_template_id' => $template->id, 'status' => MessageDeliveryStatus::Pending, 'vars' => ['order_number' => 'TW-1'],
        ]);

        $this->assertSame(ChannelSender::FAILED, ChannelSender::deliver($delivery));
        $this->assertSame(MessageDeliveryStatus::Failed, $delivery->refresh()->status);
        $this->assertFalse($contact->refresh()->isActive());
        $this->assertSame('unregistered', $contact->opt_out_reason);
    }
}
