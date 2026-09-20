<?php

namespace App\Enums;

/**
 * Whether a sequence is running.
 *
 * Two states, because pausing is the one thing an operator needs mid-flight:
 * a step found wrong after somebody has been enrolled must stop *going out*
 * without throwing away where everyone is. A paused sequence's enrolments
 * wait — `Sequences::run()` skips them — and pick up where they were.
 */
enum SequenceStatus: string
{
    case Active = 'active';
    case Paused = 'paused';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'Active',
            self::Paused => 'Paused',
        };
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
