<?php

namespace App\Enums;

/**
 * Where a candidate sits in the process.
 *
 * A fixed lifecycle staff move a person through, so an enum — the same
 * reasoning as `TicketStatus`, and the opposite of the qualifications table.
 *
 * Deliberately short. This is a record of applications, not an applicant
 * tracking system: the brief rules out a CRM, and every extra stage here is a
 * step toward one.
 */
enum ApplicationStatus: string
{
    case New = 'new';
    case Shortlisted = 'shortlisted';
    case Interviewing = 'interviewing';
    case Offered = 'offered';
    case Hired = 'hired';
    case Rejected = 'rejected';

    public function label(): string
    {
        return match ($this) {
            self::New => 'New',
            self::Shortlisted => 'Shortlisted',
            self::Interviewing => 'Interviewing',
            self::Offered => 'Offered',
            self::Hired => 'Hired',
            self::Rejected => 'Not proceeding',
        };
    }

    /** Still being considered. */
    public function isOpen(): bool
    {
        return ! in_array($this, [self::Hired, self::Rejected], true);
    }

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
