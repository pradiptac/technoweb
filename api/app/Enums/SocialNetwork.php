<?php

namespace App\Enums;

/** The networks a post can be drafted for. X is never sent by API in this release. */
enum SocialNetwork: string
{
    case LinkedIn = 'linkedin';
    case X = 'x';

    public function label(): string
    {
        return match ($this) {
            self::LinkedIn => 'LinkedIn',
            self::X => 'X',
        };
    }

    /** The most characters the network takes (X counts each link as 23). */
    public function limit(): int
    {
        return match ($this) {
            self::LinkedIn => 3000,
            self::X => 280,
        };
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
