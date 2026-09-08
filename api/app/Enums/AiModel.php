<?php

namespace App\Enums;

/**
 * The models offered in the console, and what each one costs to choose.
 *
 * A dropdown rather than a text box, for the reason `schema_type` had to become
 * one: free text invites a guess, a typo saves happily, and the failure arrives
 * at *send* time as the provider's own error from a screen that had just
 * reported the settings saved. Model choice is also the single biggest lever on
 * both the bill and the quality of an answer, which is exactly the kind of
 * decision that deserves a described choice rather than a code name.
 *
 * ## Two rules that are not the usual ones
 *
 * **A stored value outside this list is kept and still sent.** Every other
 * allowlist here falls back — `SchemaTypes::resolve()` returns the derived type
 * for a value it does not recognise, and `mail_transport` falls back to `smtp`.
 * This one must not, because the failure is different in kind: substituting a
 * cheaper model for the one somebody chose means they are billed for one thing
 * while believing they bought another, and nothing anywhere says so. Emitting
 * slightly wrong markup is recoverable; a quiet swap on an invoice is not. The
 * console shows an unrecognised value as an extra option, marked, the way
 * `MailTransport` renders an uninstalled transport disabled *with the reason*
 * rather than hiding it.
 *
 * **This list will go stale.** Providers ship models faster than this
 * application deploys, and there is no way to know from here which of them a
 * given account may actually call. That is what `POST /admin/seo/ai/test-model`
 * is for — one real request, reporting the provider's own words on refusal, the
 * same job `/admin/settings/mail/test` does for a mail transport. **Press it for
 * every model offered before trusting this list**; an id that does not exist
 * fails silently on every call otherwise.
 *
 * Written September 2026. Reviewing it is a two-line change plus a test run.
 */
enum AiModel: string
{
    case Gpt4oMini = 'gpt-4o-mini';
    case Gpt41Mini = 'gpt-4.1-mini';
    case Gpt4o = 'gpt-4o';
    case Gpt41 = 'gpt-4.1';

    public function label(): string
    {
        return match ($this) {
            self::Gpt4oMini => 'GPT-4o mini',
            self::Gpt41Mini => 'GPT-4.1 mini',
            self::Gpt4o => 'GPT-4o',
            self::Gpt41 => 'GPT-4.1',
        };
    }

    /**
     * What choosing it costs, in words.
     *
     * Deliberately not a price. A number here would be stale the week after it
     * was typed and would read as a quote; what an editor needs is the shape of
     * the trade — the same reasoning behind `ImageQuality` naming its five steps
     * rather than showing a percentage.
     */
    public function description(): string
    {
        return match ($this) {
            self::Gpt4oMini => 'Cheapest and quickest. Fine for titles, descriptions and keywords.',
            self::Gpt41Mini => 'A little dearer, better at following a brief. A good default.',
            self::Gpt4o => 'Stronger on analysis and rewriting copy. Several times the cost of mini.',
            self::Gpt41 => 'The best judgement of the four, and the most expensive. Worth it for content work, wasteful for a meta description.',
        };
    }

    public static function tryFromValue(?string $value): ?self
    {
        return $value === null || $value === '' ? null : self::tryFrom($value);
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }

    /**
     * The console's dropdown.
     *
     * `$stored` is the value currently saved. When it is not one of ours it is
     * appended as its own option and said to be unrecognised, so choosing
     * something else is a deliberate act rather than the side effect of opening
     * the screen — a select whose current value is absent silently reassigns
     * itself to the first option the moment the form is submitted.
     *
     * @return array<int, array{value: string, label: string, description: string}>
     */
    public static function options(?string $stored = null): array
    {
        $options = array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label(), 'description' => $c->description()],
            self::cases(),
        );

        if ($stored !== null && $stored !== '' && self::tryFrom($stored) === null) {
            $options[] = [
                'value' => $stored,
                'label' => $stored,
                'description' => 'Set outside this list. It is sent exactly as written — test it before relying on it.',
            ];
        }

        return $options;
    }
}
