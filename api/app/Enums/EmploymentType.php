<?php

namespace App\Enums;

/**
 * How a role is engaged.
 *
 * An enum rather than a lookup table, unlike qualifications beside it: these
 * are a closed set the frontend and Google's `JobPosting` schema both branch
 * on, and a new row in a table could not teach either about a fifth kind.
 */
enum EmploymentType: string
{
    case FullTime = 'full_time';
    case PartTime = 'part_time';
    case Contract = 'contract';
    case Internship = 'internship';
    case Temporary = 'temporary';

    public function label(): string
    {
        return match ($this) {
            self::FullTime => 'Full time',
            self::PartTime => 'Part time',
            self::Contract => 'Contract',
            self::Internship => 'Internship',
            self::Temporary => 'Temporary',
        };
    }

    /**
     * The value schema.org's JobPosting expects.
     *
     * Google reads `employmentType` from a fixed vocabulary; our own snake_case
     * would be ignored, and a posting Google cannot parse is a posting nobody
     * searching for a job will see.
     */
    public function schemaValue(): string
    {
        return match ($this) {
            self::FullTime => 'FULL_TIME',
            self::PartTime => 'PART_TIME',
            self::Contract => 'CONTRACTOR',
            self::Internship => 'INTERN',
            self::Temporary => 'TEMPORARY',
        };
    }

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
