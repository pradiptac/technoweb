<?php

namespace Tests\Unit;

use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;
use Tests\TestCase;

/**
 * The trait's wildcard reads a dotted path after the `*` since 2026-09-26 —
 * `blocks.*.data.body`, a builder section's rich text. Pinned here because
 * the first cut of the one-level form listed a path and cleaned nothing, and
 * a nested one fails the same way: silently.
 */
class SanitisesRichTextTest extends TestCase
{
    /** @param  array<string, mixed>  $input @return array<string, mixed> */
    private function prepared(array $input): array
    {
        $request = new class extends FormRequest
        {
            use SanitisesRichText;

            protected function richTextFields(): array
            {
                return ['body', 'answer_blocks.*.detail', 'blocks.*.data.body', 'blocks.*.data.rows.*.columns.*.widgets.*.html'];
            }

            public function run(): void
            {
                $this->prepareForValidation();
            }
        };

        $request->merge($input);
        $request->run();

        return $request->all();
    }

    public function test_a_nested_path_after_the_wildcard_is_cleaned_on_every_row(): void
    {
        $out = $this->prepared(['blocks' => [
            ['type' => 'rich_text', 'data' => ['body' => '<p>One</p><script>alert(1)</script>']],
            ['type' => 'media_text', 'data' => ['body' => '<p onclick="x()">Two</p>']],
        ]]);

        $this->assertSame('<p>One</p>', $out['blocks'][0]['data']['body']);
        $this->assertStringNotContainsString('onclick', $out['blocks'][1]['data']['body']);
        $this->assertStringContainsString('Two', $out['blocks'][1]['data']['body']);
    }

    public function test_a_row_without_the_nested_key_is_left_as_it_was(): void
    {
        $out = $this->prepared(['blocks' => [
            ['type' => 'divider', 'data' => ['size' => 'small']],
            ['type' => 'hero'],
        ]]);

        $this->assertSame(['size' => 'small'], $out['blocks'][0]['data']);
        $this->assertArrayNotHasKey('data', $out['blocks'][1]);
    }

    public function test_a_non_string_is_left_for_validation_to_refuse(): void
    {
        $out = $this->prepared(['blocks' => [['data' => ['body' => ['<script>']]]]]);

        $this->assertSame(['<script>'], $out['blocks'][0]['data']['body']);
    }

    public function test_the_one_level_form_still_works(): void
    {
        $out = $this->prepared([
            'body' => '<p>Body</p><script>x</script>',
            'answer_blocks' => [['detail' => '<p>Detail</p><iframe src="//evil"></iframe>']],
        ]);

        $this->assertSame('<p>Body</p>', $out['body']);
        $this->assertSame('<p>Detail</p>', $out['answer_blocks'][0]['detail']);
    }

    public function test_four_stars_deep_a_layout_widgets_html_is_cleaned_on_every_widget(): void
    {
        $text = fn (string $html) => ['type' => 'text', 'html' => $html];
        $out = $this->prepared(['blocks' => [['data' => ['rows' => [
            ['columns' => [
                ['widgets' => [$text('<p>One</p><script>alert(1)</script>'), ['type' => 'heading', 'text' => '<b>kept as typed</b>']]],
                ['widgets' => [$text('<p onclick="x()">Two</p>')]],
            ]],
            ['columns' => [['widgets' => [$text('<iframe src="//evil"></iframe><p>Three</p>')]]]],
        ]]]]]);

        $rows = $out['blocks'][0]['data']['rows'];
        $this->assertSame('<p>One</p>', $rows[0]['columns'][0]['widgets'][0]['html']);
        $this->assertStringNotContainsString('onclick', $rows[0]['columns'][1]['widgets'][0]['html']);
        $this->assertStringNotContainsString('iframe', $rows[1]['columns'][0]['widgets'][0]['html']);
        // Only the named key is cleaned: a widget's plain text is escaped at the sink, not rewritten here.
        $this->assertSame('<b>kept as typed</b>', $rows[0]['columns'][0]['widgets'][1]['text']);
    }
}
