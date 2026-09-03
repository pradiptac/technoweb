<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\ChatConversation;
use App\Models\Customer;
use App\Models\KnowledgeArticle;
use App\Models\Lead;
use App\Models\Service;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Notifications\ChatLeadCaptured;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * The six journeys of the roadmap's Phase 18, each walked end to end.
 *
 * `ChatTest` covers the rules one at a time — what the retriever may return,
 * what an intent offers, what a lead records. This covers the **handoffs**,
 * which is where a module made of correct parts still fails: the card that
 * carries a slug nothing resolves, the lead that is written and notifies
 * nobody, the basket the card cannot actually add to.
 *
 * That failure has a history here. `admin_path` on the SEO overview was
 * spelled with the API's resource names while the console served those records
 * at different URLs, so two of nine record types linked to a 404 from the one
 * screen whose job is finding things to fix — and nothing type-checks a string
 * built on one side of the wire against a route table on the other. The
 * assistant emits eight such strings.
 */
class ChatJourneyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setting('chatbot_enabled', '1', 'boolean');
    }

    private function setting(string $key, ?string $value, string $type = 'string'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => 'chatbot', 'value' => $value, 'type' => $type]);
        Setting::flushCache();
    }

    /** A model that answers without any HTTP, so a journey costs nothing. */
    private function fakeProvider(string $says = 'Here is what the website says.'): void
    {
        $this->app->bind(AiProvider::class, fn () => new class($says) implements AiProvider
        {
            public function __construct(private string $says) {}

            public function complete(array $messages, int $maxTokens = 500): AiReply
            {
                return new AiReply(true, $this->says, 42, null);
            }

            public function isConfigured(): bool
            {
                return true;
            }

            public function name(): string
            {
                return 'fake';
            }
        });
    }

    private function start(): string
    {
        return $this->postJson('/api/v1/chat/conversations')->assertCreated()->json('data.token');
    }

    private function ask(string $token, string $message): array
    {
        return $this->postJson("/api/v1/chat/conversations/{$token}/messages", [
            'message' => $message,
        ])->assertOk()->json('data');
    }

    private function switch(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'CBS350 24-Port Managed Switch',
            'slug' => 'cbs350-24-port',
            'short_description' => 'A managed gigabit switch for a small office.',
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
            'track_stock' => true,
            'stock' => 6,
        ], $attributes));
    }

    /**
     * Journey 1 — visitor, question, card, product page.
     *
     * The step that matters is the last: the card carries a slug and a URL, and
     * a URL nobody resolves is a dead end in the middle of an answer. Asserted
     * against the storefront endpoint the page is built from, so a renamed
     * route or a changed slug shape fails here rather than in front of a
     * customer.
     */
    public function test_journey_one_a_question_becomes_a_card_that_opens_a_real_product(): void
    {
        $this->fakeProvider();
        $product = $this->switch();

        $reply = $this->ask($this->start(), 'Do you sell managed switches?');

        $card = collect($reply['sources'])->firstWhere('product.id', $product->id);

        $this->assertNotNull($card, 'A product question must produce a card.');
        $this->assertSame('/store/products/'.$product->slug, $card['url']);

        // The figures on the card come from the database, never from the
        // answer's text -- so the page and the card cannot disagree.
        $this->assertSame(1180000, $card['product']['price_paise']);
        $this->assertTrue($card['product']['in_stock']);

        $page = $this->getJson('/api/v1/store/products/'.$product->slug)->assertOk()->json('data');

        $this->assertSame($product->id, $page['id']);
        $this->assertSame($card['product']['price_paise'], $page['price_paise']);
    }

    /**
     * Journey 2 — buying intent, the form, a lead, and somebody told about it.
     *
     * The whole chain in one test, because each half has passed on its own
     * while the join was broken: a lead written that notifies nobody is a lead
     * nobody works, and the failure is silent by construction — `LeadIntake`
     * catches and logs rather than failing the submission, which is right and
     * means nothing reports it.
     */
    public function test_journey_two_buying_intent_becomes_a_lead_the_desk_hears_about(): void
    {
        Notification::fake();
        $this->fakeProvider();
        $this->switch();
        $this->setting('sales_email', 'sales@technoware.test');

        $token = $this->start();
        // "cost" alone is not a sales phrase and should not be: "what does a
        // managed switch cost to run" is a question about power. The list wants
        // "cost of", "how much" or, as here, an outright request to be quoted.
        $reply = $this->ask($token, 'Can you send me a quote for twenty of the 24-port switch?');

        $this->assertNotEmpty($reply['actions'], 'Buying intent must offer a way to be called.');
        $this->assertSame('/contact', $reply['actions'][0]['url']);

        $this->postJson("/api/v1/chat/conversations/{$token}/lead", [
            'name' => 'Priya Raman',
            'email' => 'priya@example.test',
            'phone' => '+91 98765 43210',
            'requirement' => 'Twenty of the 24-port, please quote.',
        ])->assertCreated();

        $lead = Lead::latest('id')->first();

        $this->assertNotNull($lead, 'The callback must reach the one pipeline.');
        $this->assertSame('chatbot', $lead->channel);
        $this->assertSame('priya@example.test', $lead->email);

        Notification::assertSentOnDemand(ChatLeadCaptured::class);
    }

    /**
     * Journey 3 — a service question, the service, and a callback.
     *
     * Same shape as journey 2 and deliberately not folded into it: a service
     * has no card, no price and no stock, so the sales path has to work from a
     * retrieved *page* rather than from a product. That is the half a
     * product-shaped test would never exercise.
     */
    public function test_journey_three_a_service_question_can_end_in_a_callback(): void
    {
        $this->fakeProvider();

        Service::create([
            'title' => 'Structured cabling',
            'slug' => 'structured-cabling',
            'summary' => 'Cat6A and fibre containment, certified and documented.',
            'status' => PublishStatus::Published,
        ]);

        $token = $this->start();
        $reply = $this->ask($token, 'Do you quote for structured cabling work?');

        $this->assertNotEmpty($reply['sources'], 'The service must be retrieved.');
        $this->assertSame(
            'Structured cabling',
            collect($reply['sources'])->firstWhere('type', 'service')['title'] ?? null,
        );

        $this->postJson("/api/v1/chat/conversations/{$token}/lead", [
            'name' => 'Arun Das',
            'email' => 'arun@example.test',
            'phone' => '+91 90000 00000',
            'requirement' => 'Please quote for cabling a new floor.',
        ])->assertCreated();

        $this->assertSame('chatbot', Lead::latest('id')->first()?->channel);
    }

    /**
     * Journey 4 — a fault, a guide, and the way through to a person.
     *
     * A visitor with no account is sent to sign in *and* given a door that does
     * not need one, because an unanswerable choice between two doors is worse
     * than one door and a hint.
     */
    public function test_journey_four_a_fault_finds_the_guide_and_then_the_desk(): void
    {
        $this->fakeProvider();

        KnowledgeArticle::create([
            'title' => 'Firewall rules that quietly stop working',
            'slug' => 'firewall-rules-stop-working',
            'excerpt' => 'What to check when traffic stops matching a rule you did not change.',
            'body' => '<p>Check the interface bindings first.</p>',
            'status' => PublishStatus::Published,
            'published_at' => now(),
        ]);

        $reply = $this->ask($this->start(), 'My firewall rules have stopped working');

        $article = collect($reply['sources'])->firstWhere('type', 'knowledge');

        $this->assertNotNull($article, 'A fault must surface the guide if one exists.');
        $this->assertStringStartsWith('/knowledge-base/', $article['url']);

        $urls = collect($reply['actions'])->pluck('url')->all();

        $this->assertContains('/portal/login', $urls);
        $this->assertContains('/support', $urls, 'Somebody with no account needs a door too.');
    }

    /**
     * Journey 5 — a customer who is already signed in.
     *
     * The distinction the whole `signedIn` branch exists for: sending somebody
     * who is signed in to a sign-in page is the kind of thing that makes an
     * assistant feel like it is not part of the site.
     */
    /**
     * The same journey, driven by a **bearer token** rather than `actingAs`.
     *
     * `actingAs(..., 'sanctum')` stages the authentication by hand: it proves
     * the controller does the right thing with a resolved user and proves
     * nothing about anything resolving one. These routes carry no auth
     * middleware, so the only thing that can is a token on the request — and
     * the controller was reading the *default* guard, which on a route outside
     * `auth:sanctum` is always null.
     *
     * So the conversation was never filed against the account, and a customer
     * who was signed in was offered the sign-in page. Nothing failed and
     * nothing was logged. This is the wiring test: reverting `user('sanctum')`
     * to `user()` fails exactly this and leaves journey five green.
     */
    public function test_a_bearer_token_is_what_files_a_conversation_against_an_account(): void
    {
        $this->fakeProvider();

        $customer = Customer::create([
            'name' => 'Neil Basu',
            'email' => 'neil@meridian-foods.test',
            'password' => bcrypt('irrelevant'),
            'status' => CustomerStatus::Active,
        ]);

        $bearer = ['Authorization' => 'Bearer '.$customer->createToken('portal')->plainTextToken];

        $token = $this->postJson('/api/v1/chat/conversations', [], $bearer)
            ->assertCreated()->json('data.token');

        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertSame($customer->id, $conversation->customer_id);

        $reply = $this->postJson(
            "/api/v1/chat/conversations/{$token}/messages",
            ['message' => 'My switch is not working'],
            $bearer,
        )->assertOk()->json('data');

        $this->assertNotContains('/portal/login', collect($reply['actions'])->pluck('url')->all());
    }

    public function test_journey_five_a_signed_in_customer_is_sent_to_raise_a_ticket(): void
    {
        $this->fakeProvider();

        $customer = Customer::create([
            'name' => 'Neil Basu',
            'email' => 'neil@meridian-foods.test',
            'password' => bcrypt('irrelevant'),
            'status' => CustomerStatus::Active,
        ]);

        $token = $this->postJson('/api/v1/chat/conversations')->assertCreated()->json('data.token');

        $reply = $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/chat/conversations/{$token}/messages", [
                'message' => 'My switch is not working',
            ])->assertOk()->json('data');

        $urls = collect($reply['actions'])->pluck('url')->all();

        $this->assertContains('/portal/tickets/new', $urls);
        $this->assertNotContains('/portal/login', $urls, 'They are already signed in.');
    }

    /**
     * Journey 6 — card, basket, checkout.
     *
     * The card's button goes through the shop's own cart API and the assistant
     * is given no basket of its own — §9's "add to cart assistance" arrived
     * that way deliberately, because a second route to spending somebody's
     * money is a second set of rules about stock, coupons and oversell to keep
     * in step. This asserts the card's id is one the ordinary cart accepts.
     */
    public function test_journey_six_the_card_adds_to_the_ordinary_basket(): void
    {
        $this->fakeProvider();
        $product = $this->switch();

        $reply = $this->ask($this->start(), 'Do you sell managed switches?');
        $card = collect($reply['sources'])->firstWhere('product.id', $product->id);

        $this->assertNotNull($card);
        $this->assertFalse($card['product']['has_variations'], 'A card only offers a button when it can.');

        $cart = $this->postJson('/api/v1/cart/items', [
            'product_id' => $card['product']['id'],
            'quantity' => 2,
        ])->assertCreated()->json('data');

        $this->assertSame(2, collect($cart['items'])->firstWhere('product_id', $product->id)['quantity'] ?? null);

        // Priced by the shop, from the product, on every read -- the card's
        // figure is a snapshot for display and never the basis of a total.
        $this->assertSame(2360000, $cart['subtotal_paise']);
    }
}
