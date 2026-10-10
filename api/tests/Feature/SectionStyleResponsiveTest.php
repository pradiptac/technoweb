<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Page;
use App\Models\Role;
use App\Models\User;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The Design tab (0.146.0, `docs/page-builder.md` "Per-device design"): a
 * section's `min_h` and `heading_color`, and per-device overrides under
 * `style.responsive`. Choices on fixed scales, never numbers or colours.
 */
class SectionStyleResponsiveTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        $user = User::firstOrCreate(['email' => 'design-editor@example.test'], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()])->id]);

        return $user;
    }

    /** @param  array<string, mixed>  $style @return array<string, mixed> */
    private static function section(array $style): array
    {
        return ['id' => (string) Str::uuid(), 'type' => 'divider', 'hidden' => false, 'background' => null, 'data' => [], 'style' => $style];
    }

    /** @param  list<array<string, mixed>>  $blocks */
    private function create(array $blocks)
    {
        return $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => 'Designed page', 'template' => 'builder', 'status' => 'published', 'blocks' => $blocks,
        ]);
    }

    public function test_a_responsive_style_is_stored_and_returned_by_a_page_save(): void
    {
        $style = [
            'min_h' => 'm', 'heading_color' => 'brand',
            'responsive' => [
                'phone' => ['pad_top' => 's', 'pad_bottom' => 's', 'align' => 'start', 'min_h' => 'none'],
                'tablet' => ['pad_top' => 'm'],
            ],
        ];

        $this->create([self::section($style)])->assertCreated()
            ->assertJsonPath('data.blocks.0.style', $style);

        $this->getJson('/api/v1/pages/designed-page')->assertOk()
            ->assertJsonPath('data.sections.0.style', $style);
    }

    public function test_default_is_dropped_at_the_base_but_m_is_kept_in_an_override(): void
    {
        $this->create([self::section([
            'pad_top' => 'default', 'min_h' => 'default', 'heading_color' => 'default',
            'responsive' => ['phone' => ['pad_top' => 'm', 'pad_bottom' => 'm']],
        ])])->assertCreated()
            ->assertJsonPath('data.blocks.0.style', ['responsive' => ['phone' => ['pad_top' => 'm', 'pad_bottom' => 'm']]]);
    }

    public function test_an_override_stores_the_value_even_when_it_matches_the_base(): void
    {
        $this->create([self::section([
            'pad_top' => 'l', 'responsive' => ['desktop' => ['pad_top' => 'l']],
        ])])->assertCreated()
            ->assertJsonPath('data.blocks.0.style', ['pad_top' => 'l', 'responsive' => ['desktop' => ['pad_top' => 'l']]]);
    }

    public function test_an_empty_device_and_an_empty_responsive_are_dropped(): void
    {
        $this->create([
            self::section(['responsive' => ['phone' => [], 'tablet' => ['align' => 'center'], 'desktop' => []]]),
            self::section(['responsive' => ['phone' => [], 'desktop' => []]]),
            self::section(['responsive' => []]),
        ])->assertCreated()
            ->assertJsonPath('data.blocks.0.style', ['responsive' => ['tablet' => ['align' => 'center']]])
            ->assertJsonPath('data.blocks.1.style', null)
            ->assertJsonPath('data.blocks.2.style', null);

        // And in the column itself: nothing but the one real override is stored.
        $stored = Page::query()->firstOrFail()->blocks;
        $this->assertSame(['responsive' => ['tablet' => ['align' => 'center']]], $stored[0]['style']);
        $this->assertNull($stored[1]['style']);
        $this->assertNull($stored[2]['style']);
    }

    public function test_style_itself_drops_an_empty_device_and_an_empty_responsive(): void
    {
        // Pinned on the normaliser directly: the request layer may drop an
        // empty array before it gets here, and the rule must hold without it.
        $this->assertNull(SectionRules::style(['responsive' => []]));
        $this->assertNull(SectionRules::style(['responsive' => ['phone' => [], 'desktop' => []]]));
        $this->assertSame(
            ['responsive' => ['desktop' => ['min_h' => 'screen']]],
            SectionRules::style(['responsive' => ['phone' => [], 'desktop' => ['min_h' => 'screen', 'junk' => 'x']]]),
        );
    }

    /** @return array<string, array{0: array<string, mixed>, 1: string}> */
    public static function refusals(): array
    {
        return [
            'an unknown value' => [['responsive' => ['phone' => ['pad_top' => 'huge']]], 'blocks.0.style.responsive.phone.pad_top'],
            'default is not a step in an override' => [['responsive' => ['tablet' => ['pad_bottom' => 'default']]], 'blocks.0.style.responsive.tablet.pad_bottom'],
            'a value from another key' => [['responsive' => ['desktop' => ['align' => 'xl']]], 'blocks.0.style.responsive.desktop.align'],
            'a pixel height' => [['responsive' => ['phone' => ['min_h' => '400px']]], 'blocks.0.style.responsive.phone.min_h'],
            'a base height that is not a step' => [['min_h' => '90vh'], 'blocks.0.style.min_h'],
            'a heading colour that is a hex' => [['heading_color' => '#ff0000'], 'blocks.0.style.heading_color'],
            'responsive that is not a list of devices' => [['responsive' => 'phone'], 'blocks.0.style.responsive'],
            'a device that is not an object' => [['responsive' => ['phone' => 'tight']], 'blocks.0.style.responsive.phone'],
        ];
    }

    /** @param  array<string, mixed>  $style */
    #[DataProvider('refusals')]
    public function test_a_value_outside_its_list_is_refused_at_its_dotted_path(array $style, string $key): void
    {
        $this->create([self::section($style)])->assertStatus(422)->assertJsonValidationErrors($key);
    }

    public function test_an_unknown_device_is_never_stored(): void
    {
        $this->create([self::section(['responsive' => ['watch' => ['pad_top' => 's'], 'phone' => ['pad_top' => 's']]])])->assertCreated()
            ->assertJsonPath('data.blocks.0.style', ['responsive' => ['phone' => ['pad_top' => 's']]]);
    }

    /** @return array<string, array{0: string}> */
    public static function doors(): array
    {
        return ['the live preview' => ['preview'], 'the library' => ['library'], 'a record' => ['record']];
    }

    #[DataProvider('doors')]
    public function test_the_same_style_is_accepted_by_the_other_doors(string $door): void
    {
        $style = ['min_h' => 'screen', 'responsive' => ['phone' => ['pad_top' => 'm', 'min_h' => 'none']]];
        $block = self::section($style);
        $user = $this->actingAs($this->user(), 'sanctum');

        match ($door) {
            'preview' => $user->postJson('/api/v1/admin/pages/preview', ['blocks' => [$block]])->assertOk()
                ->assertJsonPath('data.sections.0.style', $style),
            'library' => $user->postJson('/api/v1/admin/saved-sections', ['kind' => 'section', 'name' => 'Styled', 'blocks' => [$block]])->assertCreated()
                ->assertJsonPath('data.blocks.0.style', $style),
            'record' => $user->postJson('/api/v1/admin/solutions', ['title' => 'Styled', 'status' => 'published', 'body_layout' => 'sections', 'blocks' => [$block]])->assertCreated()
                ->assertJsonPath('data.blocks.0.style', $style),
        };
    }

    public function test_a_bad_override_is_refused_at_the_other_doors_too(): void
    {
        $bad = self::section(['responsive' => ['phone' => ['pad_top' => 'huge']]]);
        $user = $this->actingAs($this->user(), 'sanctum');

        $user->postJson('/api/v1/admin/pages/preview', ['blocks' => [$bad]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.style.responsive.phone.pad_top');
        $user->postJson('/api/v1/admin/saved-sections', ['kind' => 'section', 'name' => 'Bad', 'blocks' => [$bad]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.style.responsive.phone.pad_top');
        $user->postJson('/api/v1/admin/solutions', ['title' => 'Bad', 'status' => 'published', 'blocks' => [$bad]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.style.responsive.phone.pad_top');
    }

    public function test_the_builder_options_name_the_types_whose_heading_colour_is_ignored(): void
    {
        $response = $this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk();

        $this->assertSame(SectionRules::HEADING_COLOR_EXCEPT, $response->json('data.style_options.heading_color_except'));
        foreach (['hero', 'cta', 'theme_section'] as $type) {
            $this->assertContains($type, $response->json('data.style_options.heading_color_except'));
        }
    }
}
