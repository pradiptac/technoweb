<?php

namespace Technoware\Install;

/**
 * An environment file built from a template, key by key.
 *
 * The wizard starts from `api/.env.example` — the documented list of every
 * setting, with its comments — and replaces the values it knows, so the file
 * a customer later opens in File Manager still explains itself. A key the
 * template does not carry is appended at the end.
 */
final class EnvFile
{
    /** @var list<string> */
    private array $lines;

    private function __construct(string $contents)
    {
        $this->lines = preg_split('/\r\n|\n|\r/', rtrim($contents, "\r\n")) ?: [];
    }

    public static function fromTemplate(?string $path): self
    {
        return new self($path !== null && is_file($path) ? (string) file_get_contents($path) : '');
    }

    /** @param array<string, string|int|bool|null> $values */
    public function set(array $values): self
    {
        foreach ($values as $key => $value) {
            $line = $key.'='.self::quote($value);
            $found = false;

            foreach ($this->lines as $i => $existing) {
                // The live key, or a commented-out example of it ("# KEY=…").
                if (preg_match('/^\s*#?\s*'.preg_quote($key, '/').'\s*=/', $existing) === 1) {
                    if ($found) {
                        continue;
                    }
                    $this->lines[$i] = $line;
                    $found = true;
                }
            }

            if (! $found) {
                $this->lines[] = $line;
            }
        }

        return $this;
    }

    public function write(string $path): void
    {
        $tmp = $path.'.tmp';

        if (file_put_contents($tmp, implode("\n", $this->lines)."\n") === false || ! rename($tmp, $path)) {
            throw new \RuntimeException('Could not write '.basename($path).'. Check that the config folder is writable.');
        }

        @chmod($path, 0600);
    }

    private static function quote(string|int|bool|null $value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        $value = (string) $value;

        if ($value === '' || preg_match('/^[A-Za-z0-9_.:\/@+,=\-]+$/', $value) === 1) {
            return $value;
        }

        return '"'.str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $value).'"';
    }
}
