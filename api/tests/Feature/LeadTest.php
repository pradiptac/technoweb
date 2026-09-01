<?php

namespace Tests\Feature;

use App\Enums\LeadStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Enquiry;
use App\Models\Form;
use App\Models\FormField;
use App\Models\Lead;
use App\Models\Role;
use App\Models\User;
use App\Notifications\EnquiryReceived;
use App\Support\Crm\LeadScore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * The lead pipeline: intake, source capture, scoring and the queue.
 *
 * The instruction this is built on: **every contact form lands in one place a
 * person can work, and the email keeps going out.** So the tests that matter
 * most here are the ones that pin the two halves against each other — a
 * submission always produces a lead, a mail failure never costs one, and a lead
 * never costs a submission.
 */
class LeadTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            ['name' => 'Test staff', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));
        }

        return $user;
    }

    private function sales(): User
    {
        return $this->staff(RoleEnum::SalesManager, 'sales@example.test');
    }

    private function enquiry(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Rahul Sen',
            'email' => 'rahul@meridianfoods.in',
            'phone' => '+91 98300 11223',
            'company' => 'Meridian Foods',
            'subject' => 'Switch refresh',
            'message' => 'We are replacing the access layer across two floors and need a quotation for 24-port PoE switches, plus what the lead time looks like this quarter.',
            'source' => 'contact',
        ], $overrides);
    }

    // ---------------------------------------------------------------- intake

    public function test_an_enquiry_becomes_a_lead_and_still_sends_the_email(): void
    {
        Notification::fake();

        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();

        $lead = Lead::sole();

        $this->assertSame('rahul@meridianfoods.in', $lead->email);
        $this->assertSame('Meridian Foods', $lead->company);
        $this->assertSame('enquiry', $lead->channel);
        $this->assertSame(LeadStatus::New, $lead->status);
        // The evidence is still its own row, and the lead points at it.
        $this->assertSame('enquiry', $lead->source_type);
        $this->assertNotNull($lead->source_id);

        // The whole point of "continue the email sending on submission".
        Notification::assertSentOnDemand(EnquiryReceived::class);
    }

    /**
     * The form is named from the *kind* of page, not the whole source value.
     *
     * `EnquiryForm` is rendered with `source={`product:${slug}`}`, so the column
     * holds `product:cisco-cbs350-24t-4g` — and matching the whole string
     * labelled every product enquiry on the site "Enquiry form". It survived
     * because the contact page passes a bare `contact` and matched, so the one
     * call site that got tested was the one case that worked. Found in a
     * browser, not by reading the code.
     */
    public function test_the_form_name_reads_the_kind_of_page_not_the_whole_source(): void
    {
        Notification::fake();

        foreach ([
            ['product:cisco-cbs350-24t-4g', 'Product enquiry'],
            ['service:structured-cabling', 'Service enquiry'],
            ['contact', 'Contact form'],
        ] as $i => [$source, $expected]) {
            $this->postJson('/api/v1/enquiries', $this->enquiry([
                'source' => $source,
                'email' => "lead{$i}@acme.co.in",
            ]))->assertCreated();

            $this->assertSame($expected, Lead::latest('id')->first()->form_name);
        }
    }

    /**
     * The source page, which is the half that cannot be read from the request.
     *
     * Every submission arrives through a Next.js Server Action, so `Referer`
     * here is the Next server. The page has to say where it is, and this is
     * what asserts it survives the whole way to the column.
     */
    public function test_the_source_page_is_captured_from_the_posted_envelope(): void
    {
        Notification::fake();

        $this->postJson('/api/v1/enquiries', $this->enquiry([
            '_source_url' => 'https://www.technoware.in/products/cisco-cbs350-24t-4g?ref=nav',
            '_source_title' => 'Cisco CBS350 24-Port Switch',
            '_referrer' => 'https://www.google.com/',
            '_utm_source' => 'google',
            '_utm_medium' => 'cpc',
            '_utm_campaign' => 'switches-q3',
        ]))->assertCreated();

        $lead = Lead::sole();

        $this->assertSame('https://www.technoware.in/products/cisco-cbs350-24t-4g?ref=nav', $lead->source_url);
        // Derived here rather than accepted, so a lead cannot claim to have
        // come from a page its own URL contradicts. The query survives: a
        // search term and a campaign both live there.
        $this->assertSame('/products/cisco-cbs350-24t-4g?ref=nav', $lead->source_path);
        $this->assertSame('Cisco CBS350 24-Port Switch', $lead->source_title);
        $this->assertSame('https://www.google.com/', $lead->referrer);
        $this->assertSame('switches-q3', $lead->utm_campaign);
    }

    public function test_a_lead_without_page_context_is_still_created(): void
    {
        Notification::fake();

        // No `_source_*` at all — a submission with JavaScript disabled, or a
        // direct POST. Attribution is decoration on a lead that has already
        // been accepted; refusing one for want of it would be absurd.
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();

        $lead = Lead::sole();
        $this->assertNull($lead->source_path);
        $this->assertNotNull($lead->email);
    }

    /**
     * An editor-built form submission is a lead too.
     *
     * This is the half that made a separate `leads` table necessary: the
     * answers are keyed by names an editor chose, and one of these forms need
     * not collect an email address at all.
     */
    public function test_an_editor_built_form_submission_becomes_a_lead(): void
    {
        Notification::fake();

        $form = Form::create(['name' => 'Request a survey', 'slug' => 'survey', 'status' => 'published']);
        foreach ([['name', 'text'], ['email', 'email'], ['message', 'textarea']] as $i => [$name, $kind]) {
            FormField::create([
                'form_id' => $form->id, 'name' => $name, 'label' => ucfirst($name),
                'kind' => $kind, 'required' => true, 'sort_order' => $i,
            ]);
        }

        $this->postJson('/api/v1/forms/survey', [
            'name' => 'Priya Das',
            'email' => 'priya@acme.co.in',
            'message' => 'Please quote for a site survey at our Salt Lake warehouse before the end of the month.',
            '_source_url' => 'https://www.technoware.in/services/site-survey',
        ])->assertCreated();

        $lead = Lead::sole();

        $this->assertSame('form', $lead->channel);
        $this->assertSame('Request a survey', $lead->form_name);
        $this->assertSame('priya@acme.co.in', $lead->email);
        $this->assertSame('/services/site-survey', $lead->source_path);
        $this->assertSame('form_submission', $lead->source_type);
    }

    /**
     * The envelope must not be storable as an answer.
     *
     * `FormValidator` drops every key the form does not declare, so the page
     * context would be discarded with it — which is why it is read off the
     * request instead. And a field key is validated against `^[a-z]...`, so a
     * field called `_source_url` cannot be created and the collision is
     * impossible rather than merely forbidden.
     */
    public function test_the_page_envelope_is_never_stored_as_a_form_answer(): void
    {
        Notification::fake();

        $form = Form::create(['name' => 'Short', 'slug' => 'short', 'status' => 'published']);
        FormField::create(['form_id' => $form->id, 'name' => 'email', 'label' => 'Email', 'kind' => 'email', 'required' => true, 'sort_order' => 0]);

        $this->postJson('/api/v1/forms/short', [
            'email' => 'someone@acme.co.in',
            '_source_url' => 'https://www.technoware.in/contact',
        ])->assertCreated();

        $lead = Lead::sole();

        $this->assertSame(['email' => 'someone@acme.co.in'], $lead->source->data);
        $this->assertSame('/contact', $lead->source_path);

        $this->postJson('/api/v1/admin/forms', ['name' => 'x', 'fields' => [['name' => '_source_url', 'label' => 'x', 'kind' => 'text']]])
            ->assertStatus(401);
    }

    /**
     * A dead mail server costs the announcement and never the record.
     *
     * `Notifier` swallows a send failure so a committed submission still
     * answers 201 — which, before the pipeline existed, meant the enquiry was
     * only ever findable in the database. The lead is what makes that
     * recoverable, so it has to be written whatever mail does.
     */
    public function test_a_mail_failure_does_not_cost_the_lead(): void
    {
        Notification::fake();
        Notification::shouldReceive('sendNow')->andThrow(new \RuntimeException('SMTP is down'));

        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();

        $this->assertSame(1, Lead::count());
    }

    // ---------------------------------------------------------------- scoring

    public function test_the_score_is_out_of_what_applies(): void
    {
        // A form that collected a name and nothing else can earn none of the
        // message checks. Scoring it against them would park it in the forties
        // with nothing anybody could do — the rule `SeoScore` follows.
        $bare = LeadScore::for(['email' => null, 'message' => null, 'source_path' => null]);

        $applied = array_filter($bare['reasons'], fn ($c) => $c['applies']);
        $this->assertCount(3, $applied, 'Only phone, company and returning apply with no email, message or page.');
        $this->assertSame('cold', $bare['band']);
    }

    public function test_a_business_enquiry_from_a_product_page_scores_hot(): void
    {
        $hot = LeadScore::for([
            'email' => 'rahul@meridianfoods.in',
            'phone' => '+91 98300 11223',
            'company' => 'Meridian Foods',
            'message' => 'We are replacing the access layer across two floors and need a quotation for 24-port PoE switches, plus what the lead time looks like this quarter.',
            'source_path' => '/products/cisco-cbs350-24t-4g',
        ]);

        $this->assertSame('hot', $hot['band']);
        $this->assertGreaterThanOrEqual(70, $hot['score']);
    }

    public function test_a_three_word_message_from_a_free_mailbox_scores_cold(): void
    {
        $cold = LeadScore::for([
            'email' => 'someone@gmail.com',
            'message' => 'please send details',
            'source_path' => '/contact',
        ]);

        $this->assertSame('cold', $cold['band']);
        $this->assertLessThan(40, $cold['score']);
    }

    /**
     * Word boundaries, not `str_contains`.
     *
     * "PO" inside "port" is a false positive on the most common noun in this
     * catalogue, and "buy" inside "buying" is a false negative on the most
     * obvious signal there is. Both directions are pinned, because a
     * substring match gets one right and the other wrong whichever way it is
     * written.
     */
    public function test_intent_matching_respects_word_boundaries(): void
    {
        $reason = fn (array $r, string $key) => collect($r['reasons'])->firstWhere('key', $key);

        $ports = LeadScore::for(['message' => 'How many ports does the smaller chassis carry in total, roughly speaking?']);
        $this->assertFalse($reason($ports, 'intent')['passed'], '"ports" must not match "po".');

        $buying = LeadScore::for(['message' => 'We are buying twelve of these before the end of the financial year, subject to a demo.']);
        $this->assertTrue($reason($buying, 'intent')['passed'], '"buying" must match "buy".');
    }

    public function test_a_link_dump_fails_the_clean_message_check(): void
    {
        $reason = fn (array $r, string $key) => collect($r['reasons'])->firstWhere('key', $key);

        $spam = LeadScore::for(['message' => 'Best SEO http://a.test http://b.test http://c.test']);
        $this->assertFalse($reason($spam, 'clean_message')['passed']);

        // A long, genuine message may reasonably cite a page. Only the second
        // threshold keeps that from being punished.
        $real = LeadScore::for(['message' => 'We looked at the datasheet on https://www.technoware.in/products/cbs350 and it is close to what we want, but we need to know whether the PoE budget covers thirty access points across two floors and what the delivery position is.']);
        $this->assertTrue($reason($real, 'clean_message')['passed']);
    }

    public function test_the_reasons_are_stored_beside_the_number(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();

        $lead = Lead::sole();

        // A figure without its working is not worth showing. Every check is
        // carried, applying or not, so the number is explainable from its own
        // row even after the rubric moves.
        $this->assertIsArray($lead->score_reasons);
        $this->assertCount(8, $lead->score_reasons);
        $this->assertSame('business_email', $lead->score_reasons[0]['key']);
    }

    // ---------------------------------------------------------------- the queue

    public function test_the_queue_is_behind_the_sales_role(): void
    {
        $this->getJson('/api/v1/admin/leads')->assertStatus(401);

        // The point of splitting a role is what it *cannot* reach.
        $this->actingAs($this->staff(RoleEnum::ContentManager, 'content@example.test'), 'sanctum')
            ->getJson('/api/v1/admin/leads')->assertStatus(403);

        $this->actingAs($this->sales(), 'sanctum')
            ->getJson('/api/v1/admin/leads')->assertOk();
    }

    public function test_a_sales_manager_cannot_edit_the_blog(): void
    {
        $this->actingAs($this->sales(), 'sanctum')
            ->getJson('/api/v1/admin/blog-posts')->assertStatus(403);
    }

    public function test_the_export_route_is_not_swallowed_by_the_id_binding(): void
    {
        // Laravel matches in declaration order: under `leads/{lead}` this binds
        // to the literal "export" and 404s from model binding — a routing bug
        // that reads as a missing record.
        $this->actingAs($this->sales(), 'sanctum')
            ->get('/api/v1/admin/leads/export')
            ->assertOk()
            ->assertHeader('content-type', 'text/csv; charset=UTF-8');
    }

    public function test_an_illegal_status_move_is_refused_by_name(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();
        $lead = Lead::sole();
        $lead->update(['status' => LeadStatus::Won]);

        $this->actingAs($this->sales(), 'sanctum')
            ->patchJson("/api/v1/admin/leads/{$lead->id}", ['status' => 'spam'])
            ->assertStatus(422)
            ->assertSee('cannot go from Won to Spam');
    }

    /**
     * The console is only offered moves the API will accept.
     *
     * A dropdown is a promise -- the argument `schema_type` settled here.
     * Offering all six statuses and refusing four of them with a 422 is a form
     * arguing with whoever filled it in, and the refusal arrives only after
     * they have typed a note to go with it.
     */
    public function test_a_lead_offers_only_the_moves_it_can_make(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();
        $lead = Lead::sole();
        $sales = $this->sales();

        $offered = fn () => collect(
            $this->actingAs($sales, 'sanctum')
                ->getJson("/api/v1/admin/leads/{$lead->id}")->assertOk()
                ->json('data.allowed_next'),
        )->pluck('value')->all();

        // Itself first, so the select can show what the lead is now.
        $this->assertSame('new', $offered()[0]);
        $this->assertEqualsCanonicalizing(
            ['new', 'contacted', 'qualified', 'won', 'lost', 'spam'],
            $offered(),
        );

        $this->actingAs($sales, 'sanctum')
            ->patchJson("/api/v1/admin/leads/{$lead->id}", ['status' => 'won'])->assertOk();

        // A mis-click on a terminal state has to be correctable, and nothing
        // else is on offer from there.
        $this->assertSame(['won', 'qualified'], $offered());
    }

    public function test_spam_is_reversible(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();
        $lead = Lead::sole();

        $sales = $this->sales();

        // A misfiled real enquiry is a customer nobody ever answers.
        $this->actingAs($sales, 'sanctum')
            ->patchJson("/api/v1/admin/leads/{$lead->id}", ['status' => 'spam'])->assertOk();
        $this->actingAs($sales, 'sanctum')
            ->patchJson("/api/v1/admin/leads/{$lead->id}", ['status' => 'new'])->assertOk();

        $this->assertSame(LeadStatus::New, $lead->fresh()->status);
        // Reopened, so it is not sitting in a report of deals settled.
        $this->assertNull($lead->fresh()->closed_at);
    }

    /**
     * The rule `resolved_at` had to be taught on tickets.
     *
     * Closing a ticket used to erase when it was resolved, and every throughput
     * figure read that column. `contacted_at` is what "how fast do we answer an
     * enquiry" is computed from, so a later move must not clear it.
     */
    public function test_contacted_at_is_stamped_once_and_survives_a_later_move(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();
        $lead = Lead::sole();
        $sales = $this->sales();

        $this->actingAs($sales, 'sanctum')
            ->patchJson("/api/v1/admin/leads/{$lead->id}", ['status' => 'contacted'])->assertOk();
        $first = $lead->fresh()->contacted_at;
        $this->assertNotNull($first);

        $this->actingAs($sales, 'sanctum')
            ->patchJson("/api/v1/admin/leads/{$lead->id}", ['status' => 'lost'])->assertOk();

        $this->assertEquals($first, $lead->fresh()->contacted_at);
    }

    public function test_a_lead_written_off_unanswered_records_no_contact(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();
        $lead = Lead::sole();

        $this->actingAs($this->sales(), 'sanctum')
            ->patchJson("/api/v1/admin/leads/{$lead->id}", ['status' => 'lost'])->assertOk();

        // Recording this as a contact would flatter the one figure the column
        // exists to produce.
        $this->assertNull($lead->fresh()->contacted_at);
    }

    public function test_a_status_change_writes_the_trail(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();
        $lead = Lead::sole();

        $this->actingAs($this->sales(), 'sanctum')
            ->patchJson("/api/v1/admin/leads/{$lead->id}", ['status' => 'contacted', 'note' => 'Called, sending a quote.'])
            ->assertOk();

        $notes = $lead->fresh()->notes;
        $this->assertCount(2, $notes);
        $this->assertSame('status', $notes[0]->kind);
        $this->assertStringContainsString('New', $notes[0]->body);
        $this->assertSame('note', $notes[1]->kind);
        // Copied, not joined: a trail that forgets who did something once they
        // leave has failed at the point it is read.
        $this->assertSame('Test staff', $notes[1]->actor_name);
    }

    public function test_overdue_means_open_and_past_its_date(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();
        $this->postJson('/api/v1/enquiries', $this->enquiry(['email' => 'other@acme.co.in']))->assertCreated();

        [$open, $won] = Lead::orderBy('id')->get()->all();
        $open->update(['follow_up_at' => now()->subDay()]);
        // A won deal with a date left on it is not overdue, it is finished —
        // and a queue that says otherwise is one people stop believing.
        $won->update(['follow_up_at' => now()->subDay(), 'status' => LeadStatus::Won]);

        $body = $this->actingAs($this->sales(), 'sanctum')
            ->getJson('/api/v1/admin/leads?overdue=1')->assertOk()->json();

        $this->assertCount(1, $body['data']);
        $this->assertSame($open->id, $body['data'][0]['id']);
        $this->assertTrue($body['data'][0]['is_overdue']);
        $this->assertSame(1, $body['meta']['overdue_count']);
    }

    public function test_the_detail_lists_everything_else_that_address_sent(): void
    {
        Notification::fake();

        // Deliberately not merged. The second message is routinely the one
        // that says what they actually want.
        $this->postJson('/api/v1/enquiries', $this->enquiry(['subject' => 'First']))->assertCreated();
        $this->postJson('/api/v1/enquiries', $this->enquiry(['subject' => 'Second, and it is two sites']))->assertCreated();

        $this->assertSame(2, Lead::count());

        $second = Lead::latest('id')->first();
        $body = $this->actingAs($this->sales(), 'sanctum')
            ->getJson("/api/v1/admin/leads/{$second->id}")->assertOk()->json('data');

        $this->assertCount(1, $body['related']);
        $this->assertSame('First', $body['related'][0]['subject']);

        // And having been in touch before is a scoring signal on the second.
        $returning = collect($body['score_reasons'])->firstWhere('key', 'returning');
        $this->assertTrue($returning['passed']);
    }

    public function test_deleting_a_lead_keeps_the_submission(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/enquiries', $this->enquiry())->assertCreated();
        $lead = Lead::sole();

        $this->actingAs($this->sales(), 'sanctum')
            ->deleteJson("/api/v1/admin/leads/{$lead->id}")->assertOk();

        $this->assertSame(0, Lead::count());
        // The evidence of something a person actually sent. Clearing a pipeline
        // is not a reason to destroy it.
        $this->assertSame(1, Enquiry::count());
    }
}
