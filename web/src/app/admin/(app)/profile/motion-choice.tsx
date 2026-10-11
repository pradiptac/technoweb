"use client";

import { setConsoleMotion, useConsoleMotion, type ConsoleMotion } from "@/lib/console-prefs";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CHOICES: { value: ConsoleMotion; label: string; blurb: string }[] = [
  { value: "full", label: "Full", blurb: "Things slide and fade as they change. Quick, and never on keyboard shortcuts." },
  { value: "subtle", label: "Subtle", blurb: "Only fades. Nothing moves across the screen." },
];

/**
 * This browser's choice (lib/console-prefs.ts). Somebody who has asked their
 * system for less motion gets the Subtle behaviour whatever is picked here.
 */
export function MotionChoice() {
  const motion = useConsoleMotion();
  return (
    <Card as="section" interactive={false} padding="sm" className="mt-6">
      <h2 className="text-15 font-semibold">Motion</h2>
      <p className="mt-1 text-13 text-muted">How much the console moves, in this browser.</p>
      <div role="radiogroup" aria-label="Motion" className="mt-3 grid gap-2 sm:grid-cols-2">
        {CHOICES.map((c) => (
          <label
            key={c.value}
            className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", motion === c.value ? "border-brand-600 bg-brand-50" : "border-line-strong bg-card")}
          >
            <input
              type="radio" name="console-motion" value={c.value}
              checked={motion === c.value} onChange={() => setConsoleMotion(c.value)}
              className="mt-1 accent-brand-600"
            />
            <span>
              <span className="block text-13-5 font-semibold">{c.label}</span>
              <span className="block text-12-5 text-muted">{c.blurb}</span>
            </span>
          </label>
        ))}
      </div>
    </Card>
  );
}
