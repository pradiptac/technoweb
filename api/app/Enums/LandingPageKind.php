<?php

namespace App\Enums;

/**
 * The shapes of programmatic landing page this site will produce.
 *
 * An enum rather than a lookup table — the same call as `TicketStatus`, for the
 * reason that decision gives. Code branches on every one of these: each kind
 * has its own evidence rule, its own path, its own structured data and its own
 * set of required relations. A row in a table could not introduce a new kind
 * without code, so a table would only be a second place for the list to be
 * wrong.
 *
 * Four, and deliberately not more. Every additional axis multiplies rather than
 * adds — brand x category x location is not three pages, it is however many
 * brands times however many categories times however many cities, and that
 * number is a doorway-page generator with a business plan. If a fifth is ever
 * wanted, the question to answer first is what it would say that none of these
 * four already says.
 */
enum LandingPageKind: string
{
    /** Cisco Network Switches — a brand's stock within one category. */
    case BrandCategory = 'brand_category';

    /** Cisco Wi-Fi Solutions — a brand's stock behind one solution. */
    case BrandSolution = 'brand_solution';

    /** A brand's whole catalogue here. Also what makes /brands/{slug} real. */
    case Brand = 'brand';

    /** Firewall Installation in Kolkata. */
    case ServiceLocation = 'service_location';

    /** Network Installation in Kolkata. */
    case SolutionLocation = 'solution_location';

    /** Everything we do in Kolkata. */
    case Location = 'location';

    public function label(): string
    {
        return match ($this) {
            self::Brand => 'Brand',
            self::BrandCategory => 'Brand in a category',
            self::BrandSolution => 'Brand in a solution',
            self::Location => 'Location',
            self::ServiceLocation => 'Service in a location',
            self::SolutionLocation => 'Solution in a location',
        };
    }

    /**
     * Which relations a page of this kind must have.
     *
     * Used to validate on write and to build the path, so a page cannot exist
     * half-addressed — a `brand_category` row with no category has no URL it
     * could live at.
     *
     * @return array<int, string>
     */
    public function requires(): array
    {
        return match ($this) {
            self::Brand => ['brand_id'],
            self::BrandCategory => ['brand_id', 'product_category_id'],
            self::BrandSolution => ['brand_id', 'solution_id'],
            self::Location => ['location_id'],
            self::ServiceLocation => ['location_id', 'service_id'],
            self::SolutionLocation => ['location_id', 'solution_id'],
        };
    }

    /**
     * Whether this kind claims the company works in a named place.
     *
     * The whole location family is held to a stricter bar than the catalogue
     * family, because the failure modes differ in kind and not in degree. A
     * thin brand page is a weak page about hardware that genuinely exists. A
     * thin location page is a claim to serve a city, made to rank for it —
     * which is the doorway pattern in its textbook form and, if the company
     * does not actually attend sites there, untrue as well.
     */
    public function isLocal(): bool
    {
        return in_array($this, [self::Location, self::ServiceLocation, self::SolutionLocation], true);
    }

    /** The catalogue family, whose evidence is a count of products. */
    public function isCatalogue(): bool
    {
        return ! $this->isLocal();
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
