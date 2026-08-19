import { cn } from "@/lib/utils";

/**
 * Wordmark. Placeholder until the real logo file is supplied — the split
 * black/olive treatment matches the supplied artwork.
 */
export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn("font-display text-[23px] font-bold leading-none tracking-[-.045em]", className)}>
      <span className={onDark ? "text-white" : "text-ink"}>TECHNO</span>
      <span className={onDark ? "text-brand-400" : "text-brand-600"}>WARE</span>
    </span>
  );
}
