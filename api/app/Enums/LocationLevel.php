<?php

namespace App\Enums;

/**
 * How far down the tree a place sits.
 *
 * An enum rather than an integer depth, because the depth of a row is a fact
 * about where somebody filed it and the *kind* of place is a fact about the
 * world — a neighbourhood filed directly under a state is still a
 * neighbourhood, and a page about it should read like one. Code branches on
 * this too: a state page rolls up its cities, a city page lists the services
 * offered there, and the structured data differs between them.
 *
 * Country is included and is usually the one nobody uses. A single-country
 * business has no reason to create it, and `parent_id` is nullable so a state
 * can be a root. It exists because leaving it out is the kind of decision that
 * has to be undone the first time somebody opens an office abroad.
 */
enum LocationLevel: string
{
    case Country = 'country';
    case State = 'state';
    case City = 'city';
    case Area = 'area';

    public function label(): string
    {
        return match ($this) {
            self::Country => 'Country',
            self::State => 'State or region',
            self::City => 'City or district',
            self::Area => 'Area or neighbourhood',
        };
    }

    /**
     * How deep this sits. Only ever compared, never stored.
     *
     * Keeping it out of the database is deliberate: a stored depth is a second
     * copy of what `parent_id` already says, and the two disagree the first
     * time a subtree is moved.
     */
    public function depth(): int
    {
        return match ($this) {
            self::Country => 0,
            self::State => 1,
            self::City => 2,
            self::Area => 3,
        };
    }

    /**
     * Whether this may sit under that.
     *
     * Strictly deeper, not "exactly one deeper". A city directly under a
     * country is ordinary — plenty of places have no meaningful state — and
     * forcing an invented intermediate row to satisfy a rule produces a page
     * about a region nobody would ever search for.
     */
    public function canSitUnder(?self $parent): bool
    {
        return $parent === null || $this->depth() > $parent->depth();
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
