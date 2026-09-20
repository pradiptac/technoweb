<?php

namespace App\Support\Mail;

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
     *     subject: string, body: string, locked: bool
     * }>
     */
    public static function all(): array
    {
        // `locked` on every entry, so the console reads a boolean rather than
        // the absence of a key — three entries set it and the rest do not.
        return array_map(
            fn (array $entry) => $entry + ['locked' => false],
            MessageCatalogueEntries::all(),
        );
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
