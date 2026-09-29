<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Backup;
use App\Models\BackupRestore;
use App\Models\BackupUpload;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\BackupFailed;
use App\Support\Backups\BackupPaths;
use App\Support\Backups\BackupRunner;
use App\Support\Backups\BackupSchedule;
use App\Support\Backups\BackupWorker;
use App\Support\Backups\Destinations\FakeDestination;
use App\Support\Backups\Manifest;
use App\Support\Backups\RestoreMode;
use App\Support\Backups\RestoreRunner;
use App\Support\Backups\Retention;
use App\Support\Net\PublicHost;
use App\Support\QueueHealth;
use Carbon\CarbonImmutable;
use Database\Seeders\SettingsSeeder;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;
use ZipArchive;

/**
 * Backups: full and incremental, the upload to each destination, retention,
 * the schedule, and the doors in front of them. Every destination is a
 * `FakeDestination` and `storage/app` is a temporary folder, so nothing here
 * touches the network or the developer's uploads. See `docs/backups.md`;
 * restoring a database is `BackupRestoreTest`, which cannot run inside the
 * transaction `RefreshDatabase` wraps a test in.
 */
class BackupTest extends TestCase
{
    use RefreshDatabase;

    private string $root;

    private FakeDestination $s3;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = storage_path('framework/testing/backups-'.bin2hex(random_bytes(4)));
        config([
            'backups.roots' => ['public' => $this->root.'/public', 'private' => $this->root.'/private'],
            // Inside the test's transaction only this connection sees the rows.
            'backups.dumper' => 'php',
        ]);

        $this->file('public/media/2026/09/logo.png', str_repeat('p', 3000));
        $this->file('public/media/2026/09/photo.jpg', str_repeat('j', 5000));
        $this->file('private/tickets/7/log.txt', 'router log');
        $this->file('private/wordpress-imports/3/harvest.jsonl', 'scratch that must not be archived');

        // Setting::put() writes only rows the seeder made, as in production.
        $this->seed(SettingsSeeder::class);
        $this->s3 = new FakeDestination('s3', 1024);
        $this->app->instance('backups.destination.s3', $this->s3);
        $this->setting('backup_s3_enabled', '1');

