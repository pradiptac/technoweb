<?php

namespace App\Support\Backups\Destinations;

/**
 * Somewhere a backup is kept: S3 (or anything speaking it), Google Drive, an
 * FTP, FTPS or SFTP server.
 *
 * **Every transfer is in chunks, and the state between chunks is data.** A
 * backup's zip volume can be far bigger than one run of the worker can
 * upload, so `begin()` returns whatever the destination needs to carry on —
 * an S3 upload id and the parts so far, a Drive resumable-session URI — the
 * worker stores it on the upload row, and the next run calls `send()` with
 * it. Downloads for a restore are ranged reads for the same reason.
 *
 * Every backup is a folder under `technoware-backups/` holding its files,
 * with `manifest.json` uploaded **last**: a folder without one is an upload
 * that never finished, and `folders()` callers treat it as such.
 */
interface Destination
{
    /** `s3`, `gdrive` or `ftp`. */
    public function key(): string;

    public function label(): string;

    /** How much one `send()` moves. */
    public function chunkBytes(): int;

    /**
     * Start an upload of `$size` bytes to `$folder/$file`.
     *
     * @return array<string, mixed> the state `send()` and `finish()` take
     */
    public function begin(string $folder, string $file, int $size): array;

    /**
     * Send `$length` bytes of `$localPath` from `$offset`.
     *
     * @param  array<string, mixed>  $state
     * @return array<string, mixed> the state after this chunk
     */
    public function send(array $state, string $localPath, int $offset, int $length): array;

    /** @param  array<string, mixed>  $state */
    public function finish(array $state): void;

    /** Up to `$length` bytes of `$folder/$file` from `$offset`. */
    public function read(string $folder, string $file, int $offset, int $length): string;

    /** The size of `$folder/$file`, or null when it is not there. */
    public function size(string $folder, string $file): ?int;

    /** @return list<string> the backup folders under the root, in no particular order */
    public function folders(): array;

    public function deleteFolder(string $folder): void;

    /**
     * Connect, write a small file, read it back, delete it: the settings
     * screen's Test button. Returns a sentence saying what was reached.
     */
    public function probe(): string;
}
