import { OrderReturns } from "@/components/store/order-returns";
import { ReturnForm, type ReturnFormState } from "@/components/store/return-form";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/api";

/**
 * "Returns" on a customer's order page (docs/store.md "Returns"): what they
 * have already asked to send back, and — while the order is inside its
 * window — the form to ask for more.
 *
 * Nothing is drawn for an order that has not left yet and has no returns:
 * a paragraph about returns on a basket somebody has just paid for is noise.
 * Once it has been dispatched the section is always there, with the form or
 * with the one sentence the API gives for why there is none (the window has
 * closed; everything has been returned).
 *
 * The form sits in a `<details>`, closed: most people opening an order are
 * not returning it, and a disclosure works before any script has loaded.
 */
export function ReturnsSection({
  order, action, uploadUrl, loginPath, className,
}: {
  order: Order;
  action: (prev: ReturnFormState, formData: FormData) => Promise<ReturnFormState>;
  uploadUrl: string;
  loginPath?: string;
  className?: string;
}) {
  const policy = order.return_policy;
  const returns = order.returns ?? [];

  if (!policy) return null;

  const delivered = Boolean(order.dispatched_at) && policy.enabled;
  if (returns.length === 0 && !policy.open && !delivered) return null;

  return (
    <section id="returns" className={cn("scroll-mt-24 rounded-lg border border-line-strong bg-card p-5", className)}>
      <h2 className="text-15 font-semibold">Returns</h2>

      {returns.length > 0 && (
        <div className="mt-3">
          <OrderReturns returns={returns} />
        </div>
      )}

      {policy.open ? (
        <details className="group mt-3">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded border border-line-strong px-4 text-13-5 font-semibold text-ink transition-colors duration-(--duration-base) hover:border-brand-ink hover:text-brand-ink [&::-webkit-details-marker]:hidden">
            {returns.length > 0 ? "Return something else" : "Return items"}
          </summary>
          <div className="mt-4">
            {policy.closes_label && (
              <p className="mb-4 text-13 text-muted">
                This order can be returned until <span className="font-semibold text-ink-2">{policy.closes_label}</span>.
                Items marked non-returnable, and licence keys, cannot come back.
              </p>
            )}
            <ReturnForm order={order} policy={policy} action={action} uploadUrl={uploadUrl} loginPath={loginPath} />
          </div>
        </details>
      ) : (
        policy.message && <p className="mt-2 text-13-5 text-muted">{policy.message}</p>
      )}
    </section>
  );
}
