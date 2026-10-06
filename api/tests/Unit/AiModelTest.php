<?php

namespace Tests\Unit;

use App\Enums\AiModel;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The models the console offers — OpenRouter ids since 0.116.0 — and the one
 * rename an install from before that needs.
 */
class AiModelTest extends TestCase
{
    public function test_the_seven_models_are_openrouter_ids_with_googles_first_and_the_default_first_of_all(): void
    {
        $this->assertSame([
            'google/gemini-2.5-flash',
            'google/gemini-2.5-flash-lite',
            'google/gemini-2.5-pro',
            'openai/gpt-4o-mini',
            'openai/gpt-4.1-mini',
            'openai/gpt-4o',
            'openai/gpt-4.1',
        ], AiModel::values());

        // A Google model: the key the client starts with is a free Google AI
        // Studio one, and a default that needed a second maker's key would
        // fail on the first press.
        $this->assertSame('google/gemini-2.5-flash', AiModel::DEFAULT);
        $this->assertNotNull(AiModel::tryFrom(AiModel::DEFAULT));
        $this->assertSame(AiModel::DEFAULT, AiModel::cases()[0]->value, 'the default is the first option a select shows');
        $this->assertStringStartsWith('The default.', AiModel::from(AiModel::DEFAULT)->description());

        foreach (AiModel::cases() as $model) {
            // `maker/model`, and short enough for `seo_suggestions.model` and
            // the `test-model` rule, both of which stop at 64.
            $this->assertMatchesRegularExpression('#^(openai|google)/[a-z0-9.-]+$#', $model->value);
            $this->assertLessThanOrEqual(64, strlen($model->value));
            // The maker is in the label, because the id is not what an editor reads.
            $this->assertStringEndsWith(str_starts_with($model->value, 'openai/') ? '(OpenAI)' : '(Google)', $model->label());
            $this->assertNotSame('', $model->description());
            // An OpenAI model says what it needs at OpenRouter; a Google one does not ask for it.
            $this->assertSame(str_starts_with($model->value, 'openai/'), str_contains($model->description(), 'Needs an OpenAI key'));
            // Words about the trade, never a price that would be stale in a week.
            $this->assertDoesNotMatchRegularExpression('/[$₹€£]|\d+\s*(cents?|paise)/u', $model->description());
        }
    }

    public function test_only_the_two_models_that_think_first_are_marked_as_thinking(): void
    {
        $thinking = array_values(array_map(
            fn (AiModel $m) => $m->value,
            array_filter(AiModel::cases(), fn (AiModel $m) => $m->thinks()),
        ));

        $this->assertSame(['google/gemini-2.5-flash', 'google/gemini-2.5-pro'], $thinking);
    }

    public function test_an_unknown_stored_value_is_offered_back_and_never_replaced(): void
    {
        $this->assertCount(7, AiModel::options());
        $this->assertCount(7, AiModel::options('google/gemini-2.5-pro'));
        $this->assertCount(7, AiModel::options(''));

        $options = AiModel::options('somebody/their-own-model');

        $this->assertCount(8, $options);
        $this->assertSame('somebody/their-own-model', $options[7]['value']);
        $this->assertSame('somebody/their-own-model', $options[7]['label']);
        $this->assertStringContainsString('exactly as written', $options[7]['description']);
        $this->assertSame(['value', 'label', 'description'], array_keys($options[0]));
    }

    public static function ids(): array
    {
        return [
            'gpt-4.1' => ['gpt-4.1', 'openai/gpt-4.1'],
            'gpt-4o-mini' => ['gpt-4o-mini', 'openai/gpt-4o-mini'],
            'one set outside the old list' => ['gpt-9-enormous', 'openai/gpt-9-enormous'],
            'chatgpt alias' => ['chatgpt-4o-latest', 'openai/chatgpt-4o-latest'],
            'an o-series id' => ['o4-mini', 'openai/o4-mini'],
            'padded' => ['  gpt-4o ', 'openai/gpt-4o'],
            'blank' => ['', ''],
            'already openai' => ['openai/gpt-4.1', 'openai/gpt-4.1'],
            'another maker' => ['google/gemini-2.5-flash', 'google/gemini-2.5-flash'],
            // A fine-tune is an OpenAI account's own model, which OpenRouter
            // cannot route to; a prefix would only disguise that.
            'a fine-tune' => ['ft:gpt-4o-mini:acme::abc123', 'ft:gpt-4o-mini:acme::abc123'],
            'nothing this can vouch for' => ['my-local-model', 'my-local-model'],
            'a word that only starts like one' => ['omni-large', 'omni-large'],
        ];
    }

    /** `gpt-4.1` is `openai/gpt-4.1` at OpenRouter: a rename, never a different model. */
    #[DataProvider('ids')]
    public function test_only_a_bare_openai_id_is_given_its_maker(string $from, string $to): void
    {
        $this->assertSame($to, AiModel::qualify($from));
    }
}
