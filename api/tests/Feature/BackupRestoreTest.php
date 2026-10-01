<?php

namespace Tests\Feature;

use App\Models\Backup;
use App\Models\BackupRestore;
use App\Models\Setting;
use App\Models\User;
use App\Support\Backups\BackupRunner;
use App\Support\Backups\DatabaseDumper;
use App\Support\Backups\Destinations\FakeDestination;
use App\Support\Backups\RestoreMode;
use App\Support\Backups\RestoreRunner;
use Carbon\CarbonImmutable;
use Database\Seeders\SettingsSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * A database and its files backed up, changed, and restored — the whole
 * round trip, against the real test database.
 *
 * **Not `RefreshDatabase`.** A restore drops and recreates every table, and a
 * `DROP TABLE` commits whatever transaction is open, so the trait's rollback
 * would roll back nothing and the next test would inherit this one's rows.
 * Instead each test starts and ends on `migrate:fresh`: slower, and the only
 * honest way to test the thing that replaces the database.
 *
 * Every step of the restore is given thirty milliseconds, so the dump is imported
 * across dozens of runs of the worker — which is the only way the cursor, and
 * the session state each run has to set again, are exercised at all.
 */
class BackupRestoreTest extends TestCase
{
    private string $root;

    private FakeDestination $s3;

    protected function setUp(): void
    {
        parent::setUp();

        // Every other suite leaves the schema migrated and empty; only a bare database needs building.
        if (! Schema::hasTable('backups')) {
            $this->artisan('migrate:fresh');
        }

        $this->seed(SettingsSeeder::class);

        $this->root = storage_path('framework/testing/restore-'.bin2hex(random_bytes(4)));
        config(['backups.roots' => ['public' => $this->root.'/public', 'private' => $this->root.'/private']]);

        $this->s3 = new FakeDestination('s3', 8 * 1024);
        $this->app->instance('backups.destination.s3', $this->s3);
        Setting::put('backup_s3_enabled', '1');
        Notification::fake();
    }

    protected function tearDown(): void
    {
        RestoreMode::off();
        File::deleteDirectory($this->root);
        // Leave an empty, current schema for whichever test runs next.
        $this->artisan('migrate:fresh');

        parent::tearDown();
    }

    private function file(string $relative, string $contents): void
    {
        File::ensureDirectoryExists(dirname($this->root.'/'.$relative));
        File::put($this->root.'/'.$relative, $contents);
    }

    /** @return iterable<string, array{string}> */
    public static function dumpers(): iterable
    {
        yield 'the PHP dumper' => ['php'];
        yield 'mysqldump' => ['mysqldump'];
    }

