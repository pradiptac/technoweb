import { BasketBar } from "@/components/store/basket-bar";

/**
 * The shop's own strip, above every page under /store.
 *
 * A layout rather than a component pasted into three pages, for the reason the
 * newsletter's nav exists: the basket has to be reachable from wherever
 * somebody is shopping, and "remember to add the bar" is not a mechanism.
 *
 * `/cart` deliberately sits outside this segment — it *is* the basket, and a
 * strip saying what is in the basket above the basket is noise.
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BasketBar />
      {children}
    </>
  );
}
