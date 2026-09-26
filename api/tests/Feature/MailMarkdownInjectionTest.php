<?php

namespace Tests\Feature;

use App\Models\Enquiry;
use App\Models\MailTemplate;
use App\Notifications\EnquiryAcknowledged;
use App\Support\Mail\Placeholders;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A value typed into a public form is text in the email it causes, never
 * Markdown.
 *
 * Blade escaped `<`, and then the mail layout ran the body through
 * CommonMark — so `[Reset your password](https://evil.example)` typed as a
 * name on the contact form came back in the acknowledgement as a working
 * link under this company's letterhead, sent to any address the form was
 * given. Two ways into the same parse, and both are pinned: the built-in
 * wording (`{{ }}` echoes, secured encoding) and an editor's wording
 * (`Placeholders::fill`, which escapes before `{!! !!}`).
 */
class MailMarkdownInjectionTest extends TestCase
{
    use RefreshDatabase;

    private const LINK = '[Reset your password](https://evil.example/reset)';

    private function enquiry(): Enquiry
    {
        return Enquiry::create([
            'name' => self::LINK,
            'email' => 'victim@example.test',
            'subject' => '![logo](https://evil.example/pixel.png) '.self::LINK,
            'message' => 'Hello.',
            'source' => 'contact',
        ]);
    }

    private function render(): string
    {
        return (string) (new EnquiryAcknowledged($this->enquiry()))->toMail((object) [])->render();
    }

    public function test_the_built_in_acknowledgement_carries_no_link_from_the_form(): void
    {
        $html = $this->render();

        $this->assertStringNotContainsString('href="https://evil.example', $html);
        $this->assertStringNotContainsString('src="https://evil.example', $html);
        $this->assertStringContainsString('Reset your password', $html, 'The words themselves still arrive.');
    }

    public function test_an_edited_acknowledgement_carries_no_link_from_the_form(): void
    {
        MailTemplate::create([
            'key' => 'enquiry_acknowledged',
            'subject' => 'Thank you',
            'body_html' => '<p>Thank you, {{name}}. We have your note about {{subject}}.</p>',
        ]);

        $html = $this->render();

        $this->assertStringNotContainsString('href="https://evil.example', $html);
        $this->assertStringNotContainsString('src="https://evil.example', $html);
        $this->assertStringContainsString('Reset your password', $html);
    }

    public function test_a_placeholder_value_cannot_open_a_markdown_link(): void
    {
        $filled = Placeholders::fill('<p>{{name}}</p>', ['name' => self::LINK]);

        $this->assertStringNotContainsString('](', $filled);
        $this->assertStringNotContainsString('[', $filled);
    }
}
