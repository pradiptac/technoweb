<?php

namespace App\Support\Backups\Destinations;

use App\Models\Setting;
use phpseclib3\Crypt\PublicKeyLoader;
use phpseclib3\Net\SFTP;
use RuntimeException;

/**
 * An SFTP server, through `phpseclib` — pure PHP, so no `ssh2` extension to
 * ask a host for.
 *
 * **The server's host key is pinned on first contact.** SSH's protection
 * against a server pretending to be the one you meant is the host key, and a
 * program has no person to ask "are you sure?" the way `ssh` does. So the
 * first successful connection records the key's SHA-256 fingerprint beside
 * the host and port it came from (`backup_ftp_sftp_fingerprint`), and every
 * later connection refuses a different key — which is either a server that
 * was rebuilt or somebody in the middle, and a person should decide which.
 * Changing the host re-pins, because the stored key belongs to the old one.
 *
 * Signs in with a private key when one is saved (the password is then its
 * passphrase), otherwise with the password. Connects to the checked address,
 * as the FTP destination does.
 */
final class SftpDestination implements Destination
{
    private const CHUNK = 8 * 1024 * 1024;

    private ?SFTP $sftp = null;

    public function key(): string
    {
        return 'ftp';
    }

    public function label(): string
    {
        return 'SFTP';
    }

    public function chunkBytes(): int
    {
        return self::CHUNK;
    }

    public function begin(string $folder, string $file, int $size): array
    {
        $sftp = $this->sftp();
        $directory = Remote::root().'/'.$folder;

        if (! $sftp->is_dir($directory) && ! $sftp->mkdir($directory, -1, true)) {
            throw new RuntimeException("Could not make the folder {$directory} on the SFTP server.");
        }

        $path = Remote::path($folder, $file);
        $sftp->delete($path, false);

        return ['path' => $path];
    }

    public function send(array $state, string $localPath, int $offset, int $length): array
    {
        $chunk = S3Destination::slice($localPath, $offset, $length);
        $ok = $offset === 0
            ? $this->sftp()->put((string) $state['path'], $chunk)
            : $this->sftp()->put((string) $state['path'], $chunk, SFTP::SOURCE_STRING, $offset);

        if (! $ok) {
            throw new RuntimeException('The SFTP server refused the upload: '.($this->sftp()->getLastSFTPError() ?: 'no reason given'));
        }

        return $state;
    }

    public function finish(array $state): void {}

    public function read(string $folder, string $file, int $offset, int $length): string
    {
        $bytes = $this->sftp()->get(Remote::path($folder, $file), false, $offset, $length);

        if ($bytes === false) {
            throw new RuntimeException('The SFTP server refused the download: '.($this->sftp()->getLastSFTPError() ?: 'no reason given'));
        }

        return (string) $bytes;
    }

    public function size(string $folder, string $file): ?int
    {
        $stat = $this->sftp()->stat(Remote::path($folder, $file));

        return is_array($stat) ? (int) ($stat['size'] ?? 0) : null;
    }

    public function folders(): array
    {
        $list = $this->sftp()->nlist(Remote::root());

        return array_values(array_filter((array) ($list ?: []), fn ($name) => ! in_array($name, ['.', '..'], true) && ! str_starts_with((string) $name, '.probe')));
    }

    public function deleteFolder(string $folder): void
    {
        $this->sftp()->delete(Remote::root().'/'.$folder, true);
    }

    public function probe(): string
    {
        $sftp = $this->sftp();
        $root = Remote::root();

        if (! $sftp->is_dir($root) && ! $sftp->mkdir($root, -1, true)) {
            throw new RuntimeException("Signed in, but could not make the folder {$root}: ".($sftp->getLastSFTPError() ?: 'permission denied'));
        }

        $path = $root.'/.probe-'.bin2hex(random_bytes(6));

        if (! $sftp->put($path, 'technoware backup probe')) {
            throw new RuntimeException("Signed in, but could not write a file in {$root}: ".($sftp->getLastSFTPError() ?: 'permission denied'));
        }

        $back = $sftp->get($path);
        $sftp->delete($path, false);

        if ($back !== 'technoware backup probe') {
            throw new RuntimeException('A test file was written but did not read back the same.');
        }

        return 'Signed in to '.Setting::get('backup_ftp_host').' over SFTP (host key '.self::fingerprintOf((string) $sftp->getServerPublicHostKey()).'), and wrote, read and deleted a test file in '.$root.'.';
    }

    private function sftp(): SFTP
    {
        if ($this->sftp !== null) {
            return $this->sftp;
        }

        [$host, $port] = [trim((string) Setting::get('backup_ftp_host')), (int) (Setting::get('backup_ftp_port') ?: 22)];
        $sftp = new SFTP(Remote::address($host), $port, 20);

        $key = $sftp->getServerPublicHostKey();

        if ($key === false) {
            throw new RuntimeException("Could not connect to {$host} on port {$port}, or it did not offer a host key.");
        }

        $this->pin("{$host}:{$port}", self::fingerprintOf((string) $key));

        $username = (string) Setting::get('backup_ftp_username');
        $password = (string) Setting::get('backup_ftp_password');
        $privateKey = trim((string) Setting::get('backup_ftp_private_key'));

        try {
            $credential = $privateKey !== '' ? PublicKeyLoader::load($privateKey, $password === '' ? false : $password) : $password;
        } catch (\Throwable) {
            throw new RuntimeException('The saved private key could not be read. Paste the whole key, including its BEGIN and END lines; if it has a passphrase, save that as the password.');
        }

        if (! $sftp->login($username, $credential)) {
            throw new RuntimeException("{$host} refused the user name, password or key.");
        }

        return $this->sftp = $sftp;
    }

    /** Record the first key seen for this host and port; refuse a different one afterwards. */
    private function pin(string $where, string $fingerprint): void
    {
        $stored = (string) Setting::get('backup_ftp_sftp_fingerprint');
        [$storedWhere, $storedPrint] = array_pad(explode(' ', $stored, 2), 2, '');

        if ($storedWhere === $where && $storedPrint !== '' && ! hash_equals($storedPrint, $fingerprint)) {
            throw new RuntimeException("The SFTP server’s host key has changed (it was {$storedPrint}, it is now {$fingerprint}). If the server was rebuilt, press “Forget the pinned key” in Settings and test again; if it was not, do not — something may be in the middle.");
        }

        if ($storedWhere !== $where || $storedPrint === '') {
            Setting::put('backup_ftp_sftp_fingerprint', "{$where} {$fingerprint}");
        }
    }

    /** `SHA256:…`, the form `ssh-keygen -lf` prints. */
    public static function fingerprintOf(string $key): string
    {
        $blob = base64_decode(explode(' ', trim($key))[1] ?? '', true) ?: '';

        return 'SHA256:'.rtrim(base64_encode(hash('sha256', $blob, true)), '=');
    }
}
