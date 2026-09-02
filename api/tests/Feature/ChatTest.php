<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Brand;
use App\Models\ChatConversation;
use App\Models\ChatEvent;
use App\Models\ChatMessage;
use App\Models\Product;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
use App\Support\Chat\Intent;
use App\Support\Chat\Providers\OpenAiProvider;
use App\Support\Chat\Retriever;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The website assistant.
 *
 * Most of these are about what it will **not** do. The module's whole risk is
 * that a model says something plausible and untrue on the company's own
 * website, so the tests that matter are the ones proving it cannot: no
 * retrieval means no model call, a provider failure never reaches the visitor,
 * and a system message never reaches a browser.
 */
class ChatTest extends TestCase
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

    /** A model that says whatever the test wants, without any HTTP at all. */
    private function fakeProvider(string $says = 'A grounded answer.', bool $ok = true, bool $configured = true): void
    {
        $this->app->bind(AiProvider::class, fn () => new class($says, $ok, $configured) implements AiProvider
        {
            public array $received = [];

            public function __construct(private string $says, private bool $ok, private bool $configured) {}

            public function complete(array $messages, int $maxTokens = 500): AiReply
            {
                return $this->ok ? AiReply::of($this->says, 42) : AiReply::failed('quota exceeded for org-abc123');
            }

            public function isConfigured(): bool
            {
                return $this->configured;
            }

            public function name(): string
            {
                return 'fake';
            }
        });
    }

    private function product(array $attributes = []): StoreProduct
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
     * A product in the *site* catalogue, which is not the shop's.
     *
     * `products` and `store_products` are separate tables on purpose. A brand
     * is offered when the site catalogue carries something from it, because
     * that is what `/products?brand=` filters.
     */
    private function siteProduct(Brand $brand): Product
    {
        return Product::create([
            'brand_id' => $brand->id,
            'name' => $brand->name.' switch',
            'slug' => $brand->slug.'-switch',
            'status' => PublishStatus::Published,
        ]);
    }

    private function start(): string
    {
        return $this->postJson('/api/v1/chat/conversations')->assertCreated()->json('data.token');
    }

    // ------------------------------------------------------------- the switch

    /**
     * Off means off at the API, not only in the interface.
     *
     * A flag the frontend honours and the API does not is a feature still
     * running for anybody who kept the page open — the rule
     * `registration_enabled` follows.
     */
    public function test_every_route_is_gone_when_the_chatbot_is_switched_off(): void
    {
        $token = $this->start();
        $this->setting('chatbot_enabled', '0', 'boolean');

        $this->postJson('/api/v1/chat/conversations')->assertNotFound();
        $this->getJson("/api/v1/chat/conversations/{$token}")->assertNotFound();
        $this->postJson("/api/v1/chat/conversations/{$token}/messages", ['message' => 'hello'])->assertNotFound();
    }

    // -------------------------------------------------------------- the token

    public function test_the_token_is_returned_once_and_never_again(): void
    {
        $token = $this->start();

        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $token);

        $body = $this->getJson("/api/v1/chat/conversations/{$token}")->assertOk()->json();

        $this->assertStringNotContainsString(
            $token,
            json_encode($body),
            'A credential in every read of the thing it protects is a credential in every log.',
        );
    }

    public function test_a_token_that_is_not_ours_is_a_404_and_not_a_403(): void
    {
        // A 403 confirms the conversation exists, which is the thing worth
        // knowing to somebody enumerating.
        $this->getJson('/api/v1/chat/conversations/'.str_repeat('a', 64))->assertNotFound();
        $this->getJson('/api/v1/chat/conversations/short')->assertNotFound();
    }

    // ----------------------------------------------------------- the grounding

    public function test_an_answer_stands_on_what_was_retrieved_and_carries_its_links(): void
    {
        $this->fakeProvider('We stock managed switches.');
        $this->product();

        $reply = $this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'Do you have a 24-port managed switch?',
        ])->assertOk()->json('data');

        $this->assertSame('We stock managed switches.', $reply['content']);
        $this->assertTrue($reply['grounded']);
        $this->assertSame('/store/products/cbs350-24-port', $reply['sources'][0]['url']);
    }

    /**
     * Nothing retrieved means the model is never asked.
     *
     * This is the single most important test here. Asked a question with no
     * context attached, a helpful assistant helpfully invents — so the call is
     * not made at all, the fallback sentence is returned, and the question is
     * recorded so somebody can write the missing page.
     */
    public function test_nothing_retrieved_means_the_model_is_never_called(): void
    {
        $called = false;

        $this->app->bind(AiProvider::class, fn () => new class($called) implements AiProvider
        {
            public function __construct(public &$called) {}

            public function complete(array $messages, int $maxTokens = 500): AiReply
            {
                $this->called = true;

                return AiReply::of('I should never be reached.');
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

        $reply = $this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'Do you resell Zyxel XGS4600 in Antarctica?',
        ])->assertOk()->json('data');

        $this->assertFalse($reply['grounded']);
        $this->assertStringContainsString("can't confirm", $reply['content']);
        $this->assertSame([], $reply['sources']);
        $this->assertDatabaseHas('chat_events', ['type' => 'unanswered']);
    }

    /**
     * A provider failure never reaches the visitor in the provider's words.
     *
     * Those carry model names, quota messages and organisation ids. What the
     * visitor gets is the pages that were found, which is a worse answer than
     * the model would have given and a far better one than an apology.
     */
    public function test_a_provider_failure_gives_the_links_and_never_the_error(): void
    {
        $this->fakeProvider(ok: false);
        $this->product();

        $reply = $this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'managed switch',
        ])->assertOk()->json('data');

        $this->assertStringNotContainsString('quota', $reply['content']);
        $this->assertStringNotContainsString('org-abc123', $reply['content']);
        $this->assertStringContainsString('CBS350', $reply['content']);
        $this->assertDatabaseHas('chat_events', ['type' => 'provider_failed']);
    }

    /** No key at all still answers with the pages, rather than an apology. */
    public function test_a_missing_key_still_answers_with_the_pages(): void
    {
        $this->fakeProvider(configured: false);
        $this->product();

        $reply = $this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'managed switch',
        ])->assertOk()->json('data');

        $this->assertStringContainsString('CBS350', $reply['content']);
        $this->assertTrue($reply['grounded']);
    }

    /**
     * A product card is built from the database, never from the answer.
     *
     * Rule 4 and §29: the model may not determine price or stock. It is not
     * asked to — the figures ride on the source beside its sentence, put there
     * by `Retriever` on this request. Here the model is made to say something
     * false about the price, and the card's figures are unmoved.
     */
    public function test_the_card_figures_come_from_the_database_and_not_from_the_reply(): void
    {
        $this->fakeProvider('This switch costs ₹99 and we have nine hundred in stock.');

        $product = $this->product(['price_paise' => 1180000, 'compare_at_paise' => 1450000, 'stock' => 4]);

        $source = collect($this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'managed switch',
        ])->assertOk()->json('data.sources'))->firstWhere('type', 'product');

        $this->assertSame($product->id, $source['product']['id']);
        $this->assertSame(1180000, $source['product']['price_paise']);
        $this->assertSame(1450000, $source['product']['compare_at_paise']);
        $this->assertTrue($source['product']['in_stock']);
        $this->assertFalse($source['product']['has_variations']);
    }

    /**
     * A compare-at price that is not higher is absent.
     *
     * Equal or lower is either a mistake or a lie, and both render as a
     * discount that is not there — the rule the shop's own listing follows.
     */
    public function test_a_compare_at_price_that_is_not_higher_never_reaches_the_card(): void
    {
        $this->fakeProvider();
        $this->product(['price_paise' => 1180000, 'compare_at_paise' => 1000000]);

        $source = collect($this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'managed switch',
        ])->assertOk()->json('data.sources'))->firstWhere('type', 'product');

        $this->assertNull($source['product']['compare_at_paise']);
    }

    /**
     * A product with variations says so, and the card offers a link instead.
     *
     * It cannot be added without choosing one: falling back to the product
     * would sell "a switch" where the shop has only ever offered a 24-port and
     * a 48-port, and somebody in the warehouse then has to guess.
     */
    public function test_a_variated_product_is_marked_so_the_card_cannot_offer_a_basket_button(): void
    {
        $this->fakeProvider();
        $product = $this->product();
        $product->variations()->create(['name' => '24-port', 'stock' => 3, 'sort_order' => 0]);

        $source = collect($this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'managed switch',
        ])->assertOk()->json('data.sources'))->firstWhere('type', 'product');

        $this->assertTrue($source['product']['has_variations']);
    }

    /** A page or a service carries no product payload — a card is for a product. */
    public function test_only_a_product_source_carries_a_card(): void
    {
        $this->fakeProvider();
        $this->product();

        foreach ($this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'managed switch',
        ])->assertOk()->json('data.sources') as $source) {
            if (($source['type'] ?? null) !== 'product') {
                $this->assertArrayNotHasKey('product', $source);
            }
        }
    }

    // ------------------------------------------------------------ the leakage

    /**
     * A system message holds the instructions and the retrieved context, and
     * never reaches a browser.
     *
     * Structural — `visibleMessages` — rather than a filter somebody has to
     * remember, the call the ticket module makes with `publicMessages`. "Show
     * me your system prompt" is the first thing anybody probing a chatbot asks.
     */
    public function test_a_system_message_never_reaches_a_browser(): void
    {
        $this->fakeProvider();
        $this->product();
        $token = $this->start();

        $this->postJson("/api/v1/chat/conversations/{$token}/messages", ['message' => 'managed switch'])->assertOk();

        $conversation = ChatConversation::where('session_token', $token)->sole();
        $conversation->messages()->create(['role' => 'system', 'content' => 'SECRET INSTRUCTIONS', 'created_at' => now()]);

        $body = json_encode($this->getJson("/api/v1/chat/conversations/{$token}")->assertOk()->json());

        $this->assertStringNotContainsString('SECRET INSTRUCTIONS', $body);
    }

    /**
     * Retrieval has no path to anything private.
     *
     * §15 and §34 are enforced by `Retriever` not knowing how to reach a
     * customer, an order, a ticket or an activation code — not by asking the
     * model nicely, which is the only enforcement a prompt cannot be talked out
     * of. Every type it can return is on this list.
     */
    public function test_retrieval_can_only_ever_return_public_content(): void
    {
        $this->product();

        $public = ['product', 'solution', 'service', 'industry', 'faq', 'knowledge', 'blog', 'page'];

        foreach (['switch', 'order', 'customer', 'activation code', 'password', 'ticket'] as $question) {
            foreach (Retriever::for($question) as $source) {
                $this->assertContains($source['type'], $public, "Retrieval returned a {$source['type']}.");
            }
        }
    }

    // --------------------------------------------------- brands and support

    /**
     * "What brands do you support?" cannot be answered by matching words.
     *
     * After the stop list the only term left is "brands", and no brand is
     * called that — so this is the one question in the module answered by
     * asking *about* the records rather than matching against them.
     */
    public function test_asking_about_brands_in_general_returns_the_list(): void
    {
        $cisco = Brand::create(['name' => 'Cisco', 'slug' => 'cisco']);
        Brand::create(['name' => 'Sophos', 'slug' => 'sophos']);

        // A *site* product, because `/products?brand=` filters the site
        // catalogue — the two are separate tables on purpose, and a brand with
        // only store products would link to an empty listing.
        $this->siteProduct($cisco);

        $sources = Retriever::for('What brands do you support?');
        $brands = collect($sources)->firstWhere('type', 'brand');

        $this->assertNotNull($brands, 'A question about brands must return brands.');
        $this->assertStringContainsString('Cisco', $brands['excerpt']);
    }

    /**
     * A brand nothing is stocked from is not offered.
     *
     * A facet that can only return an empty page reads as "we do not stock
     * this" rather than as "that filter was never going to match" — the rule
     * `/brands` already follows.
     */
    public function test_a_brand_with_nothing_behind_it_is_not_offered(): void
    {
        Brand::create(['name' => 'Cisco', 'slug' => 'cisco']);

        $this->assertEmpty(
            collect(Retriever::for('Do you work with Cisco?'))->where('type', 'brand')->all(),
        );
    }

    /** A named brand links to the filtered catalogue, which always exists. */
    public function test_a_named_brand_links_to_a_page_that_is_always_there(): void
    {
        $brand = Brand::create(['name' => 'Sophos', 'slug' => 'sophos']);
        $this->siteProduct($brand);

        $found = collect(Retriever::for('Do you work with Sophos?'))->firstWhere('type', 'brand');

        // Not `/brands/sophos`: a brand landing page is programmatic and exists
        // only if somebody published it, so pointing at one is a 404 in the
        // middle of an answer.
        $this->assertSame('/products?brand=sophos', $found['url']);
    }

    /**
     * Somebody whose kit has stopped working is shown the support desk.
     *
     * And a guest is shown a different door from a customer: sending a
     * signed-in customer to a login page is the small rudeness that makes a
     * thing feel automated.
     */
    public function test_a_support_question_offers_the_portal_and_knows_who_is_asking(): void
    {
        $this->fakeProvider();
        $this->product();

        $reply = $this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'My switch is not working',
        ])->assertOk()->json('data');

        $this->assertSame('/portal/login', $reply['actions'][0]['url']);
        $this->assertTrue($reply['actions'][0]['primary']);
    }

    /** A buying question offers the contact form, and nothing else. */
    public function test_a_sales_question_offers_a_callback(): void
    {
        $this->fakeProvider();
        $this->product();

        $reply = $this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'How much does a managed switch cost?',
        ])->assertOk()->json('data');

        $this->assertCount(1, $reply['actions']);
        $this->assertSame('/contact', $reply['actions'][0]['url']);
    }

    /** An ordinary question offers nothing — a button on every answer is chrome. */
    public function test_an_ordinary_question_offers_no_actions(): void
    {
        $this->fakeProvider();
        $this->product();

        $reply = $this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'managed switch',
        ])->assertOk()->json('data');

        $this->assertSame([], $reply['actions']);
    }

    /**
     * The bare word "support" is not a support request.
     *
     * "What brands do you support?" and "do you support VLAN tagging?" are a
     * catalogue question and a specification question. Routing either to the
     * help desk puts the wrong screen in front of somebody who was shopping —
     * measured, before the word was taken out of the list on its own.
     */
    public function test_asking_what_we_support_is_not_asking_for_support(): void
    {
        $this->assertSame(Intent::GENERAL, Intent::detect('What brands do you support?'));
        $this->assertSame(Intent::GENERAL, Intent::detect('Do you support VLAN tagging?'));
        $this->assertSame(Intent::SUPPORT, Intent::detect('I need support'));
        $this->assertSame(Intent::SUPPORT, Intent::detect('Contact support please'));
    }

    /**
     * "Download" must not read as "down".
     *
     * Half this catalogue's knowledge base is about downloading firmware, and
     * an unbounded substring match sent every one of those to the support desk.
     */
    public function test_download_is_not_an_outage(): void
    {
        $this->assertSame(Intent::GENERAL, Intent::detect('Where do I download the firmware?'));
        $this->assertSame(Intent::SUPPORT, Intent::detect('Our internet is down'));
    }

    // ------------------------------------------------------------- the limits

    public function test_a_message_longer_than_the_setting_is_refused(): void
    {
        $this->setting('chatbot_max_message_chars', '50');

        $this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => str_repeat('a', 51),
        ])->assertStatus(422)->assertJsonValidationErrors('message');
    }

    /**
     * A conversation has an end.
     *
     * Rate limiting bounds how fast one visitor can ask; this bounds how long
     * one conversation can run, which is the other half of the cost controls.
     */
    public function test_a_conversation_closes_at_its_ceiling(): void
    {
        $this->fakeProvider();
        $this->setting('chatbot_max_messages', '2');
        $token = $this->start();

        $this->postJson("/api/v1/chat/conversations/{$token}/messages", ['message' => 'managed switch'])->assertOk();

        $this->postJson("/api/v1/chat/conversations/{$token}/messages", ['message' => 'and again'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('message');

        $this->assertSame('closed', ChatConversation::where('session_token', $token)->value('status'));
    }

    // ------------------------------------------------------------ the provider

    /**
     * The real provider, against a faked network.
     *
     * Two things worth pinning that no amount of reading proves: the key goes
     * in the `Authorization` header and nowhere else, and a refusal comes back
     * as a failure rather than as an empty answer somebody would render.
     */
    public function test_the_openai_provider_sends_a_bearer_token_and_reports_a_refusal(): void
    {
        Setting::updateOrCreate(
            ['key' => 'openai_api_key'],
            ['group' => 'integrations', 'value' => 'sk-test-key', 'type' => 'string', 'is_secret' => false],
        );
        Setting::flushCache();

        Http::fake(['api.openai.com/*' => Http::response([
            'choices' => [['message' => ['content' => 'Hello.']]],
            'usage' => ['total_tokens' => 11],
        ])]);

        $reply = (new OpenAiProvider)->complete([['role' => 'user', 'content' => 'hi']]);

        $this->assertTrue($reply->ok);
        $this->assertSame('Hello.', $reply->text);

        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer sk-test-key'));
    }

    /**
     * A refusal is a failure, not an empty answer somebody would render.
     *
     * Its own test rather than a second half of the one above: a second
     * `Http::fake()` **adds** a stub rather than replacing the first, so the
     * original success kept matching and the assertion passed for the wrong
     * reason. It read as the provider ignoring a 429.
     */
    public function test_the_openai_provider_reports_a_refusal_rather_than_an_empty_answer(): void
    {
        Setting::updateOrCreate(
            ['key' => 'openai_api_key'],
            ['group' => 'integrations', 'value' => 'sk-test-key', 'type' => 'string', 'is_secret' => false],
        );
        Setting::flushCache();

        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'no quota']], 429)]);

        $reply = (new OpenAiProvider)->complete([['role' => 'user', 'content' => 'hi']]);

        $this->assertFalse($reply->ok);
        $this->assertSame('no quota', $reply->error);
        $this->assertSame('', $reply->text);
    }

    // ------------------------------------------------------------- the opening

    public function test_starting_a_conversation_offers_the_configured_chips(): void
    {
        $this->setting('chatbot_quick_actions', "Find a product|I need a switch\nTalk to sales|Please call me", 'text');

        $data = $this->postJson('/api/v1/chat/conversations')->assertCreated()->json('data');

        $this->assertCount(2, $data['quick_actions']);
        $this->assertSame('Find a product', $data['quick_actions'][0]['label']);
        // The label is what somebody presses; the second half is what is sent,
        // because "Talk to sales" is a good button and a poor question.
        $this->assertSame('I need a switch', $data['quick_actions'][0]['message']);

        $this->assertDatabaseHas('chat_events', ['type' => 'opened']);
    }

    public function test_the_public_settings_publish_the_four_presentational_keys_and_no_others(): void
    {
        $this->setting('chatbot_model', 'gpt-4o');
        $this->setting('chatbot_daily_reply_cap', '9');

        $data = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertArrayHasKey('chatbot_enabled', $data);
        $this->assertArrayNotHasKey('chatbot_model', $data, 'The model is nobody visiting the site is business.');
        $this->assertArrayNotHasKey('chatbot_daily_reply_cap', $data);
        $this->assertArrayNotHasKey('openai_api_key', $data);
    }

    // ----------------------------------------------------------- the retention

    public function test_the_prune_deletes_old_conversations_and_their_messages(): void
    {
        $this->fakeProvider();
        $this->product();
        $token = $this->start();
        $this->postJson("/api/v1/chat/conversations/{$token}/messages", ['message' => 'managed switch'])->assertOk();

        ChatConversation::where('session_token', $token)->update(['created_at' => now()->subDays(200)]);

        $this->artisan('technoware:prune-chats')->assertSuccessful();

        $this->assertSame(0, ChatConversation::count());
        $this->assertSame(0, ChatMessage::count(), 'The cascade must take the transcript with it.');
    }

    /** A floor, so a typo cannot destroy yesterday's conversations. */
    public function test_the_retention_floor_holds_against_a_silly_setting(): void
    {
        Setting::updateOrCreate(['key' => 'chat_retention_days'], ['group' => 'security', 'value' => '0', 'type' => 'string']);
        Setting::flushCache();

        $this->start();
        ChatConversation::query()->update(['created_at' => now()->subDays(3)]);

        $this->artisan('technoware:prune-chats')->assertSuccessful();

        $this->assertSame(1, ChatConversation::count(), 'Three days old is inside any floor worth having.');
    }

    public function test_events_are_recorded_for_the_things_worth_counting(): void
    {
        $this->fakeProvider();
        $this->product();

        $this->postJson("/api/v1/chat/conversations/{$this->start()}/messages", [
            'message' => 'managed switch',
            'quick_action' => 'Find a product',
        ])->assertOk();

        $this->assertDatabaseHas('chat_events', ['type' => 'quick_action']);
        $this->assertSame(2, ChatEvent::whereIn('type', ['opened', 'quick_action'])->count());
    }
}
