import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { Tabs } from "@/components/admin/tabs";
import {
  getNewsletterGroups, getNewsletterSequence, getNewsletterTemplates, getSequenceEnrolments, getSequenceReport,
} from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SequenceSettingsForm } from "../sequence-settings-form";
import { SequenceStatusControls } from "./sequence-status-controls";
import { StepsPanel } from "./steps-panel";
import { EnrolmentsPanel } from "./enrolments-panel";
import { ReportPanel } from "./report-panel";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Sequence", path: "/admin/newsletter/sequences", seo: noIndex });

/**
 * One sequence: Settings, Steps, Enrolments, Report.
 *
 * Four panels in one `Tabs`, and — unlike the entity forms — not one form:
 * each panel saves through its own action, so nothing typed on one tab is
 * at the mercy of another. `?tab=` opens the panel a link means (creating a
 * sequence lands on Steps; the enrolments filter keeps its tab), which is
 * what `Tabs` reads once and never writes back.
 */
export default async function SequencePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; status?: string; page?: string; per_page?: string }>;
}) {
  await requireScreen();
  const { id } = await params;
  const query = await searchParams;

  let sequence, groups, templates, enrolments, report;

  try {
    [sequence, groups, templates, enrolments, report] = await Promise.all([
      getNewsletterSequence(Number(id)),
      getNewsletterGroups(),
      getNewsletterTemplates(),
      getSequenceEnrolments(Number(id), {
        status: query.status,
        page: Number(query.page) || 1,
        per_page: Number(query.per_page) || undefined,
      }),
      getSequenceReport(Number(id)),
    ]);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) notFound();

    return <ErrorState title="We could not load this sequence">The admin API is not responding.</ErrorState>;
  }

  const counts = sequence.enrolments ?? { active: 0, completed: 0, cancelled: 0 };

  return (
    <>
      <PageHeader
        title={sequence.name}
        back={{ href: "/admin/newsletter/sequences", label: "Sequences" }}
        lede={sequence.group ? <>Enrols whoever joins <strong>{sequence.group.name}</strong>.</> : <>Enrols every new subscriber.</>}
      >
        <SequenceStatusControls sequence={sequence} />
      </PageHeader>

      <Tabs
        tabs={[
          { id: "settings", label: "Settings" },
          { id: "steps", label: "Steps", badge: sequence.steps?.length || undefined },
          { id: "enrolments", label: "Enrolments", badge: counts.active || undefined },
          { id: "report", label: "Report" },
        ]}
      >
        <div id="settings">
          <SequenceSettingsForm sequence={sequence} groups={groups} />
        </div>
        <div id="steps">
          <StepsPanel sequence={sequence} templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
        </div>
        <div id="enrolments">
          <EnrolmentsPanel sequence={sequence} groups={groups} enrolments={enrolments} status={query.status} />
        </div>
        <div id="report">
          <ReportPanel report={report} />
        </div>
      </Tabs>
    </>
  );
}
