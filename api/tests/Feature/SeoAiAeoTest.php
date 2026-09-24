<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\SeoAiAction;
use App\Models\Brand;
use App\Models\Role;
use App\Models\SeoSuggestion;
use App\Models\Service;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
use App\Support\Seo\Ai\SeoContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The assistant's eight AEO and GEO actions (`docs/aeo-geo-contract.md` §6).
 *
 * The same rule `SeoAiTest` states: nothing here pins what a model says.
 * What is pinned is the shape each action's reply is read into, what is
 * dropped on the way (an unknown block kind, a number outside the list, a
 * block from another record), what is kept exactly as written
 * (`[MISSING: …]`), and what the model is told — the blocks and FAQs
 * already on the page, and a product's own facts with the rule that a
 * missing one is a hole rather than a guess.
 */
class SeoAiAeoTest extends TestCase
{
    use RefreshDatabase;

    private function seoManager(): User
    {
        $user = User::create([
            'name' => 'Test seo_manager',
            'email' => 'seo@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $user->roles()->attach(Role::firstOrCreate(['slug' => 'seo_manager'], ['name' => 'seo_manager'])->id);

        return $user->load('roles');
    }

    private function setting(string $key, ?string $value, string $type = 'string', string $group = 'seo'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => $group, 'value' => $value, 'type' => $type]);
        Setting::flushCache();
    }

    private function enable(): void
    {
        $this->setting('seo_ai_enabled', '1', 'boolean');
        $this->setting('openai_api_key', 'sk-test', 'string', 'integrations');
    }

    /** The `SeoAiTest` fake: says what the test wants and keeps what it was asked. */
    private function fakeProvider(string $says = '{}'): object
    {
        $fake = new class($says) implements AiProvider
        {
            public int $calls = 0;

            public array $lastMessages = [];

            public function __construct(private string $says) {}

            public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply
            {
                $this->calls++;
                $this->lastMessages = $messages;

                return AiReply::of($this->says, 42);
            }

            public function isConfigured(): bool
            {
                return true;
            }

            public function name(): string
            {
                return 'fake';
            }
        };

        $this->app->instance(AiProvider::class, $fake);

        return $fake;
    }

    private function solution(array $attributes = []): Solution
    {
        return Solution::create(array_merge([
            'title' => 'Enterprise networking',
            'slug' => 'enterprise-networking-'.uniqid(),
            'summary' => 'Switching and routing for busy offices.',
            'overview' => '<p>Structured cabling, core switching and VLAN design.</p>',
            'status' => 'published',
            'sort_order' => 1,
        ], $attributes));
    }

