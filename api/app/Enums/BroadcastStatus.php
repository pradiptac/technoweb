<?php

namespace App\Enums;

/**
 * A broadcast's life: written, perhaps scheduled, claimed and sent, done.
 *
 * `sending` is claimed with a conditional UPDATE from `draft` or `scheduled`
 * (`Broadcasts::queue()`), so two presses — or the scheduler and a press —
 * cannot both freeze an audience. Only a draft may be edited. A scheduled or
 * sending broadcast may be cancelled — what has not gone yet is skipped,
 * because a message that has gone cannot be recalled — and only a draft or
 * a cancelled one may be deleted.
 */
enum BroadcastStatus: string
{
    case Draft = 'draft';
    case Scheduled = 'scheduled';
    case Sending = 'sending';
    case Sent = 'sent';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Scheduled => 'Scheduled',
            self::Sending => 'Sending',
            self::Sent => 'Sent',
            self::Cancelled => 'Cancelled',
        };
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
