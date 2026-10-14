<?php

namespace Tests\Feature;

use App\Enums\LeadStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
use App\Support\Copilot\Copilot;
use App\Support\Copilot\Questions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Ask ALTIS (0.177.0, docs/copilot.md).
 *
 * What the feature rests on, each pinned on its own:
 *
 *   1. **The figures are the console's own.** Every answer comes out of a
 *      scope the dashboard and the list filters already use, so the number
 *      and the screen it links to cannot disagree.
 *   2. **A role is never offered a question it may not ask**, and the
 *      narrowing happens before the words are matched and before a model
 *      is shown anything.
 *   3. **It works with no model.** The words match most questions on their
 *      own; the assistant being off changes nothing but the fallback.
 *   4. **The model can only pick from the list.** Its whole output is an
 *      index; anything else — out of range, a sentence, a refusal — is
 *      dropped, and nothing it returns is ever shown to anybody.
 */
class CopilotTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------- the answers */

    public function test_it_counts_the_open_tickets(): void
    {
        $this->tickets(3);

        $answer = $this->ask('how many tickets are open?', RoleEnum::SupportEngineer);

        $this->assertTrue($answer['matched']);
        $this->assertSame('tickets_open', $answer['key']);
        $this->assertSame(3, $answer['figure']);
        $this->assertStringContainsString('3 tickets are open', $answer['sentence']);
        $this->assertSame('/admin/tickets?open=1', $answer['href']);
    }

    /**
     * The figure is the scope's, so it moves with the scope.
     *
     * Asserted against `Ticket::open()` rather than against a literal: a
     * test that hard-codes the number proves the copilot can count to
     * three, and this one proves it is reading what the console reads.
     */
    public function test_the_figure_is_the_console_s_own_scope(): void
    {
        $this->tickets(4);
        Ticket::query()->first()?->update(['status' => TicketStatus::Closed]);

        $answer = $this->ask('open tickets', RoleEnum::SupportEngineer);

        $this->assertSame(Ticket::open()->count(), $answer['figure']);
    }

    /**
     * Nothing to count gets its own sentence and no link.
     *
     * "0 tickets are open" is a sentence a machine writes, and a link to an
     * empty list is a click that answers nothing.
     */
    public function test_nothing_to_count_reads_as_a_sentence_and_offers_no_link(): void
    {
        $answer = $this->ask('how many tickets are open?', RoleEnum::SupportEngineer);

        $this->assertSame(0, $answer['figure']);
        $this->assertSame('Nothing is open. The queue is clear.', $answer['sentence']);
        $this->assertNull($answer['href']);
    }

    public function test_it_counts_new_leads_for_a_sales_manager(): void
    {
        Lead::create(['name' => 'A', 'email' => 'a@example.test', 'status' => LeadStatus::New, 'channel' => 'contact']);

        $answer = $this->ask('any new leads?', RoleEnum::SalesManager);

        $this->assertSame('leads_new', $answer['key']);
        $this->assertSame(1, $answer['figure']);
        $this->assertStringContainsString('One lead is new', $answer['sentence']);
    }

    /* --------------------------------------------------------- the roles */

    /** A question belongs to a role, and the list is narrowed before anything else. */
    public function test_a_role_is_only_offered_its_own_questions(): void
    {
        $support = array_column(
            array_map(fn ($q) => $q->toArray(), Questions::for([RoleEnum::SupportEngineer->value])),
            'key',
        );

        $this->assertContains('tickets_open', $support);
        $this->assertNotContains('store_revenue_month', $support);
        $this->assertNotContains('customers_pending', $support);
    }

    /** An administrator passes every role check, here as everywhere. */
    public function test_an_administrator_may_ask_everything(): void
    {
        $this->assertCount(
            count(Questions::all()),
            Questions::for([RoleEnum::Admin->value]),
        );
    }

    /**
     * A question outside the role is not refused — it does not exist.
     *
     * The distinction matters: refusing would confirm the question is one
     * somebody else can ask, which is a thing this console does not tell
     * people about each other's screens.
     */
    public function test_a_question_outside_the_role_is_simply_not_answered(): void
    {
        $answer = $this->ask('how much have we taken this month?', RoleEnum::SupportEngineer);

        $this->assertFalse($answer['matched']);
        $this->assertNull($answer['figure']);
        $this->assertNotEmpty($answer['suggestions']);

        foreach ($answer['suggestions'] as $suggestion) {
            $this->assertNotSame('store_revenue_month', $suggestion['key']);
        }
    }

    /* --------------------------------------------------------- the words */

    /**
     * Most questions never reach a model, which is what makes this work on
     * an install with no key — and what keeps it free.
     *
     * The assistant is switched **on** here deliberately. The first cut
     * bound a throwing provider and left the assistant off, so `byModel()`
     * returned at its first guard and the provider was unreachable: the
     * test passed without ever being able to fail. Switched on, a rules
     * miss reaches the provider and the throw fails this test by name,
     * which is the control that makes the assertion mean something.
     */
    public function test_the_words_answer_without_a_model(): void
    {
        $this->model(['index' => 0]);

        $this->app->bind(AiProvider::class, fn () => new class implements AiProvider
        {
            public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply
            {
                throw new \RuntimeException('the model must not be asked');
            }

            public function isConfigured(): bool
            {
                return true;
            }

            public function name(): string
            {
                return 'never';
            }
        });

        $this->tickets(2);

        $answer = $this->ask('overdue tickets', RoleEnum::SupportEngineer);

        $this->assertSame('tickets_overdue', $answer['key']);
        $this->assertSame('words', $answer['source']);
    }

    /** Plural and singular are the same question. */
    public function test_a_singular_asking_finds_the_same_question(): void
    {
        $this->assertSame(
            'tickets_unassigned',
            $this->ask('is there an unassigned ticket', RoleEnum::SupportEngineer)['key'],
        );
    }

    /* --------------------------------------------------------- the model */

    /** Its whole output is an index, and an index is all that is read. */
    public function test_the_model_picks_one_of_the_questions(): void
    {
        $available = Questions::for([RoleEnum::SupportEngineer->value]);
        $wanted = null;

        foreach ($available as $i => $question) {
            if ($question->key === 'tickets_reported') {
                $wanted = $i;
            }
        }

        $this->assertNotNull($wanted);
        $this->model(['index' => $wanted]);

        // Deliberately nothing the words can match.
        $answer = $this->ask('anyone grumbling', RoleEnum::SupportEngineer);

        $this->assertSame('tickets_reported', $answer['key']);
        $this->assertSame('model', $answer['source']);
    }

    /**
     * An index outside the list is dropped, not clamped.
     *
     * Clamping would answer *some* question for a model that returned
     * nonsense, and the one it lands on would be arbitrary.
     */
    public function test_an_index_outside_the_list_is_dropped(): void
    {
        $this->model(['index' => 999]);

        $this->assertFalse($this->ask('zzzz qqqq', RoleEnum::SupportEngineer)['matched']);
    }

    /** A sentence where a number belongs is dropped, and never shown. */
    public function test_a_model_that_answers_in_words_is_ignored(): void
    {
        $this->model(['index' => 'there are four open tickets']);

        $answer = $this->ask('zzzz qqqq', RoleEnum::SupportEngineer);

        $this->assertFalse($answer['matched']);
        $this->assertStringNotContainsString('four', $answer['sentence']);
    }

    /** A model that cannot be reached costs the asking nothing. */
    public function test_a_failed_model_leaves_the_copilot_working(): void
    {
        $this->model(null);
        $this->tickets(1);

        // The words still answer this one.
        $this->assertSame('tickets_open', $this->ask('open tickets', RoleEnum::SupportEngineer)['key']);
        // And this one simply is not answered.
        $this->assertFalse($this->ask('zzzz qqqq', RoleEnum::SupportEngineer)['matched']);
    }

    /* ------------------------------------------------------- the endpoint */

    public function test_the_endpoint_lists_what_this_account_may_ask(): void
    {
        $response = $this->as(RoleEnum::SalesManager)
            ->getJson('/api/v1/admin/copilot/questions')
            ->assertOk();

        $keys = array_column($response->json('data'), 'key');

        $this->assertContains('leads_new', $keys);
        $this->assertNotContains('tickets_open', $keys);
    }

    public function test_the_endpoint_answers_a_question(): void
    {
        $this->tickets(2);

        $this->as(RoleEnum::SupportEngineer)
            ->postJson('/api/v1/admin/copilot/ask', ['question' => 'how many open tickets'])
            ->assertOk()
            ->assertJsonPath('data.key', 'tickets_open')
            ->assertJsonPath('data.figure', 2);
    }

    public function test_a_customer_token_cannot_reach_it(): void
    {
        $customer = new Customer;
        $customer->forceFill([
            'name' => 'Priya', 'email' => 'priya@example.test', 'password' => 'x',
            'status' => 'active', 'email_verified_at' => now(),
        ])->save();

        $this->withHeader('Authorization', 'Bearer '.$customer->createToken('portal')->plainTextToken)
            ->getJson('/api/v1/admin/copilot/questions')
            ->assertForbidden();
    }

    public function test_an_empty_question_is_refused(): void
    {
        $this->as(RoleEnum::SupportEngineer)
            ->postJson('/api/v1/admin/copilot/ask', ['question' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('question');
    }

    /* ------------------------------------------------------------ helpers */

    private function tickets(int $n): void
    {
        $customer = new Customer;
        $customer->forceFill([
            'name' => 'Priya Das', 'email' => 'tickets@example.test', 'password' => 'x',
            'status' => 'active', 'email_verified_at' => now(),
        ])->save();

        $category = TicketCategory::firstOrCreate(
            ['slug' => 'general'],
            ['name' => 'General', 'sort_order' => 1],
        );

        for ($i = 0; $i < $n; $i++) {
            Ticket::create([
                'customer_id' => $customer->id,
                'ticket_category_id' => $category->id,
                'subject' => "Ticket {$i}",
                'description' => 'Something is wrong.',
                'status' => TicketStatus::Open,
                'priority' => TicketPriority::Normal,
            ]);
        }
    }

    /** Stand a model in. `null` is one that cannot be reached. */
    private function model(?array $answer): void
    {
        foreach ([
            'seo_ai_enabled' => '1',
            'openrouter_api_key' => 'test-key',
        ] as $key => $value) {
            Setting::updateOrCreate(['key' => $key], ['group' => 'seo', 'value' => $value, 'type' => 'string']);
        }
        Setting::flushCache();

        $this->app->bind(AiProvider::class, fn () => new class($answer) implements AiProvider
        {
            public function __construct(private ?array $answer) {}

            public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply
            {
                return $this->answer === null
                    ? AiReply::failed('nothing answered')
                    : AiReply::of(json_encode($this->answer));
            }

            public function isConfigured(): bool
            {
                return true;
            }

            public function name(): string
            {
                return 'stand-in';
            }
        });
    }

    private function ask(string $question, RoleEnum $role): array
    {
        $user = $this->staff($role);
        $this->actingAs($user);

        return app(Copilot::class)->ask($question, $user->roles->pluck('slug')->all());
    }

    private function staff(RoleEnum $role): User
    {
        $user = User::create([
            'name' => ucfirst($role->value),
            'email' => $role->value.'-'.Str::random(6).'@example.test',
            'phone' => '9800000001',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user->load('roles');
    }

    private function as(RoleEnum $role): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeader(
            'Authorization',
            'Bearer '.$this->staff($role)->createToken('admin')->plainTextToken,
        );
    }
}
