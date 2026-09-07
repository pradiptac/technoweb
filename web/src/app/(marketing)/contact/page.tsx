import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { FormBlock } from "@/components/forms/form-block";
import { publicApi } from "@/lib/api";
import { IconBook, IconBuilding, IconMail, IconPhone, IconTicket } from "@/components/icons";
import { buildMetadata } from "@/lib/seo";
import { contact } from "@/content/site";
import { getSiteSettings } from "@/lib/settings";
import { telHref } from "@/lib/site-settings";
import Link from "next/link";

export const metadata = buildMetadata({
  title: "Contact",
  description:
    "Talk to a Technoware engineer about networking, servers, security or an AMC contract. Existing customers can raise a support ticket directly.",
  path: "/contact",
});

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;
  const settings = await getSiteSettings();

  // Caught rather than awaited alongside the settings: a contact page with no
  // form is a page with no way to make contact, so the fallback below matters
  // more than the failure does.
  const form = await publicApi.form("contact").then((r) => r.data).catch(() => null);
  // Settings win; the static constants remain the fallback for a site with
  // nothing configured yet.
  const phone = settings.phone ?? contact.phone;
  const email = settings.support_email ?? contact.email;

  return (
    <>
      <PageHero
        kicker="Contact"
        title="Tell us what you're working with."
        lede="A short description of your site and what is prompting the change is enough — an engineer reads every enquiry and replies with something specific."
        crumbs={[{ name: "Contact", path: "/contact" }]}
      />

      {/*
        The three ways to reach a person, before the form.

        Most people arriving here want the telephone number, and it used to be
        the third item of a list in a sidebar beside the form — below the fold
        on a laptop. A form is the right *default* for a stranger with a project
        to describe, and the wrong thing to put in front of somebody whose line
        is already down.
      */}
      <Container data-aos="fade-up" className="pt-10 lg:pt-14">
        <h2 className="sr-only">Ways to reach us</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li className="rounded-xl border border-line-strong bg-card p-5">
            <span className="grid size-10 place-items-center rounded-lg border border-brand-ink/30 text-brand-ink">
              <IconPhone className="size-5" />
            </span>
            <h3 className="mt-3.5 text-[13px] font-semibold uppercase tracking-[.06em] text-muted">Call</h3>
            <a href={telHref(phone)} className="mt-1 block text-[17px] font-semibold hover:underline">{phone}</a>
            <p className="mt-1 text-[13px] text-muted">Mon&ndash;Sat, 9:30&ndash;18:30 IST</p>
          </li>

          <li className="rounded-xl border border-line-strong bg-card p-5">
            <span className="grid size-10 place-items-center rounded-lg border border-brand-ink/30 text-brand-ink">
              <IconMail className="size-5" />
            </span>
            <h3 className="mt-3.5 text-[13px] font-semibold uppercase tracking-[.06em] text-muted">Email</h3>
            {/*
              `break-all` on the address: an email address is one unbreakable
              run to a browser, and a long one at 320px paints outside its own
              card while the box stays put — the signature the dashboard's
              "Today" label already taught this project.
            */}
            <a href={`mailto:${email}`} className="mt-1 block text-[17px] font-semibold break-all hover:underline">
              {email}
            </a>
            <p className="mt-1 text-[13px] text-muted">Support and general enquiries</p>
          </li>

          {settings.address && (
            <li className="rounded-xl border border-line-strong bg-card p-5">
              <span className="grid size-10 place-items-center rounded-lg border border-brand-ink/30 text-brand-ink">
                <IconBuilding className="size-5" />
              </span>
              <h3 className="mt-3.5 text-[13px] font-semibold uppercase tracking-[.06em] text-muted">Visit</h3>
              <address className="mt-1 text-[14.5px] leading-relaxed whitespace-pre-line not-italic">
                {settings.address}
              </address>
              {settings.map_link && (
                <a
                  href={settings.map_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-[13px] font-semibold text-brand-ink hover:underline"
                >
                  Open in Maps &#8599;
                </a>
              )}
            </li>
          )}
        </ul>
      </Container>

      <Container data-aos="fade-up" className="section-y">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
          <div className="min-w-0">
            <h2 className="display-3">Send us the details</h2>
            <p className="lede measure mt-2 mb-6">
              The more you can say about the site and what is prompting the change, the more
              specific the reply.
            </p>

            {subject && (
              <p className="mb-6 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[14px]">
                Enquiring about <strong className="font-semibold">{subject}</strong>.
              </p>
            )}

            <div className="rounded-xl border border-line-strong bg-card p-6 lg:p-7">
              {/*
                The editor-built form when one exists at `contact`, and the
                original hard-coded enquiry form when it does not.

                Not a replacement: an install that has never seeded a form —
                or where somebody unpublishes this one — still has a working
                contact page rather than a heading with nothing under it.
              */}
              {form ? <FormBlock form={form} /> : <EnquiryForm source="contact" subject={subject} />}
            </div>
          </div>

          <aside className="grid content-start gap-4">
            {/*
              The one thing on this page that should stop somebody using the
              form: a fault raised here has no SLA clock on it and lands in an
              inbox rather than on the desk. Beside the form for that reason,
              not under it.
            */}
            <div className="rounded-xl border border-line-strong bg-dark p-5.5 text-dark-ink">
              <h2 className="text-[15.5px] text-dark-ink">Already a customer?</h2>
              <p className="mt-2 text-[13.5px] leading-normal text-dark-muted">
                Don&rsquo;t use this form for faults — raise a ticket instead and it lands on
                the support desk with an SLA clock attached.
              </p>
              <div className="mt-4 grid gap-2">
                <Link
                  href="/portal/tickets/new"
                  className="inline-flex items-center gap-2 rounded bg-dark-ink px-4 py-[11px] text-[13.5px] font-semibold text-dark transition-colors hover:bg-brand-50"
                >
                  <IconTicket className="size-4" /> Submit a ticket
                </Link>
                <Link
                  href="/knowledge-base"
                  className="inline-flex items-center gap-2 rounded border border-dark-line px-4 py-[11px] text-[13.5px] font-semibold transition-colors hover:border-dark-muted"
                >
                  <IconBook className="size-4" /> Knowledge base
                </Link>
              </div>
            </div>

            {/*
              What a form does after it is submitted is the question everybody
              has and almost no contact page answers. Three steps, and each is
              something this business actually does rather than a promise about
              response times nobody has measured.
            */}
            <div className="rounded-xl border border-line-strong bg-surface p-5.5">
              <h2 className="text-[15.5px]">What happens next</h2>
              <ol className="mt-3.5 grid gap-3 text-[13.5px] leading-normal text-ink-2">
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-ink">1</span>
                  An engineer reads it — not a queue bot.
                </li>
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-ink">2</span>
                  We reply with something specific, or ask the one question we need.
                </li>
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-ink">3</span>
                  A site visit or a call, if that is the sensible next step.
                </li>
              </ol>
            </div>
          </aside>
        </div>
      </Container>

      {settings.map_embed_url && (
        /*
          Full width and at the end. In the sidebar it was a 260px box nobody
          could read a street from — a map is either worth looking at or is not
          worth embedding.
        */
        <section data-aos="fade-up" className="pb-16 lg:pb-20">
          <Container>
            <h2 className="sr-only">Where we are</h2>
            <div className="overflow-hidden rounded-xl border border-line-strong">
              {/*
                The src is validated server-side against Google's embed host,
                because an unchecked one is somebody else's page rendered
                inside ours. loading="lazy" keeps a third-party frame off the
                critical path; the title is what a screen reader announces
                instead of "iframe".
              */}
              <iframe
                src={settings.map_embed_url}
                title="Map showing the Technoware office"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block h-[320px] w-full border-0 lg:h-[420px]"
              />
            </div>
          </Container>
        </section>
      )}
    </>
  );
}
