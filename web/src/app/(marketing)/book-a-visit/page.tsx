import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Alert } from "@/components/ui/input";
import { getVisitOptions } from "@/lib/visits";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled, telHref } from "@/lib/site-settings";
import { buildMetadata } from "@/lib/seo";
import { contact } from "@/content/site";
import { VisitRequestForm } from "./visit-request-form";
import type { VisitOptions } from "@/types/api";

export const metadata = buildMetadata({
  title: "Book a site visit",
  description:
    "Ask for an engineer to visit your site — a survey, an installation or a look at what you have. Choose the dates that suit you and we confirm a time by email.",
  path: "/book-a-visit",
});

const STEPS = [
  { title: "You ask", body: "Choose up to three dates and parts of the day that suit you, and tell us where the site is." },
  { title: "We confirm", body: "The desk picks one of your times, and confirms it by email — with a calendar file — and on WhatsApp if you ask." },
  { title: "An engineer visits", body: "They arrive in the window we agreed, and we remind you the day before." },
];

/**
 * The engineer visit request (docs/visits.md). The client chose "request a
 * time, staff confirm", so there is no availability calendar here: a request
 * is a wish list and the desk books it.
 *
 * Dynamic for `?service=`, `?solution=` and `?location=`, which preselect
 * what the page linking here was about. Nothing on it reads the portal
 * cookie while rendering — who is signed in is asked after mount.
 */
export default async function BookAVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; solution?: string; location?: string }>;
}) {
  const params = await searchParams;
  const settings = await getSiteSettings();
  const options: VisitOptions | null = await getVisitOptions().catch(() => null);
  const phone = settings.phone ?? contact.phone;

  const preset = {
    serviceId: options?.services.find((s) => s.slug === params.service)?.id,
    solutionId: options?.solutions.find((s) => s.slug === params.solution)?.id,
    locationId: options?.locations.find((l) => l.slug === params.location)?.id,
  };

  const messagingChannels = [
    ...(settingEnabled(settings, "messaging_whatsapp_live") ? [{ value: "whatsapp", label: "WhatsApp" }] : []),
    ...(settingEnabled(settings, "messaging_rcs_live") ? [{ value: "rcs", label: "RCS messages" }] : []),
  ];

  return (
    <>
      <PageHero
        section="support"
        kicker="Support"
        title="Book a site visit"
        lede="An engineer comes to you — to survey the site, scope an installation or look at what is not working. Tell us when suits you and we confirm a time."
        crumbs={[{ name: "Support", path: "/support" }, { name: "Book a site visit", path: "/book-a-visit" }]}
      />

      <section className="section-y">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="min-w-0">
              {!options ? (
                <Alert tone="warn" title="The form could not be loaded" dismissible={false}>
                  Call us on <a href={telHref(phone)} className="font-semibold underline">{phone}</a> and we will book the visit over the phone.
                </Alert>
              ) : !options.enabled ? (
                <Alert tone="info" title="We are not taking visit requests online at the moment" dismissible={false}>
                  Call us on <a href={telHref(phone)} className="font-semibold underline">{phone}</a> and we will arrange it over the phone.
                </Alert>
              ) : (
                <VisitRequestForm options={options} preset={preset} messagingChannels={messagingChannels} />
              )}
            </div>

            <aside className="min-w-0 lg:sticky lg:top-24">
              <h2 className="mb-4 text-17 font-semibold">How it works</h2>
              <ol className="grid gap-4">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-14 font-semibold text-brand-on">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-15 font-semibold">{step.title}</h3>
                      <p className="mt-0.5 text-14 text-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-14 text-muted">
                Something down right now? A visit is booked ahead —{" "}
                <Link href="/portal/tickets/new" className="font-semibold text-brand-ink underline">raise a support ticket</Link>{" "}
                or call <a href={telHref(phone)} className="font-semibold text-brand-ink underline">{phone}</a>.
              </p>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
