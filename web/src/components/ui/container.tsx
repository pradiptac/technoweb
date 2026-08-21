import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/**
 * The 90% width doubles as the side gutter, so there is no horizontal
 * padding on top of it — adding both would gutter the content twice and
 * squeeze small screens. At 360px this leaves 324px of content, near
 * identical to the 320px the previous full-width-plus-px-5 gave.
 *
 * Forwards any other div attribute, so callers can pass `id`, `data-aos`
 * and friends. It previously accepted only className/children and silently
 * dropped everything else.
 */
export function Container({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("mx-auto w-[90%] max-w-[1920px]", className)} {...props}>
      {children}
    </div>
  );
}
