<?php

namespace App\Enums;

/**
 * Where a lead is in the pipeline.
 *
 * A PHP enum rather than a lookup table, the same call `TicketStatus` makes and
 * for the same reason: this is a fixed lifecycle that application code branches
 * on, not a list the client adds to. A new row in a table could not introduce a
 * new state without code to handle it anyway.
 */
enum LeadStatus: string
{
    case New = 'new';
    case Contacted = 'contacted';
    case Qualified = 'qualified';
    case Won = 'won';
    case Lost = 'lost';
    case Spam = 'spam';

    public function label(): string
    {
        return match ($this) {
            self::New => 'New',
            self::Contacted => 'Contacted',
            self::Qualified => 'Qualified',
            self::Won => 'Won',
            self::Lost => 'Lost',
            self::Spam => 'Spam',
        };
    }

    /** Still being worked. What the queue means by "there is something to do". */
    public static function openStates(): array
    {
        return [self::New, self::Contacted, self::Qualified];
    }

    public function isOpen(): bool
    {
        return in_array($this, self::openStates(), true);
    }

    /**
     * Permitted moves.
     *
     * Two rules that are decisions rather than bookkeeping:
     *
     * **`New` may go straight to `Won`.** Somebody who telephoned the moment
     * the enquiry landed and closed it that afternoon should not have to record
     * a "contacted" that never happened as a separate act, and a pipeline that
     * insists on the ceremony gets worked around by not being updated at all.
     *
     * **`Spam` is reversible, and that is the important one.** A misfiled real
     * enquiry is a customer nobody ever answers. `Won` returns to `Qualified`
     * for the same reason on a smaller scale — a mis-click on a terminal state
     * with no way back is a figure somebody has to correct in the database.
     */
    public function canTransitionTo(self $next): bool
    {
        return in_array($next, match ($this) {
            self::New => [self::Contacted, self::Qualified, self::Won, self::Lost, self::Spam],
            self::Contacted => [self::Qualified, self::Won, self::Lost, self::Spam],
            self::Qualified => [self::Contacted, self::Won, self::Lost],
            self::Won => [self::Qualified],
            self::Lost => [self::New, self::Contacted, self::Qualified],
            self::Spam => [self::New],
        }, true);
    }

    /**
     * Where this lead may actually go next, itself included.
     *
     * The console builds its dropdown from this rather than from every case,
     * because **a dropdown is a promise** — the argument `schema_type` already
     * settled here. Offering all six and refusing four of them with a 422 is a
     * form arguing with the person filling it in, and the refusal arrives only
     * after they have typed a note to go with it.
     *
     * The current status is first and always present: a select has to be able
     * to show what the record is now, and saving the panel without touching it
     * must not be a move at all.
     *
     * @return array<int, array{value: string, label: string}>
     */
    public function allowedNext(): array
    {
        $next = array_values(array_filter(self::cases(), fn (self $c) => $c !== $this && $this->canTransitionTo($c)));

        return array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label()],
            [$this, ...$next],
        );
    }

    /**
     * The options, for a console that must not hold its own copy of this list.
     *
     * The rule `schema_type_options` and `meta.transitions` already follow: two
     * hand-written lists of the same strings on opposite sides of the wire is
     * the drift nothing type-checks.
     */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'open' => $c->isOpen(),
        ], self::cases());
    }
}
