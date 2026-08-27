import { PageHeader } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { getLandingOpportunities } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { draftOpportunityAction } from "../actions";
import type { LandingOpportunity } from "@/types/api";

export const metadata = buildMetadata({
  title: "Landing page opportunities", path: "/admin/landing-pages/opportunities", seo: noIndex,
});

/**
 * The combinations the catalogue supports that do not have a page yet.
 *
 * This screen is the safety argument made visible. An editor choosing from a
 * list the data produced cannot invent "Cisco firewalls in Kolkata" for a
 * category holding nothing and a city nobody has been to — the combination is
 * simply not on the screen. The alternative shape, a form with a brand picker
 * and a city picker, is a doorway-page generator with a nice interface.
 *
 * Everything here creates a **draft with no introduction**, which is precisely
 * a page the quality gate refuses to publish. This button is safe to press
 * repeatedly; it cannot put anything on the public site.
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const flags = await searchParams;

  let result: Awaited<ReturnType<typeof getLandingOpportunities>>;
  try {
    result = await getLandingOpportunities();
  } catch {
    return <ErrorState title="We could not load the opportunities">The admin API is not responding.</ErrorState>;
  }

  const { data, meta } = result;
  const room = meta.cap - meta.published;

  return (
    <>
      <PageHeader
        title="Opportunities"
        back={{ href: "/admin/landing-pages", label: "Landing pages" }}
        lede={<>
          Combinations the catalogue already supports and nothing covers yet.
          A pairing appears here only once at least {meta.min_products} published
          products stand behind it, or — for a place — once somebody has recorded
          something concrete about working there.
        </>}
      />

      {flags.failed && (
        <Alert tone="err" title="That could not be drafted">
          Something rejected it. It may already exist under a different name.
        </Alert>
      )}

      <Alert tone="info" title={`${meta.published} of ${meta.cap} landing pages published`}>
        {room > 0
          ? `Room for ${room} more. Each draft still has to be written before it can go live.`
          : "The limit is reached — nothing more can be published until one is retired or the limit is raised in Settings."}
      </Alert>

      {data.length === 0 ? (
        <EmptyState title="Nothing to propose">
          Every combination the catalogue supports already has a page. More will
          appear here as the catalogue grows — the list is built from what is in
          stock, not from what could be typed.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[720px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[11.5px] uppercase tracking-wide text-faint">
                <th className="py-2.5 pr-3 font-semibold">Proposed page</th>
                <th className="py-2.5 pr-3 font-semibold">Evidence</th>
                <th className="py-2.5 pr-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {data.map((o: LandingOpportunity) => (
                <tr key={o.key} className="border-b border-line align-middle">
                  <td className="py-3 pr-3" data-label="Proposed page">
                    <p className="font-medium text-ink">{o.title}</p>
                    <p className="mt-0.5 break-all font-mono text-[12px] text-muted">{o.path}</p>
                  </td>
                  <td className="py-3 pr-3 text-muted" data-label="Evidence">
                    {Number(o.evidence.products) > 0
                      ? `${o.evidence.products} published products`
                      : "Local detail on record"}
                  </td>
                  <td className="py-3 pr-3" data-label="">
                    <form action={draftOpportunityAction}>
                      <input type="hidden" name="kind" value={o.kind} />
                      <input type="hidden" name="brand_id" value={o.brand_id ?? ""} />
                      <input type="hidden" name="product_category_id" value={o.product_category_id ?? ""} />
                      <input type="hidden" name="solution_id" value={o.solution_id ?? ""} />
                      <input type="hidden" name="service_id" value={o.service_id ?? ""} />
                      <input type="hidden" name="location_id" value={o.location_id ?? ""} />
                      <input type="hidden" name="title" value={o.title} />
                      <input type="hidden" name="heading" value={o.heading} />
                      <Button type="submit" size="sm" variant="secondary">Create draft</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        Why a place was passed over. "No opportunities" from a console listing
        three cities reads as a broken feature; the real answer is nearly always
        that nobody has written the local detail yet, and saying so turns a dead
        end into a next step.
      */}
      {meta.skipped_locations.length > 0 && (
        <div className="mt-8 rounded-lg border border-line bg-surface p-5">
          <h2 className="text-[14px] font-semibold text-ink">Places not offered yet</h2>
          <ul className="mt-2.5 grid gap-1.5">
            {meta.skipped_locations.map((line) => (
              <li key={line} className="measure text-[13px] text-muted">{line}</li>
            ))}
          </ul>
          <ButtonLink href="/admin/locations" size="sm" variant="secondary" className="mt-4">
            Edit places
          </ButtonLink>
        </div>
      )}
    </>
  );
}
