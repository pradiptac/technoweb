import { Container } from "@/components/ui/container";

/**
 * What a public page shows while its data is on the way, on a client
 * navigation: the hero band's shape and three card outlines, so the new
 * route appears at once rather than the old page holding until the whole
 * of the new one is ready. Every detail page is ISR-cached, so this is
 * mostly seen on the dynamic ones — the catalogue listing, search, the
 * store — and on a cold first request.
 *
 * `role="status"` with visible-to-AT text, not `aria-label` on a `div`: a
 * label on an element with no role is ignored by assistive technology.
 */
export default function MarketingLoading() {
  return (
    <div role="status" className="animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="bg-dark">
        <Container className="py-16">
          <div className="h-3 w-24 rounded bg-dark-2" />
          <div className="mt-5 h-10 w-2/3 max-w-[32rem] rounded bg-dark-2" />
          <div className="mt-4 h-5 w-1/2 max-w-[28rem] rounded bg-dark-2" />
        </Container>
      </div>
      <Container className="section-y">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 rounded-lg border border-line-strong bg-card" />
          ))}
        </div>
      </Container>
    </div>
  );
}
