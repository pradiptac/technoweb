import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty";
import { VisitSummary } from "@/components/visits/visit-summary";
import { VisitManage } from "@/components/visits/visit-manage";
import { ApiError } from "@/lib/api";
import { getMyVisit } from "@/lib/portal";
import { getVisitOptions } from "@/lib/visits";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cancelMyVisitAction, rescheduleMyVisitAction } from "../actions";
import type { CustomerVisit } from "@/types/api";

export const metadata = buildMetadata({ title: "Your visit", path: "/portal/visits", seo: noIndex });

export default async function PortalVisitPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;

  let visit: CustomerVisit;

  try {
    visit = await getMyVisit(reference);
  } catch (error) {
    // Another customer's request is a 404 from the API, never a 403.
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load that visit">
        Try again shortly, or call us and we will look it up.
      </ErrorState>
    );
  }

  const rules = await getVisitOptions().catch(() => null);

  return (
    <>
      <p className="mb-2 text-13">
        <Link href="/portal/visits" className="text-brand-ink underline">← Your visits</Link>
      </p>
      <h2 className="display-3 mb-4">Visit <span className="font-mono">{visit.reference}</span></h2>

      <div className="grid max-w-3xl gap-6">
        <Card as="section" interactive={false}>
          <h2 className="sr-only">The request</h2>
          <VisitSummary visit={visit} />
        </Card>

        <VisitManage
          visit={visit}
          rules={rules}
          cancelAction={cancelMyVisitAction.bind(null, visit.reference)}
          rescheduleAction={rescheduleMyVisitAction.bind(null, visit.reference)}
        />
      </div>
    </>
  );
}
