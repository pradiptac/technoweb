import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Alert } from "@/components/ui/input";
import { getMeetingOptions } from "@/lib/meetings";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled, telHref } from "@/lib/site-settings";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import { contact } from "@/content/site";
import { MeetingBookingForm } from "./meeting-booking-form";
import type { MeetingOptions } from "@/types/meetings";

export const metadata = buildMetadata({
  title: "Book a meeting",
  description:
    "Book a video call with an engineer on Google Meet — choose a time that suits you and the invitation arrives in your calendar.",
  path: "/book-a-meeting",
});

const STEPS = [
  { title: "Choose a time", body: "Pick what you want to talk about, then a day and a time that are free. It is booked the moment you confirm." },
  { title: "It lands in your calendar", body: "A confirmation and a calendar invitation with the Google Meet link arrive by email." },
  { title: "We talk", body: "We remind you beforehand. Need to change it? The link in the email moves or cancels it." },
];

/**
 * Online meetings, booked by the visitor (docs/meetings.md).
 *
 * **Prerendered and cached.** The options are the same for every visitor
 * and are fetched with `revalidate: 300` under the `meetings` tag, which the
 * console's saves purge. Nothing here reads a cookie, a header or
 * `searchParams` while rendering — `?type=` is read by the form in the
 * browser, the slots are fetched after mount through `/api/meetings/slots`,
 * and who is signed in is asked for after mount too. A build that cannot
 * reach the API fails rather than bake an error page (CLAUDE.md).
 */
export default async function BookAMeetingPage() {
  const settings = await getSiteSettings();
  let options: MeetingOptions | null = null;

  try {
    options = await getMeetingOptions();
  } catch (error) {
    if (isPrerendering) throw error;
  }

  const phone = settings.phone ?? contact.phone;
  const messagingChannels = [
    ...(settingEnabled(settings, "messaging_whatsapp_live") ? [{ value: "whatsapp", label: "WhatsApp" }] : []),
    ...(settingEnabled(settings, "messaging_rcs_live") ? [{ value: "rcs", label: "RCS messages" }] : []),
  ];
  const callUs = phone
    ? <>Call us on <a href={telHref(phone)} className="font-semibold underline">{phone}</a> and we will set it up over the phone.</>
    : <><Link href="/contact" className="font-semibold underline">Get in touch</Link> and we will arrange it with you.</>;

  return (
    <>
      <PageHero
        section="support"
        kicker="Support"
        title="Book a meeting"
        lede="A video call with one of our engineers on Google Meet — about a project, a quote or something that is not working. Choose a time that suits you."
        crumbs={[{ name: "Support", path: "/support" }, { name: "Book a meeting", path: "/book-a-meeting" }]}
      />

      <section className="section-y">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
            <div className="min-w-0">
              {!options ? (
                <Alert tone="warn" title="The booking could not be loaded" dismissible={false}>{callUs}</Alert>
              ) : !options.enabled || options.types.length === 0 ? (
                <Alert tone="info" title="We are not taking bookings online at the moment" dismissible={false}>{callUs}</Alert>
              ) : (
                <MeetingBookingForm options={options} messagingChannels={messagingChannels} />
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
                Rather have an engineer on site?{" "}
                <Link href="/book-a-visit" className="font-semibold text-brand-ink underline">Book a site visit</Link>.
              </p>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
