import { EnquiryForm } from "@/components/forms/enquiry-form";

/**
 * The card a service's page carries beside its body: a heading, one line, and
 * the enquiry form already knowing which record it is about. Lifted out of the
 * service route (0.161.0) so a detail template's `record_enquiry` draws the
 * same card; `heading` replaces the words over it, and `name` is the
 * lower-cased title the default heading finishes with.
 */
export function EnquiryCard({ source, subject, name, heading }: { source: string; subject: string; name?: string; heading?: string }) {
  return (
    <div className="rounded-xl border border-line-strong bg-surface p-6 lg:sticky lg:top-24">
      <h2 className="text-17">{heading ?? <>Ask about {name ?? subject.toLowerCase()}</>}</h2>
      <p className="mt-1.5 mb-5 text-13-5 text-muted">
        No sales sequence — an engineer reads it and replies.
      </p>
      <EnquiryForm source={source} subject={subject} compact />
    </div>
  );
}
