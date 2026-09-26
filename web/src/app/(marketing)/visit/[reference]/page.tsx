import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Card } from "@/components/ui/card";
import { VisitSummary } from "@/components/visits/visit-summary";
import { VisitManage } from "@/components/visits/visit-manage";
import { getGuestVisit, getVisitOptions, guestToken } from "@/lib/visits";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cancelGuestVisitAction, rescheduleGuestVisitAction } from "./actions";
import type { CustomerVisit } from "@/types/api";

/** One person's request, opened by a secret in a cookie. Nothing here may be cached. */
export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "Your visit request", path: "/visit", seo: noIndex });

/**
 * A guest's own visit request (docs/visits.md). Reached through the link in
 * the email, which lands on `/visit/{reference}/open?token=…`; that route
 * handler moved the token into a cookie scoped to this path and sent the
 * browser here, so the address bar never holds it. No cookie, a wrong one or
 * a wrong reference is the same not-found.
 */
export default async function GuestVisitPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const token = await guestToken(reference);

  if (!token) notFound();

  let visit: CustomerVisit;

  try {
    visit = await getGuestVisit(reference, token);
  } catch {
    notFound();
  }

  const rules = await getVisitOptions().catch(() => null);

  return (
    <>
      <PageHero
        section="support"
        kicker="Engineer visit"
        title={`Visit ${visit.reference}`}
        crumbs={[{ name: "Support", path: "/support" }]}
      />

      <section className="section-y">
        <Container>
          <div className="grid max-w-3xl gap-6">
            <Card as="section" interactive={false}>
              <h2 className="sr-only">Your request</h2>
              <VisitSummary visit={visit} />
            </Card>

            <VisitManage
              visit={visit}
              rules={rules}
              cancelAction={cancelGuestVisitAction.bind(null, visit.reference)}
              rescheduleAction={rescheduleGuestVisitAction.bind(null, visit.reference)}
            />

            <p className="text-14 text-muted">
              Requests made while signed in to the portal are listed under{" "}
              <Link href="/portal/visits" className="font-semibold text-brand-ink underline">My visits</Link>.
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
