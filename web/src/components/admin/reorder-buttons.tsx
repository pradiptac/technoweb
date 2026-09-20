import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Up / Down (and optionally Remove) for one row of a repeater.
 *
 * Seven console repeaters — form fields, gallery tabs and pictures, slides,
 * product images, spec rows, menu items, newsletter blocks — each drew their
 * own pair of arrows, two of them through a local `Move` component and the
 * rest through five `Button`s that agreed on everything but the sr-only
 * wording. One component, so the end-of-list disabling, the labels a screen
 * reader hears and the target size are decided once.
 *
 * `subject` is what is being moved, as a screen reader should hear it —
 * "field 3", "the Networking tab" — because "Move up" on its own, read out of
 * a list of twelve identical rows, moves *something*.
 *
 * `dense` is the 24px square for a row that already carries five controls
 * (the menu builder's indent/outdent, the block editor's edit toggle). 24px is
 * the audit's floor for a target with another inside 24px of its centre. The
 * default is the ghost `sm` Button the card-style repeaters use, which clears
 * 44px on its own.
 */
export function ReorderButtons({
  index, count, subject, onMove, onRemove, disabled, dense, children, className,
}: {
  index: number;
  count: number;
  subject: string;
  /** `-1` is up, `1` is down. */
  onMove: (delta: -1 | 1) => void;
  /** Rendered as a third button when given: "Remove <subject>". */
  onRemove?: () => void;
  disabled?: boolean;
  dense?: boolean;
  /** Extra controls rendered after the arrows (and Remove), in the same row. */
  children?: ReactNode;
  className?: string;
}) {
  const up = `Move ${subject} up`;
  const down = `Move ${subject} down`;
  const remove = `Remove ${subject}`;

  if (dense) {
    return (
      <span className={cn("flex shrink-0 items-center gap-0.5", className)}>
        <MoveButton label={up} onClick={() => onMove(-1)} disabled={disabled || index === 0}>↑</MoveButton>
        <MoveButton label={down} onClick={() => onMove(1)} disabled={disabled || index === count - 1}>↓</MoveButton>
        {onRemove && <MoveButton label={remove} onClick={onRemove} disabled={disabled}>✕</MoveButton>}
        {children}
      </span>
    );
  }

  return (
    <span className={cn("flex gap-1.5", className)}>
      <Button type="button" variant="ghost" size="sm" onClick={() => onMove(-1)} disabled={disabled || index === 0}>
        ↑<span className="sr-only">{up}</span>
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => onMove(1)} disabled={disabled || index === count - 1}>
        ↓<span className="sr-only">{down}</span>
      </Button>
      {onRemove && (
        <Button type="button" variant="ghost" size="sm" className="text-err" onClick={onRemove} disabled={disabled}>
          Remove<span className="sr-only"> {subject}</span>
        </Button>
      )}
      {children}
    </span>
  );
}

/** The 24px square `dense` is built from, for a row's other one-glyph controls. */
export function MoveButton({
  label, onClick, disabled, children, className,
}: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-6 place-items-center rounded text-13 text-muted hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35",
        className,
      )}
    >
      {children}
    </button>
  );
}
