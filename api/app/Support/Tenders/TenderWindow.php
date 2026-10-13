<?php

namespace App\Support\Tenders;

use App\Models\Tender;
use Carbon\CarbonInterface;

/**
 * Whether a tender is taking bids right now — **the one definition** of
 * upcoming, open, closing soon and closed.
 *
 * Three things ask this question and must not give three answers: the public
 * resource (which a cached page renders from), the state endpoint the page's
 * badge re-asks after mount, and the console's own badge. So they all build
 * one of these, from the tender and the clock.
 *
 * It is the `App\Support\Events\Availability` shape, and for the same
 * reason. A closing date is a deadline: a bidder who reads "open" on a
 * tender that shut yesterday has been told something that costs them real
 * work, so there is exactly one place that decides it and the answer is
 * computed from `now()` every time it is asked rather than stored in a
 * column that would drift from the clock the moment it was written.
 *
 * The order of the checks is the order of the reasons a person would be
 * given: a notice that has not opened yet; one whose date has passed; then
 * how near the deadline is.
 */
final class TenderWindow
{
    /** Published, but not open for bids yet. */
    public const UPCOMING = 'upcoming';

    public const OPEN = 'open';

    /** Open, and `Tender::CLOSING_SOON_DAYS` or less to go. */
    public const CLOSING_SOON = 'closing_soon';

    public const CLOSED = 'closed';

    private function __construct(
        public readonly string $state,
        /**
         * Calendar days from today to the closing day, in `APP_TIMEZONE`:
         * 0 means it closes today, 1 tomorrow. Null once it has closed, or
         * before it opens.
         */
        public readonly ?int $daysLeft,
    ) {}

    public static function for(Tender $tender, ?CarbonInterface $now = null): self
    {
        $now ??= now();

        if ($tender->closes_at->lte($now)) {
            return new self(self::CLOSED, null);
        }

        if ($tender->opens_at->gt($now)) {
            return new self(self::UPCOMING, null);
        }

        // **Calendar days in the app's zone, not 24-hour blocks.** A bidder
        // reads "2 days left" as "the day after tomorrow", so a deadline at
        // 6pm tomorrow is 1 whatever the time now — counting in blocks of 24
        // hours calls that 0 at 7pm today and 1 at 5pm today, which is the
        // same deadline described two ways within one evening.
        $days = (int) TenderText::local($now)->startOfDay()
            ->diffInDays(TenderText::local($tender->closes_at)->startOfDay(), true);

        return new self(
            $days <= Tender::CLOSING_SOON_DAYS ? self::CLOSING_SOON : self::OPEN,
            $days,
        );
    }

    public function isClosed(): bool
    {
        return $this->state === self::CLOSED;
    }

    /** Whether a bid could be submitted now — `open` or `closing_soon`. */
    public function isOpen(): bool
    {
        return $this->state === self::OPEN || $this->state === self::CLOSING_SOON;
    }

    /** The chip on the page: "Open", "Closing soon", "Closed", "Opens soon". */
    public function label(): string
    {
        return match ($this->state) {
            self::UPCOMING => 'Opens soon',
            self::OPEN => 'Open',
            self::CLOSING_SOON => 'Closing soon',
            default => 'Closed',
        };
    }

    /**
     * The line under it: "3 days left", "Closes tomorrow", "Closes today".
     *
     * Null for a tender that has closed or has not opened — there is a date
     * to read in both cases and a countdown would be noise.
     */
    public function countdownLabel(): ?string
    {
        if (! $this->isOpen() || $this->daysLeft === null) {
            return null;
        }

        return match ($this->daysLeft) {
            0 => 'Closes today',
            1 => 'Closes tomorrow',
            default => $this->daysLeft.' days left',
        };
    }

    /**
     * What the state endpoint sends, and what rides on every public read.
     *
     * @return array{state: string, state_label: string, closes_in_label: string|null, closed: bool}
     */
    public function toArray(): array
    {
        return [
            'state' => $this->state,
            'state_label' => $this->label(),
            'closes_in_label' => $this->countdownLabel(),
            'closed' => $this->isClosed(),
        ];
    }
}