    #[DataProvider('dumpers')]
    public function test_a_database_and_its_files_come_back_as_they_were(string $dumper): void
    {
        config(['backups.dumper' => $dumper]);

        if ($dumper === 'mysqldump' && DatabaseDumper::binary() === null) {
            $this->markTestSkipped('mysqldump is not on this machine; set BACKUP_MYSQLDUMP_PATH to run this case.');
        }

        Setting::put('company_name', "Before — it's ; a \"test\"\nwith a line break");
        $keeper = User::query()->create(['name' => 'Kept', 'email' => 'kept@technoware.in', 'password' => 'password-for-tests', 'is_active' => true]);
        $this->file('public/media/a.txt', 'original');
        $this->file('private/tickets/1/x.log', 'ticket log');

        $backup = BackupRunner::start('full', 'manual');

        while (in_array($backup->fresh()->status, Backup::IN_FLIGHT, true)) {
            BackupRunner::advance($backup->fresh(), CarbonImmutable::now()->addSeconds(30));
        }

        $this->assertSame('completed', $backup->fresh()->status, (string) $backup->fresh()->error);
        $this->assertSame($dumper, $backup->fresh()->dumper);

        // Things change after the backup…
        Setting::put('company_name', 'After');
        User::query()->create(['name' => 'Added later', 'email' => 'later@technoware.in', 'password' => 'password-for-tests', 'is_active' => true]);
        $keeper->update(['name' => 'Renamed']);
        File::delete($this->root.'/public/media/a.txt');
        $this->file('public/media/new.txt', 'made after the backup');
        DB::table('jobs')->insert(['queue' => 'default', 'payload' => '{"still":"here"}', 'attempts' => 0, 'available_at' => time(), 'created_at' => time()]);

        // …and the backup is restored from the destination, as on a fresh server.
        $restore = RestoreRunner::plan(['kind' => 'remote', 'destination' => 's3', 'folder' => $backup->folder], 'both', true);
        $runs = 0;

        while (in_array($restore->fresh()?->status, BackupRestore::IN_FLIGHT, true) && $runs < 2000) {
            RestoreRunner::advance($restore->fresh(), CarbonImmutable::now()->addMilliseconds(30));
            $runs++;
        }

        $restore = $restore->fresh();
        $this->assertSame('completed', $restore->status, (string) $restore->error);
        $this->assertGreaterThan(5, $runs, 'the restore never paused, so the cursor was not exercised');
        $this->assertGreaterThan(20, $restore->progress['import']['cursor']['statements']);

        Setting::flushCache();
        $this->assertSame("Before — it's ; a \"test\"\nwith a line break", Setting::get('company_name'));
        $this->assertSame('Kept', User::query()->find($keeper->id)?->name);
        $this->assertNull(User::query()->where('email', 'later@technoware.in')->first());

        $this->assertSame('original', File::get($this->root.'/public/media/a.txt'));
        $this->assertSame('ticket log', File::get($this->root.'/private/tickets/1/x.log'));
        $this->assertFileDoesNotExist($this->root.'/public/media/new.txt', 'prune_missing removes what the backup did not have');

        // The machinery survived its own restore: the queue and the backup records.
        $this->assertSame('{"still":"here"}', DB::table('jobs')->value('payload'));
        $this->assertNotNull(Backup::query()->find($backup->id));
        $safety = Backup::query()->find($restore->safety_backup_id);
        $this->assertSame('pre_restore', $safety?->trigger);
        $this->assertSame('completed', $safety?->status);
        $this->assertFalse(RestoreMode::active());

        // The safety copy is the state just before: restoring it puts "After" back.
        $undo = RestoreRunner::plan(['kind' => 'local', 'folder' => $safety->folder], 'database', false);

        while (in_array($undo->fresh()?->status, BackupRestore::IN_FLIGHT, true)) {
            RestoreRunner::advance($undo->fresh(), CarbonImmutable::now()->addSeconds(30));
        }

        $this->assertSame('completed', $undo->fresh()->status, (string) $undo->fresh()->error);
        Setting::flushCache();
        $this->assertSame('After', Setting::get('company_name'));
        $this->assertSame('Renamed', User::query()->find($keeper->id)?->name);
    }

    public function test_a_restore_that_fails_mid_import_says_the_database_may_be_incomplete_and_names_the_safety_copy(): void
    {
        config(['backups.dumper' => 'php']);
        $backup = BackupRunner::start('full', 'manual', includes: ['database' => true, 'public' => false, 'private' => false]);

        while (in_array($backup->fresh()->status, Backup::IN_FLIGHT, true)) {
            BackupRunner::advance($backup->fresh(), CarbonImmutable::now()->addSeconds(30));
        }

        // A dump whose last statement the server refuses, with a checksum that matches it.
        $folder = $backup->fresh()->folder;
        $sql = gzdecode($this->s3->files["{$folder}/database.sql.gz"])."\nINSERT INTO `no_such_table` VALUES (1);\n";
        $this->s3->files["{$folder}/database.sql.gz"] = gzencode($sql);
        $manifest = json_decode($this->s3->files["{$folder}/manifest.json"], true);
        $manifest['files'][0] = ['name' => 'database.sql.gz', 'size' => strlen($this->s3->files["{$folder}/database.sql.gz"]), 'sha256' => hash('sha256', $this->s3->files["{$folder}/database.sql.gz"])];
        $this->s3->files["{$folder}/manifest.json"] = json_encode($manifest);

        $restore = RestoreRunner::plan(['kind' => 'remote', 'destination' => 's3', 'folder' => $folder], 'database', false);

        while (in_array($restore->fresh()?->status, BackupRestore::IN_FLIGHT, true)) {
            RestoreRunner::advance($restore->fresh(), CarbonImmutable::now()->addSeconds(30));
        }

        $restore = $restore->fresh();
        $this->assertSame('failed', $restore->status);
        $this->assertStringContainsString('no_such_table', (string) $restore->error);
        $this->assertStringContainsString('may be incomplete', (string) $restore->error);
        $this->assertStringContainsString(Backup::query()->find($restore->safety_backup_id)->folder, (string) $restore->error);
        $this->assertFalse(RestoreMode::active(), 'a failed restore must not leave the site closed');
    }
}