    private function storeProduct(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'Cisco CBS350-24T-4G',
            'slug' => 'cbs350-'.uniqid(),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 4200000,
            'track_stock' => true,
            'stock' => 3,
            'sku' => 'CBS350-24T-4G',
            'specifications' => ['Ports' => '24 × 1G', 'Uplinks' => '4 × SFP'],
            'features' => ['Fanless', 'Layer 3 static routing'],
        ], $attributes));
    }

    private function ask(User $user, string $action, Model $record, array $extra = [])
    {
        return $this->actingAs($user)->postJson("/api/v1/admin/seo/ai/{$action}", array_merge([
            'type' => $record->getMorphClass(),
            'id' => $record->getKey(),
        ], $extra));
    }

    // ---- the list ---------------------------------------------------------------

    public function test_the_eight_actions_are_offered_beside_the_seven(): void
    {
        $this->enable();
        $record = $this->solution();

        $actions = $this->actingAs($this->seoManager())
            ->getJson('/api/v1/admin/seo/ai/suggestions?type=solution&id='.$record->id)
            ->assertOk()
            ->json('meta.actions');

        $values = array_column($actions, 'value');

        foreach (['aeo_analyze', 'questions', 'answer_blocks', 'improve_answer', 'faq_suggest', 'geo_analyze', 'entity_links', 'product_qa'] as $value) {
            $this->assertContains($value, $values);
        }

        $this->assertCount(15, $values);

        // Every entry carries a label and a blurb: the console draws only
        // what the API's option list says, and an empty one is a blank button.
        foreach ($actions as $action) {
            $this->assertNotSame('', $action['label']);
            $this->assertNotSame('', $action['description']);
        }
    }

    // ---- the analyses ---------------------------------------------------------

    public function test_the_two_analyses_parse_to_a_summary_and_three_lists(): void
    {
        $this->enable();
        $user = $this->seoManager();
        $record = $this->solution();

        foreach (['aeo_analyze', 'geo_analyze'] as $action) {
            $this->fakeProvider(json_encode([
                'summary' => 'Readable, but nothing an assistant could lift as a one-line answer.',
                'strengths' => ['States what it covers', 'Names the technologies'],
                'gaps' => ['No definition block', 'No question a buyer asks is answered directly', ''],
                'suggestions' => ['Add a definition block', 'Answer "what does it cost to run" in one sentence'],
                'ranking' => 'should not survive',
            ]));

            $result = $this->ask($user, $action, $record)->assertCreated()->json('data.result');

            $this->assertStringStartsWith('Readable', $result['summary']);
            $this->assertCount(2, $result['strengths']);
            $this->assertCount(2, $result['gaps'], 'blanks are dropped');
            $this->assertCount(2, $result['suggestions']);
            $this->assertArrayNotHasKey('ranking', $result, 'a key that was not asked for is never stored');
        }
    }

    // ---- questions ------------------------------------------------------------

    public function test_questions_are_capped_at_eight_and_never_repeated(): void
    {
        $this->enable();
        $rows = [];
        for ($i = 1; $i <= 10; $i++) {
            $rows[] = ['question' => "Question number {$i}?", 'intent' => 'to compare'];
        }
        $rows[] = ['question' => 'question number 1?', 'intent' => 'a repeat in another case'];
        $rows[] = 'A bare string is a question with no intent?';
        $this->fakeProvider(json_encode(['questions' => $rows]));

        $result = $this->ask($this->seoManager(), 'questions', $this->solution())->assertCreated()->json('data.result');

        $this->assertCount(8, $result['questions']);
        $this->assertSame('Question number 1?', $result['questions'][0]['question']);
        $this->assertSame('to compare', $result['questions'][0]['intent']);
        $this->assertCount(8, array_unique(array_map(fn ($q) => mb_strtolower($q['question']), $result['questions'])));
    }

    // ---- answer blocks --------------------------------------------------------

    public function test_a_block_with_an_unknown_kind_is_dropped_and_a_question_kind_needs_its_question(): void
    {
        $this->enable();
        $this->fakeProvider(json_encode(['blocks' => [
            ['kind' => 'definition', 'answer' => 'Enterprise networking is the switching and routing an office runs on.', 'detail' => "First paragraph.\n\nSecond paragraph."],
            ['kind' => 'testimonial', 'answer' => 'A kind the enum does not know.'],
            ['kind' => 'question', 'answer' => 'An answer with no question.'],
            ['kind' => 'Question', 'question' => 'Does it need a controller?', 'answer' => 'Not for a single site.'],
            ['kind' => 'key_fact', 'answer' => ''],
        ]]));

        $result = $this->ask($this->seoManager(), 'answer_blocks', $this->solution())->assertCreated()->json('data.result');

        $this->assertCount(2, $result['blocks']);
        $this->assertSame('definition', $result['blocks'][0]['kind']);
        $this->assertNull($result['blocks'][0]['question']);
        // Detail is paragraphs the editor can show as paragraphs, built here from escaped text.
        $this->assertSame("<p>First paragraph.</p>\n<p>Second paragraph.</p>", $result['blocks'][0]['detail']);
        $this->assertSame('question', $result['blocks'][1]['kind'], 'the kind is read case-insensitively');
        $this->assertSame('Does it need a controller?', $result['blocks'][1]['question']);
    }

    public function test_more_than_eight_blocks_are_cut_to_eight(): void
    {
        $this->enable();
        $rows = [];
        for ($i = 1; $i <= 11; $i++) {
            $rows[] = ['kind' => 'key_fact', 'answer' => "Fact {$i}."];
        }
        $this->fakeProvider(json_encode(['blocks' => $rows]));

        $result = $this->ask($this->seoManager(), 'answer_blocks', $this->solution())->assertCreated()->json('data.result');

        $this->assertCount(8, $result['blocks']);
    }

    public function test_a_missing_marker_survives_verbatim_in_an_answer(): void
    {
        $this->enable();
        $this->fakeProvider(json_encode(['blocks' => [
            ['kind' => 'key_fact', 'answer' => 'The CBS350-24T-4G carries a [MISSING: warranty term] warranty from Cisco.', 'detail' => 'Register it at [MISSING: registration URL] after purchase.'],
        ]]));

        $result = $this->ask($this->seoManager(), 'product_qa', $this->storeProduct())->assertCreated()->json('data.result');

        $this->assertStringContainsString('[MISSING: warranty term]', $result['blocks'][0]['answer']);
        $this->assertStringContainsString('[MISSING: registration URL]', $result['blocks'][0]['detail']);
    }

    public function test_drafting_blocks_writes_none_to_the_record(): void
    {
        $this->enable();
        $this->fakeProvider(json_encode(['blocks' => [
            ['kind' => 'definition', 'answer' => 'A definition the model wrote.'],
        ]]));
        $record = $this->solution();

        $this->ask($this->seoManager(), 'answer_blocks', $record)->assertCreated();

        // The suggestion exists; the record has no block. Applying is the
        // console adding a draft row and a person pressing Save.
        $this->assertSame(1, SeoSuggestion::count());
        $this->assertSame(0, $record->answerBlocks()->count());
    }

    // ---- improve_answer ---------------------------------------------------------

    public function test_improve_answer_needs_a_block_and_refuses_one_from_another_record(): void
    {
        $this->enable();
        $fake = $this->fakeProvider(json_encode(['answer' => 'Tighter.', 'detail' => 'More.']));
        $user = $this->seoManager();
        $mine = $this->solution();
        $theirs = $this->solution(['title' => 'Somebody else']);
        $theirBlock = $theirs->answerBlocks()->create(['kind' => 'definition', 'answer' => 'Their answer.', 'sort_order' => 0]);

        $this->ask($user, 'improve_answer', $mine)
            ->assertStatus(422)
            ->assertJsonPath('errors.block_id.0', 'Choose which answer block to improve.');

        $this->ask($user, 'improve_answer', $mine, ['block_id' => $theirBlock->id])
            ->assertStatus(422)
            ->assertJsonPath('errors.block_id.0', fn ($m) => str_contains((string) $m, 'not on this record'));

        // Neither refusal reached the model, and nothing was stored.
        $this->assertSame(0, $fake->calls);
        $this->assertSame(0, SeoSuggestion::count());
    }

    public function test_improve_answer_returns_the_answer_and_its_detail_for_the_named_block(): void
    {
        $this->enable();
        $fake = $this->fakeProvider(json_encode([
            'answer' => 'Enterprise networking is the switching and routing an office runs on, sized for [MISSING: user count].',
            'detail' => "It covers the core switches.\n\nAnd the access layer.",
        ]));
        $record = $this->solution();
        $draft = $record->answerBlocks()->create([
            'kind' => 'definition', 'answer' => 'The old, wordier answer about networking.', 'sort_order' => 0, 'status' => 'draft',
        ]);

        $result = $this->ask($this->seoManager(), 'improve_answer', $record, ['block_id' => $draft->id])
            ->assertCreated()
            ->json('data.result');

        $this->assertStringContainsString('[MISSING: user count]', $result['answer']);
        $this->assertSame("<p>It covers the core switches.</p>\n<p>And the access layer.</p>", $result['detail']);

        // The prompt named the block — a draft one, which the public
        // relation would not carry — inside its own fence.
        $context = $fake->lastMessages[1]['content'];
        $this->assertStringContainsString('THE BLOCK TO IMPROVE', $context);
        $this->assertStringContainsString('Answer: The old, wordier answer about networking.', $context);
        $this->assertStringContainsString('Kind: definition', $context);
    }

    // ---- faq_suggest ------------------------------------------------------------

    public function test_faq_suggest_reuses_the_faq_shape(): void
    {
        $this->enable();
        $this->fakeProvider(json_encode(['faqs' => [
            ['question' => 'Does it include cabling?', 'answer' => 'Structured cabling is part of the design.'],
            ['question' => '', 'answer' => 'An answer with no question is dropped.'],
        ]]));

        $result = $this->ask($this->seoManager(), 'faq_suggest', $this->solution())->assertCreated()->json('data.result');

        $this->assertCount(1, $result['faqs']);
        $this->assertSame('Does it include cabling?', $result['faqs'][0]['question']);
        $this->assertArrayHasKey('answer', $result['faqs'][0]);
    }

    // ---- entity_links -----------------------------------------------------------

    public function test_entity_links_drop_a_number_outside_the_list_and_carry_the_lists_relation(): void
    {
        $this->enable();
        Service::create([
            'title' => 'Network installation', 'slug' => 'network-installation', 'summary' => 'Install.',
            'body' => '<p>Install.</p>', 'status' => 'published', 'sort_order' => 1,
        ]);
        Cache::flush();

        // The list holds the record's own page filtered out, so [1] is the
        // service. The model calls it a "solution" and invents [99].
        $fake = $this->fakeProvider(json_encode(['links' => [
            ['n' => 1, 'relation' => 'solution', 'reason' => 'It is installed by this service.'],
            ['n' => 99, 'relation' => 'article', 'reason' => 'invented'],
            ['n' => 1, 'relation' => 'service', 'reason' => 'a repeat'],
        ]]));

        $result = $this->ask($this->seoManager(), 'entity_links', $this->solution())->assertCreated()->json('data.result');

        $this->assertCount(1, $result['links']);
        $this->assertSame(1, $result['links'][0]['n']);
        $this->assertSame('service', $result['links'][0]['relation'], 'the relation is the list\'s, not the model\'s');
        $this->assertSame('/services/network-installation', $result['links'][0]['path']);

        // The numbered list named the relation beside each entry.
        $this->assertStringContainsString('[1] (service) Network installation — /services/network-installation', $fake->lastMessages[1]['content']);
    }

    public function test_entity_links_never_offer_the_record_itself(): void
    {
        $this->enable();
        $record = $this->solution();
        Cache::flush();

        $fake = $this->fakeProvider(json_encode(['links' => [['n' => 1, 'relation' => 'solution', 'reason' => 'itself']]]));

        // The only published record is the one being asked about, so the
        // list is empty and [1] is nothing.
        $this->ask($this->seoManager(), 'entity_links', $record)->assertStatus(422);
        $this->assertStringNotContainsString($record->publicPath(), $fake->lastMessages[1]['content']);
    }

    // ---- what the model is told ----------------------------------------------------

    public function test_the_context_carries_the_blocks_and_the_faqs_already_on_the_page(): void
    {
        $this->enable();
        $record = $this->solution();
        $record->answerBlocks()->create(['kind' => 'definition', 'answer' => 'A definition already written.', 'sort_order' => 0]);
        $record->answerBlocks()->create(['kind' => 'question', 'question' => 'Is it managed?', 'answer' => 'Yes, under an AMC.', 'sort_order' => 1, 'status' => 'draft']);
        $record->faqs()->create(['question' => 'How long does a site take?', 'answer' => '<p>Two to three <b>weeks</b>.</p>', 'sort_order' => 0]);

        $data = $this->actingAs($this->seoManager())
            ->getJson('/api/v1/admin/seo/ai/context?type=solution&id='.$record->id.'&action=aeo_analyze')
            ->assertOk()
            ->json('data');

        $context = $data['context'];
        $this->assertStringContainsString('Answer blocks already on the page:', $context);
        $this->assertStringContainsString('- [definition] A definition already written.', $context);
        $this->assertStringContainsString('- [question, draft] Is it managed? — Yes, under an AMC.', $context);
        $this->assertStringContainsString('FAQs already on the page:', $context);
        $this->assertStringContainsString('- How long does a site take? — Two to three weeks.', $context);

        // Inside the record's fence: every one of those is content-manager
        // authored, and the fence is what keeps it material rather than
        // instruction.
        $page = strpos($context, 'THE PAGE');
        $fence = strpos($context, '---WEBSITE COPY---', $page);
        $this->assertGreaterThan($fence, strpos($context, 'Answer blocks already on the page:'));
        $this->assertGreaterThan($fence, strpos($context, 'FAQs already on the page:'));
    }

    public function test_an_empty_page_says_so_rather_than_leaving_a_gap(): void
    {
        $this->enable();

        $context = SeoContext::build(SeoAiAction::AnswerBlocks, $this->solution());

        $this->assertStringContainsString("Answer blocks already on the page:\n(none yet)", $context);
        $this->assertStringContainsString("FAQs already on the page:\n(none yet)", $context);
    }

    public function test_a_store_products_facts_are_stated_and_a_blank_one_is_named_as_blank(): void
    {
        $this->enable();
        $brand = Brand::create(['name' => 'Cisco', 'slug' => 'cisco', 'sort_order' => 1]);
        $product = $this->storeProduct(['brand_id' => $brand->id, 'warranty' => null, 'applications' => 'Branch office access switching.']);

        $context = SeoContext::build(SeoAiAction::ProductQa, $product);

        $this->assertStringContainsString('Product facts, from the catalogue record.', $context);
        $this->assertStringContainsString('Brand: Cisco', $context);
        $this->assertStringContainsString('SKU: CBS350-24T-4G', $context);
        $this->assertStringContainsString('GTIN: (not entered)', $context);
        $this->assertStringContainsString('Warranty: (not entered)', $context);
        $this->assertStringContainsString('Applications: Branch office access switching.', $context);
        $this->assertStringContainsString('Availability: in stock', $context);
        $this->assertStringContainsString('- Ports: 24 × 1G', $context);
        $this->assertStringContainsString('- Fanless', $context);
        $this->assertStringContainsString('Price: ', $context);

        // The rule that turns a blank into a hole — ours, so outside the
        // fence — and the vocabulary the reply is validated against.
        $this->assertStringContainsString(SeoContext::MISSING_RULE, $context);
        $this->assertStringContainsString('Permitted block kinds: definition, who_for', $context);
        $page = strpos($context, 'THE PAGE');
        $fence = strpos($context, '---WEBSITE COPY---', $page);
        $this->assertLessThan($fence, strpos($context, '[MISSING: what is missing]'));
        $this->assertGreaterThan($fence, strpos($context, 'Brand: Cisco'));
    }

    public function test_the_missing_rule_is_stated_only_where_an_answer_is_written(): void
    {
        $this->enable();
        $record = $this->solution();

        foreach ([SeoAiAction::AnswerBlocks, SeoAiAction::ProductQa, SeoAiAction::ImproveAnswer, SeoAiAction::FaqSuggest] as $action) {
            $this->assertStringContainsString(SeoContext::MISSING_RULE, SeoContext::build($action, $record), $action->value);
        }

        foreach ([SeoAiAction::AeoAnalyze, SeoAiAction::GeoAnalyze, SeoAiAction::Questions, SeoAiAction::EntityLinks, SeoAiAction::Generate] as $action) {
            $this->assertStringNotContainsString(SeoContext::MISSING_RULE, SeoContext::build($action, $record), $action->value);
        }
    }

    public function test_a_solution_carries_no_product_facts(): void
    {
        $this->enable();

        $this->assertStringNotContainsString('Product facts', SeoContext::build(SeoAiAction::ProductQa, $this->solution()));
    }

    // ---- bulk ---------------------------------------------------------------------

    public function test_a_bulk_run_refuses_the_one_block_action_before_queueing(): void
    {
        Queue::fake();
        $this->enable();
        $record = $this->solution();

        $this->actingAs($this->seoManager())
            ->postJson('/api/v1/admin/seo/ai/bulk', ['action' => 'improve_answer', 'type' => 'solution', 'ids' => [$record->id]])
            ->assertStatus(422)
            ->assertJsonPath('errors.action.0', fn ($m) => str_contains((string) $m, 'one block at a time'));

        Queue::assertNothingPushed();
    }

    public function test_a_bulk_run_accepts_the_new_actions(): void
    {
        Queue::fake();
        $this->enable();
        $record = $this->solution();

        $res = $this->actingAs($this->seoManager())
            ->postJson('/api/v1/admin/seo/ai/bulk', ['action' => 'answer_blocks', 'type' => 'solution', 'ids' => [$record->id]])
            ->assertStatus(202)
            ->json();

        $this->assertSame(1, $res['queued']);
    }
}
