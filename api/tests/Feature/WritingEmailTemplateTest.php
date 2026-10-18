<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

/** A system email's wording: the catalogue's placeholders and no others. */
class WritingEmailTemplateTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    private function ask(array $over = [], ?RoleEnum $role = null)
    {
        $body = array_replace([
            'surface' => 'email_template', 'mode' => 'rewrite',
            'input' => '<p>Hello {{reference}}</p>', 'ref' => ['key' => 'ticket_acknowledged', 'field' => 'body'],
        ], $over);

        return $this->actingAs($this->staff($role ?? RoleEnum::Admin), 'sanctum')->postJson('/api/v1/admin/writing', $body);
    }

    public function test_a_body_is_reworded_and_keeps_its_placeholder(): void
    {
        $this->writerOn();
        $this->fakeModel(['lines' => [['kind' => 'p', 'text' => 'Good news: {{reference}} is logged.']]]);

        $out = $this->ask()->assertOk()->json('data.output');

        $this->assertSame('<p>Good news: {{reference}} is logged.</p>', $out);
    }

    public function test_a_content_manager_is_refused(): void
    {
        $this->writerOn();
        $this->fakeModel(['text' => 'x']);

        $this->ask([], RoleEnum::ContentManager)->assertForbidden();
    }

    public function test_a_locked_message_is_refused(): void
    {
        $this->writerOn();
        $fake = $this->fakeModel(['text' => 'x']);

        $this->ask(['ref' => ['key' => 'reset_password', 'field' => 'subject'], 'input' => 'Reset your password'])->assertStatus(422);
        $this->assertSame(0, $fake->calls);
    }

    public function test_an_invented_placeholder_is_refused(): void
    {
        $this->writerOn();
        $this->fakeModel(['lines' => [['kind' => 'p', 'text' => 'Hello {{reference}}, total {{order_total}}']]]);

        $this->ask()->assertStatus(422)->assertJsonPath('errors.writing.0', fn ($m) => str_contains($m, 'order_total'));
    }

    public function test_an_invented_placeholder_in_a_subject_is_refused(): void
    {
        $this->writerOn();
        $this->fakeModel(['text' => 'Your {{order_total}} ticket {{reference}}']);

        $this->ask(['input' => '[{{reference}}] We have your ticket', 'ref' => ['key' => 'ticket_acknowledged', 'field' => 'subject']])
            ->assertStatus(422);
    }

    public function test_a_dropped_placeholder_is_refused(): void
    {
        $this->writerOn();
        $this->fakeModel(['lines' => [['kind' => 'p', 'text' => 'Hello there.']]]);

        $this->ask()->assertStatus(422);
    }

    public function test_a_subject_is_rewritten_as_plain_text_within_two_hundred(): void
    {
        $this->writerOn();
        $this->fakeModel(['text' => '<b>Got it</b> [{{reference}}] {{subject}} '.str_repeat('x', 300)]);

        $out = $this->ask(['input' => '[{{reference}}] We have your ticket: {{subject}}', 'ref' => ['key' => 'ticket_acknowledged', 'field' => 'subject']])
            ->assertOk()->json('data.output');

        $this->assertStringStartsWith('Got it [{{reference}}] {{subject}}', $out);
        $this->assertStringNotContainsString('<b>', $out);
        $this->assertLessThanOrEqual(200, mb_strlen($out));
    }

    public function test_an_unknown_key_is_a_404(): void
    {
        $this->writerOn();
        $this->fakeModel(['text' => 'x']);

        $this->ask(['ref' => ['key' => 'no_such_message', 'field' => 'body']])->assertNotFound();
    }
}
