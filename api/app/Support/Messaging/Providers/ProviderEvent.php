<?php

namespace App\Support\Messaging\Providers;

use App\Enums\MessageDeliveryStatus;
use App\Enums\TemplateApproval;

/**
 * One thing a provider's webhook reported: a message's status moved, a
 * person wrote back (which is where a STOP arrives), or a template's
 * approval changed.
 */
final readonly class ProviderEvent
{
    private function __construct(
        public string $type,
        public ?string $messageId = null,
        public ?MessageDeliveryStatus $status = null,
        public ?string $error = null,
        public ?string $address = null,
        public ?string $text = null,
        public ?string $templateName = null,
        public ?string $language = null,
        public ?TemplateApproval $approval = null,
    ) {}

    public static function status(string $messageId, MessageDeliveryStatus $status, ?string $error = null): self
    {
        return new self('status', messageId: $messageId, status: $status, error: $error);
    }

    public static function inbound(string $address, string $text): self
    {
        return new self('inbound', address: $address, text: $text);
    }

    public static function template(string $name, ?string $language, TemplateApproval $approval, ?string $reason = null): self
    {
        return new self('template', templateName: $name, language: $language, approval: $approval, error: $reason);
    }

    /**
     * A provider's word for a message's status. Unknown words are null —
     * dropped rather than guessed at.
     */
    public static function statusFrom(?string $word): ?MessageDeliveryStatus
    {
        return match (strtolower(trim((string) $word))) {
            'sent', 'enqueued', 'submitted', 'accepted' => MessageDeliveryStatus::Sent,
            'delivered' => MessageDeliveryStatus::Delivered,
            'read', 'seen' => MessageDeliveryStatus::Read,
            'failed', 'undelivered', 'rejected' => MessageDeliveryStatus::Failed,
            default => null,
        };
    }
}
