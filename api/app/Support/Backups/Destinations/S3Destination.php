<?php

namespace App\Support\Backups\Destinations;

use App\Models\Setting;
use App\Support\Backups\BackupPaths;
use App\Support\Net\PublicHost;
use AsyncAws\Core\Exception\Http\ClientException;
use AsyncAws\S3\S3Client;
use AsyncAws\S3\ValueObject\CompletedMultipartUpload;
use AsyncAws\S3\ValueObject\CompletedPart;
use RuntimeException;
use Symfony\Component\HttpClient\HttpClient;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Amazon S3, and everything that speaks its API: Backblaze B2, Cloudflare R2,
 * Wasabi, DigitalOcean Spaces, MinIO.
 *
 * Through `async-aws/s3`, which runs on the `symfony/http-client` this
 * application already ships, rather than `aws/aws-sdk-php` — the ~50MB SDK
 * the SES transport already declines to carry.
 *
 * Two things make the S3-compatible services work, and both are settings:
 * an **endpoint** (blank means Amazon) and **path-style addressing**
 * (`https://host/bucket/key` rather than `https://bucket.host/key`), which
 * MinIO and some others need. `sendChunkedBody` is off because several of
 * them refuse AWS's chunked signing.
 *
 * A custom endpoint is a host an administrator typed, so it is checked like
 * any other (`PublicHost`) and the connection is **pinned** to the address
 * that was checked: Symfony's `resolve` option, the rebinding gap closed the
 * way the webhooks close it.
 *
 * Files over one chunk go up as a multipart upload; the upload id and every
 * part's ETag are the resume state.
 */
final class S3Destination implements Destination
{
    private const CHUNK = 16 * 1024 * 1024;

    private ?S3Client $client = null;

    public function __construct(private readonly ?HttpClientInterface $http = null) {}

    public function key(): string
    {
        return 's3';
    }

    public function label(): string
    {
        return filled(Setting::get('backup_s3_endpoint')) ? 'S3-compatible storage' : 'Amazon S3';
    }

    public function chunkBytes(): int
    {
        return self::CHUNK;
    }

    public function begin(string $folder, string $file, int $size): array
    {
        $key = $this->objectKey($folder, $file);

        if ($size <= self::CHUNK) {
            return ['key' => $key, 'mode' => 'single'];
        }

        $upload = $this->client()->createMultipartUpload(['Bucket' => $this->bucket(), 'Key' => $key]);

        return ['key' => $key, 'mode' => 'multipart', 'upload_id' => (string) $upload->getUploadId(), 'parts' => []];
    }

    public function send(array $state, string $localPath, int $offset, int $length): array
    {
        $body = self::slice($localPath, $offset, $length);

        if ($state['mode'] === 'single') {
            $this->client()->putObject(['Bucket' => $this->bucket(), 'Key' => $state['key'], 'Body' => $body])->resolve();

            return $state + ['sent' => true];
        }

        $number = count($state['parts']) + 1;
        $part = $this->client()->uploadPart([
            'Bucket' => $this->bucket(),
            'Key' => $state['key'],
            'UploadId' => $state['upload_id'],
            'PartNumber' => $number,
            'Body' => $body,
        ]);

        $state['parts'][] = ['n' => $number, 'etag' => (string) $part->getEtag()];

        return $state;
    }

    public function finish(array $state): void
    {
        if ($state['mode'] === 'single') {
            return;
        }

        $this->client()->completeMultipartUpload([
            'Bucket' => $this->bucket(),
            'Key' => $state['key'],
            'UploadId' => $state['upload_id'],
            'MultipartUpload' => new CompletedMultipartUpload([
                'Parts' => array_map(fn (array $p) => new CompletedPart(['ETag' => $p['etag'], 'PartNumber' => $p['n']]), $state['parts']),
            ]),
        ])->resolve();
    }

    public function read(string $folder, string $file, int $offset, int $length): string
    {
        $object = $this->client()->getObject([
            'Bucket' => $this->bucket(),
            'Key' => $this->objectKey($folder, $file),
            'Range' => 'bytes='.$offset.'-'.($offset + $length - 1),
        ]);

        return $object->getBody()->getContentAsString();
    }

    public function size(string $folder, string $file): ?int
    {
        try {
            return (int) $this->client()->headObject(['Bucket' => $this->bucket(), 'Key' => $this->objectKey($folder, $file)])->getContentLength();
        } catch (ClientException $e) {
            if ($e->getResponse()->getStatusCode() === 404) {
                return null;
            }

            throw $e;
        }
    }

