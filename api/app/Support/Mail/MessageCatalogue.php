<?php

namespace App\Support\Mail;

use App\Notifications\TicketAcknowledged;
use App\Notifications\TicketCreated;
use App\Notifications\TicketReplied;

/**
 * Every email the system sends, and what an editor may put in it.
 *
 * ## Why a catalogue rather than methods on each notification
 *
 * The console has to list all of these with an empty database, and
 * `new OrderPaid($order)` needs a real order. Every fact here is knowable
 * without a record — the key, the label, what the message is for, which
 * placeholders it offers and a sample for each — so it lives here, and the
 * only thing a notification supplies is `templateData()`, the values that
 * only that send can know.
 *
 * The seam between the two is exactly where drift would be invisible: a key
 * that disagrees resolves to "fall back to the built-in", which is a
 * *correct-looking* email. `MailTemplateTest` asserts every catalogue key
 * resolves to a class, every templated class has an entry, and every name a
 * `templateData()` returns is declared here.
 *
 * ## Keys are hand-written
 *
 * Never derived from the class name, so renaming `OrderPaid` cannot silently
 * orphan somebody's stored copy.
 *
 * ## `html` variables
 *
 * Most of these messages build a *variable number of lines* — a labelled fact
 * per detail that happens to be present, an order's items, a form's answers.
 * A subject-and-body template cannot express a loop, so the loop's output
 * becomes one placeholder marked `html`, and `Placeholders::fill()` leaves it
 * unescaped because the application built it rather than a person typing it.
 * Everything else is escaped. That direction must never be got backwards.
 */
class MessageCatalogue
{
    /** Who the message is written for, which is why two of them read alike. */
    public const CUSTOMER = 'customer';

    public const INTERNAL = 'internal';

