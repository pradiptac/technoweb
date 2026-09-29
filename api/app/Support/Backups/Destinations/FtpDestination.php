<?php

namespace App\Support\Backups\Destinations;

use App\Models\Setting;
use FTP\Connection;
use RuntimeException;

/**
 * An FTP or FTPS server, through PHP's own FTP extension.
 *
 * **The connection goes to the address that was checked.** The host an
 * administrator typed is resolved once and refused if any answer is private
 * (`Remote::address()`), then the extension is handed the IP rather than the
 * name, so a second DNS answer cannot redirect it. For the same reason passive
 * mode ignores the address in the server's `PASV` reply
 * (`FTP_USEPASVADDRESS` off) and uses the control connection's: a hostile
 * server could otherwise point the data connection at anything on the LAN.
 *
 * FTPS is explicit TLS (`AUTH TLS`). PHP's extension does not verify the
 * certificate, which the settings screen says; it still keeps the password
 * and the backups off the wire in clear. Plain FTP does neither.
 *
 * Uploads append: the first chunk with `STOR`, the rest with `APPE`, each
 * chunk written to a temporary file first because the extension sends files,
 * not strings. Downloads read from an offset (`REST`) and hang up once they
 * have the chunk, rather than pulling the rest of a 128 MB volume each time.
 */
final class FtpDestination implements Destination
{
    private const CHUNK = 8 * 1024 * 1024;

    private ?Connection $connection = null;

    public function __destruct()
    {
        if ($this->connection !== null) {
            @ftp_close($this->connection);
        }
    }

    public function key(): string
    {
        return 'ftp';
    }

    public function label(): string
    {
        return Setting::get('backup_ftp_protocol') === 'ftp' ? 'FTP' : 'FTPS';
    }

    public function chunkBytes(): int
    {
        return self::CHUNK;
    }

    public function begin(string $folder, string $file, int $size): array
    {
        $ftp = $this->ftp();
        $this->mkdirs(Remote::root().'/'.$folder);
        $path = Remote::path($folder, $file);
        @ftp_delete($ftp, $path);

        return ['path' => $path];
    }

    public function send(array $state, string $localPath, int $offset, int $length): array
    {
        $ftp = $this->ftp();
        $chunk = tmpfile();
        fwrite($chunk, S3Destination::slice($localPath, $offset, $length));
        fflush($chunk);
        rewind($chunk);

        $ok = $offset === 0
            ? @ftp_fput($ftp, (string) $state['path'], $chunk, FTP_BINARY)
            : @ftp_append($ftp, (string) $state['path'], stream_get_meta_data($chunk)['uri'], FTP_BINARY);
        fclose($chunk);

        if (! $ok) {
            throw new RuntimeException('The FTP server refused the upload: '.self::lastError());
        }

        return $state;
    }

    public function finish(array $state): void {}

    public function read(string $folder, string $file, int $offset, int $length): string
    {
        $ftp = $this->ftp();
        $buffer = fopen('php://temp', 'w+b');
        $status = @ftp_nb_fget($ftp, $buffer, Remote::path($folder, $file), FTP_BINARY, $offset);

        while ($status === FTP_MOREDATA && ftell($buffer) < $length) {
            $status = @ftp_nb_continue($ftp);
        }

        if ($status === FTP_FAILED) {
            fclose($buffer);

            throw new RuntimeException('The FTP server refused the download: '.self::lastError());
        }

        if ($status === FTP_MOREDATA) {
            // Hang up mid-transfer: the control connection is in no state to reuse.
            @ftp_close($ftp);
            $this->connection = null;
        }

        rewind($buffer);
        $bytes = (string) stream_get_contents($buffer, $length);
        fclose($buffer);

        return $bytes;
    }

    public function size(string $folder, string $file): ?int
    {
        $size = @ftp_size($this->ftp(), Remote::path($folder, $file));

        return $size < 0 ? null : $size;
    }

