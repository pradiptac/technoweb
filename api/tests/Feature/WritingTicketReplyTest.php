<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\PublishStatus;
use App\Enums\Role;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\KnowledgeArticle;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Support\Writing\Surfaces\TicketReplySurface;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\FakesEmbeddings;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

/** A ticket reply drafted from what the customer can see — and nothing private. */
class WritingTicketReplyTest extends TestCase
{
    use FakesEmbeddings, FakesWriter, RefreshDatabase;

    /**
     * @param  list<array{0: string, 1: string, 2: bool, 3: bool}>  $rows  [author, body, is_internal, is_sensitive]
     * @param  array<string, mixed>  $ticketAttrs
     * @return array{0: Ticket}
     */
    private function ticketWithThread(array $rows, array $ticketAttrs = []): array
    {
        $customer = Customer::firstOrCreate(['email' => 'neil@example.test'], [
            'name' => 'Neil Basu', 'email' => 'neil@example.test',
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
        $engineer = User::firstOrCreate(['email' => 'engineer@example.test'], [
            'name' => 'Support Engineer', 'email' => 'engineer@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $ticket = Ticket::create($ticketAttrs + [
            'customer_id' => $customer->id,
            'ticket_category_id' => TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true])->id,
            'subject' => 'Switch drops every hour',
            'description' => 'It happens hourly.',
            'status' => TicketStatus::Open,
            'priority' => 'normal',
        ]);
        foreach ($rows as [$author, $body, $internal, $sensitive]) {
            $who = $author === 'customer' ? $customer : $engineer;
            $ticket->messages()->create([
                'author_type' => $who->getMorphClass(), 'author_id' => $who->id,
                'body' => $body, 'is_internal' => $internal, 'is_sensitive' => $sensitive,
            ]);
        }

        return [$ticket];
    }

    private function ask(User $user, Ticket|string $ticket, array $extra = [])
    {
        $reference = $ticket instanceof Ticket ? $ticket->reference : $ticket;

        return $this->actingAs($user, 'sanctum')->postJson('/api/v1/admin/writing', $extra + [
            'surface' => 'ticket_reply', 'mode' => 'write', 'brief' => 'Ask for the firmware version',
            'input' => '', 'ref' => ['reference' => $reference],
        ]);
    }

    public function test_private_text_never_leaves(): void
    {
        $this->writerOn();
        [$ticket] = $this->ticketWithThread([
            ['customer', 'My switch drops every hour. Call me on 9876543210 or mail neil@example.in', false, false],
            ['staff', 'INTERNAL: firmware 7.2 bug suspected', true, false],
            ['staff', 'SECRET: admin password is hunter2', false, true],
            ['customer', 'Still dropping.', false, false],
        ]);
        $fake = $this->fakeModel(['text' => 'Thanks for the detail. [CHECK: firmware version]']);

        $this->ask($this->staff(Role::SupportEngineer), $ticket)->assertOk();

        $sent = $this->sent($fake);
        $this->assertStringContainsString('Still dropping.', $sent);
        $this->assertStringNotContainsString('firmware 7.2 bug', $sent);
        $this->assertStringNotContainsString('hunter2', $sent);
        $this->assertStringNotContainsString('9876543210', $sent);
        $this->assertStringNotContainsString('neil@example.in', $sent);
        $this->assertStringContainsString('[phone]', $sent);
        $this->assertStringContainsString('[email]', $sent);
    }

    public function test_only_published_articles_are_sources_and_cited_by_number(): void
    {
        $this->writerOn();
        [$ticket] = $this->ticketWithThread([['customer', 'Still dropping.', false, false]]);
        KnowledgeArticle::create([
            'title' => 'Why a switch drops every hour', 'slug' => 'why-a-switch-drops-every-hour',
            'excerpt' => 'Check the PoE budget first.', 'body' => '<p>Check the PoE budget.</p>',
            'status' => PublishStatus::Published, 'published_at' => now(),
        ]);
        KnowledgeArticle::create([
            'title' => 'DRAFTONLY switch drops every hour notes', 'slug' => 'draftonly-switch-drops',
            'excerpt' => 'Unfinished.', 'body' => '<p>Unfinished.</p>',
            'status' => PublishStatus::Draft,
        ]);
        $fake = $this->fakeModel(['text' => 'See [S1].']);

        $res = $this->ask($this->staff(Role::SupportEngineer), $ticket)->assertOk();

        $sent = $this->sent($fake);
        $this->assertStringContainsString('[S1] Why a switch drops every hour', $sent);
        $this->assertStringNotContainsString('DRAFTONLY', $sent);
        $this->assertStringContainsString('/knowledge-base/why-a-switch-drops-every-hour', $res->json('data.output'));
        $this->assertStringNotContainsString('[S1]', $res->json('data.output'));
    }

