<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Brand;
use App\Models\Faq;
use App\Models\KnowledgeArticle;
use App\Models\KnowledgeCategory;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * FAQs on the seven records that never took them, and the FAQPage gate.
 *
 * The gate is the part worth a test on its own: an `FAQPage` over one
 * question is the shape a template produces, and the frontend used to emit
 * one for any FAQ list at all. `StructuredData::answerFaqs()` counts the
 * FAQs and the `question` answer blocks together and answers null under
 * two — so one of each is a page, one alone is not.
 */
class FaqOwnersTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'cm-faq-owners@example.test'],
            ['name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::ContentManager->value],
                ['name' => RoleEnum::ContentManager->label()],
            ));
        }

        return $user->load('roles');
    }

    private function article(): KnowledgeArticle
    {
        $category = KnowledgeCategory::create(['name' => 'Wireless', 'slug' => 'wireless']);

        return KnowledgeArticle::create([
            'knowledge_category_id' => $category->id,
            'title' => 'Fixing a flapping uplink', 'slug' => 'fixing-a-flapping-uplink',
            'excerpt' => 'Why an uplink drops and comes back.', 'body' => '<p>Check the SFP first.</p>',
            'status' => PublishStatus::Published, 'published_at' => now(),
        ]);
    }

    private function faq(string $question = 'Is it covered?'): array
    {
        return ['question' => $question, 'answer' => 'Yes.'];
    }

    // ------------------------------------------------------------ owners

    public function test_a_brand_takes_faqs_through_its_own_form(): void
    {
        $response = $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/brands', [
                'name' => 'Cisco', 'slug' => 'cisco',
                'faqs' => [$this->faq('Do you sell Cisco?'), $this->faq('Is Cisco supported?')],
            ])
            ->assertCreated();

        $this->assertSame(['Do you sell Cisco?', 'Is Cisco supported?'], $response->json('data.faqs.*.question'));
        $this->assertSame(2, Faq::where('faqable_type', 'brand')->count());
    }

    /**
     * An answer saved through an entity's own form is cleaned like one saved
     * on the FAQ screen. It renders through the same `Prose` either way, and
     * the entity forms declared nothing for it.
     */
    public function test_an_answer_saved_through_an_entity_form_is_sanitised(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/brands', [
                'name' => 'Cisco', 'slug' => 'cisco',
                'faqs' => [['question' => 'Is it covered?', 'answer' => '<p>Yes.<script>alert(1)</script><img src=x onerror=alert(2)></p>']],
            ])
            ->assertCreated();

        $answer = Faq::where('faqable_type', 'brand')->sole()->answer;

        $this->assertStringContainsString('Yes.', $answer);
        $this->assertStringNotContainsString('<script', $answer);
        $this->assertStringNotContainsString('onerror', $answer);
    }

    public function test_a_knowledge_article_takes_faqs_through_its_own_form(): void
    {
        $article = $this->article();

        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/knowledge-articles/{$article->id}", ['faqs' => [$this->faq()]])
            ->assertOk()
            ->assertJsonPath('data.faqs.0.question', 'Is it covered?');

        $this->assertSame('knowledge_article', Faq::firstOrFail()->faqable_type);
    }

    /** The cross-cutting FAQ screen offers the widened owners. */
    public function test_the_owner_picker_lists_the_new_owners(): void
    {
        $types = collect($this->actingAs($this->editor(), 'sanctum')
            ->getJson('/api/v1/admin/faq-owners')
            ->assertOk()
            ->json('data'))->pluck('type')->all();

        foreach (['brand', 'blog_post', 'knowledge_article', 'industry', 'product_category', 'store_product', 'store_category'] as $type) {
            $this->assertContains($type, $types);
        }
    }

    public function test_a_brand_faq_can_be_filed_from_the_faq_screen(): void
    {
        $brand = Brand::create(['name' => 'Aruba', 'slug' => 'aruba']);

        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/faqs', [
                'question' => 'Is Aruba supported?', 'answer' => 'Yes.',
                'owner_type' => 'brand', 'owner_id' => $brand->id,
            ])
            ->assertCreated();

        $this->assertSame(1, $brand->faqs()->count());
    }

    // -------------------------------------------------------------- gate

    public function test_one_faq_alone_emits_no_faq_page(): void
    {
        $article = $this->article();
        $article->faqs()->create(['question' => 'Only one?', 'answer' => 'Yes.', 'sort_order' => 0]);

        $response = $this->getJson('/api/v1/knowledge-base/fixing-a-flapping-uplink')->assertOk();

        $this->assertCount(1, $response->json('data.faqs'));
        $this->assertArrayNotHasKey('faq_schema', $response->json('data'));
    }

    public function test_two_faqs_emit_a_faq_page(): void
    {
        $article = $this->article();
        $article->faqs()->create(['question' => 'First?', 'answer' => 'Yes.', 'sort_order' => 0]);
        $article->faqs()->create(['question' => 'Second?', 'answer' => 'Also yes.', 'sort_order' => 1]);

        $response = $this->getJson('/api/v1/knowledge-base/fixing-a-flapping-uplink')->assertOk();

        $this->assertSame('FAQPage', $response->json('data.faq_schema.@type'));
        $this->assertSame(['First?', 'Second?'], $response->json('data.faq_schema.mainEntity.*.name'));
        // The record's own graph is untouched beside it.
        $this->assertSame('TechArticle', $response->json('data.schema.@type'));
    }

    /**
     * One FAQ and one question block is a real pair. The block's detail
     * rides in the answer text after the direct answer, as text.
     */
    public function test_one_faq_and_one_question_block_emit_a_faq_page(): void
    {
        $article = $this->article();
        $article->faqs()->create(['question' => 'From the FAQ?', 'answer' => 'Yes.', 'sort_order' => 0]);
        $article->answerBlocks()->create([
            'kind' => 'question', 'question' => 'From a block?', 'answer' => 'Also yes.',
            'detail' => '<p>With <b>detail</b>.</p>', 'sort_order' => 0,
        ]);
        // A definition is not a question and must not count.
        $article->answerBlocks()->create(['kind' => 'definition', 'answer' => 'An uplink is a link up.', 'sort_order' => 1]);

        $response = $this->getJson('/api/v1/knowledge-base/fixing-a-flapping-uplink')->assertOk();

        $entries = $response->json('data.faq_schema.mainEntity');
        $this->assertCount(2, $entries);
        $this->assertSame('From a block?', $entries[1]['name']);
        $this->assertSame('Also yes. With detail.', $entries[1]['acceptedAnswer']['text']);
    }

    public function test_a_draft_question_block_does_not_count(): void
    {
        $article = $this->article();
        $article->faqs()->create(['question' => 'From the FAQ?', 'answer' => 'Yes.', 'sort_order' => 0]);
        $article->answerBlocks()->create([
            'kind' => 'question', 'question' => 'Unfinished?', 'answer' => 'Not yet.', 'status' => 'draft', 'sort_order' => 0,
        ]);

        $this->assertArrayNotHasKey('faq_schema', $this->getJson('/api/v1/knowledge-base/fixing-a-flapping-uplink')->json('data'));
    }
}
