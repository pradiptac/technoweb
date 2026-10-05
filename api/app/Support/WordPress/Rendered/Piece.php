<?php

namespace App\Support\WordPress\Rendered;

/**
 * One thing a recogniser found on a rendered page, before it is a section:
 * its kind, its items (a plan, a figure, a question), or its data for a kind
 * that is one thing (a call to action, a video), and the markup it came from
 * — which is what the page keeps, as text, if the thing does not pass its
 * section's rules.
 */
final class Piece
{
    /** Kinds whose neighbours are one section: three price tables are one block of three plans. */
    public const MERGES = ['pricing', 'testimonial', 'figures', 'bars', 'faq', 'features', 'checklist', 'timeline', 'steps'];

    /**
     * @param  list<array<string, mixed>>  $items
     * @param  array<string, mixed>  $data
     */
    public function __construct(
        public string $kind,
        public array $items = [],
        public array $data = [],
        public ?string $heading = null,
        public string $html = '',
    ) {}

    /** Whether this piece and `$next` are one section. */
    public function joins(self $next): bool
    {
        return $this->kind === $next->kind && in_array($this->kind, self::MERGES, true) && $next->heading === null;
    }

    public function absorb(self $next): void
    {
        $this->items = [...$this->items, ...$next->items];
        $this->html .= $next->html;
    }
}
