<?php

namespace App\Enums;

/**
 * Where a channel template stands with the provider that has to approve it.
 *
 * Only WhatsApp approves (see `MessageChannel::needsApproval()`); an RCS or
 * push template is `not_required` from the moment it is saved. The rest are
 * Meta's own states, which Gupshup and Twilio report in their own words and
 * the providers map onto these — `fromProvider()` is that map, so one
 * unfamiliar word from a provider becomes `pending` rather than a status the
 * console has no badge for.
 */
enum TemplateApproval: string
{
    case NotRequired = 'not_required';
    case Draft = 'draft';
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Paused = 'paused';

    public function label(): string
    {
        return match ($this) {
            self::NotRequired => 'No approval needed',
            self::Draft => 'Not submitted',
            self::Pending => 'Waiting for approval',
            self::Approved => 'Approved',
            self::Rejected => 'Rejected',
            self::Paused => 'Paused by the provider',
        };
    }

    /** Whether a message may be sent against it now. */
    public function sendable(): bool
    {
        return $this === self::NotRequired || $this === self::Approved;
    }

    /**
     * A provider's word for a template's state, as one of these.
     *
     * Meta says APPROVED/PENDING/REJECTED/PAUSED/DISABLED; Gupshup the same
     * in lower case plus FAILED; Twilio `approved`, `pending`, `received`,
     * `rejected`, `paused`, `disabled`, `unsubmitted`.
     */
    public static function fromProvider(?string $word): self
    {
        return match (strtolower(trim((string) $word))) {
            'approved', 'active', 'enabled' => self::Approved,
            'rejected', 'failed', 'disabled', 'deleted' => self::Rejected,
            'paused', 'flagged' => self::Paused,
            'unsubmitted', 'draft', '' => self::Draft,
            default => self::Pending,
        };
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
