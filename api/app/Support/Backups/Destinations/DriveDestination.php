<?php

namespace App\Support\Backups\Destinations;

use App\Models\Setting;
use App\Support\Backups\BackupPaths;
use App\Support\OAuth\OAuthConnection;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Google Drive, over its REST API with `Http` — no Google client library,
 * `GoogleServiceAccount`'s reasoning.
 *
 * **An OAuth consent, not a service account.** A service account has no
 * storage of its own on a personal Drive, so every upload from one fails
 * with a quota error unless the account is inside a Workspace shared drive.
 * The consent is its own slot (`OAuthConnection::backupDrive()`), with the
 * narrowest scope Drive has: `drive.file`, which sees only the files this
 * application created. A leaked token cannot read the rest of the Drive.
 *
 * The app makes one folder, `technoware-backups`, at the top of the Drive,
 * remembers its id (`backup_gdrive_folder_id`) and puts one folder per
 * backup inside it. Uploads are Drive's resumable sessions: the session URI
 * is the resume state, and chunks are a multiple of 256 KB as Drive asks.
 */
final class DriveDestination implements Destination
{
    private const API = 'https://www.googleapis.com/drive/v3';

    private const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

    private const FOLDER = 'application/vnd.google-apps.folder';

    private const CHUNK = 8 * 1024 * 1024;

    /** @var array<string, string> folder name => id, for this run */
    private array $folderIds = [];

    public function key(): string
    {
        return 'gdrive';
    }

    public function label(): string
    {
        return 'Google Drive';
    }

    public function chunkBytes(): int
    {
        return self::CHUNK;
    }

    public function begin(string $folder, string $file, int $size): array
    {
        $parent = $this->folderId($folder, create: true);

        // A retried upload must not leave two files with one name.
        foreach ($this->find($file, $parent) as $existing) {
            $this->api()->delete(self::API.'/files/'.$existing['id'])->throw();
        }

        $response = $this->api()
            ->withHeaders(['X-Upload-Content-Type' => 'application/octet-stream', 'X-Upload-Content-Length' => (string) $size])
            ->post(self::UPLOAD.'?uploadType=resumable&fields=id', ['name' => $file, 'parents' => [$parent]]);

        self::check($response);
        $session = $response->header('Location');

        if ($session === '' || ! str_starts_with($session, 'https://www.googleapis.com/')) {
            throw new RuntimeException('Google Drive did not open an upload session.');
        }

        return ['session' => $session, 'size' => $size];
    }

    public function send(array $state, string $localPath, int $offset, int $length): array
    {
        $body = S3Destination::slice($localPath, $offset, $length);
        $size = (int) $state['size'];
        $range = $size === 0 ? 'bytes */0' : 'bytes '.$offset.'-'.($offset + strlen($body) - 1).'/'.$size;

        $response = $this->api()
            ->withHeaders(['Content-Range' => $range])
            ->withBody($body, 'application/octet-stream')
            ->put((string) $state['session']);

        // 308 is "keep going"; 200 or 201 is the whole file.
        if ($response->status() !== 308) {
            self::check($response);
            $state['id'] = $response->json('id');
        }

        return $state;
    }

    public function finish(array $state): void
    {
        if (empty($state['id'])) {
            throw new RuntimeException('Google Drive did not confirm the upload finished.');
        }
    }

    public function read(string $folder, string $file, int $offset, int $length): string
    {
        $id = $this->fileId($folder, $file) ?? throw new RuntimeException("{$folder}/{$file} is not on Google Drive.");

        $response = $this->api()
            ->withHeaders(['Range' => 'bytes='.$offset.'-'.($offset + $length - 1)])
            ->get(self::API.'/files/'.$id, ['alt' => 'media']);

        self::check($response);

        return $response->body();
    }

    public function size(string $folder, string $file): ?int
    {
        $parent = $this->folderId($folder, create: false);
        $found = $parent === null ? [] : $this->find($file, $parent);

        return $found === [] ? null : (int) ($found[0]['size'] ?? 0);
    }

