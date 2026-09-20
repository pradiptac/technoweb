"use client";

/**
 * Velora `dock` — https://velora.colorlib.com/r/dock.json, installed
 * 2026-09-14 (Velora by Colorlib, built on `motion`). As published, with
 * shadcn's tokens mapped to this theme's (`bg-muted` here is a *text*
 * colour, so the icon disc is `bg-surface-2`) and `aria-label` dropped from
 * `DockIcon`: it is a `div`, and the footer puts a real `<a>` with its own
 * name inside each one, which is what a screen reader should find.
 *
 * The magnification animates `width` and `height` — the one place on the
 * site that does. It is the published mechanism and it is what the effect
 * *is*; the icons are 40–64px discs, so the reflow is a row of six.
 */
import { createContext, useContext, useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { cn } from "@/lib/utils";

interface DockContextValue {
  mouseX: MotionValue<number>;
  baseSize: number;
  magnification: number;
  distance: number;
}

const DockContext = createContext<DockContextValue | null>(null);

interface DockProps {
  children: ReactNode;
  className?: string;
  /** Icon size at rest, px */
  baseSize?: number;
  /** Icon size under the cursor, px */
  magnification?: number;
  /** Cursor influence radius, px */
  distance?: number;
}

export function Dock({
  children,
  className,
  baseSize = 40,
  magnification = 64,
  distance = 140,
}: DockProps) {
  const mouseX = useMotionValue(Infinity);

  return (
    <DockContext.Provider value={{ mouseX, baseSize, magnification, distance }}>
      <motion.div
        data-slot="dock"
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className={cn(
          "mx-auto flex h-16 w-fit items-end gap-2 rounded-2xl border border-line-strong bg-card/70 px-3 pb-2 backdrop-blur-xl",
          className
        )}
      >
        {children}
      </motion.div>
    </DockContext.Provider>
  );
}

interface DockIconProps {
  children: ReactNode;
  className?: string;
}

export function DockIcon({ children, className }: DockIconProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const fallbackX = useMotionValue(Infinity);
  const ctx = useContext(DockContext);
  const mouseX = ctx?.mouseX ?? fallbackX;
  const baseSize = ctx?.baseSize ?? 40;
  const magnification = ctx?.magnification ?? 64;
  const distance = ctx?.distance ?? 140;

  const distanceFromCursor = useTransform(mouseX, (x) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return x - bounds.x - bounds.width / 2;
  });

  const sizeTarget = useTransform(
    distanceFromCursor,
    [-distance, 0, distance],
    [baseSize, magnification, baseSize]
  );
  const size = useSpring(sizeTarget, {
    mass: 0.1,
    stiffness: 160,
    damping: 13,
  });

  return (
    <motion.div
      ref={ref}
      data-slot="dock-icon"
      style={
        reducedMotion
          ? { width: baseSize, height: baseSize }
          : { width: size, height: size }
      }
      className={cn(
        "flex aspect-square cursor-pointer items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:text-ink",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