    public function folders(): array
    {
        $prefix = $this->prefix();
        $folders = [];

        foreach ($this->client()->listObjectsV2(['Bucket' => $this->bucket(), 'Prefix' => $prefix, 'Delimiter' => '/'])->getCommonPrefixes() as $common) {
            $folders[] = trim(substr((string) $common->getPrefix(), strlen($prefix)), '/');
        }

        return array_values(array_filter($folders));
    }

    public function deleteFolder(string $folder): void
    {
        $prefix = $this->prefix().$folder.'/';

        foreach ($this->client()->listObjectsV2(['Bucket' => $this->bucket(), 'Prefix' => $prefix])->getContents() as $object) {
            $this->client()->deleteObject(['Bucket' => $this->bucket(), 'Key' => (string) $object->getKey()])->resolve();
        }
    }

    public function probe(): string
    {
        $key = $this->prefix().'.probe-'.bin2hex(random_bytes(6));
        $this->client()->putObject(['Bucket' => $this->bucket(), 'Key' => $key, 'Body' => 'technoware backup probe'])->resolve();
        $back = $this->client()->getObject(['Bucket' => $this->bucket(), 'Key' => $key])->getBody()->getContentAsString();
        $this->client()->deleteObject(['Bucket' => $this->bucket(), 'Key' => $key])->resolve();

        if ($back !== 'technoware backup probe') {
            throw new RuntimeException('A test file was written but did not read back the same.');
        }

        return 'Wrote, read and deleted a test file in '.$this->bucket().' ('.$this->label().').';
    }

    private function client(): S3Client
    {
        if ($this->client !== null) {
            return $this->client;
        }

        foreach (['backup_s3_bucket' => 'bucket', 'backup_s3_key' => 'access key', 'backup_s3_secret' => 'secret key'] as $setting => $what) {
            if (blank(Setting::get($setting))) {
                throw new RuntimeException("No {$what} is saved for S3.");
            }
        }

        $endpoint = trim((string) Setting::get('backup_s3_endpoint'));
        $region = trim((string) Setting::get('backup_s3_region')) ?: ($endpoint === '' ? 'us-east-1' : 'auto');

        $config = [
            'region' => $region,
            'accessKeyId' => trim((string) Setting::get('backup_s3_key')),
            'accessKeySecret' => (string) Setting::get('backup_s3_secret'),
            // Strings, as async-aws reads them: it runs them through FILTER_VALIDATE_BOOLEAN.
            'pathStyleEndpoint' => in_array((string) Setting::get('backup_s3_path_style'), ['1', 'true'], true) ? 'true' : 'false',
            'sendChunkedBody' => 'false',
            // Never read ~/.aws on the server: the credentials are the ones saved here.
            'sharedCredentialsFile' => '/dev/null',
            'sharedConfigFile' => '/dev/null',
        ];

        $http = $this->http;

        if ($endpoint !== '') {
            $config['endpoint'] = rtrim($endpoint, '/');
            $http ??= self::pinned((string) parse_url($endpoint, PHP_URL_HOST));
        }

        return $this->client = new S3Client($config, null, $http ?? HttpClient::create(['timeout' => 120, 'max_redirects' => 0]));
    }

    /** An HTTP client that can only ever connect to the address that was checked. */
    private static function pinned(string $host): HttpClientInterface
    {
        if (config('backups.allow_private_hosts')) {
            return HttpClient::create(['timeout' => 120, 'max_redirects' => 0]);
        }

        if ($refusal = PublicHost::refusal($host, requireResolution: true)) {
            throw new RuntimeException($refusal);
        }

        $addresses = PublicHost::resolve($host);

        return HttpClient::create(['timeout' => 120, 'max_redirects' => 0, 'resolve' => [$host => $addresses[0]]]);
    }

    private function bucket(): string
    {
        return trim((string) Setting::get('backup_s3_bucket'));
    }

    private function prefix(): string
    {
        $prefix = trim((string) Setting::get('backup_s3_prefix'), '/ ');

        return ($prefix === '' ? '' : $prefix.'/').BackupPaths::REMOTE_ROOT.'/';
    }

    private function objectKey(string $folder, string $file): string
    {
        return $this->prefix().$folder.'/'.$file;
    }

    public static function slice(string $path, int $offset, int $length): string
    {
        $handle = fopen($path, 'rb');

        if ($handle === false) {
            throw new RuntimeException('A backup file could not be read from this server\'s disk.');
        }

        try {
            fseek($handle, $offset);

            return (string) stream_get_contents($handle, $length);
        } finally {
            fclose($handle);
        }
    }
}
