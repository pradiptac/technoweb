<?php

namespace App\Enums;

enum TicketPriority: string
{
    case Low = 'low';
    case Normal = 'normal';
    case High = 'high';
    case Critical = 'critical';

    public function label(): string
    {
        return match ($this) {
            self::Low => 'Low',
            self::Normal => 'Normal',
            self::High => 'High',
            self::Critical => 'Critical — service down',
        };
    }

    /** Hours until first response is due, before category overrides. */
    public function slaHours(): int
    {
        return match ($this) {
            self::Low => 24,
            self::Normal => 8,
            self::High => 4,
            self::Critical => 1,
        };
    }

    public function weight(): int
    {
        return match ($this) {
            self::Critical => 4,
            self::High => 3,
            self::Normal => 2,
            self::Low => 1,
        };
    }
}
