import { Button } from "@/components/ui/button";
import type { AdminCustomer } from "@/types/api";

/**
 * "View as": open the portal as this customer, in a new tab.
 *
 * A plain form, deliberately three ways. **A form, not a link**: the route
 * handler is POST-only because both session cookies are `sameSite: "lax"` —
 * a cross-site POST arrives without the admin cookie and is refused, where a
 * cross-site top-level GET would carry it and mint a token; `route.ts` has
 * the whole argument. **Not a `Link`**, because a `next/link` at a route
 * handler prefetches it. **`target="_blank"`** on the form itself, which is
 * what opens the 303 in a new tab with no JavaScript, so the console's own
 * tab keeps its place in the list.
 *
 * Offered for an active account only; the API refuses every other status
 * with a sentence, and a button that opens a tab saying "no" is worse than
 * no button.
 */
export function ViewAsForm({ customer, size = "sm", variant = "ghost", label = "View as" }: {
  customer: Pick<AdminCustomer, "id" | "status" | "name">;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary";
  label?: string;
}) {
  if (customer.status !== "active") return null;

  return (
    <form method="post" action={`/api/admin/customers/${customer.id}/impersonate`} target="_blank" className="inline">
      <Button type="submit" variant={variant} size={size} title={`Open the portal as ${customer.name} in a new tab`}>
        {label}
      </Button>
    </form>
  );
}
