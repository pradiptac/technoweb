<?php

namespace Tests\Feature;

use App\Enums\CampaignStatus;
use App\Enums\Role as RoleEnum;
use App\Models\NewsletterCampaign;
use App\Support\Writing\WritingSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

/** One block of a campaign, and subject lines: only the words ever change. */
class WritingCampaignTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    private function campaign(): NewsletterCampaign
    {
        return NewsletterCampaign::create([
            'name' => 'Autumn', 'subject' => 'Autumn offers', 'status' => CampaignStatus::Draft,
            'blocks' => [
                ['type' => 'heading', 'text' => 'Big news', 'level' => 1],
                ['type' => 'text', 'html' => '<p>New switches are in.</p>'],
            ],
        ]);
    }

    private function ask(array $block, ?RoleEnum $role = null, ?NewsletterCampaign $campaign = null)
    {
        $campaign ??= $this->campaign();

        return $this->actingAs($this->staff($role ?? RoleEnum::CampaignManager), 'sanctum')->postJson('/api/v1/admin/writing', [
            'surface' => 'campaign_block', 'mode' => 'rewrite',
            'input' => json_encode($block), 'ref' => ['campaign_id' => $campaign->id],
        ]);
    }

    public function test_a_heading_is_reworded_and_its_level_kept(): void
    {
        $this->writerOn();
        $this->fakeModel(['block' => ['text' => 'Our biggest news this year']]);

        $out = json_decode($this->ask(['type' => 'heading', 'text' => 'Big news', 'level' => 1])->assertOk()->json('data.output'), true);

        $this->assertSame('heading', $out['type']);
        $this->assertSame(1, $out['level']);
        $this->assertSame('Our biggest news this year', $out['text']);
    }

    public function test_a_heading_is_cut_to_two_hundred_characters(): void
    {
        $this->writerOn();
        $this->fakeModel(['block' => ['text' => str_repeat('word ', 80)]]);

        $out = json_decode($this->ask(['type' => 'heading', 'text' => 'Big news', 'level' => 1])->assertOk()->json('data.output'), true);

        $this->assertLessThanOrEqual(200, mb_strlen($out['text']));
    }

    public function test_a_text_block_that_loses_its_placeholder_is_refused(): void
    {
        $this->writerOn();
        $this->fakeModel(['block' => ['lines' => [['kind' => 'p', 'text' => 'Hello, new switches are here.']]]]);

        $this->ask(['type' => 'text', 'html' => '<p>Hi {{first_name}}, new switches.</p>'])
            ->assertStatus(422)->assertJsonPath('errors.writing.0', fn ($m) => str_contains($m, 'first_name'));
    }

    public function test_a_text_block_that_keeps_its_placeholder_is_returned(): void
    {
        $this->writerOn();
        $this->fakeModel(['block' => ['lines' => [['kind' => 'p', 'text' => 'Hello {{first_name}}, the new switches are in.']]]]);

        $out = json_decode($this->ask(['type' => 'text', 'html' => '<p>Hi {{first_name}}, new switches.</p>'])->assertOk()->json('data.output'), true);

        $this->assertSame('text', $out['type']);
        $this->assertStringContainsString('{{first_name}}', $out['html']);
        $this->assertStringContainsString('<p>', $out['html']);
    }

    public function test_a_heading_that_loses_its_placeholder_is_refused(): void
    {
        $this->writerOn();
        $this->fakeModel(['block' => ['text' => 'Big news for you']]);

        $this->ask(['type' => 'heading', 'text' => 'Big news, {{first_name}}', 'level' => 2])->assertStatus(422);
    }

    public function test_a_button_label_is_cut_to_sixty_and_its_link_kept(): void
    {
        $this->writerOn();
        $this->fakeModel(['block' => ['label' => str_repeat('Shop ', 30)]]);

        $out = json_decode($this->ask(['type' => 'button', 'label' => 'Shop', 'href' => 'https://example.test/x'])->assertOk()->json('data.output'), true);

        $this->assertLessThanOrEqual(60, mb_strlen($out['label']));
        $this->assertSame('https://example.test/x', $out['href']);
    }

    public function test_columns_are_reworded_in_order_and_markup_is_stripped(): void
    {
        $this->writerOn();
        $this->fakeModel(['block' => ['columns' => [
            ['heading' => 'Fast <b>now</b>', 'text' => 'Quicker links.'],
            ['heading' => 'Safe', 'text' => 'Better firewalls.'],
        ]]]);

        $out = json_decode($this->ask(['type' => 'columns', 'columns' => [
            ['heading' => 'Fast', 'text' => 'Links.', 'image_path' => 'a.png'],
            ['heading' => 'Safe', 'text' => 'Firewalls.'],
        ]])->assertOk()->json('data.output'), true);

        $this->assertSame('Fast now', $out['columns'][0]['heading']);
        $this->assertSame('Better firewalls.', $out['columns'][1]['text']);
        $this->assertSame('a.png', $out['columns'][0]['image_path']);
    }

    public function test_an_image_block_has_no_words_to_write(): void
    {
        $this->writerOn();
        $fake = $this->fakeModel(['block' => ['text' => 'x']]);

        $this->ask(['type' => 'image', 'src' => 'a.png'])
            ->assertStatus(422)->assertJsonPath('errors.writing.0', 'This kind of block has no words to write.');
        $this->assertSame(0, $fake->calls);
    }

    public function test_a_content_manager_cannot_write_campaign_blocks(): void
    {
        $this->writerOn();
        $this->fakeModel(['block' => ['text' => 'Our biggest news']]);

        $this->ask(['type' => 'heading', 'text' => 'Big news', 'level' => 1], RoleEnum::ContentManager)->assertForbidden();
    }

    public function test_an_unknown_campaign_is_a_404(): void
    {
        $this->writerOn();
        $this->fakeModel(['block' => ['text' => 'x']]);
        $campaign = $this->campaign();
        $campaign->delete();

        $this->ask(['type' => 'heading', 'text' => 'Big news', 'level' => 1], null, $campaign)->assertNotFound();
    }

    public function test_three_subject_lines_are_suggested_and_counted_once(): void
    {
        $this->writerOn();
        $fake = $this->fakeModel(['subjects' => ['A', 'B', str_repeat('C', 200), 'D']]);
        $campaign = $this->campaign();

        $subjects = $this->actingAs($this->staff(RoleEnum::CampaignManager), 'sanctum')
            ->postJson('/api/v1/admin/writing/subjects', ['campaign_id' => $campaign->id])
            ->assertOk()->json('data.subjects');

        $this->assertCount(3, $subjects);
        foreach ($subjects as $s) {
            $this->assertLessThanOrEqual(120, mb_strlen($s));
        }
        $this->assertSame(1, $fake->calls);
        $this->assertSame(1, WritingSettings::runsToday());
        $this->assertStringContainsString('Big news', $this->sent($fake));
    }

    public function test_subject_lines_need_the_campaign_role_and_a_campaign(): void
    {
        $this->writerOn();
        $fake = $this->fakeModel(['subjects' => ['A']]);
        $campaign = $this->campaign();

        $this->actingAs($this->staff(RoleEnum::ContentManager), 'sanctum')
            ->postJson('/api/v1/admin/writing/subjects', ['campaign_id' => $campaign->id])->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(RoleEnum::CampaignManager), 'sanctum')
            ->postJson('/api/v1/admin/writing/subjects', ['campaign_id' => $campaign->id + 999])->assertNotFound();
        $this->assertSame(0, $fake->calls);
        $this->assertSame(0, WritingSettings::runsToday());
    }
}