    public function folders(): array
    {
        $list = @ftp_nlist($this->ftp(), Remote::root());

        return array_values(array_filter(array_map(fn ($entry) => basename(str_replace('\\', '/', (string) $entry)), $list ?: []), fn ($name) => ! in_array($name, ['.', '..', ''], true) && ! str_starts_with($name, '.probe')));
    }

    public function deleteFolder(string $folder): void
    {
        $ftp = $this->ftp();
        $directory = Remote::root().'/'.$folder;

        foreach (@ftp_nlist($ftp, $directory) ?: [] as $entry) {
            $name = basename(str_replace('\\', '/', (string) $entry));

            if (! in_array($name, ['.', '..'], true)) {
                @ftp_delete($ftp, $directory.'/'.$name);
            }
        }

        @ftp_rmdir($ftp, $directory);
    }

    public function probe(): string
    {
        $ftp = $this->ftp();
        $this->mkdirs(Remote::root());
        $path = Remote::root().'/.probe-'.bin2hex(random_bytes(6));

        $out = fopen('php://temp', 'w+b');
        fwrite($out, 'technoware backup probe');
        rewind($out);

        if (! @ftp_fput($ftp, $path, $out, FTP_BINARY)) {
            throw new RuntimeException('Connected and signed in, but could not write a file in '.Remote::root().': '.self::lastError());
        }

        fclose($out);
        $back = $this->readWhole($path);
        @ftp_delete($ftp, $path);

        if ($back !== 'technoware backup probe') {
            throw new RuntimeException('A test file was written but did not read back the same.');
        }

        return 'Signed in to '.Setting::get('backup_ftp_host').' over '.$this->label().', and wrote, read and deleted a test file in '.Remote::root().'.';
    }

    private function readWhole(string $path): string
    {
        $in = fopen('php://temp', 'w+b');
        @ftp_fget($this->ftp(), $in, $path, FTP_BINARY);
        rewind($in);
        $bytes = (string) stream_get_contents($in);
        fclose($in);

        return $bytes;
    }

    private function ftp(): Connection
    {
        if ($this->connection !== null) {
            return $this->connection;
        }

        if (! function_exists('ftp_connect')) {
            throw new RuntimeException('PHP’s FTP extension is not enabled on this server. Switch on extension=ftp in php.ini, or use SFTP.');
        }

        [$host, $port] = [trim((string) Setting::get('backup_ftp_host')), (int) (Setting::get('backup_ftp_port') ?: 21)];
        $address = Remote::address($host);
        $secure = Setting::get('backup_ftp_protocol') !== 'ftp';

        if ($secure && ! function_exists('ftp_ssl_connect')) {
            throw new RuntimeException('This server’s PHP was built without FTPS support.');
        }

        $ftp = $secure ? @ftp_ssl_connect($address, $port, 20) : @ftp_connect($address, $port, 20);

        if ($ftp === false) {
            throw new RuntimeException("Could not connect to {$host} on port {$port}.");
        }

        if (! @ftp_login($ftp, (string) Setting::get('backup_ftp_username'), (string) Setting::get('backup_ftp_password'))) {
            @ftp_close($ftp);

            throw new RuntimeException("{$host} refused the user name or password.");
        }

        @ftp_set_option($ftp, FTP_USEPASVADDRESS, false);
        @ftp_pasv($ftp, Setting::get('backup_ftp_passive') !== '0');

        return $this->connection = $ftp;
    }

    private function mkdirs(string $directory): void
    {
        $ftp = $this->ftp();
        $path = str_starts_with($directory, '/') ? '' : '.';

        foreach (array_filter(explode('/', $directory)) as $segment) {
            $path = $path === '.' ? $segment : $path.'/'.$segment;
            @ftp_mkdir($ftp, $path);
        }
    }

    private static function lastError(): string
    {
        return trim((string) (error_get_last()['message'] ?? 'no reason given'));
    }
}
