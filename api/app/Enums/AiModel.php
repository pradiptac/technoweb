<?php

namespace App\Enums;

/**
 * The models offered in the console, and what each one costs to choose.
 *
 * **These are OpenRouter model ids** — `maker/model`, as openrouter.ai lists
 * them — because every AI feature here calls OpenRouter and nothing else
 * (`App\Support\Chat\Providers\OpenRouterProvider`, 0.116.0). One key, one
 * endpoint, and the maker is a prefix on the id rather than a second
 * integration.
 *
 * **The client brings their own keys (BYOK).** Their OpenAI and Google AI
 * Studio keys are saved *inside OpenRouter* (its Settings → Integrations),
 * never here, and OpenRouter routes each call to the maker under that key.
 * The consequence that matters on this screen: **a model only works when its
 * maker's key is configured there** (or the OpenRouter account has credit of
 * its own to fall back on). So a Gemini model answers once a Google AI
 * Studio key has been added at OpenRouter — and such a key is free to
 * create, which is why the Google models are listed first and one of them is
 * the default — while **an OpenAI model needs an OpenAI key, or credit, in
 * the OpenRouter account** and is refused without one. Nothing on this side
 * can know which is in place — it is a fact about somebody's OpenRouter
 * account — so the list offers both makers and
 * `POST /admin/seo/ai/test-model` is how one is proved.
 *
 * **A free key is rate-limited by its maker**, per minute and per day. Past
 * the limit OpenRouter answers 429 in the maker's words; that is logged,
 * shown verbatim by `test-model`, never retried on the spot, and to a visitor
 * or an editor it is the ordinary "the AI service did not answer". A bulk SEO
 * run and a busy assistant are where a free key's limits are met first.
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
 * **This list will go stale.** Makers ship models faster than this
 * application deploys, and there is no way to know from here which of them a
 * given account may actually call. That is what `POST /admin/seo/ai/test-model`
 * is for — one real request, reporting the provider's own words on refusal, the
 * same job `/admin/settings/mail/test` does for a mail transport. **Press it for
 * every model offered before trusting this list**; an id that does not exist
 * fails silently on every call otherwise.
 *
 * ## What every model here must be able to do
 *
 * Read a picture. `AltText` sends one to whichever model is chosen, so a
 * text-only model on this list would be a model that breaks one feature and
 * says so only when somebody presses the button. All seven accept images.
 *
 * Written September 2026, moved to OpenRouter ids October 2026. Reviewing it
 * is a two-line change plus a test run.
 */
enum AiModel: string
{
    // Google's first, and the default first of all: the order is the order
    // of the console's dropdown, and the first option is what a select shows
    // when nothing is chosen.
    case Gemini25Flash = 'google/gemini-2.5-flash';
    case Gemini25FlashLite = 'google/gemini-2.5-flash-lite';
    case Gemini25Pro = 'google/gemini-2.5-pro';
    case Gpt4oMini = 'openai/gpt-4o-mini';
    case Gpt41Mini = 'openai/gpt-4.1-mini';
    case Gpt4o = 'openai/gpt-4o';
    case Gpt41 = 'openai/gpt-4.1';

    /**
     * What a blank setting and a blank `AI_MODEL` both mean.
     *
     * A Google model, because the key the client starts with is a Google AI
     * Studio one — free to create, added at OpenRouter under "bring your own
     * key" — and a default that needed a second, paid maker's key would be
     * a default that fails on the first press. A choice already *stored* is
     * never moved to this: only a blank resolves here.
     */
    public const DEFAULT = 'google/gemini-2.5-flash';

    public function label(): string
    {
        return match ($this) {
            self::Gemini25Flash => 'Gemini 2.5 Flash (Google)',
            self::Gemini25FlashLite => 'Gemini 2.5 Flash-Lite (Google)',
            self::Gemini25Pro => 'Gemini 2.5 Pro (Google)',
            self::Gpt4oMini => 'GPT-4o mini (OpenAI)',
            self::Gpt41Mini => 'GPT-4.1 mini (OpenAI)',
            self::Gpt4o => 'GPT-4o (OpenAI)',
            self::Gpt41 => 'GPT-4.1 (OpenAI)',
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
            self::Gemini25Flash => 'The default. Google’s all-rounder: follows a brief well and handles long pages. Works with a free Google AI Studio key added at OpenRouter, within that key’s limits.',
            self::Gemini25FlashLite => 'Google’s lightest and quickest. Fine for titles, descriptions, keywords and alt text, and the gentlest on a free key’s limits.',
            self::Gemini25Pro => 'Google’s strongest and slowest: it thinks before it answers, and the thinking counts as usage. For content work and page drafts, not for the website assistant.',
            self::Gpt4oMini => 'OpenAI’s cheapest and quickest. Needs an OpenAI key, or credit, in the OpenRouter account.',
            self::Gpt41Mini => 'OpenAI’s all-rounder, better at following a brief than 4o mini. Needs an OpenAI key, or credit, in the OpenRouter account.',
            self::Gpt4o => 'Stronger on analysis and rewriting copy, at several times the cost of mini. Needs an OpenAI key, or credit, in the OpenRouter account.',
            self::Gpt41 => 'The best judgement of OpenAI’s four, and their most expensive. Worth it for content work, wasteful for a meta description. Needs an OpenAI key, or credit, in the OpenRouter account.',
        };
    }

    /**
     * Whether the model spends tokens thinking before it writes.
     *
     * It matters because **the thinking comes out of the same allowance as the
     * answer**. Every caller here caps a reply — five tokens to prove a model,
     * 120 for an alt text or an intake reading — and a model that thinks
     * first can spend the whole of a small cap before writing a word, which
     * arrives as an empty reply from a model that is working perfectly. The
     * provider gives these models headroom above the caller's cap for that
     * reason (`OpenRouterProvider::allowance()`).
     *
     * Gemini 2.5 Pro always thinks; 2.5 Flash thinks when it judges the
     * question needs it. Flash-Lite does not unless asked, and nothing here
     * asks. Headroom on a model that turns out not to need it costs nothing —
     * a cap is a ceiling, and a reply ends where the answer ends.
     */
    public function thinks(): bool
    {
        return match ($this) {
            self::Gemini25Flash, self::Gemini25Pro => true,
            default => false,
        };
    }

    public static function tryFromValue(?string $value): ?self
    {
        return $value === null || $value === '' ? null : self::tryFrom($value);
    }

    /**
     * An id from before OpenRouter, as OpenRouter names the same model.
     *
     * Until 0.116.0 the only provider was OpenAI and a model was stored bare
     * — `gpt-4o`. OpenRouter calls the same model `openai/gpt-4o`, and a bare
     * id there is "not a valid model". So an id with no maker in front of it
     * that has an OpenAI model's shape gets `openai/`; anything else —
     * blank, already qualified, or something this cannot vouch for — comes
     * back exactly as it went in.
     *
     * This is a **rename, not a substitution**: the model called is the one
     * that was chosen, which is the rule this enum exists to keep. Used once
     * by the upgrade step on the stored settings, and on every read of
     * `AI_MODEL`, which lives in a file no upgrade step can edit.
     */
    public static function qualify(string $id): string
    {
        $id = trim($id);

        if ($id === '' || str_contains($id, '/') || str_contains($id, ':')) {
            return $id;
        }

        return preg_match('/^(gpt-|chatgpt-|o\d)/i', $id) === 1 ? 'openai/'.$id : $id;
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
                'description' => 'Set outside this list. It is sent to OpenRouter exactly as written — test it before relying on it.',
            ];
        }

        return $options;
    }
}
