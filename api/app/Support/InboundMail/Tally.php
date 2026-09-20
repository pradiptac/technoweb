<?php

namespace App\Support\InboundMail;

/**
 * What one run of the piper did, for the command's output and the tests.
 */
final class Tally
{
    public int $created = 0;

    public int $replied = 0;

    public int $skipped = 0;

    public int $failed = 0;

    public int $duplicates = 0;

    public function __construct(
        public readonly bool $ran,
        public ?string $error = null,
    ) {}

    public static function disabled(): self
    {
        return new self(ran: false);
    }

    public static function refused(string $error): self
    {
        return new self(ran: false, error: $error);
    }

    public function count(string $outcome): void
    {
        match (true) {
            $outcome === 'ticket_created' => $this->created++,
            $outcome === 'reply_added' => $this->replied++,
            $outcome === 'failed' => $this->failed++,
            $outcome === 'duplicate' => $this->duplicates++,
            default => $this->skipped++,
        };
    }

    public function total(): int
    {
        return $this->created + $this->replied + $this->skipped + $this->failed + $this->duplicates;
    }

    public function summary(): string
    {
        return sprintf(
            '%d message(s): %d ticket(s) opened, %d reply(ies) added, %d skipped, %d failed, %d already seen.',
            $this->total(), $this->created, $this->replied, $this->skipped, $this->failed, $this->duplicates,
        );
    }
}
