<?php

namespace App\Support\Writing;

final class WritingResult
{
    private function __construct(public bool $ok, public string $output, public ?string $message, public int $status) {}

    public static function ok(string $output): self
    {
        return new self(true, $output, null, 200);
    }

    public static function refused(string $message, int $status = 422): self
    {
        return new self(false, '', $message, $status);
    }
}