    public function folders(): array
    {
        $names = [];
        $token = null;

        do {
            $response = $this->api()->get(self::API.'/files', array_filter([
                'q' => "'".$this->rootId()."' in parents and mimeType = '".self::FOLDER."' and trashed = false",
                'fields' => 'nextPageToken, files(id, name)',
                'pageSize' => 1000,
                'pageToken' => $token,
            ]));
            self::check($response);

            foreach ((array) $response->json('files', []) as $folder) {
                $names[] = (string) $folder['name'];
                $this->folderIds[(string) $folder['name']] = (string) $folder['id'];
            }

            $token = $response->json('nextPageToken');
        } while ($token);

        return $names;
    }

    public function deleteFolder(string $folder): void
    {
        $id = $this->folderId($folder, create: false);

        if ($id !== null) {
            self::check($this->api()->delete(self::API.'/files/'.$id));
            unset($this->folderIds[$folder]);
        }
    }

    public function probe(): string
    {
        $root = $this->rootId();
        $name = '.probe-'.bin2hex(random_bytes(6));

        $response = $this->api()->withBody("--probe\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
            .json_encode(['name' => $name, 'parents' => [$root]])
            ."\r\n--probe\r\nContent-Type: text/plain\r\n\r\ntechnoware backup probe\r\n--probe--", 'multipart/related; boundary=probe')
            ->post(self::UPLOAD.'?uploadType=multipart&fields=id');
        self::check($response);
        $id = (string) $response->json('id');

        $back = $this->api()->get(self::API.'/files/'.$id, ['alt' => 'media']);
        self::check($back);
        self::check($this->api()->delete(self::API.'/files/'.$id));

        if ($back->body() !== 'technoware backup probe') {
            throw new RuntimeException('A test file was written but did not read back the same.');
        }

        return 'Wrote, read and deleted a test file in the “'.BackupPaths::REMOTE_ROOT.'” folder of '.(Setting::get('backup_gdrive_oauth_account') ?: 'the connected Drive').'.';
    }

    private function api(): PendingRequest
    {
        return Http::withToken(OAuthConnection::backupDrive()->accessToken())->timeout(120)->acceptJson()->withoutRedirecting();
    }

    /** The app's own folder at the top of the Drive, made on first use. */
    private function rootId(): string
    {
        $stored = trim((string) Setting::get('backup_gdrive_folder_id'));

        if ($stored !== '') {
            $check = $this->api()->get(self::API.'/files/'.$stored, ['fields' => 'id, trashed']);

            if ($check->successful() && ! $check->json('trashed')) {
                return $stored;
            }
        }

        $response = $this->api()->post(self::API.'/files?fields=id', ['name' => BackupPaths::REMOTE_ROOT, 'mimeType' => self::FOLDER]);
        self::check($response);
        $id = (string) $response->json('id');
        Setting::put('backup_gdrive_folder_id', $id);

        return $id;
    }

    private function folderId(string $folder, bool $create): ?string
    {
        if (isset($this->folderIds[$folder])) {
            return $this->folderIds[$folder];
        }

        $root = $this->rootId();
        $found = $this->find($folder, $root, self::FOLDER);

        if ($found !== []) {
            return $this->folderIds[$folder] = (string) $found[0]['id'];
        }

        if (! $create) {
            return null;
        }

        $response = $this->api()->post(self::API.'/files?fields=id', ['name' => $folder, 'mimeType' => self::FOLDER, 'parents' => [$root]]);
        self::check($response);

        return $this->folderIds[$folder] = (string) $response->json('id');
    }

    private function fileId(string $folder, string $file): ?string
    {
        $parent = $this->folderId($folder, create: false);
        $found = $parent === null ? [] : $this->find($file, $parent);

        return $found === [] ? null : (string) $found[0]['id'];
    }

    /** @return list<array{id: string, size?: string}> */
    private function find(string $name, string $parent, ?string $mime = null): array
    {
        $query = "name = '".str_replace(['\\', "'"], ['\\\\', "\\'"], $name)."' and '".$parent."' in parents and trashed = false"
            .($mime === null ? " and mimeType != '".self::FOLDER."'" : " and mimeType = '".$mime."'");

        $response = $this->api()->get(self::API.'/files', ['q' => $query, 'fields' => 'files(id, size)', 'pageSize' => 10]);
        self::check($response);

        return (array) $response->json('files', []);
    }

    private static function check(Response $response): void
    {
        if ($response->successful()) {
            return;
        }

        $message = $response->json('error.message') ?: $response->json('error_description') ?: 'Google Drive refused the request';

        throw new RuntimeException("{$message} (HTTP {$response->status()})");
    }
}
