import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { endImpersonationAction } from "../actions";
import type { Customer } from "@/types/api";

/**
 * The strip across the top of the portal while a staff member is viewing it
 * as a customer.
 *
 * Not an `Alert`: that is dismissible by default and turns into a toast
 * inside the console, and this must sit there for the whole session — the
 * tab looks exactly like the customer's own, and a staff member who has
 * forgotten which tab they are in is the failure the banner exists for.
 * The warn palette's own tokens (`Alert`'s `warn` tone), so it inverts with
 * the scheme and grades the same.
 *
 * `role="status"`, read once on arrival; the button is the one control and
 * ends the session properly — revokes the token, clears the cookie and
 * lands back on the customer's record in the console.
 */
export function ImpersonationBanner({ customer }: { customer: Customer }) {
  return (
    <div role="status" className="border-b border-warn/25 bg-warn-soft text-warn">
      <Container className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-13-5">
        <p className="min-w-0 font-medium">
          You are viewing the portal as <b className="font-semibold">{customer.name}</b> — staff.
          <span className="font-normal"> Everything you do here is done as them.</span>
        </p>
        <form action={endImpersonationAction} className="ml-auto">
          <Button type="submit" variant="secondary" size="sm">End</Button>
        </form>
      </Container>
    </div>
  );
}
