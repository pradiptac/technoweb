<?php

namespace Tests\Feature;

use App\Enums\AnswerBlockKind;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\AnswerBlock;
use App\Models\Role;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Answer blocks — the "What is it / Who is it for / Key facts / Steps /
 * Questions" sections of a page, as data an editor writes.
 *
 * The rules pinned here are the `faqs` rules, because the table is the
 * `faqs` shape with a kind: replaced wholesale on save, `[]` clears, an
 * absent key leaves them alone, and the rich-text half goes through the
 * sanitiser like any body. Written through a solution (the content
 * manager's door) and a store product (the store manager's), because the
 * two controllers reach `saveAnswerBlocks()` by different paths and either
 * could have forgotten it.
 */
class AnswerBlockTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            ['name' => 'Test staff', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => $role->value],
                ['name' => $role->label()],
            ));
        }

        return $user->load('roles');
    }

    private function editor(): User
    {
        return $this->staff(RoleEnum::ContentManager, 'cm-answer-blocks@example.test');
    }

    private function storeManager(): User
    {
        return $this->staff(RoleEnum::StoreManager, 'sm-answer-blocks@example.test');
    }

    private function solution(): Solution
    {
        return Solution::create([
            'title' => 'Enterprise Wi-Fi', 'slug' => 'enterprise-wifi',
            'summary' => 'Campus wireless that stays up.', 'status' => PublishStatus::Published,
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    private function blocks(): array
    {
        return [
            ['kind' => 'definition', 'answer' => 'Enterprise Wi-Fi is a managed wireless network built for hundreds of devices at once.'],
            ['kind' => 'question', 'question' => 'Does it cover outdoor areas?', 'answer' => 'Yes, with outdoor-rated access points.', 'detail' => '<p>Rated to <b>IP67</b>.</p>'],
        ];
    }

    // ---------------------------------------------------------- writing

    public function test_a_solution_stores_its_answer_blocks_in_order(): void
    {
        $solution = $this->solution();

        $response = $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => $this->blocks()])
            ->assertOk();

        $this->assertSame(['definition', 'question'], $response->json('data.answer_blocks.*.kind'));
        $this->assertSame([0, 1], $response->json('data.answer_blocks.*.sort_order'));
        $this->assertSame('published', $response->json('data.answer_blocks.0.status'));
        $this->assertNull($response->json('data.answer_blocks.0.question'));
        $this->assertSame('Does it cover outdoor areas?', $response->json('data.answer_blocks.1.question'));

        $this->assertSame(2, AnswerBlock::where('blockable_type', 'solution')->where('blockable_id', $solution->id)->count());
    }

    public function test_a_store_product_stores_its_answer_blocks(): void
    {
        $response = $this->actingAs($this->storeManager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', [
                'name' => 'CBS350 24-Port Switch', 'type' => ProductType::Physical->value,
                'status' => PublishStatus::Published->value, 'price_paise' => 1180000,
                'answer_blocks' => $this->blocks(),
            ])
            ->assertCreated();

        $this->assertSame(['definition', 'question'], $response->json('data.answer_blocks.*.kind'));
        $this->assertSame('store_product', AnswerBlock::firstOrFail()->blockable_type);
    }

    /**
     * The `faqs` contract: the set is replaced, never merged.
     */
    public function test_the_set_is_replaced_wholesale(): void
    {
        $solution = $this->solution();
        $editor = $this->editor();

        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => $this->blocks()])
            ->assertOk();

        $response = $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => [
                ['kind' => 'step', 'answer' => 'Survey the site.'],
            ]])
            ->assertOk();

        $this->assertSame(['step'], $response->json('data.answer_blocks.*.kind'));
        $this->assertSame(1, $solution->answerBlocks()->count());
    }

    public function test_an_empty_list_clears_and_an_absent_key_leaves_alone(): void
    {
        $solution = $this->solution();
        $editor = $this->editor();

        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => $this->blocks()])
            ->assertOk();

        // Absent: the summary changes, the blocks do not.
        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['summary' => 'Still here.'])
            ->assertOk();
        $this->assertSame(2, $solution->answerBlocks()->count());

        // Empty: cleared, which has to be possible or the last one could never go.
        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => []])
            ->assertOk()
            ->assertJsonPath('data.answer_blocks', []);
        $this->assertSame(0, $solution->answerBlocks()->count());
    }

    /**
     * `detail` is rich text and goes through the sanitiser. Planted as a
     * `<script>` in a repeater row, because the trait's `$this->has()` is
     * false for a wildcard path and the first cut cleaned nothing.
     */
    public function test_detail_is_sanitised_on_write(): void
    {
        $solution = $this->solution();

        $response = $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => [
                ['kind' => 'definition', 'answer' => 'A thing.', 'detail' => '<p>Safe.</p><script>alert(1)</script><p onclick="x()">Also safe.</p>'],
            ]])
            ->assertOk();

        $detail = $response->json('data.answer_blocks.0.detail');
        $this->assertStringNotContainsString('<script', $detail);
        $this->assertStringNotContainsString('onclick', $detail);
        $this->assertStringContainsString('Safe.', $detail);
        $this->assertStringNotContainsString('<script', (string) AnswerBlock::firstOrFail()->detail);
    }

    public function test_a_question_block_needs_its_question(): void
    {
        $solution = $this->solution();

        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => [
                ['kind' => 'question', 'answer' => 'An answer to nothing.'],
            ]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('answer_blocks.0.question');

        // A definition has no question, and must not be asked for one.
        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => [
                ['kind' => 'definition', 'answer' => 'A thing.'],
            ]])
            ->assertOk();
    }

    public function test_the_direct_answer_is_capped_and_the_kind_is_an_allowlist(): void
    {
        $solution = $this->solution();

        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => [
                ['kind' => 'definition', 'answer' => str_repeat('x', 601)],
                ['kind' => 'sonnet', 'answer' => 'Not a kind.'],
            ]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['answer_blocks.0.answer', 'answer_blocks.1.kind']);
    }

    // ---------------------------------------------------------- reading

    /**
     * The page draws the published set, in order, with the heading each
     * block renders under; a draft never leaves the console.
     */
    public function test_the_public_resource_carries_published_blocks_only_in_order(): void
    {
        $solution = $this->solution();

        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['answer_blocks' => [
                ['kind' => 'step', 'answer' => 'Second, in the list.', 'status' => 'published'],
                ['kind' => 'definition', 'answer' => 'Not yet.', 'status' => 'draft'],
                ['kind' => 'use_case', 'answer' => 'Third, in the list.'],
            ]])
            ->assertOk();

        $response = $this->getJson('/api/v1/solutions/enterprise-wifi')->assertOk();

        $this->assertSame(['step', 'use_case'], $response->json('data.answer_blocks.*.kind'));
        $this->assertSame(['How it works', 'Use cases'], $response->json('data.answer_blocks.*.heading'));
        $this->assertArrayNotHasKey('id', $response->json('data.answer_blocks.0'));
        $this->assertArrayNotHasKey('status', $response->json('data.answer_blocks.0'));

        // The index carries no key at all: a listing loads no blocks.
        $this->assertArrayNotHasKey('answer_blocks', $this->getJson('/api/v1/solutions')->json('data.0'));
    }

    public function test_every_admin_index_sends_the_kinds(): void
    {
        $options = $this->actingAs($this->editor(), 'sanctum')
            ->getJson('/api/v1/admin/solutions')
            ->assertOk()
            ->json('meta.answer_block_kinds');

        $this->assertSame(AnswerBlockKind::values(), array_column($options, 'value'));
        $this->assertSame('What is it?', $options[0]['heading']);
        $this->assertFalse($options[0]['asks_question']);
        $this->assertTrue(collect($options)->firstWhere('value', 'question')['asks_question']);

        $this->actingAs($this->storeManager(), 'sanctum')
            ->getJson('/api/v1/admin/store/products')
            ->assertOk()
            ->assertJsonPath('meta.answer_block_kinds.0.value', 'definition');
    }

    /**
     * The morph alias, not the class name — a row stored with the FQCN is
     * one a renamed model can never find again.
     */
    public function test_the_morph_alias_is_stored(): void
    {
        $product = StoreProduct::create([
            'name' => 'A switch', 'slug' => 'a-switch', 'type' => ProductType::Physical,
            'status' => PublishStatus::Published, 'price_paise' => 100,
        ]);

        $product->answerBlocks()->create(['kind' => 'definition', 'answer' => 'A switch.', 'sort_order' => 0]);

        $this->assertDatabaseHas('answer_blocks', ['blockable_type' => 'store_product', 'blockable_id' => $product->id]);
    }
}
