<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\JobApplication;
use App\Models\JobExperienceLevel;
use App\Models\JobOpening;
use App\Models\JobQualification;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Careers: vacancies and the people who apply to them.
 *
 * The properties worth more than the happy path:
 *
 *   1. **A CV cannot be an executable.** This is the only unauthenticated file
 *      upload in the product, and the name is not evidence of anything.
 *   2. **A closed role stops accepting applications by itself**, including from
 *      a tab left open across the date.
 *   3. **Deleting an application deletes its CV.** A pruned record that leaves
 *      the file on disk has not been deleted, it has been hidden.
 */
class CareersTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $role = RoleEnum::ContentManager->value): User
    {
        $user = User::create([
            'name' => 'Ada Admin', 'email' => 'ada@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role], ['name' => $role]));

        return $user;
    }

    private function opening(array $overrides = []): JobOpening
    {
        return JobOpening::create(array_merge([
            'title' => 'Network Engineer',
            'employment_type' => 'full_time',
            'status' => 'published',
            'published_at' => now()->subDay(),
        ], $overrides));
    }

    private function cv(string $name = 'cv.pdf', string $mime = 'application/pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, '%PDF-1.4 fake')->mimeType($mime);
    }

    /* -------------------------------------------------------------- public */

    public function test_only_open_roles_are_listed(): void
    {
        $this->opening(['title' => 'Open role']);
        $this->opening(['title' => 'Draft role', 'status' => 'draft', 'published_at' => null]);
        $this->opening(['title' => 'Closed role', 'closes_at' => now()->subDay()->toDateString()]);

        $response = $this->getJson('/api/v1/careers')->assertOk();

        $titles = collect($response->json('data'))->pluck('title');
        $this->assertContains('Open role', $titles);
        $this->assertNotContains('Draft role', $titles);
        $this->assertNotContains('Closed role', $titles);
    }

    public function test_a_closed_role_404s_rather_than_taking_applications(): void
    {
        $job = $this->opening(['closes_at' => now()->subDay()->toDateString()]);

        $this->getJson("/api/v1/careers/{$job->slug}")->assertStatus(404);

        // And the endpoint refuses too, for the tab left open across the date.
        Storage::fake('local');
        $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Late', 'email' => 'late@example.test', 'cv' => $this->cv(),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertSame(0, JobApplication::count());
    }

    public function test_salary_is_absent_rather_than_null_when_it_was_left_blank(): void
    {
        $job = $this->opening();

        $body = $this->getJson("/api/v1/careers/{$job->slug}")->assertOk()->json('data');

        // The frontend renders nothing at all rather than "Salary: —".
        $this->assertNull($body['salary']);
    }

    /* ------------------------------------------------------------ applying */

    public function test_an_application_stores_the_cv_privately(): void
    {
        Storage::fake('local');
        Notification::fake();

        $job = $this->opening();

        $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Priya Raman', 'email' => 'PRIYA@Example.test', 'cv' => $this->cv(),
        ], ['Accept' => 'application/json'])->assertStatus(202);

        $application = JobApplication::firstOrFail();

        $this->assertSame('priya@example.test', $application->email);
        // Copied, so the row still reads after the vacancy is deleted.
        $this->assertSame('Network Engineer', $application->job_title);
        $this->assertSame('local', $application->cv_disk);
        Storage::disk('local')->assertExists($application->cv_path);
    }

    /**
     * The name is not evidence. `mimes:` checks the extension and `mimetypes:`
     * checks what the file actually is, and a PHP script called `cv.pdf` has to
     * fail the second one.
     */
    public function test_an_executable_cannot_be_a_cv(): void
    {
        Storage::fake('local');
        $job = $this->opening();

        $evil = UploadedFile::fake()
            ->createWithContent('cv.pdf', '<?php echo "pwned";')
            ->mimeType('application/x-httpd-php');

        $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Bad Actor', 'email' => 'bad@example.test', 'cv' => $evil,
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertSame(0, JobApplication::count());
    }

    public function test_an_application_without_a_cv_is_refused(): void
    {
        $job = $this->opening();

        $this->postJson("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'No CV', 'email' => 'nocv@example.test',
        ])->assertStatus(422)->assertJsonValidationErrors('cv');
    }

    public function test_the_honeypot_stores_nothing_and_says_so_to_nobody(): void
    {
        Storage::fake('local');
        Notification::fake();

        $job = $this->opening();

        $clean = $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Real', 'email' => 'real@example.test', 'cv' => $this->cv(),
        ], ['Accept' => 'application/json']);

        $trapped = $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Bot', 'email' => 'bot@example.test', 'cv' => $this->cv(), 'website' => 'http://spam.test',
        ], ['Accept' => 'application/json']);

        $this->assertSame($clean->status(), $trapped->status());
        $this->assertSame($clean->json(), $trapped->json());
        $this->assertDatabaseMissing('job_applications', ['email' => 'bot@example.test']);
    }

    /* ------------------------------------------------------------- the CV */

    public function test_a_cv_is_only_reachable_by_signed_in_staff(): void
    {
        Storage::fake('local');
        Notification::fake();

        $job = $this->opening();
        $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Priya', 'email' => 'priya@example.test', 'cv' => $this->cv(),
        ], ['Accept' => 'application/json']);

        $application = JobApplication::firstOrFail();

        $this->getJson("/api/v1/admin/applications/{$application->id}/cv")->assertStatus(401);

        $this->actingAs($this->staff(RoleEnum::SupportEngineer->value), 'sanctum')
            ->get("/api/v1/admin/applications/{$application->id}/cv")
            ->assertOk();
    }

    public function test_the_resource_never_carries_the_storage_path(): void
    {
        Storage::fake('local');
        Notification::fake();

        $job = $this->opening();
        $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Priya', 'email' => 'priya@example.test', 'cv' => $this->cv(),
        ], ['Accept' => 'application/json']);

        $body = $this->actingAs($this->staff(RoleEnum::SupportEngineer->value), 'sanctum')
            ->getJson('/api/v1/admin/applications')
            ->assertOk()
            ->json();

        // Putting a storage path in a response is the first half of making the
        // file fetchable.
        $this->assertStringNotContainsString('cv_path', json_encode($body));
        $this->assertStringNotContainsString('cv_disk', json_encode($body));
    }

    public function test_deleting_an_application_deletes_its_cv(): void
    {
        Storage::fake('local');
        Notification::fake();

        $job = $this->opening();
        $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Priya', 'email' => 'priya@example.test', 'cv' => $this->cv(),
        ], ['Accept' => 'application/json']);

        $application = JobApplication::firstOrFail();
        $path = $application->cv_path;

        Storage::disk('local')->assertExists($path);

        $application->delete();

        Storage::disk('local')->assertMissing($path);
    }

    public function test_the_prune_takes_the_cv_with_the_row(): void
    {
        Storage::fake('local');
        Notification::fake();
        Setting::create(['group' => 'security', 'key' => 'application_retention_days', 'value' => '180', 'type' => 'string']);

        $job = $this->opening();
        $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Priya', 'email' => 'priya@example.test', 'cv' => $this->cv(),
        ], ['Accept' => 'application/json']);

        $application = JobApplication::firstOrFail();
        $path = $application->cv_path;
        $application->forceFill(['created_at' => now()->subDays(400)])->save();

        $this->artisan('technoware:prune-applications')->assertExitCode(0);

        $this->assertSame(0, JobApplication::count());
        // A mass delete would skip the model event that removes this.
        Storage::disk('local')->assertMissing($path);
    }

    /* -------------------------------------------------------------- admin */

    public function test_deleting_a_vacancy_keeps_its_applications(): void
    {
        Storage::fake('local');
        Notification::fake();

        $job = $this->opening();
        $this->post("/api/v1/careers/{$job->slug}/apply", [
            'name' => 'Priya', 'email' => 'priya@example.test', 'cv' => $this->cv(),
        ], ['Accept' => 'application/json']);

        $this->actingAs($this->staff(), 'sanctum')
            ->deleteJson("/api/v1/admin/job-openings/{$job->id}")
            ->assertOk();

        $application = JobApplication::firstOrFail();

        $this->assertNull($application->job_opening_id);
        // The title was copied on the way in, which is what makes the record
        // still readable.
        $this->assertSame('Network Engineer', $application->job_title);
    }

    public function test_a_qualification_in_use_cannot_be_deleted(): void
    {
        $qualification = JobQualification::create(['name' => 'B.E. / B.Tech']);
        $this->opening()->qualifications()->attach($qualification->id);

        $this->actingAs($this->staff(), 'sanctum')
            ->deleteJson("/api/v1/admin/job-qualifications/{$qualification->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('job_qualifications', ['id' => $qualification->id]);
    }

    public function test_an_experience_level_cannot_end_before_it_starts(): void
    {
        $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/job-experience-levels', [
                'name' => 'Nonsense', 'min_years' => 5, 'max_years' => 2,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('max_years');
    }

    public function test_publishing_without_a_date_sets_one(): void
    {
        $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/job-openings', [
                'title' => 'Field Engineer', 'employment_type' => 'full_time', 'status' => 'published',
            ])
            ->assertCreated();

        // Otherwise it would be published and invisible: the public scope
        // filters on the date.
        $this->assertNotNull(JobOpening::where('title', 'Field Engineer')->value('published_at'));
    }

    public function test_a_content_manager_cannot_read_applications(): void
    {
        // A CV and an employment history are not content.
        $this->actingAs($this->staff(RoleEnum::ContentManager->value), 'sanctum')
            ->getJson('/api/v1/admin/applications')
            ->assertStatus(403);
    }

    public function test_experience_levels_describe_their_own_range(): void
    {
        $this->assertSame('2-4 years', JobExperienceLevel::create(
            ['name' => 'Mid', 'min_years' => 2, 'max_years' => 4],
        )->range());

        $this->assertSame('8+ years', JobExperienceLevel::create(
            ['name' => 'Senior', 'min_years' => 8, 'max_years' => null],
        )->range());
    }
}
