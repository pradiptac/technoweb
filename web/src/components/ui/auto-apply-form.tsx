"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A GET filter form that applies itself as it changes.
 *
 * Every list on the product — the catalogue, the shop, sixteen console
 * screens — collected a query, a couple of selects and a sort into a form
 * and waited for Apply, which was the fourth control in the row. Changing
 * the brand dropdown did nothing until it was pressed. This form listens to
 * its own controls by delegation, so the screens that use it need no wiring:
 * a select, a checkbox or a radio applies at once; a text box applies 300ms
 * after the last keystroke; Enter and the Apply button apply now. The URL
 * the form would have submitted is what is pushed, so the result is the
 * same shareable address either way and the back button still works — and
 * with JavaScript off the form is still a plain GET.
 *
 * `page` is dropped from what is pushed: filtering while on page three of an
 * unfiltered list would ask for page three of a two-page result and land on
 * an empty screen that reads as "nothing matched". Empty values are dropped
 * too, so "All" leaves no `status=` behind in the address.
 *
 * The push runs inside a transition, so the old list stays on screen until
 * the new one is ready rather than flashing, and `aria-busy` marks the form
 * while it waits — `globals.css` dims the submit button on it and the route
 * loader is already running from the router's own word.
 *
 * `text: false` keeps a text box on Enter only. The shop's search box has a
 * suggestion list under it, and navigating away while somebody is choosing
 * from that list would be the form arguing with the listbox.
 */
export function AutoApplyForm({
  action, text = true, delay = 300, className, children, ...rest
}: {
  action: string;
  text?: boolean;
  delay?: number;
  className?: string;
  children: ReactNode;
  role?: string;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const apply = useCallback((form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value !== "string" || value === "" || key === "page") continue;
      params.append(key, value);
    }
    const qs = params.toString();
    start(() => router.push(qs ? `${action}?${qs}` : action));
  }, [action, router]);

  useEffect(() => cancel, []);

  const onChange = (e: FormEvent<HTMLFormElement>) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const form = e.currentTarget;
    const immediate = target.tagName === "SELECT"
      || (target instanceof HTMLInputElement && (target.type === "checkbox" || target.type === "radio"));

    if (immediate) {
      cancel();
      apply(form);
      return;
    }

    if (!text) return;
    cancel();
    timer.current = setTimeout(() => apply(form), delay);
  };

  return (
    <form
      action={action}
      method="get"
      onChange={onChange}
      onSubmit={(e) => { e.preventDefault(); cancel(); apply(e.currentTarget); }}
      aria-busy={pending || undefined}
      className={cn(className, pending && "is-applying")}
      {...rest}
    >
      {children}
    </form>
  );
}
