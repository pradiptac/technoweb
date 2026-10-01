<?php

namespace App\Support\Backups\Destinations;

use RuntimeException;

/**
 * A destination held in memory, for tests — the `FakeMailbox` of backups.
 *
 * `failOn` names a file whose upload throws, so a test can watch one
 * destination fail while another completes; `chunk` is small so a test can
 * watch an upload span several steps.
 */
final class FakeDestination implements Destination
{
    /** @var array<string, string> "folder/file" => bytes */
    public array $files = [];

    /** @var array<string, string> uploads in progress */
    private array $partial = [];

    public int $sends = 0;

    /** How long each chunk takes, so a test can watch an upload pause. */
    public int $delayMs = 0;

    public function __construct(
        private readonly string $key = 's3',
        private readonly int $chunk = 64 * 1024,
        public ?string $failOn = null,
    ) {}

    public function key(): string
    {
        return $this->key;
    }

    public function label(): string
    {
        return 'Fake '.$this->key;
    }

    public function chunkBytes(): int
    {
        return $this->chunk;
    }

    public function begin(string $folder, string $file, int $size): array
    {
        if ($this->failOn === $file) {
            throw new RuntimeException("The fake refuses {$file}.");
        }

        $this->partial["{$folder}/{$file}"] = '';

        return ['path' => "{$folder}/{$file}"];
    }

    public function send(array $state, string $localPath, int $offset, int $length): array
    {
        $this->sends++;
        usleep($this->delayMs * 1000);
        $handle = fopen($localPath, 'rb');
        fseek($handle, $offset);
        $this->partial[$state['path']] = ($this->partial[$state['path']] ?? '').(string) fread($handle, $length);
        fclose($handle);

        return $state;
    }

    public function finish(array $state): void
    {
        $this->files[$state['path']] = $this->partial[$state['path']] ?? '';
        unset($this->partial[$state['path']]);
    }

    public function read(string $folder, string $file, int $offset, int $length): string
    {
        return substr($this->files["{$folder}/{$file}"] ?? throw new RuntimeException("No {$folder}/{$file}."), $offset, $length);
    }

    public function size(string $folder, string $file): ?int
    {
        return isset($this->files["{$folder}/{$file}"]) ? strlen($this->files["{$folder}/{$file}"]) : null;
    }

    public function folders(): array
    {
        return array_values(array_unique(array_map(fn ($path) => explode('/', $path, 2)[0], array_keys($this->files))));
    }

    public function deleteFolder(string $folder): void
    {
        foreach (array_keys($this->files) as $path) {
            if (str_starts_with($path, $folder.'/')) {
                unset($this->files[$path]);
            }
        }
    }

    public function probe(): string
    {
        return 'The fake answered.';
    }
}
