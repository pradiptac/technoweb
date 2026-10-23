<?php

namespace App\Enums;

enum SocialPostStatus: string
{
    case Draft = 'draft';
    case Sending = 'sending';
    case Sent = 'sent';
    case SharedManually = 'shared_manually';
    case Failed = 'failed';
    case Unconfirmed = 'unconfirmed';
    case Discarded = 'discarded';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Waiting',
            self::Sending => 'Sending',
            self::Sent => 'Sent',
            self::SharedManually => 'Shared by hand',
            self::Failed => 'Failed',
            self::Unconfirmed => "Couldn't confirm",
            self::Discarded => 'Discarded',
        };
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