    /**
     * @return array<string, array{
     *     label: string, description: string, audience: string, class: class-string,
     *     variables: array<string, array{about: string, sample: string, html?: bool}>,
     *     subject: string, body: string
     * }>
     */
    public static function all(): array
    {
        return [
            /* ------------------------------------------------- tickets */

            'ticket_created' => [
                'label' => 'New ticket — to the desk',
                'description' => 'Sent to the support address when a customer raises a ticket.',
                'audience' => self::INTERNAL,
                'class' => TicketCreated::class,
                'variables' => [
                    'reference' => ['about' => 'The ticket reference, which is what people search their mailbox for.', 'sample' => 'TW-2026-00042'],
                    'subject' => ['about' => 'What the customer called it.', 'sample' => 'Switch keeps dropping its uplink'],
                    'customer_name' => ['about' => 'Who raised it.', 'sample' => 'Neil Basu'],
                    'company' => ['about' => 'Their company, or blank.', 'sample' => 'Meridian Foods'],
                    'priority' => ['about' => 'Normal, High, Critical.', 'sample' => 'High'],
                    'category' => ['about' => 'The ticket category.', 'sample' => 'Network / connectivity'],
                    'description' => ['about' => 'The first 400 characters of what they wrote.', 'sample' => 'The uplink drops every afternoon, and it started after the last firmware update.'],
                    'url' => ['about' => 'The ticket in the console.', 'sample' => 'https://www.technoware.in/admin/tickets/TW-2026-00042'],
                ],
                'subject' => '[{{reference}}] New ticket: {{subject}}',
                'body' => '<p>A new ticket has been raised.</p>'
                    .'<p><strong>{{subject}}</strong></p>'
                    .'<p>From {{customer_name}} at {{company}} · {{priority}} · {{category}}</p>'
                    .'<p>{{description}}</p>'
                    .'<p><a href="{{url}}">Open it in the console</a></p>',
            ],

            'ticket_acknowledged' => [
                'label' => 'Ticket received — to the customer',
                'description' => 'The receipt a customer gets the moment their ticket is logged.',
                'audience' => self::CUSTOMER,
                'class' => TicketAcknowledged::class,
                'variables' => [
                    'reference' => ['about' => 'The ticket reference.', 'sample' => 'TW-2026-00042'],
                    'subject' => ['about' => 'What they called it.', 'sample' => 'Switch keeps dropping its uplink'],
                    'customer_name' => ['about' => 'Who raised it.', 'sample' => 'Neil Basu'],
                    'url' => ['about' => 'The ticket in the customer portal.', 'sample' => 'https://www.technoware.in/portal/tickets/TW-2026-00042'],
                ],
                'subject' => '[{{reference}}] We have your ticket: {{subject}}',
                'body' => '<p>Thanks {{customer_name}} — this is logged.</p>'
                    .'<p>Your reference is <strong>{{reference}}</strong>. Quote it if you call.</p>'
                    .'<p><a href="{{url}}">Track this ticket</a></p>',
            ],

            'ticket_replied_customer' => [
                'label' => 'Ticket reply — to the customer',
                'description' => 'Sent when an engineer replies to a ticket. Internal notes never trigger this.',
                'audience' => self::CUSTOMER,
                'class' => TicketReplied::class,
                'variables' => [
                    'reference' => ['about' => 'The ticket reference.', 'sample' => 'TW-2026-00042'],
                    'subject' => ['about' => 'The ticket subject.', 'sample' => 'Switch keeps dropping its uplink'],
                    'author' => ['about' => 'Who replied.', 'sample' => 'Priya Sharma'],
                    'body' => ['about' => 'The first 400 characters of the reply.', 'sample' => 'We have pushed the firmware back a version on that switch — please watch it this afternoon.'],
                    'url' => ['about' => 'The conversation in the portal.', 'sample' => 'https://www.technoware.in/portal/tickets/TW-2026-00042'],
                ],
                'subject' => '[{{reference}}] New reply: {{subject}}',
                'body' => '<p>{{author}} has replied to your ticket.</p>'
                    .'<p>{{body}}</p>'
                    .'<p><a href="{{url}}">Read it and reply</a></p>',
            ],

            'ticket_replied_desk' => [
                'label' => 'Ticket reply — to the desk',
                'description' => 'Sent to the support address when a customer replies to their own ticket.',
                'audience' => self::INTERNAL,
                'class' => TicketReplied::class,
                'variables' => [
                    'reference' => ['about' => 'The ticket reference.', 'sample' => 'TW-2026-00042'],
                    'subject' => ['about' => 'The ticket subject.', 'sample' => 'Switch keeps dropping its uplink'],
                    'author' => ['about' => 'Who replied.', 'sample' => 'Neil Basu'],
                    'body' => ['about' => 'The first 400 characters of the reply.', 'sample' => 'It dropped again at 3pm, same as before.'],
                    'url' => ['about' => 'The ticket in the console.', 'sample' => 'https://www.technoware.in/admin/tickets/TW-2026-00042'],
                ],
                'subject' => '[{{reference}}] New reply: {{subject}}',
                'body' => '<p>{{author}} has replied.</p>'
                    .'<p>{{body}}</p>'
                    .'<p><a href="{{url}}">Open it in the console</a></p>',
            ],
        ];
    }

    /** @return array<string, mixed>|null */
    public static function get(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::all());
    }

    /**
     * Sample values, for a preview and a test send.
     *
     * One declaration serves the palette, the preview and the test — a second
     * list of samples somewhere else would be wrong the first time a message
     * gained a placeholder.
     *
     * @return array<string, string>
     */
    public static function samples(string $key): array
    {
        $entry = self::get($key);

        if ($entry === null) {
            return [];
        }

        return array_map(fn (array $v): string => $v['sample'], $entry['variables']);
    }

    /**
     * The names whose value is a fragment the application built, so
     * `Placeholders::fill()` must not escape them.
     *
     * @return list<string>
     */
    public static function rawVariables(string $key): array
    {
        $entry = self::get($key);

        if ($entry === null) {
            return [];
        }

        return array_keys(array_filter($entry['variables'], fn (array $v): bool => ($v['html'] ?? false) === true));
    }

    /**
     * The placeholder names this message offers.
     *
     * @return list<string>
     */
    public static function variableNames(string $key): array
    {
        return array_keys(self::get($key)['variables'] ?? []);
    }
}
