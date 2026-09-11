<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Models\MailTemplate;
use App\Models\Role;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
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
        // The ordinary state: 25 of 25 messages on a fresh install, which is
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

    /* ------------------------------------------------------------ the API */

    private function admin(): User
    {
        $user = User::create([
            'name' => 'Admin',
            'email' => 'admin@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $role = Role::firstOrCreate(
            ['slug' => \App\Enums\Role::Admin->value],
            ['name' => \App\Enums\Role::Admin->label()],
        );

        $user->roles()->sync([$role->id]);

        return $user->load('roles');
    }

    public function test_the_catalogue_comes_back_with_every_message_and_its_variables(): void
    {
        $response = $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/settings/email-templates')
            ->assertOk();

        $this->assertCount(count(MessageCatalogue::keys()), $response->json('data'));

        // The console builds its palette from this, so a second copy in
        // TypeScript is the drift `schema_type_options` was moved to end.
        $this->assertNotEmpty($response->json('meta.messages.ticket_created.variables'));
        $this->assertFalse($response->json('data.0.is_customised'));
    }

    public function test_saving_warns_about_a_placeholder_the_message_does_not_offer(): void
    {
        $response = $this->actingAs($this->admin(), 'sanctum')
            ->putJson('/api/v1/admin/settings/email-templates/ticket_created', [
                'subject' => 'Hi {{reference}}',
                'body_html' => '<p>Ring {{ceo_mobile}} about {{subject}}</p>',
            ])
            ->assertOk();

        /*
         * A warning rather than a refusal. Refusing would throw away a
         * screenful of typing over one typo mid-edit; stripping it silently is
         * how braces ship. Naming it is the middle course.
         */
        $this->assertSame(['ceo_mobile'], $response->json('meta.unknown'));
        $this->assertDatabaseHas('mail_templates', ['key' => 'ticket_created']);
    }

    public function test_a_subject_with_a_line_break_is_refused_on_write(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->putJson('/api/v1/admin/settings/email-templates/ticket_created', [
                'subject' => "Hello\nBcc: someone@example.test",
                'body_html' => '<p>Hi</p>',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('subject');
    }

    public function test_resetting_deletes_the_row_and_is_idempotent(): void
    {
        $this->customise();

        // Once: a second `admin()` collides on the user's unique address.
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')
            ->deleteJson('/api/v1/admin/settings/email-templates/ticket_created')
            ->assertNoContent();

        $this->assertDatabaseMissing('mail_templates', ['key' => 'ticket_created']);

        // "Reset to default" on a message already at its default is a no-op,
        // not an error — a 404 there reports a failure for something the
        // person plainly achieved.
        $this->actingAs($admin, 'sanctum')
            ->deleteJson('/api/v1/admin/settings/email-templates/ticket_created')
            ->assertNoContent();
    }

    public function test_preview_renders_the_draft_without_saving_it(): void
    {
        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/email-templates/ticket_created/preview', [
                'subject' => 'Draft {{reference}}',
                'body_html' => '<p>Draft body for {{customer_name}}</p>',
            ])
            ->assertOk();

        // Sample values, so a preview never carries a real customer's details.
        $this->assertSame('Draft TW-2026-00042', $response->json('data.subject'));
        $this->assertStringContainsString('Draft body for Neil Basu', $response->json('data.html'));
        // Through the same shell a real send uses.
        $this->assertStringContainsString('#f4f5f2', $response->json('data.html'));

        $this->assertDatabaseMissing('mail_templates', ['key' => 'ticket_created']);
    }

    public function test_an_unknown_message_key_is_a_404(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/settings/email-templates/no_such_message')
            ->assertNotFound();
    }

    public function test_preview_is_not_swallowed_by_the_key_route(): void
    {
        // `preview` is declared above `{key}`; underneath it, `{key}` binds the
        // literal string and this answers 404 — the `leads/export` trap.
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/email-templates/ticket_created/preview', [
                'subject' => 'S', 'body_html' => '<p>B</p>',
            ])
            ->assertOk();
    }

    public function test_a_content_manager_is_refused(): void
    {
        $user = User::create([
            'name' => 'Editor',
            'email' => 'editor@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $role = Role::firstOrCreate(
            ['slug' => \App\Enums\Role::ContentManager->value],
            ['name' => \App\Enums\Role::ContentManager->label()],
        );

        $user->roles()->sync([$role->id]);

        // The point of splitting a role is what it *cannot* reach.
        $this->actingAs($user->load('roles'), 'sanctum')
            ->getJson('/api/v1/admin/settings/email-templates')
            ->assertForbidden();
    }

    public function test_every_templated_notification_agrees_with_its_catalogue_entry(): void
    {
        /*
         * The seam where drift would be invisible.
         *
         * `templateData()` runs only when somebody has customised that message,
         * so a name it returns that the catalogue does not declare — or one the
         * shipped copy uses that `templateData()` never supplies — costs a word
         * in an email nobody is looking at. It never throws, and it never falls
         * back either: the sentence simply comes out short.
         *
         * Read from the source rather than by building 22 notifications, each
         * of which would need a real Order, Ticket or Lead to construct. That
         * is the whole argument for the catalogue holding what is knowable
         * without a record.
         */
        $byClass = [];

        foreach (MessageCatalogue::all() as $key => $entry) {
            $byClass[$entry['class']][] = $key;
        }

        foreach (glob(app_path('Notifications/*.php')) as $file) {
            $source = file_get_contents($file);

            if (! str_contains($source, 'protected function templateData(')) {
                continue;
            }

            $class = 'App\\Notifications\\'.basename($file, '.php');

            $this->assertArrayHasKey($class, $byClass, "{$class} is templated but has no catalogue entry");

            $start = strpos($source, 'protected function templateData(');
            $end = strpos($source, 'protected function defaultMail(');
            $body = substr($source, $start, $end - $start);

            // The keys of the returned array, as written.
            preg_match_all("/^\s+'([a-z0-9_]+)' =>/m", $body, $matches);
            $supplied = array_unique($matches[1]);

            foreach ($byClass[$class] as $key) {
                $offered = MessageCatalogue::variableNames($key);

                foreach ($supplied as $name) {
                    $this->assertContains(
                        $name,
                        $offered,
                        "{$class} supplies '{$name}' but {$key} does not offer it",
                    );
                }

                // And the other direction: copy that uses a name nothing fills
                // renders a sentence with a hole in it.
                foreach (Placeholders::used(MessageCatalogue::get($key)['body']) as $used) {
                    $this->assertContains(
                        $used,
                        $supplied,
                        "{$key} uses {{{$used}}} but {$class} never supplies it",
                    );
                }
            }
        }
    }

    public function test_every_message_in_the_catalogue_is_templated(): void
    {
        foreach (MessageCatalogue::all() as $key => $entry) {
            $this->assertContains(
                'App\\Notifications\\Concerns\\Templated',
                class_uses_recursive($entry['class']),
                "{$key} names {$entry['class']}, which does not use the Templated trait — so editing it would do nothing",
            );
        }
    }
}
