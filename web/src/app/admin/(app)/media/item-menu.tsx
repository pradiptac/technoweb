"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { IconClose } from "@/components/icons";

export type MenuAction = {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  /** Renders in the destructive colour and sits below a divider. */
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

/**
 * The per-item menu, opened three ways.
 *
 * The reference design opens this on right-click. That alone would put every
 * action on this screen out of reach of a touch device and a keyboard, so the
 * same menu is also on a visible button — right-click stays as the shortcut
 * it is, rather than being the only way in.
 *
 * Positioned at the pointer for a right-click and against the button
 * otherwise, clamped so it cannot open off the edge of the window.
 */
export function ItemMenu({
  label, actions, children,
}: {
  /** Names the thing being acted on, for the button's accessible name. */
  label: string;
  actions: MenuAction[];
  children: React.ReactNode;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const open = at !== null;

  useEffect(() => {
    if (!open) return;

    const close = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      setAt(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAt(null);
        triggerRef.current?.focus();
      }
    };

    // `true` so a click anywhere closes it before that click does anything
    // else — including a click on another item's menu button.
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", () => setAt(null));
    window.addEventListener("scroll", () => setAt(null), true);

    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus the first item so the keyboard has somewhere to land.
  useEffect(() => {
    if (open) menuRef.current?.querySelector("button")?.focus();
  }, [open]);

  const openAt = (x: number, y: number) => {
    const w = 208;
    const h = actions.length * 38 + 16;
    setAt({
      x: Math.min(x, window.innerWidth - w - 8),
      y: Math.min(y, window.innerHeight - h - 8),
    });
  };

  return (
    <>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          openAt(e.clientX, e.clientY);
        }}
        className="contents"
      >
        {children}
      </div>

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          openAt(r.left, r.bottom + 4);
        }}
        // Over the tile's top-right corner rather than in the flow: the card
        // is a picture with a caption, and a button in the caption row reads
        // as being about the caption.
        className="absolute top-2 right-2 z-10 grid size-8 cursor-pointer place-items-center rounded border border-line-strong bg-card/95 text-muted shadow-1 backdrop-blur-[4px] hover:border-faint hover:text-ink"
      >
        <span aria-hidden className="text-[15px] leading-none">⋯</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${label}`}
          style={{ left: at.x, top: at.y }}
          className="fixed z-50 w-52 rounded-lg border border-line-strong bg-card py-1.5 shadow-3"
        >
          {actions.map((a, i) => (
            <div key={a.label}>
              {a.danger && i > 0 && <div className="my-1.5 border-t border-line" />}
              <button
                type="button"
                role="menuitem"
                disabled={a.disabled}
                title={a.disabled ? a.disabledReason : undefined}
                onClick={() => {
                  setAt(null);
                  a.onSelect();
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-[13.5px]",
                  "[&_svg]:size-4 [&_svg]:shrink-0",
                  a.disabled
                    ? "cursor-not-allowed text-faint"
                    : a.danger
                      ? "text-err hover:bg-err-soft"
                      : "text-ink hover:bg-surface-2",
                )}
              >
                {a.icon}
                {a.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** A small modal, used by rename and resize. */
export function Dialog({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;

      const items = [...(ref.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea',
      ) ?? [])].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (!ref.current?.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    // Same lesson as the site header's drawer: focus on the next frame, once
    // the element can actually take it.
    const raf = requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    });

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-xl border border-line-strong bg-card shadow-3"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15.5px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 cursor-pointer place-items-center rounded border border-line-strong text-muted hover:text-ink"
          >
            <IconClose className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
