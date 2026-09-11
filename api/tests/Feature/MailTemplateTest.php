<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Models\MailTemplate;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Notifications\TicketCreated;
use App\Support\Mail\MessageCatalogue;
use App\Support\Mail\Placeholders;
use App\Support\Mail\Templates;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * An editor's copy in place of the built-in message.
 *
 * The failure this file mostly exists to catch is the quiet one: a template
 * that does not apply falls back to the built-in, which is a *correct-looking*
 * email. Nothing about it says "your wording was ignored", so only an
 * assertion will ever notice.
 */
class MailTemplateTest extends TestCase
{
    use RefreshDatabase;

    private function ticket(): Ticket
    {
        $customer = Customer::create([
            'name' => 'Neil Basu',
            'email' => 'neil@example.test',
            'company' => 'Meridian Foods',
            'password' => 'password-for-tests',
            'status' => CustomerStatus::Active,
        ]);

        $ticket = $customer->tickets()->make([
            'subject' => 'Switch keeps dropping',
            'description' => 'The uplink drops every afternoon.',
            'ticket_category_id' => TicketCategory::create([
                'name' => 'Network', 'slug' => 'network', 'is_active' => true,
            ])->id,
            'priority' => 'normal',
            'status' => 'open',
        ]);
        $ticket->save();

        return $ticket->load(['customer', 'category']);
    }

    private function mail(): MailMessage
    {
        return (new TicketCreated($this->ticket()))->toMail((object) []);
    }

    private function customise(array $attributes = []): MailTemplate
    {
        return MailTemplate::create(array_merge([
            'key' => 'ticket_created',
            'subject' => 'URGENT {{reference}} from {{customer_name}}',
            'body_html' => '<p>Hello desk, {{subject}} is {{priority}}.</p>',
        ], $attributes));
    }

    public function test_an_override_replaces_the_subject_and_the_body(): void
    {
        $this->customise();

        $mail = $this->mail();

        $this->assertSame('URGENT TW-2026-00001 from Neil Basu', $mail->subject);
        $this->assertStringContainsString('Hello desk, Switch keeps dropping is Normal.', (string) $mail->render());
    }

    public function test_no_row_falls_back_to_the_built_in_message(): void
    {
        // The ordinary state: 23 of 23 messages on a fresh install, which is
        // why this path is the one exercised constantly rather than the one
        // nobody ever runs.
        $this->assertStringStartsWith('[TW-2026-00001] New ticket:', $this->mail()->subject);
    }

    public function test_a_row_that_cannot_render_falls_back_and_says_so(): void
    {
        Log::spy();

        /*
         * A key with no catalogue entry makes `render()` throw on the way to
         * resolving its raw variables. What matters is not this particular
         * cause but the shape: the caller has already committed its work, so a
         * template that blows up must cost the built-in message rather than
         * the receipt — the rule `Notifier::guard()` follows.
         */
        $this->customise(['key' => 'ticket_created']);
        Templates::apply(
            (new TicketCreated($this->ticket()))->toMail((object) []),
            'ticket_created',
            fn () => throw new \RuntimeException('the values could not be assembled'),
        );

        Log::shouldHaveReceived('error')
            ->withArgs(fn (string $m) => str_contains($m, 'could not be rendered'))
            ->once();
    }

    public function test_a_switched_off_row_falls_back(): void
    {
        // The softer off switch: it puts the built-in back *without* throwing
        // away an afternoon's copy.
        $this->customise(['is_enabled' => false]);

        $this->assertStringStartsWith('[TW-2026-00001] New ticket:', $this->mail()->subject);
    }

    public function test_a_blank_body_falls_back(): void
    {
        // "Unusable" has three shapes and a single condition covering two of
        // them looks perfectly correct.
        $this->customise(['body_html' => '']);

        $this->assertStringStartsWith('[TW-2026-00001] New ticket:', $this->mail()->subject);
    }

    public function test_a_placeholder_the_message_does_not_offer_is_stripped(): void
    {
        $this->customise(['body_html' => '<p>Ring {{ceo_mobile}} about {{subject}}.</p>']);

        $html = (string) $this->mail()->render();

        // Not as braces, and not as the literal name either — a sentence
        // missing a word reads better than one showing its own plumbing.
        $this->assertStringNotContainsString('{{', $html);
        $this->assertStringNotContainsString('ceo_mobile', $html);
        $this->assertStringContainsString('Switch keeps dropping', $html);
    }

    public function test_a_value_is_escaped_and_a_declared_html_one_is_not(): void
    {
        $filled = Placeholders::fill(
            '<p>{{customer_name}}</p><div>{{details}}</div>',
            ['customer_name' => 'A <script>alert(1)</script>', 'details' => '<ul><li>Two</li></ul>'],
            ['details'],
        );

        // The direction that is missing is always the dangerous one, so both
        // are asserted in one test.
        $this->assertStringNotContainsString('<script>', $filled);
        $this->assertStringContainsString('&lt;script&gt;', $filled);
        $this->assertStringContainsString('<ul><li>Two</li></ul>', $filled);
    }

    public function test_a_newline_cannot_be_smuggled_into_a_subject(): void
    {
        // Header injection. The sanitiser does not cover it, because a subject
        // is not markup.
        $this->customise(['subject' => "Hello\r\nBcc: someone@example.test"]);

        // Once: `mail()` builds a ticket, and a second call collides on the
        // customer's unique email address.
        $subject = $this->mail()->subject;

        $this->assertStringNotContainsString("\n", $subject);
        $this->assertStringNotContainsString("\r", $subject);
    }

    public function test_a_customised_message_is_still_branded_and_still_has_no_unsubscribe(): void
    {
        $this->customise();

        $html = (string) $this->mail()->render();

        // The shell wraps the override exactly as it wraps the built-in, which
        // is the whole reason it is a published theme rather than a second
        // renderer that only the customised path would use.
        $this->assertStringContainsString('#f4f5f2', $html);
        $this->assertStringNotContainsStringIgnoringCase('unsubscribe', $html);
    }

    public function test_the_text_part_keeps_its_paragraphs_and_its_links(): void
    {
        $this->customise([
            'body_html' => '<p>Hello.</p><p>Open <a href="https://x.test/t/1">the ticket</a>.</p>',
        ]);

        $rendered = Templates::render(
            'ticket_created',
            'S',
            '<p>Hello.</p><p>Open <a href="https://x.test/t/1">the ticket</a>.</p>',
            null,
            MessageCatalogue::samples('ticket_created'),
        );

        // `strip_tags` throws every URL away, which is the one thing a reader
        // opens the text part for.
        $this->assertStringContainsString('the ticket (https://x.test/t/1)', $rendered['text']);
        $this->assertStringContainsString("Hello.\n\nOpen", $rendered['text']);
    }

    public function test_every_catalogue_entry_points_at_a_class_that_declares_it(): void
    {
        foreach (MessageCatalogue::all() as $key => $entry) {
            $this->assertTrue(class_exists($entry['class']), "{$key} names a class that does not exist");

            $this->assertNotEmpty($entry['variables'], "{$key} offers no variables");

            /*
             * Every placeholder the shipped starting copy uses must be one the
             * message actually offers. Two independently written strings — a
             * name in the copy and a name in the variable list — disagreeing is
             * invisible to static analysis and silent at runtime, because the
             * disagreement renders as a missing word.
             */
            $offered = MessageCatalogue::variableNames($key);

            foreach (Placeholders::used($entry['subject'].$entry['body']) as $used) {
                $this->assertContains($used, $offered, "{$key} uses {{{$used}}} but does not offer it");
            }
        }
    }
}
