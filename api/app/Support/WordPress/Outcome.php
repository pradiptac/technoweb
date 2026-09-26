<?php

namespace App\Support\WordPress;

/**
 * What a step decided about one source record: create it, update the record
 * an earlier run made, or skip it and say why — and, for the first two,
 * anything that will not come across (`warnings`).
 *
 * `data` is whatever the step worked out while deciding, handed to its own
 * `write()` so the commit does not work it out twice (and cannot work it out
 * differently).
 */
final class Outcome
{
    public const CREATE = 'create';

    public const UPDATE = 'update';

    public const SKIP = 'skip';

    /** Written, but counted by something else — a file the media service counts itself. */
    public const DELEGATED = 'delegated';

    /**
     * @param  list<string>  $warnings
     * @param  array<string, mixed>  $data
     */
    private function __construct(
        public readonly string $action,
        public readonly string $label,
        public readonly ?string $reason = null,
        public array $warnings = [],
        public array $data = [],
    ) {}

    /** @param  array<string, mixed>  $data */
    public static function create(string $label, array $data = []): self
    {
        return new self(self::CREATE, $label, data: $data);
    }

    /** @param  array<string, mixed>  $data */
    public static function update(string $label, array $data = []): self
    {
        return new self(self::UPDATE, $label, data: $data);
    }

    /** Create, or update when an earlier run already made the record. */
    public static function upsert(bool $exists, string $label, array $data = []): self
    {
        return $exists ? self::update($label, $data) : self::create($label, $data);
    }

    public static function delegated(string $label): self
    {
        return new self(self::DELEGATED, $label);
    }

    public static function skip(string $label, string $reason): self
    {
        return new self(self::SKIP, $label, $reason);
    }

    public function warn(string $warning): self
    {
        if (! in_array($warning, $this->warnings, true)) {
            $this->warnings[] = $warning;
        }

        return $this;
    }

    public function writes(): bool
    {
        return $this->action !== self::SKIP;
    }
}