        Notification::fake();
        Cache::put(QueueHealth::HEARTBEAT_KEY, time());
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);

        parent::tearDown();
    }

    private function file(string $relative, string $contents): void
    {
        File::ensureDirectoryExists(dirname($this->root.'/'.$relative));
        File::put($this->root.'/'.$relative, $contents);
    }

    private function setting(string $key, ?string $value): void
    {
        Setting::query()->updateOrCreate(['key' => $key], ['group' => 'backups', 'type' => 'string', 'value' => $value]);
        Setting::flushCache();
    }

    private function finish(Backup $backup): Backup
    {
        for ($i = 0; $i < 50 && in_array($backup->fresh()->status, Backup::IN_FLIGHT, true); $i++) {
            BackupRunner::advance($backup->fresh(), CarbonImmutable::now()->addSeconds(30));
        }

        return $backup->fresh();
    }

    /** @return list<string> */
    private function zipEntries(string $bytes): array
    {
        $path = tempnam(sys_get_temp_dir(), 'zip');
        file_put_contents($path, $bytes);
        $zip = new ZipArchive;
        $zip->open($path);
        $names = [];

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $names[] = $zip->getNameIndex($i);
        }

        $zip->close();
        unlink($path);
        sort($names);

        return $names;
    }

    private function admin(string $role = 'admin'): User
    {
        $user = User::firstOrCreate(['email' => "{$role}@technoware.in"], ['name' => 'Admin', 'password' => 'password-for-tests', 'is_active' => true]);
        $enum = RoleEnum::from($role);
        $model = Role::firstOrCreate(['slug' => $enum->value], ['name' => $enum->label()]);
        $user->roles()->syncWithoutDetaching([$model->id]);

        return $user->load('roles');
    }

    private function asAdmin(string $role = 'admin'): static
    {
        return $this->withHeader('Authorization', 'Bearer '.$this->admin($role)->createToken('admin')->plainTextToken);
    }

    public function test_a_full_backup_holds_the_database_and_every_file_but_the_scratch(): void
    {
        $backup = $this->finish(BackupRunner::start('full', 'manual'));

        $this->assertSame('completed', $backup->status);
        $this->assertSame(['s3'], $backup->destinations);
        $this->assertSame(3, $backup->file_count);
        $this->assertSame(['database.sql.gz', 'files-001.zip', 'index.json.gz'], array_column($backup->files, 'name'));

        $files = $this->s3->files;
        $this->assertSame(
            ['private/tickets/7/log.txt', 'public/media/2026/09/logo.png', 'public/media/2026/09/photo.jpg'],
            $this->zipEntries($files["{$backup->folder}/files-001.zip"]),
        );

        // The manifest went up last, and says what it holds.
        $manifest = Manifest::parse($files["{$backup->folder}/manifest.json"]);
        $this->assertSame('full', $manifest['type']);
        $this->assertSame([], $manifest['chain']);
        $this->assertSame(hash('sha256', $files["{$backup->folder}/database.sql.gz"]), $manifest['files'][0]['sha256']);
        $this->assertSame('manifest.json', BackupUpload::query()->where('backup_id', $backup->id)->orderByDesc('id')->value('file'));
    }

    public function test_an_incremental_holds_what_changed_and_names_what_went(): void
    {
        $full = $this->finish(BackupRunner::start('full', 'manual'));

        $this->file('public/media/2026/09/logo.png', str_repeat('q', 3100));
        $this->file('public/media/2026/09/new.webp', 'new picture');
        File::delete($this->root.'/private/tickets/7/log.txt');

        $incr = $this->finish(BackupRunner::start('auto', 'manual'));

        $this->assertSame('incremental', $incr->type);
        $this->assertSame($full->id, $incr->base_id);
        $this->assertSame($full->id, $incr->parent_id);
        $this->assertSame(2, $incr->file_count);
        $this->assertSame(1, $incr->deleted_count);
        $this->assertSame(
            ['public/media/2026/09/logo.png', 'public/media/2026/09/new.webp'],
            $this->zipEntries($this->s3->files["{$incr->folder}/files-001.zip"]),
        );

        $manifest = Manifest::parse($this->s3->files["{$incr->folder}/manifest.json"]);
        $this->assertSame([$full->folder], $manifest['chain']);
        $this->assertSame(['private/tickets/7/log.txt'], $manifest['deleted']);

        // Nothing changed since: an incremental with no files, still a backup of the database.
        $idle = $this->finish(BackupRunner::start('auto', 'manual'));
        $this->assertSame(0, $idle->file_count);
        $this->assertSame(['database.sql.gz', 'index.json.gz'], array_column($idle->files, 'name'));
        $this->assertSame([$full->folder, $incr->folder], Manifest::parse($this->s3->files["{$idle->folder}/manifest.json"])['chain']);
    }

    public function test_the_dump_leaves_out_the_queue_the_cache_and_the_backups_themselves(): void
    {
        DB::table('jobs')->insert(['queue' => 'default', 'payload' => '{}', 'attempts' => 0, 'available_at' => time(), 'created_at' => time()]);
        $this->setting('site_name', 'Dump me');

        $backup = $this->finish(BackupRunner::start('full', 'manual', includes: ['database' => true, 'public' => false, 'private' => false]));
        $sql = gzdecode($this->s3->files["{$backup->folder}/database.sql.gz"]);

        $this->assertStringContainsString('INSERT INTO `settings`', $sql);
        $this->assertStringContainsString('Dump me', $sql);
        $this->assertStringContainsString('CREATE TABLE `settings`', $sql);

        foreach (config('backups.preserve_tables') as $table) {
            $this->assertStringNotContainsString("`{$table}`", $sql, "{$table} is in the dump");
        }
    }

    public function test_an_upload_larger_than_one_run_carries_on_from_its_last_chunk(): void
    {
        $this->file('public/media/big.bin', random_bytes(40 * 1024));
        // A slow destination and runs with almost no time: every run still moves, a little.
        $this->s3->delayMs = 5;
        $backup = BackupRunner::start('full', 'manual');
        $calls = 0;

        while (in_array($backup->fresh()->status, Backup::IN_FLIGHT, true) && $calls < 1000) {
            BackupRunner::advance($backup->fresh(), CarbonImmutable::now()->addMilliseconds(1));
            $calls++;
        }

        $backup->refresh();
        $this->assertSame('completed', $backup->status);
        $this->assertGreaterThan(10, $calls, 'the upload never paused');

        $staging = BackupPaths::staging($backup->uuid);
        $this->assertSame(hash_file('sha256', $staging.'/files-001.zip'), hash('sha256', $this->s3->files["{$backup->folder}/files-001.zip"]));
    }

    public function test_one_destination_failing_does_not_stop_another_and_says_so(): void
    {
        $ftp = new FakeDestination('ftp', 1024, failOn: 'files-001.zip');
        $this->app->instance('backups.destination.ftp', $ftp);
        $this->setting('backup_ftp_enabled', '1');
        $this->setting('support_email', 'desk@technoware.in');

        $backup = $this->finish(BackupRunner::start('full', 'manual'));

        $this->assertSame(['s3', 'ftp'], $backup->destinations);
        $this->assertSame('completed_with_errors', $backup->status);
        $this->assertArrayHasKey("{$backup->folder}/manifest.json", $this->s3->files);
        $this->assertArrayNotHasKey("{$backup->folder}/manifest.json", $ftp->files, 'a folder missing a volume must not look complete');
        $this->assertSame(3, BackupUpload::query()->where('backup_id', $backup->id)->where('destination', 'ftp')->where('file', 'files-001.zip')->value('attempts'));
        $this->assertSame(['s3', 'local'], $backup->restorableFrom());
        $this->assertStringContainsString('The fake refuses', (string) Setting::get('backup_ftp_error'));
        $this->assertStringContainsString('did not reach FTP', (string) Setting::get('backup_error'));
        Notification::assertSentOnDemand(BackupFailed::class);
    }

    public function test_an_incremental_becomes_a_full_when_a_destination_does_not_hold_the_chain(): void
    {
        $this->finish(BackupRunner::start('full', 'manual'));

        $this->app->instance('backups.destination.ftp', new FakeDestination('ftp'));
        $this->setting('backup_ftp_enabled', '1');

        $this->assertSame('full', $this->finish(BackupRunner::start('auto', 'manual'))->type);
        $this->assertSame('incremental', $this->finish(BackupRunner::start('incremental', 'manual'))->type);
    }

    public function test_a_chain_longer_than_the_setting_starts_again_with_a_full(): void
    {
        $this->setting('backup_max_chain', '1');

        $types = [];

        for ($i = 0; $i < 4; $i++) {
            $types[] = $this->finish(BackupRunner::start('auto', 'manual'))->type;
        }

        $this->assertSame(['full', 'incremental', 'full', 'incremental'], $types);
    }

    public function test_retention_deletes_whole_chains_and_only_whole_chains(): void
    {
        $this->setting('backup_keep_chains', '1');
        $this->setting('backup_keep_local', '0');

        $old = $this->finish(BackupRunner::start('full', 'manual'));
        $oldIncr = $this->finish(BackupRunner::start('auto', 'manual'));
        $this->assertSame('incremental', $oldIncr->type);

        $new = $this->finish(BackupRunner::start('full', 'manual'));

        $this->assertNull(Backup::query()->find($old->id));
        $this->assertNull(Backup::query()->find($oldIncr->id));
        $this->assertSame([$new->folder], $this->s3->folders());
        $this->assertFileDoesNotExist(BackupPaths::indexFile($old->uuid));

        // keep_local 0: the new one's staging copy went once it reached S3, its index stayed.
        $this->assertNotNull($new->fresh()->local_deleted_at);
        $this->assertDirectoryDoesNotExist(BackupPaths::staging($new->uuid));
        $this->assertFileExists(BackupPaths::indexFile($new->uuid));
    }

    public function test_the_schedule_asks_for_a_full_on_its_day_and_an_incremental_otherwise(): void
    {
        $this->setting('backup_enabled', '1');
        $this->setting('backup_time', '02:15');
        $this->setting('backup_full_day', 'sun');
        $this->setting('backup_incremental_every', '12');

        $sunday = CarbonImmutable::parse('2026-09-27 03:00', config('app.timezone'));
        $this->assertSame('full', BackupSchedule::due($sunday));
        $this->assertSame('auto', BackupSchedule::due($sunday->addHours(12)));
        $this->assertSame('auto', BackupSchedule::due($sunday->addDay()));

        // A slot is taken once; the next asks again.
        $this->travelTo($sunday);
        Backup::query()->create(['uuid' => 'x', 'type' => 'full', 'trigger' => 'schedule', 'status' => 'completed', 'folder' => 'f', 'includes' => [], 'destinations' => []]);
        $this->assertNull(BackupSchedule::due($sunday));
        $this->assertSame('auto', BackupSchedule::due($sunday->addHours(12)));

        $this->setting('backup_enabled', '0');
        $this->assertNull(BackupSchedule::due($sunday->addHours(12)));
    }

    public function test_the_worker_starts_a_due_backup_and_works_it_through(): void
    {
        $this->setting('backup_enabled', '1');
        $this->setting('backup_full_day', 'daily');
        $this->setting('backup_time', now()->subMinute()->format('H:i'));

        BackupWorker::run(CarbonImmutable::now()->addSeconds(30));

        $backup = Backup::query()->sole();
        $this->assertSame('schedule', $backup->trigger);
        $this->assertSame('completed', $backup->status);
        $this->assertStringContainsString('Nothing to do', BackupWorker::run(CarbonImmutable::now()->addSeconds(5)));
    }

    public function test_back_up_now_is_refused_when_nothing_would_run_it_or_one_is_running(): void
    {
        config(['queue.default' => 'database']);
        Cache::forget(QueueHealth::HEARTBEAT_KEY);

        $this->asAdmin()->postJson('/api/v1/admin/backups', ['type' => 'full'])
            ->assertStatus(422)->assertJsonPath('errors.type.0', fn ($m) => str_contains($m, 'scheduler is not running'));

        Cache::put(QueueHealth::HEARTBEAT_KEY, time());
        $this->asAdmin()->postJson('/api/v1/admin/backups', ['type' => 'full'])->assertStatus(202)->assertJsonPath('data.status', 'pending');
        $this->asAdmin()->postJson('/api/v1/admin/backups', ['type' => 'incremental'])
            ->assertStatus(422)->assertJsonPath('errors.type.0', fn ($m) => str_contains($m, 'already running'));
    }

    public function test_the_list_names_where_each_backup_can_be_restored_from(): void
    {
        $backup = $this->finish(BackupRunner::start('full', 'manual'));

        $this->asAdmin()->getJson('/api/v1/admin/backups')
            ->assertOk()
            ->assertJsonPath('data.0.folder', $backup->folder)
            ->assertJsonPath('data.0.restorable_from', ['s3', 'local'])
            ->assertJsonPath('data.0.destinations.0.status', 'done')
            ->assertJsonPath('meta.destinations.0.key', 's3');
    }

    public function test_cancelling_a_running_backup_stops_it_and_deleting_needs_nothing_built_on_it(): void
    {
        $running = BackupRunner::start('full', 'manual');
        $this->asAdmin()->deleteJson("/api/v1/admin/backups/{$running->id}")->assertOk()->assertJsonPath('data.status', 'cancelled');
        BackupRunner::advance($running->fresh(), CarbonImmutable::now()->addSeconds(30));
        $this->assertSame('cancelled', $running->fresh()->status);

        $full = $this->finish(BackupRunner::start('full', 'manual'));
        $incr = $this->finish(BackupRunner::start('auto', 'manual'));

        $this->asAdmin()->deleteJson("/api/v1/admin/backups/{$full->id}")->assertStatus(422);
        $this->asAdmin()->deleteJson("/api/v1/admin/backups/{$incr->id}")->assertNoContent();
        $this->asAdmin()->deleteJson("/api/v1/admin/backups/{$full->id}")->assertNoContent();
        $this->assertSame([], $this->s3->folders());
    }

    public function test_a_destination_test_reports_the_destinations_own_words(): void
    {
        $this->asAdmin()->postJson('/api/v1/admin/backups/destinations/s3/test')->assertOk()->assertJsonPath('data.message', 'The fake answered.');

        $this->app->forgetInstance('backups.destination.gdrive');
        $this->asAdmin()->postJson('/api/v1/admin/backups/destinations/gdrive/test')->assertStatus(422);
        $this->asAdmin()->postJson('/api/v1/admin/backups/destinations/nas/test')->assertNotFound();
    }

    public function test_backups_are_for_administrators_only(): void
    {
        $this->asAdmin('content_manager')->getJson('/api/v1/admin/backups')->assertForbidden();
        $this->asAdmin('support_engineer')->postJson('/api/v1/admin/backups/restores', [])->assertForbidden();
    }

    public function test_the_settings_refuse_what_would_parse_to_nothing_or_move_a_secret(): void
    {
        $row = fn (string $key, ?string $value) => ['key' => $key, 'value' => $value];

        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_time', '25:00')]])->assertStatus(422);
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_full_day', 'someday')]])->assertStatus(422);
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_s3_bucket', 'Not A Bucket')]])->assertStatus(422);
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_s3_endpoint', 'http://minio.example')]])->assertStatus(422);
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_ftp_host', '192.168.1.20')]])->assertStatus(422);
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_ftp_protocol', 'ftp'), $row('backup_ftp_port', '8021')]])->assertOk();
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_ftp_port', '80')]])->assertStatus(422);

        // A stored password is only ever sent to the host it was saved for.
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['93.184.216.34']);
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_ftp_host', 'nas.example.in'), $row('backup_ftp_password', 'secret')]])->assertOk();
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_ftp_host', 'other.example.in')]])
            ->assertStatus(422)->assertJsonPath('errors', fn ($e) => str_contains(json_encode($e), 'Type the password'));
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [$row('backup_ftp_host', 'other.example.in'), $row('backup_ftp_password', 'secret')]])->assertOk();

        $this->asAdmin()->getJson('/api/v1/admin/settings')->assertOk()
            ->assertJsonPath('data.backups_ftp', fn ($rows) => collect($rows)->firstWhere('key', 'backup_ftp_password')['value'] === null)
            ->assertJsonPath('data.backups', fn ($rows) => count(collect($rows)->firstWhere('key', 'backup_full_day')['options']) === 8);
    }

    public function test_restore_mode_closes_the_api_but_not_the_backup_screens(): void
    {
        RestoreMode::on(1);

        $this->getJson('/api/v1/solutions')->assertStatus(503)->assertJsonPath('restoring', true);
        $this->asAdmin()->getJson('/api/v1/admin/backups')->assertOk()->assertJsonPath('meta.restoring', true);

        RestoreMode::off();
        $this->getJson('/api/v1/solutions')->assertOk();
    }

    public function test_every_scheduled_command_but_the_worker_and_the_heartbeat_waits_out_a_restore(): void
    {
        $schedule = $this->app->make(Schedule::class);
        $events = collect($schedule->events());
        RestoreMode::on(1);

        $running = $events->filter(fn ($event) => $event->filtersPass($this->app))->map(fn ($event) => $event->description ?: $event->command)->values()->all();

        $this->assertSame([], array_diff($running, ['backups-work', 'scheduler-heartbeat']), 'something would run during a restore: '.implode(', ', $running));
        RestoreMode::off();
    }

    public function test_a_restore_is_refused_without_the_word_and_for_a_backup_from_the_future(): void
    {
        $backup = $this->finish(BackupRunner::start('full', 'manual'));

        $this->asAdmin()->postJson('/api/v1/admin/backups/restores', ['backup_id' => $backup->id, 'scope' => 'files', 'confirm' => 'yes'])
            ->assertStatus(422)->assertJsonValidationErrors('confirm');

        $backup->update(['schema' => '2099_01_01_000000_from_the_future']);
        $this->asAdmin()->postJson('/api/v1/admin/backups/restores', ['backup_id' => $backup->id, 'scope' => 'both', 'confirm' => 'RESTORE'])
            ->assertStatus(422)->assertJsonPath('errors.backup_id.0', fn ($m) => str_contains($m, 'newer version'));
    }

    public function test_a_files_restore_from_a_destination_puts_back_the_chain_and_refuses_a_zip_slip(): void
    {
        $full = $this->finish(BackupRunner::start('full', 'manual'));
        $this->file('public/media/2026/09/logo.png', 'the newer logo');
        $incr = $this->finish(BackupRunner::start('auto', 'manual'));

        // A volume that climbs out of the tree, planted in the incremental on the destination.
        $evil = tempnam(sys_get_temp_dir(), 'zip');
        $zip = new ZipArchive;
        $zip->open($evil, ZipArchive::OVERWRITE);
        $zip->addFromString('public/../../escaped.php', '<?php echo 1;');
        $zip->addFromString('private/backups/planted.txt', 'into the staging area');
        $zip->addFromString('public/media/planted.txt', 'fine');
        $zip->close();
        $this->s3->files["{$incr->folder}/files-002.zip"] = (string) file_get_contents($evil);
        unlink($evil);
        $manifest = Manifest::parse($this->s3->files["{$incr->folder}/manifest.json"]);
        $manifest['files'][] = ['name' => 'files-002.zip', 'size' => strlen($this->s3->files["{$incr->folder}/files-002.zip"]), 'sha256' => hash('sha256', $this->s3->files["{$incr->folder}/files-002.zip"])];
        $this->s3->files["{$incr->folder}/manifest.json"] = json_encode($manifest);

        // Lose everything, then ask the destination for it back.
        File::deleteDirectory($this->root.'/public');
        File::deleteDirectory($this->root.'/private/tickets');

        $restore = RestoreRunner::plan(['kind' => 'remote', 'destination' => 's3', 'folder' => $incr->folder], 'files', false);
        $this->assertSame([$full->folder, $incr->folder], array_column($restore->chain, 'folder'));

        for ($i = 0; $i < 20 && in_array($restore->fresh()->status, BackupRestore::IN_FLIGHT, true); $i++) {
            RestoreRunner::advance($restore->fresh(), CarbonImmutable::now()->addSeconds(30));
        }

        $restore->refresh();
        $this->assertSame('completed', $restore->status, (string) $restore->error);
        $this->assertSame('the newer logo', File::get($this->root.'/public/media/2026/09/logo.png'));
        $this->assertSame(str_repeat('j', 5000), File::get($this->root.'/public/media/2026/09/photo.jpg'));
        $this->assertSame('router log', File::get($this->root.'/private/tickets/7/log.txt'));
        $this->assertSame('fine', File::get($this->root.'/public/media/planted.txt'));
        $this->assertFileDoesNotExist($this->root.'/escaped.php');
        $this->assertFileDoesNotExist(dirname($this->root).'/escaped.php');
        $this->assertFileDoesNotExist($this->root.'/private/backups/planted.txt');
        $this->assertSame(2, $restore->progress['files']['refused']);
        $this->assertNull($restore->safety_backup_id, 'a files-only restore replaces no database, so needs no safety copy');
    }

    public function test_a_download_that_does_not_match_its_checksum_replaces_nothing(): void
    {
        $backup = $this->finish(BackupRunner::start('full', 'manual'));
        // Same length, one byte different: the download reads exactly the manifest's size.
        $bytes = $this->s3->files["{$backup->folder}/files-001.zip"];
        $this->s3->files["{$backup->folder}/files-001.zip"] = substr_replace($bytes, $bytes[100] === 'x' ? 'y' : 'x', 100, 1);
        File::put($this->root.'/public/media/2026/09/logo.png', 'current');

        $restore = RestoreRunner::plan(['kind' => 'remote', 'destination' => 's3', 'folder' => $backup->folder], 'files', false);
        RestoreRunner::advance($restore, CarbonImmutable::now()->addSeconds(30));

        $this->assertSame('failed', $restore->fresh()->status);
        $this->assertStringContainsString('checksum', (string) $restore->fresh()->error);
        $this->assertSame('current', File::get($this->root.'/public/media/2026/09/logo.png'));
    }
}
