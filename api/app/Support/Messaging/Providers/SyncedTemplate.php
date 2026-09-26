<?php

namespace App\Support\Messaging\Providers;

use App\Enums\TemplateApproval;

/** A template as the provider lists it: its name, language, state and id. */
final readonly class SyncedTemplate
{
    public function __construct(
        public string $name,
        public string $language,
        public TemplateApproval $status,
        public ?string $reason = null,
        public ?string $id = null,
    ) {}
}