    public function test_a_closed_or_merged_ticket_is_refused(): void
    {
        $this->writerOn();
        $this->fakeModel(['text' => 'Hello.']);
        [$closed] = $this->ticketWithThread([['customer', 'Hi', false, false]], ['status' => TicketStatus::Closed]);
        $this->ask($this->staff(Role::SupportEngineer), $closed)->assertStatus(422);

        [$open] = $this->ticketWithThread([['customer', 'Hi', false, false]]);
        $merged = Ticket::create([
            'customer_id' => $open->customer_id, 'ticket_category_id' => $open->ticket_category_id,
            'subject' => 'Duplicate', 'description' => 'Same.', 'status' => TicketStatus::Open,
            'priority' => 'normal',
        ]);
        $merged->forceFill(['merged_into_id' => $open->id])->save();
        $this->ask($this->staff(Role::SupportEngineer), $merged)->assertStatus(422);
    }

    public function test_the_role_gate(): void
    {
        $this->writerOn();
        $this->fakeModel(['text' => 'Hello.']);
        [$ticket] = $this->ticketWithThread([['customer', 'Hi', false, false]]);

        $this->ask($this->staff(Role::ContentManager), $ticket)->assertForbidden();
        $this->ask($this->staff(Role::SupportEngineer), 'TW-2026-99999')->assertNotFound();
    }

    public function test_a_sensitive_ticket_description_is_not_sent(): void
    {
        $this->writerOn();
        [$ticket] = $this->ticketWithThread(
            [['customer', 'Please help.', false, false]],
            ['is_sensitive' => true, 'description' => 'TOPSECRET credentials inside'],
        );
        $fake = $this->fakeModel(['text' => 'Happy to help.']);

        $this->ask($this->staff(Role::SupportEngineer), $ticket)->assertOk();

        $this->assertStringNotContainsString('TOPSECRET', $this->sent($fake));
        $this->assertStringContainsString('Please help.', $this->sent($fake));
    }

    public function test_a_draft_may_start_with_no_brief(): void
    {
        $this->writerOn();
        [$ticket] = $this->ticketWithThread([['customer', 'Hello?', false, false]]);
        $this->fakeModel(['text' => 'Thanks for getting in touch.']);

        $this->ask($this->staff(Role::SupportEngineer), $ticket, ['brief' => '', 'input' => ''])->assertOk();
    }

    public function test_the_mask_hides_phone_numbers_and_keeps_technical_facts(): void
    {
        foreach (['+91 98765 43210', '98765-43210', '09876543210', '033 2345 6789', '+44 20 7946 0958'] as $number) {
            $this->assertSame('call [phone] now', TicketReplySurface::mask("call {$number} now"), $number);
        }
        foreach (['TW-2026-00007', 'ORD-2026-00012', 'v7.2.1', '192.168.1.10', '2026-10-18', '10:30', '2026-10-18 10:30:45', 'firmware 7.2.0.1234'] as $keep) {
            $this->assertSame("see {$keep} ok", TicketReplySurface::mask("see {$keep} ok"), $keep);
        }
        $this->assertSame('[email] or [phone]', TicketReplySurface::mask('a.b@example.in or 9876543210'));
    }

    public function test_the_engineers_own_draft_is_masked_too(): void
    {
        $this->writerOn();
        [$ticket] = $this->ticketWithThread([['customer', 'Hello?', false, false]]);
        $fake = $this->fakeModel(['text' => 'Better wording.']);

        $this->ask($this->staff(Role::SupportEngineer), $ticket, ['mode' => 'rewrite', 'brief' => '', 'input' => 'Ring neil@example.in on 9876543210'])->assertOk();

        $this->assertStringNotContainsString('9876543210', $this->sent($fake));
        $this->assertStringNotContainsString('neil@example.in', $this->sent($fake));
    }

    public function test_an_admin_can_draft(): void
    {
        $this->writerOn();
        [$ticket] = $this->ticketWithThread([['customer', 'Hello?', false, false]]);
        $this->fakeModel(['text' => 'Thanks for getting in touch.']);

        $this->ask($this->staff(Role::Admin), $ticket)->assertOk();
    }

    public function test_sources_keep_the_semantic_order(): void
    {
        Storage::fake('local');
        $this->seed(SettingsSeeder::class);
        $this->enableSemanticSearch();
        $this->writerOn();
        [$ticket] = $this->ticketWithThread([['customer', 'My network keeps dropping', false, false]], ['subject' => 'network keeps dropping']);
        // The weaker match is created first, so a plain id sort would cite it as [S1].
        $weak = KnowledgeArticle::create(['title' => 'Weak match', 'slug' => 'weak', 'excerpt' => 'x', 'body' => '<p>Wireless signal, switch ports and poe.</p>', 'status' => PublishStatus::Published, 'published_at' => now()]);
        $strong = KnowledgeArticle::create(['title' => 'Strong match', 'slug' => 'strong', 'excerpt' => 'x', 'body' => '<p>Wireless signal and disconnects.</p>', 'status' => PublishStatus::Published, 'published_at' => now()]);
        $fake = $this->fakeModel(['text' => 'See [S1].']);

        $res = $this->ask($this->staff(Role::SupportEngineer), $ticket)->assertOk();

        $this->assertStringContainsString('[S1] Strong match', $this->sent($fake));
        $this->assertStringContainsString('/knowledge-base/strong', $res->json('data.output'));
        $this->assertTrue($strong->id > $weak->id);
    }
}
