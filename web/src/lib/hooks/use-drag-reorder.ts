import { useState, type DragEvent } from "react";

/** A place in a list: which list (`scope`, a key the caller chooses) and the position in it. */
export type DragSpot = { scope: string; index: number };

type Held<T> = DragSpot & { item: T };

/** `list` with item `from` moved to gap `to` (0..length, counted before the item leaves). */
export function reinsert<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to > from ? to - 1 : to, 0, item);
  return next;
}

/**
 * HTML drag and drop for reordering lists, extracted from the section builder
 * (0.155.0) so the layout editor's rows, columns and container slots share one
 * mechanism.
 *
 * **A list is a scope** — any string the caller picks. Every position is a
 * *gap*: `index` is the gap before item `index`, and `length` the gap after
 * the last, chosen from the pointer's half of the item it is over. `onMove`
 * receives the gap in the target list as it was before the held item left
 * (use `reinsert` for a move inside one list).
 *
 * **Refusal** is `accepts(sourceScope, targetScope, item)`: a target that
 * refuses is not a drop target at all (no `preventDefault`, so the browser
 * shows "not allowed") and draws no line. By default only the held item's own
 * list accepts it. A move that would change nothing (the gap beside the held
 * item) draws no line either.
 *
 * Nested lists: the innermost target handles the event and stops it, so an
 * outer list never answers for a pointer that is over an inner one — even
 * when the inner one refuses.
 *
 * Touch screens fire no HTML drag events; the arrows stay for them and for
 * the keyboard, and the handle is hidden below `sm` by its caller.
 */
export function useDragReorder<T>({ accepts, onMove }: {
  accepts?: (source: string, target: string, item: T) => boolean;
  onMove: (from: DragSpot, to: DragSpot, item: T) => void;
}) {
  const [held, setHeld] = useState<Held<T> | null>(null);
  const [over, setOver] = useState<DragSpot | null>(null);

  const allows = (to: DragSpot) => (held ? (accepts ? accepts(held.scope, to.scope, held.item) : held.scope === to.scope) : false);
  const idle = (to: DragSpot) => held !== null && held.scope === to.scope && (to.index === held.index || to.index === held.index + 1);
  const clear = () => { setHeld(null); setOver(null); };

  const hover = (e: DragEvent, to: DragSpot) => {
    if (!held) return; // a file or text from elsewhere: not ours
    e.stopPropagation();
    if (!allows(to)) { setOver(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOver((o) => (o && o.scope === to.scope && o.index === to.index ? o : to));
  };
  const release = (e: DragEvent, to: DragSpot) => {
    if (!held) return;
    e.preventDefault();
    e.stopPropagation();
    const from = held;
    clear();
    if (allows(to) && !idle(to)) onMove({ scope: from.scope, index: from.index }, to, from.item);
  };
  const gap = (e: DragEvent, scope: string, index: number): DragSpot => {
    const box = e.currentTarget.getBoundingClientRect();
    return { scope, index: e.clientY > box.top + box.height / 2 ? index + 1 : index };
  };

  return {
    /** Spread on the grip: makes it draggable and starts the drag with `item`. */
    handle: (scope: string, index: number, item: T) => ({
      draggable: true as const,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", `${scope}:${index}`);
        setHeld({ scope, index, item });
      },
      onDragEnd: clear,
    }),
    /** Spread on an item's element: the pointer's half decides the gap before or after it. */
    target: (scope: string, index: number) => ({
      onDragOver: (e: DragEvent) => hover(e, gap(e, scope, index)),
      onDrop: (e: DragEvent) => release(e, gap(e, scope, index)),
    }),
    /** Spread on an *empty* list's element, which has no item to be over; a list with items answers `{}`. */
    list: (scope: string, length: number) => (length > 0 ? {} : {
      onDragOver: (e: DragEvent) => hover(e, { scope, index: 0 }),
      onDrop: (e: DragEvent) => release(e, { scope, index: 0 }),
    }),
    /** Spread on an ancestor of every list: a pointer over none of them withdraws the drop line. */
    root: { onDragOver: () => { if (held && over) setOver(null); } },
    /** Whether a drop line belongs in gap `index` of `scope`: an accepted target that would change something. */
    line: (scope: string, index: number) => over !== null && over.scope === scope && over.index === index && allows(over) && !idle(over),
    /** Whether this very item is the one held. */
    dragging: (scope: string, index: number) => held !== null && held.scope === scope && held.index === index,
  };
}
