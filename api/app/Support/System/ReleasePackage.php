<?php

namespace App\Support\System;

use RuntimeException;
use ZipArchive;

/**
 * A release zip, read and checked before anything in it is trusted.
 *
 * `release/build.mjs` writes `<root>/release.json` — the version, the oldest
 * version it may be applied over, the migrations it carries, the changelog
 * and the sha256 of every file under `api/` and `web/` — and signs exactly
 * those bytes with Ed25519. This class opens the zip, finds that pair, and
 * checks the signature against the public key in `config/release.php`, so a
 * zip that was altered after it was built, or built by anybody else, is named
 * and refused here rather than half-installed.
 *
 * The file hashes are checked again as each file is unpacked (`Updater`):
 * the signature proves the list, the list proves the files.
 */
final class ReleasePackage
{
    /**
     * The product ids a release may carry: the name it ships under since
     * 0.97.0, and the one before, which the first installs were built from.
     */
    public const PRODUCTS = ['altis-tech-cms', 'technoware'];

    /** What people see the product called. */
    public const PRODUCT_NAME = 'ALTIS TECH-CMS';

    /** @var array<string, mixed> */
    public readonly array $release;

    public readonly string $root;

    public readonly bool $signed;

    private function __construct(public readonly string $path, array $release, string $root, bool $signed)
    {
        $this->release = $release;
        $this->root = $root;
        $this->signed = $signed;
    }

    public static function open(string $path): self
    {
        $zip = new ZipArchive;

        if ($zip->open($path, ZipArchive::RDONLY) !== true) {
            throw new RuntimeException(basename($path).' is not a readable zip file. Upload it again; a download that stopped early looks like this.');
        }

        try {
            $root = self::rootOf($zip);
            $json = $zip->getFromName($root.'/release.json');
            $sig = $zip->getFromName($root.'/release.json.sig');
        } finally {
            $zip->close();
        }

        if (! is_string($json)) {
            throw new RuntimeException(basename($path).' is not a release of this software (it has no release.json).');
        }

        $release = json_decode($json, true);

        if (! is_array($release) || ! in_array($release['product'] ?? null, self::PRODUCTS, true) || ! is_string($release['version'] ?? null) || ! is_array($release['files'] ?? null)) {
            throw new RuntimeException(basename($path).' carries a release.json this updater cannot read.');
        }

        return new self($path, $release, $root, is_string($sig) && self::verify($json, $sig));
    }

    /** The single top-level folder every entry sits under. */
    private static function rootOf(ZipArchive $zip): string
    {
        $first = (string) $zip->getNameIndex(0);
        $root = explode('/', ltrim($first, '/'))[0];

        if ($root === '' || $zip->locateName($root.'/release.json') === false) {
            throw new RuntimeException('This zip is not laid out like a release (one folder, with release.json inside it).');
        }

        return $root;
    }

    private static function verify(string $json, string $signature): bool
    {
        $public = base64_decode((string) config('release.public_key'), true);
        $sig = base64_decode(trim($signature), true);

        if (! is_string($public) || strlen($public) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES || ! is_string($sig) || strlen($sig) !== SODIUM_CRYPTO_SIGN_BYTES) {
            return false;
        }

        return sodium_crypto_sign_verify_detached($sig, $json, $public);
    }

    public function version(): string
    {
        return (string) $this->release['version'];
    }

    /** @return array<string, string> relative path ("api/…", "web/…") => sha256 */
    public function files(): array
    {
        return (array) $this->release['files'];
    }

    /**
     * Why this package may not be applied over what is installed, or null.
     * A signature, then the direction, then the bridge, then this server.
     */
    public function refusal(string $installed): ?string
    {
        if (! $this->signed) {
            return 'Its signature does not check out, so it was changed after it was built or was not built by your supplier. Do not apply it; ask your supplier for the file again.';
        }

        if (! empty($this->release['worktree']) && ! config('release.allow_test_builds')) {
            return 'It is a test build, not a release. Ask your supplier for the release zip.';
        }

        if (version_compare($this->version(), $installed, '<')) {
            return "It is version {$this->version()}, older than the {$installed} installed. Going back a version is a rollback, from the history below.";
        }

        $minFrom = (string) ($this->release['min_from'] ?? '0.0.0');

        if (version_compare($installed, $minFrom, '<')) {
            return "It can only be applied over version {$minFrom} or newer, and {$installed} is installed. Apply {$minFrom} first.";
        }

        $php = (string) ($this->release['requires']['php'] ?? '8.3.0');

        if (version_compare(PHP_VERSION, $php, '<')) {
            return "It needs PHP {$php} or newer; this server runs ".PHP_VERSION.'. Change the PHP version for the API domain in the hosting panel first.';
        }

        return null;
    }

    /**
     * What the Updates screen shows about the package.
     *
     * @param  list<string>  $ran  migrations the database has already run
     * @return array<string, mixed>
     */
    public function summary(string $installed, array $ran): array
    {
        $new = array_values(array_diff((array) ($this->release['migrations'] ?? []), $ran));

        return [
            'file' => basename($this->path),
            'size' => @filesize($this->path) ?: null,
            'version' => $this->version(),
            'built_at' => $this->release['built_at'] ?? null,
            'signed' => $this->signed,
            'refusal' => $this->refusal($installed),
            'same_version' => version_compare($this->version(), $installed, '=='),
            'changes_database' => $new !== [],
            'new_migrations' => count($new),
            'changelog' => array_values(array_filter(
                (array) ($this->release['changelog'] ?? []),
                fn ($entry) => is_array($entry) && version_compare((string) ($entry['version'] ?? '0'), $installed, '>'),
            )),
        ];
    }
}
