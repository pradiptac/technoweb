<?php

namespace App\Support\Writing;

use App\Enums\WritingMode;
use App\Enums\WritingTone;

final class WritingInput
{
    /** @param array<string, mixed> $ref surface-specific: type/id, reference, campaign_id, key/field… */
    public function __construct(
        public WritingMode $mode,
        public WritingTone $tone,
        public string $text,
        public ?string $brief,
        public array $ref,
        public ?int $max = null,
    ) {}
}
