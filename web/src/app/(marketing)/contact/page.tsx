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

      <Container data-aos="fade-up" className="py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_340px] lg:gap-16">
          <div className="min-w-0">
            {subject && (
              <p className="mb-6 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[14px]">
                Enquiring about <strong className="font-semibold">{subject}</strong>.
              </p>
            )}
            <div className="max-w-[620px] rounded-xl border border-line-strong bg-white p-6 lg:p-7">
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
            <div className="rounded-xl border border-line-strong bg-surface p-5.5">
              <h2 className="text-[15.5px]">Straight through</h2>
              <ul className="mt-4 grid gap-3.5">
                <li className="flex items-start gap-3">
                  <IconPhone className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  <span>
                    <a href={telHref(phone)} className="block py-0.5 text-[14.5px] font-semibold hover:underline">
                      {phone}
                    </a>
                    <span className="text-[13px] text-muted">Mon–Sat, 9:30–18:30 IST</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <IconMail className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  <span>
                    <a href={`mailto:${email}`} className="block py-0.5 text-[14.5px] font-semibold hover:underline">
                      {email}
                    </a>
                    <span className="text-[13px] text-muted">Support and general enquiries</span>
                  </span>
                </li>
                {settings.address && (
                  <li className="flex items-start gap-3">
                    <IconBuilding className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    <address className="not-italic">
                      <span className="block py-0.5 text-[14.5px] leading-relaxed whitespace-pre-line">
                        {settings.address}
                      </span>
                      {settings.map_link && (
                        <a href={settings.map_link} target="_blank" rel="noopener noreferrer"
                          className="text-[13px] font-semibold text-brand-600 hover:underline">
                          Open in Maps ↗
                        </a>
                      )}
                    </address>
                  </li>
                )}
              </ul>
            </div>

            {settings.map_embed_url && (
              <div className="overflow-hidden rounded-xl border border-line-strong">
                <h2 className="sr-only">Where we are</h2>
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
                  className="block h-[260px] w-full border-0"
                />
              </div>
            )}

            <div className="rounded-xl border border-line-strong bg-dark p-5.5 text-dark-ink">
              <h2 className="text-[15.5px] text-dark-ink">Already a customer?</h2>
              <p className="mt-2 text-[13.5px] leading-normal text-dark-muted">
                Don&rsquo;t use this form for faults — raise a ticket instead and it lands on
                the support desk with an SLA clock attached.
              </p>
              <div className="mt-4 grid gap-2">
                <Link href="/portal/tickets/new" className="inline-flex items-center gap-2 rounded bg-white px-4 py-[11px] text-[13.5px] font-semibold text-dark transition-colors hover:bg-brand-50">
                  <IconTicket className="size-4" /> Submit a ticket
                </Link>
                <Link href="/knowledge-base" className="inline-flex items-center gap-2 rounded border border-dark-line px-4 py-[11px] text-[13.5px] font-semibold transition-colors hover:border-dark-muted">
                  <IconBook className="size-4" /> Knowledge base
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
