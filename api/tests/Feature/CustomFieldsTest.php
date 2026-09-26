<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\CustomField;
use App\Models\CustomFieldGroup;
use App\Models\CustomFieldValue;
use App\Models\Media;
use App\Models\Page;
use App\Models\Role;
use App\Models\Service;
use App\Models\Solution;
use App\Models\User;
use App\Support\MediaMeta;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Custom fields (docs/custom-content.md): groups of editor-defined fields on
 * existing records, validated from the stored definitions, written through
 * each entity's own admin endpoint and read back in two shapes.
 */
class CustomFieldsTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        MediaMeta::forget();
        parent::tearDown();
    }

    private function staff(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::firstOrCreate(['email' => $role->value.'-cf@example.test'], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(
            ['slug' => $role->value], ['name' => $role->label()],
        )->id]);

        return $user;
    }

    /** @param array<string, mixed> $overrides */
    private function createGroup(array $overrides = [])
    {
        return $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/custom-field-groups', array_replace([
            'name' => 'Specification',
            'targets' => ['solution'],
            'placement' => 'details',
            'fields' => [
                ['key' => 'warranty', 'label' => 'Warranty', 'kind' => 'text'],
                ['key' => 'racks', 'label' => 'Racks', 'kind' => 'number', 'settings' => ['min' => 1, 'max' => 50000]],
                ['key' => 'tier', 'label' => 'Tier', 'kind' => 'select', 'options' => [
                    ['value' => 'gold', 'label' => 'Gold'], ['value' => 'silver', 'label' => 'Silver'],
                ]],
                ['key' => 'site', 'label' => 'Site', 'kind' => 'url'],
                ['key' => 'go_live', 'label' => 'Go-live', 'kind' => 'date'],
                ['key' => 'notes', 'label' => 'Notes', 'kind' => 'rich_text'],
                ['key' => 'service', 'label' => 'Delivered by', 'kind' => 'relation', 'settings' => ['target' => 'service']],
                ['key' => 'diagram', 'label' => 'Diagram', 'kind' => 'image'],
                ['key' => 'internal', 'label' => 'Internal code', 'kind' => 'text', 'show_on_page' => false],
            ],
        ], $overrides));
    }

    private function solution(): Solution
    {
        return Solution::create(['title' => 'Structured cabling', 'slug' => 'cabling', 'summary' => 'Racks.', 'status' => 'published']);
    }

    private function patchFields(Solution $solution, array $fields)
    {
        return $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['custom_fields' => $fields]);
    }

    /* ---------------------------------------------------- definitions */

    public function test_a_group_is_created_with_its_fields_in_order(): void
    {
        $this->createGroup()->assertCreated()
            ->assertJsonPath('data.slug', 'specification')
            ->assertJsonPath('data.target_labels', ['Solutions'])
            ->assertJsonPath('data.fields.2.key', 'tier')
            ->assertJsonPath('meta.kinds.0.value', 'text');

        $this->assertSame(9, CustomField::count());
    }

    public function test_definitions_are_refused_for_reserved_keys_bad_kinds_and_missing_options(): void
    {
        $this->createGroup(['fields' => [['key' => 'title', 'label' => 'Title', 'kind' => 'text']]])
            ->assertUnprocessable()->assertJsonValidationErrors('fields.0.key');

        $this->createGroup(['fields' => [['key' => 'x', 'label' => 'X', 'kind' => 'colour']]])
            ->assertUnprocessable()->assertJsonValidationErrors('fields.0.kind');

        $this->createGroup(['fields' => [['key' => 'x', 'label' => 'X', 'kind' => 'select', 'options' => []]]])
            ->assertUnprocessable()->assertJsonValidationErrors('fields.0.options');

        $this->createGroup(['fields' => [['key' => 'x', 'label' => 'X', 'kind' => 'relation']]])
            ->assertUnprocessable()->assertJsonValidationErrors('fields.0.settings.target');

        $this->createGroup(['fields' => [['key' => 'Bad Key', 'label' => 'X', 'kind' => 'text']]])
            ->assertUnprocessable()->assertJsonValidationErrors('fields.0.key');

        $this->createGroup(['targets' => ['nonsense']])
            ->assertUnprocessable()->assertJsonValidationErrors('targets.0');

        $this->assertSame(0, CustomFieldGroup::count());
    }

    public function test_a_key_two_groups_on_one_target_share_is_refused_at_the_second(): void
    {
        $this->createGroup()->assertCreated();

        $this->createGroup(['name' => 'More', 'targets' => ['page', 'solution'], 'fields' => [
            ['key' => 'warranty', 'label' => 'Warranty again', 'kind' => 'text'],
        ]])->assertUnprocessable()->assertJsonValidationErrors('fields.0.key');

        // Another target entirely is a different payload, so the key is free.
        $this->createGroup(['name' => 'Page bits', 'targets' => ['page'], 'fields' => [
            ['key' => 'warranty', 'label' => 'Warranty', 'kind' => 'text'],
        ]])->assertCreated();
    }

    public function test_only_a_content_manager_writes_groups(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/custom-field-groups')->assertForbidden();

        $this->actingAs($this->staff(), 'sanctum')
            ->getJson('/api/v1/admin/custom-field-groups')->assertOk()
            ->assertJsonPath('meta.targets.0.value', 'page');
    }

    /* --------------------------------------------------------- values */

    public function test_values_are_validated_per_kind_against_the_definitions(): void
    {
        $this->createGroup()->assertCreated();
        $solution = $this->solution();

        $this->patchFields($solution, [
            'racks' => 99999,
            'tier' => 'platinum',
            'site' => 'javascript:alert(1)',
            'go_live' => '26/09/2026',
            'service' => 424242,
            'diagram' => 'media/not-in-the-library.png',
        ])->assertUnprocessable()->assertJsonValidationErrors([
            'custom_fields.racks', 'custom_fields.tier', 'custom_fields.site',
            'custom_fields.go_live', 'custom_fields.service', 'custom_fields.diagram',
        ]);

        $this->assertSame(0, CustomFieldValue::count());
    }

    public function test_values_are_saved_unknown_keys_dropped_and_rich_text_cleaned(): void
    {
        $this->createGroup()->assertCreated();
        $solution = $this->solution();

        $this->patchFields($solution, [
            'warranty' => ' Five years ',
            'racks' => '12',
            'notes' => '<p>Fine</p><script>alert(1)</script>',
            'not_declared' => 'dropped',
        ])->assertOk()
            ->assertJsonPath('data.custom_fields.warranty', 'Five years')
            ->assertJsonPath('data.custom_fields.racks', 12)
            ->assertJsonPath('data.custom_field_groups.0.slug', 'specification');

        $notes = CustomFieldValue::whereHas('field', fn ($q) => $q->where('key', 'notes'))->value('value');
        $this->assertStringNotContainsString('script', (string) $notes);
        $this->assertSame(3, CustomFieldValue::count());
    }

    public function test_a_blank_value_clears_one_field_and_an_absent_payload_touches_nothing(): void
    {
        $this->createGroup()->assertCreated();
        $solution = $this->solution();
        $this->patchFields($solution, ['warranty' => 'Five years', 'tier' => 'gold'])->assertOk();

        $this->patchFields($solution, ['warranty' => ''])->assertOk()
            ->assertJsonMissingPath('data.custom_fields.warranty')
            ->assertJsonPath('data.custom_fields.tier', 'gold');

        // A PATCH that does not mention custom fields leaves them alone.
        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['summary' => 'Changed.'])
            ->assertOk()->assertJsonPath('data.custom_fields.tier', 'gold');
    }

    public function test_a_required_field_is_required_only_when_custom_fields_are_sent(): void
    {
        $this->createGroup(['fields' => [['key' => 'warranty', 'label' => 'Warranty', 'kind' => 'text', 'required' => true]]])->assertCreated();
        $solution = $this->solution();

        $this->patchFields($solution, ['warranty' => ''])
            ->assertUnprocessable()->assertJsonValidationErrors('custom_fields.warranty');

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/solutions/{$solution->id}", ['summary' => 'Changed.'])
            ->assertOk();
    }

    /* --------------------------------------------------------- public */

    public function test_the_public_read_draws_details_fields_marked_to_show_and_resolves_links(): void
    {
        $this->createGroup()->assertCreated();
        $this->createGroup(['name' => 'Data', 'placement' => 'hidden', 'fields' => [
            ['key' => 'erp_code', 'label' => 'ERP code', 'kind' => 'text'],
        ]])->assertCreated();

        Media::create(['disk' => 'public', 'path' => 'media/diagram.png', 'filename' => 'diagram.png', 'mime' => 'image/png', 'size' => 10, 'alt_text' => 'The rack layout']);
        $service = Service::create(['title' => 'Installation', 'slug' => 'installation', 'status' => 'published']);
        $draft = Service::create(['title' => 'Secret', 'slug' => 'secret', 'status' => 'draft']);
        $solution = $this->solution();

        $this->patchFields($solution, [
            'warranty' => 'Five years', 'racks' => 12000, 'tier' => 'gold', 'go_live' => '2026-09-26',
            'service' => $service->id, 'diagram' => 'media/diagram.png', 'internal' => 'X-1', 'erp_code' => 'E-9',
        ])->assertOk();

        $res = $this->getJson('/api/v1/solutions/cabling')->assertOk();
        $fields = collect($res->json('data.custom_fields'))->keyBy('key');

        $this->assertSame(['warranty', 'racks', 'tier', 'go_live', 'service', 'diagram'], $fields->keys()->all());
        $this->assertSame('12,000', $fields['racks']['display']);
        $this->assertSame('Gold', $fields['tier']['display']);
        $this->assertSame('26 September 2026', $fields['go_live']['display']);
        $this->assertSame(['title' => 'Installation', 'path' => '/services/installation'], $fields['service']['value']);
        $this->assertSame('The rack layout', $fields['diagram']['value']['alt']);
        $this->assertStringEndsWith('storage/media/diagram.png', $fields['diagram']['value']['url']);

        // Hidden and not-shown fields are data, never drawn.
        $res->assertJsonPath('data.custom_data.erp_code', 'E-9')
            ->assertJsonPath('data.custom_data.internal', 'X-1');

        // A link to a record that is no longer public is dropped, not drawn as a 404.
        $this->patchFields($solution, ['service' => $draft->id])->assertOk();
        $this->assertNotContains('service', array_column($this->getJson('/api/v1/solutions/cabling')->json('data.custom_fields'), 'key'));
    }

    public function test_a_switched_off_group_is_neither_drawn_nor_accepted(): void
    {
        $this->createGroup()->assertCreated();
        $solution = $this->solution();
        $this->patchFields($solution, ['warranty' => 'Five years'])->assertOk();

        CustomFieldGroup::query()->update(['is_active' => false]);

        $this->getJson('/api/v1/solutions/cabling')->assertOk()->assertJsonPath('data.custom_fields', []);
        $this->patchFields($solution, ['warranty' => 'Ten years'])->assertOk();
        $this->assertSame('Five years', CustomFieldValue::value('value'));
    }

    /* ---------------------------------------------------------- sync */

    public function test_fields_are_synced_by_id_so_values_survive_an_edit_and_a_kind_change_is_refused(): void
    {
        $group = $this->createGroup()->assertCreated()->json('data');
        $solution = $this->solution();
        $this->patchFields($solution, ['warranty' => 'Five years'])->assertOk();

        $fields = $group['fields'];
        $fields[0]['label'] = 'Guarantee';

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/custom-field-groups/{$group['id']}", ['fields' => $fields])
            ->assertOk()->assertJsonPath('data.fields.0.values_count', 1);

        $this->assertSame('Five years', CustomFieldValue::value('value'));

        $fields[0]['kind'] = 'number';
        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/custom-field-groups/{$group['id']}", ['fields' => $fields])
            ->assertUnprocessable()->assertJsonValidationErrors('fields.0.kind');

        // Removing the field removes what was typed into it.
        array_shift($fields);
        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/custom-field-groups/{$group['id']}", ['fields' => $fields])
            ->assertOk();
        $this->assertSame(0, CustomFieldValue::count());
    }

    public function test_the_admin_index_of_a_target_sends_its_groups_for_a_new_form(): void
    {
        $this->createGroup(['targets' => ['page']])->assertCreated();

        $this->actingAs($this->staff(), 'sanctum')->getJson('/api/v1/admin/pages?per_page=1')
            ->assertOk()->assertJsonPath('meta.custom_field_groups.0.fields.0.key', 'warranty');

        $this->actingAs($this->staff(), 'sanctum')->getJson('/api/v1/admin/solutions?per_page=1')
            ->assertOk()->assertJsonPath('meta.custom_field_groups', []);
    }

    public function test_deleting_the_record_deletes_its_values(): void
    {
        $this->createGroup(['targets' => ['page']])->assertCreated();
        $page = Page::create(['title' => 'Downloads', 'slug' => 'downloads', 'status' => 'published']);

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/pages/{$page->id}", ['custom_fields' => ['warranty' => 'None']])
            ->assertOk();
        $this->assertSame(1, CustomFieldValue::count());

        $this->actingAs($this->staff(), 'sanctum')->deleteJson("/api/v1/admin/pages/{$page->id}")->assertOk();
        $this->assertSame(0, CustomFieldValue::count());
    }
}
