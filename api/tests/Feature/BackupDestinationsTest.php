<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Support\Backups\Destinations\DriveDestination;
use App\Support\Backups\Destinations\FtpDestination;
use App\Support\Backups\Destinations\Remote;
use App\Support\Backups\Destinations\S3Destination;
use App\Support\Backups\Destinations\SftpDestination;
use App\Support\Net\PublicHost;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Tests\TestCase;

/**
 * The destinations' own protocols, against pretend servers: S3's multipart
 * upload and ranged read through Symfony's `MockHttpClient`, Drive's
 * resumable session through `Http::fake`, and the host checks FTP and SFTP
 * make before they connect. The FTP and SFTP sessions themselves are not
 * unit-tested — `ImapMailbox`'s rule — and were driven against real servers
 * by hand (`docs/backups.md`).
 */
class BackupDestinationsTest extends TestCase
{
    use RefreshDatabase;

    private string $local;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);

        $this->local = tempnam(sys_get_temp_dir(), 'bk');
        file_put_contents($this->local, str_repeat('A', 100).str_repeat('B', 100));
    }

    protected function tearDown(): void
    {
        @unlink($this->local);

        parent::tearDown();
    }

    private function settings(array $values): void
    {
        foreach ($values as $key => $value) {
            Setting::put($key, $value);
        }
    }

    public function test_s3_uploads_in_parts_and_reads_a_range_on_an_s3_compatible_endpoint(): void
    {
        $this->settings([
            'backup_s3_endpoint' => 'https://s3.example.test', 'backup_s3_region' => 'auto', 'backup_s3_bucket' => 'site-backups',
            'backup_s3_prefix' => 'technoware', 'backup_s3_key' => 'AKIA', 'backup_s3_secret' => 'shh', 'backup_s3_path_style' => '1',
        ]);

        $seen = [];
        $http = new MockHttpClient(function (string $method, string $url, array $options) use (&$seen) {
            $seen[] = $method.' '.$url.(isset($options['headers']) ? ' '.implode(' | ', array_filter((array) $options['headers'], fn ($h) => str_starts_with(strtolower((string) $h), 'range:'))) : '');

            return match (true) {
                $method === 'POST' && str_contains($url, '?uploads') => new MockResponse('<InitiateMultipartUploadResult><Bucket>site-backups</Bucket><Key>k</Key><UploadId>UP-1</UploadId></InitiateMultipartUploadResult>'),
                $method === 'PUT' && str_contains($url, 'uploadId=UP-1') => new MockResponse('', ['response_headers' => ['ETag' => '"part-etag"']]),
                $method === 'POST' && str_contains($url, 'uploadId=UP-1') => new MockResponse('<CompleteMultipartUploadResult><Bucket>site-backups</Bucket><Key>k</Key><ETag>"done"</ETag></CompleteMultipartUploadResult>'),
                $method === 'GET' => new MockResponse(str_repeat('B', 50), ['http_code' => 206]),
                default => new MockResponse('', ['http_code' => 200]),
            };
        });

        $s3 = new S3Destination($http);
        $state = $s3->begin('20260927-103159-full-5d6cf26e', 'files-001.zip', 20 * 1024 * 1024);
        $this->assertSame('multipart', $state['mode']);
        $this->assertSame('UP-1', $state['upload_id']);

        $state = $s3->send($state, $this->local, 0, 100);
        $state = $s3->send($state, $this->local, 100, 100);
        $this->assertSame([1, 2], array_column($state['parts'], 'n'));
        $s3->finish($state);

        $this->assertSame(str_repeat('B', 50), $s3->read('20260927-103159-full-5d6cf26e', 'files-001.zip', 100, 50));

        $key = 'https://s3.example.test/site-backups/technoware/technoware-backups/20260927-103159-full-5d6cf26e/files-001.zip';
        $this->assertStringStartsWith("POST {$key}?uploads", $seen[0]);
        $this->assertStringContainsString('partNumber=1', $seen[1]);
        $this->assertStringContainsString('partNumber=2', $seen[2]);
        $this->assertStringStartsWith("POST {$key}?uploadId=UP-1", $seen[3]);
        $this->assertStringContainsString('Range: bytes=100-149', $seen[4]);
    }

    public function test_s3_refuses_an_endpoint_on_a_private_address_before_connecting(): void
    {
        $this->settings(['backup_s3_endpoint' => 'https://minio.lan.example', 'backup_s3_bucket' => 'b', 'backup_s3_key' => 'k', 'backup_s3_secret' => 's']);
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['10.0.0.5']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('private');

        (new S3Destination)->probe();
    }

    public function test_drive_uploads_through_a_resumable_session_in_its_own_folder(): void
    {
        Cache::put('backup-drive-oauth-access-token', ['token' => 'drive-token', 'expires' => time() + 3600], 3600);
        $this->settings(['backup_gdrive_oauth_refresh_token' => 'r']);
        $puts = [];

        Http::fake(function (Request $request) use (&$puts) {
            $url = $request->url();
            $this->assertSame('Bearer drive-token', $request->header('Authorization')[0]);

            if ($request->method() === 'POST' && str_contains($url, 'uploadType=resumable')) {
                $this->assertSame('200', $request->header('X-Upload-Content-Length')[0]);
                $this->assertSame(['name' => 'database.sql.gz', 'parents' => ['backup-folder']], $request->data());

                return Http::response('', 200, ['Location' => 'https://www.googleapis.com/upload/drive/v3/files?upload_id=S1']);
            }

            if ($request->method() === 'POST' && str_contains($url, '/drive/v3/files')) {
                return Http::response(['id' => ($request->data()['name'] ?? '') === 'technoware-backups' ? 'root-folder' : 'backup-folder']);
            }

            if ($request->method() === 'PUT') {
                $puts[] = $request->header('Content-Range')[0];

                return count($puts) < 2 ? Http::response('', 308) : Http::response(['id' => 'file-1']);
            }

            if ($request->method() === 'GET' && str_contains($url, 'alt=media')) {
                $this->assertSame('bytes=10-19', $request->header('Range')[0]);

                return Http::response('AAAAAAAAAA', 206);
            }

            if ($request->method() === 'GET' && str_contains($url, '/drive/v3/files?')) {
                $q = urldecode($url);

                return Http::response(['files' => str_contains($q, "name = 'database.sql.gz'") && str_contains($q, 'backup-folder') && count($puts) === 2
                    ? [['id' => 'file-1', 'size' => '200']]
                    : []]);
            }

            return Http::response([], 404);
        });

        $drive = new DriveDestination;
        $state = $drive->begin('20260927-103159-full-5d6cf26e', 'database.sql.gz', 200);
        $state = $drive->send($state, $this->local, 0, 100);
        $state = $drive->send($state, $this->local, 100, 100);
        $drive->finish($state);

        $this->assertSame(['bytes 0-99/200', 'bytes 100-199/200'], $puts);
        $this->assertSame('root-folder', Setting::get('backup_gdrive_folder_id'));
        $this->assertSame(200, $drive->size('20260927-103159-full-5d6cf26e', 'database.sql.gz'));
        $this->assertSame('AAAAAAAAAA', $drive->read('20260927-103159-full-5d6cf26e', 'database.sql.gz', 10, 10));
    }

    public function test_ftp_and_sftp_refuse_a_host_that_resolves_to_a_private_address(): void
    {
        $this->settings(['backup_ftp_host' => 'nas.example.in', 'backup_ftp_username' => 'u', 'backup_ftp_password' => 'p', 'backup_ftp_protocol' => 'ftps']);
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['192.168.1.20']);

        foreach ([new FtpDestination, new SftpDestination] as $destination) {
            try {
                $destination->probe();
                $this->fail($destination::class.' connected to a private address.');
            } catch (RuntimeException $e) {
                $this->assertStringContainsString('private', $e->getMessage());
            }
        }

        // …unless the server's own .env says a LAN host is meant.
        config(['backups.allow_private_hosts' => true]);
        $this->assertSame('nas.example.in', Remote::address('nas.example.in'));
    }

    public function test_the_sftp_fingerprint_is_the_one_ssh_keygen_prints(): void
    {
        // A key made with `ssh-keygen -t ed25519`, and what `ssh-keygen -lf` printed for it.
        $key = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKIO7qmlYFwOEMoL05tYAFnWfIatWyGh9ND/Qweb22Q1';

        $this->assertSame('SHA256:SNJIBnx3480n8gAP+6k2PBf09iWkjlMOAWSJ/hM6+6A', SftpDestination::fingerprintOf($key));
    }
}
