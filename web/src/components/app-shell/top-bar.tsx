import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import { TopBarEdge } from "./top-bar-edge";

/**
 * The glass bar the console and the portal share (Console 2.0).
 *
 * Translucent card over the page, blurred. Its hairline appears only once
 * the page has scrolled — a bar resting on the content needs no rule to
 * separate it — which `TopBarEdge` decides from the sentinel above it. Text
 * in it is graded against `--color-card`, so the contrast audit reads the
 * translucent ground as the solid card it composites to.
 */
export function TopBar({ brand, children, className, width }: {
  brand: ReactNode;
  children: ReactNode;
  className?: string;
  /** The area's container width, so the bar lines up with what is under it. */
  width?: string;
}) {
  return (
    <>
      <span data-topbar-sentinel aria-hidden className="block h-px" />
      <div
        data-topbar
        className={cn(
          "sticky top-0 z-30 -mt-px border-b border-transparent bg-card/80 backdrop-blur-[12px]",
          "transition-[border-color] duration-(--duration-base) data-[scrolled]:border-line",
          className,
        )}
      >
        <Container className={cn(width, "flex h-13 items-center gap-3")}>
          {brand}
          <div className="ml-auto flex min-w-0 items-center gap-1">{children}</div>
        </Container>
      </div>
      <TopBarEdge />
    </>
  );
}
