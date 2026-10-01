import { PageHero } from "@/components/ui/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { getTicketSurvey } from "@/lib/ticket-survey";
import { SurveyForm } from "./survey-form";

/**
 * The page the five rating buttons in a closed ticket's email open.
 *
 * `noindex`, and listed in `SECRET_PATHS` and the `no-referrer` headers: the
 * token in the path is one person's, and it must not reach an analytics tag
 * or an outbound referrer. Deliberately dynamic and never cached — the render
 * reads one person's answer, and it has no `generateStaticParams`.
 *
 * The server render reads and records nothing. The rating in the link is
 * recorded by `SurveyForm` when it runs in the browser — one click from the
 * email — and the page then asks for feedback worded for a low, middling or
 * high score.
 */
export const metadata = buildMetadata({
  title: "How did we do?",
  path: "/ticket-survey",
  seo: noIndex,
});

export const dynamic = "force-dynamic";

export default async function TicketSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rating?: string }>;
}) {
  const { token } = await params;
  const { rating } = await searchParams;

  let survey = null;
  let unreachable = false;

  try {
    survey = await getTicketSurvey(token);
  } catch {
    unreachable = true;
  }

  const asked = Number(rating);
  const preset = Number.isInteger(asked) && asked >= 1 && asked <= 5 ? asked : null;

  return (
    <>
      <PageHero
        section="support"
        title="How did we do?"
        lede={survey ? `Ticket ${survey.reference} — ${survey.subject}` : "A few seconds of your time."}
        crumbs={[{ name: "Support", path: "/support" }]}
      />

      <div className="section-y">
        <div className="mx-auto w-[90%] max-w-[680px]">
          {survey ? (
            <SurveyForm token={token} survey={survey} preset={preset} />
          ) : unreachable ? (
            <Alert tone="warn" title="We could not load the survey just now" dismissible={false}>
              Please open the link in your email again in a moment. Nothing else is needed.
            </Alert>
          ) : (
            <>
              <Alert tone="info" title="This survey link is not valid" dismissible={false}>
                It may have been copied incompletely. Use the buttons in the email we sent you when the ticket was closed.
              </Alert>
              <div className="mt-6">
                <ButtonLink href="/" variant="secondary">Back to the website</ButtonLink>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
