<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketSurvey;
use App\Models\User;
use App\Notifications\TicketSurveyRequested;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * The satisfaction survey sent when a ticket is closed (2026-09-30).
 *
 * Pinned: it goes once, from every door that closes a ticket; a ticket merged
 * into another and a switched-off survey send nothing; the five links carry
 * their rating and the page — never the link — records it; a wrong token is a
 * 404 and no response ever carries the token; an answer can be changed and
 * keeps the time of the first.
 */
class TicketSurveyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function staff(): User
    {
        $user = User::create([
            'name' => 'Priya Sharma', 'email' => 'engineer@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::SupportEngineer->value], ['name' => RoleEnum::SupportEngineer->label()],
        ));

        return $user->load('roles');
    }

    private function customer(): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu', 'email' => 'neil@example.test',
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
    }

    private function ticket(Customer $customer, TicketStatus $status = TicketStatus::Resolved): Ticket
    {
        return $customer->tickets()->create([
            'subject' => 'Switch keeps dropping', 'description' => 'The uplink drops.',
            'priority' => 'normal', 'status' => $status,
        ]);
    }

    private function close(User $staff, Ticket $ticket)
    {
        return $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['status' => 'closed']);
    }

    private function surveyFor(Ticket $ticket): TicketSurvey
    {
        return TicketSurvey::where('ticket_id', $ticket->id)->firstOrFail();
    }

    public function test_closing_a_ticket_sends_one_survey_with_five_rating_links(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);

        $this->close($this->staff(), $ticket)->assertOk();

        Notification::assertSentToTimes($customer, TicketSurveyRequested::class, 1);

        $survey = $this->surveyFor($ticket);
        $this->assertSame(64, strlen($survey->token));

        $mail = (new TicketSurveyRequested($ticket, $survey))->toMail($customer);
        $html = (string) $mail->render();

        foreach ([1 => 'Very Bad', 2 => 'Poor', 3 => 'Average', 4 => 'Good', 5 => 'Excellent'] as $value => $label) {
            // A real anchor with the label inside it — not the Markdown text
            // this project's mail deliberately refuses to turn into a link.
            $this->assertMatchesRegularExpression(
                '#<a href="[^"]*/ticket-survey/'.$survey->token.'\?rating='.$value.'"[^>]*>'.preg_quote($label, '#').'</a>#',
                $html,
            );
        }
    }

    public function test_the_customer_closing_their_own_ticket_is_asked_too(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/close")->assertOk();

        Notification::assertSentToTimes($customer, TicketSurveyRequested::class, 1);
    }

    public function test_the_bulk_close_asks_each_ticket_once(): void
    {
        $customer = $this->customer();
        $a = $this->ticket($customer);
        $b = $this->ticket($customer);

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/tickets/bulk', ['ids' => [$a->id, $b->id], 'status' => 'closed'])
            ->assertOk();

        Notification::assertSentToTimes($customer, TicketSurveyRequested::class, 2);
        $this->assertSame(2, TicketSurvey::count());
    }

    public function test_a_reopened_and_reclosed_ticket_is_not_asked_again(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $staff = $this->staff();

        $this->close($staff, $ticket)->assertOk();
        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['status' => 'in_progress'])->assertOk();
        $this->close($staff, $ticket)->assertOk();

        Notification::assertSentToTimes($customer, TicketSurveyRequested::class, 1);
        $this->assertSame(1, TicketSurvey::count());
    }

    public function test_a_ticket_merged_into_another_is_not_asked(): void
    {
        $customer = $this->customer();
        $source = $this->ticket($customer, TicketStatus::Open);
        $target = $this->ticket($customer, TicketStatus::InProgress);

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/tickets/{$source->reference}/merge", ['into' => $target->reference])
            ->assertOk();

        Notification::assertNotSentTo($customer, TicketSurveyRequested::class);
        $this->assertSame(0, TicketSurvey::count());
    }

    public function test_switching_the_survey_off_sends_nothing_and_writes_nothing(): void
    {
        Setting::updateOrCreate(['key' => 'ticket_survey_enabled'], ['group' => 'ticket_survey', 'value' => '0', 'type' => 'boolean']);
        Setting::flushCache();

        $customer = $this->customer();
        $ticket = $this->ticket($customer);

        $this->close($this->staff(), $ticket)->assertOk();

        Notification::assertNotSentTo($customer, TicketSurveyRequested::class);
        $this->assertSame(0, TicketSurvey::count());
    }

    public function test_the_page_reads_the_survey_without_answering_it_and_never_shows_the_token(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $this->close($this->staff(), $ticket);
        $survey = $this->surveyFor($ticket);

        $response = $this->getJson("/api/v1/ticket-surveys/{$survey->token}")
            ->assertOk()
            ->assertJsonPath('data.reference', $ticket->reference)
            ->assertJsonPath('data.subject', 'Switch keeps dropping')
            ->assertJsonPath('data.answered', false)
            ->assertJsonPath('data.rating', null);

        $this->assertStringNotContainsString($survey->token, $response->getContent());
        $this->assertNull($survey->fresh()->rating, 'Reading must never record an answer.');
    }

    public function test_an_answer_is_recorded_changed_and_keeps_the_first_time(): void
    {
        $ticket = $this->ticket($this->customer());
        $this->close($this->staff(), $ticket);
        $survey = $this->surveyFor($ticket);

        $this->postJson("/api/v1/ticket-surveys/{$survey->token}", ['rating' => 2, 'comment' => '  Took a while.  '])
            ->assertOk()
            ->assertJsonPath('data.rating', 2)
            ->assertJsonPath('data.rating_label', 'Poor')
            ->assertJsonPath('data.comment', 'Took a while.');

        $first = $survey->fresh()->answered_at;
        $this->assertNotNull($first);

        $this->travel(2)->hours();

        $this->postJson("/api/v1/ticket-surveys/{$survey->token}", ['rating' => 5, 'comment' => ''])
            ->assertOk()
            ->assertJsonPath('data.rating', 5)
            ->assertJsonPath('data.comment', null);

        $this->assertTrue($survey->fresh()->answered_at->equalTo($first));
    }

    public function test_only_one_to_five_is_accepted(): void
    {
        $ticket = $this->ticket($this->customer());
        $this->close($this->staff(), $ticket);
        $survey = $this->surveyFor($ticket);

        foreach ([0, 6, 'great', null] as $bad) {
            $this->postJson("/api/v1/ticket-surveys/{$survey->token}", ['rating' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors('rating');
        }

        $this->postJson("/api/v1/ticket-surveys/{$survey->token}", ['rating' => 4, 'comment' => str_repeat('a', 1001)])
            ->assertStatus(422)->assertJsonValidationErrors('comment');

        $this->assertNull($survey->fresh()->rating);
    }

    public function test_a_wrong_or_malformed_token_is_a_404(): void
    {
        $this->getJson('/api/v1/ticket-surveys/'.str_repeat('a', 64))->assertNotFound();
        $this->getJson('/api/v1/ticket-surveys/short')->assertNotFound();
        $this->postJson('/api/v1/ticket-surveys/'.str_repeat('b', 64), ['rating' => 3])->assertNotFound();
    }

    public function test_the_console_sees_the_answer_and_the_customer_does_not_get_the_token(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $staff = $this->staff();
        $this->close($staff, $ticket);
        $survey = $this->surveyFor($ticket);
        $this->postJson("/api/v1/ticket-surveys/{$survey->token}", ['rating' => 4, 'comment' => 'Fixed quickly.']);

        $read = $this->actingAs($staff, 'sanctum')
            ->getJson("/api/v1/admin/tickets/{$ticket->reference}")
            ->assertOk()
            ->assertJsonPath('data.survey.rating', 4)
            ->assertJsonPath('data.survey.rating_label', 'Good')
            ->assertJsonPath('data.survey.comment', 'Fixed quickly.');

        $this->assertStringNotContainsString($survey->token, $read->getContent());

        $this->app['auth']->forgetGuards();

        $portal = $this->actingAs($customer, 'sanctum')
            ->getJson("/api/v1/tickets/{$ticket->reference}")->assertOk();

        $this->assertArrayNotHasKey('survey', $portal->json('data'));
        $this->assertStringNotContainsString($survey->token, $portal->getContent());
    }
}
