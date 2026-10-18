<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class WritingBodyTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    private const SOURCE = '<h2>Wi-Fi</h2><p>We survey.</p><table><tbody><tr><td>x</td></tr></tbody></table>';

    private function ask(array $over = [], ?RoleEnum $role = null)
    {
        $body = array_replace(['surface' => 'body', 'mode' => 'rewrite', 'input' => self::SOURCE, 'ref' => ['type' => 'blog_post']], $over);

        return $this->actingAs($this->staff($role ?? RoleEnum::ContentManager), 'sanctum')->postJson('/api/v1/admin/writing', $body);
    }

    public function test_a_body_is_reworded_and_locked_items_survive_the_pipeline(): void
    {
        $this->writerOn();
        $fake = $this->fakeModel(['lines' => [
            ['kind' => 'h2', 'text' => 'Wi-Fi surveys'],
            ['kind' => 'p', 'text' => 'We survey every floor.'],
            ['kind' => 'locked', 'text' => '[K1]'],
        ]]);

        $out = $this->ask()->assertOk()->json('data.output');
        $this->assertStringContainsString('<h2>Wi-Fi surveys</h2>', $out);
        $this->assertStringContainsString('<table><tbody><tr><td>x</td></tr></tbody></table>', $out);
        $sent = $this->sent($fake);
        $this->assertStringContainsString('[K1]', $sent);
        $this->assertStringNotContainsString('<td>', $sent);
    }

    public function test_an_iframe_survives_the_pipeline(): void
    {
        $this->writerOn();
        $this->fakeModel(['lines' => [['kind' => 'p', 'text' => 'Watch this.'], ['kind' => 'locked', 'text' => '[K1]']]]);
        $out = $this->ask(['input' => '<p>Watch.</p><iframe src="https://www.youtube.com/embed/abc"></iframe>'])->assertOk()->json('data.output');
        $this->assertStringContainsString('youtube.com/embed/abc', $out);
        $this->assertStringContainsString('<iframe', $out);
    }

    public function test_an_answer_that_drops_a_locked_item_is_refused(): void
    {
        $this->writerOn();
        $this->fakeModel(['lines' => [['kind' => 'h2', 'text' => 'Wi-Fi surveys'], ['kind' => 'p', 'text' => 'We survey every floor.']]]);
        $this->ask()->assertStatus(422)->assertJsonPath('errors.writing.0', fn ($m) => str_contains($m, 'left out'));
    }

    public function test_markup_in_a_line_is_never_stored(): void
    {
        $this->writerOn();
        $this->fakeModel(['lines' => [['kind' => 'p', 'text' => 'Hi <script>alert(1)</script> there.'], ['kind' => 'locked', 'text' => '[K1]']]]);
        $out = $this->ask()->assertOk()->json('data.output');
        $this->assertStringNotContainsString('<script', $out);
    }

    public function test_a_type_the_role_does_not_own_is_forbidden(): void
    {
        $this->writerOn();
        $this->fakeModel(['lines' => []]);
        $this->ask(['ref' => ['type' => 'store_product']])->assertForbidden();
    }
}
