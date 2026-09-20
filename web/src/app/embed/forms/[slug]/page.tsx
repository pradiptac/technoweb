import { notFound } from "next/navigation";
import { FormBlock } from "@/components/forms/form-block";
import { publicApi } from "@/lib/api";

/**
 * One editor-built form, with nothing around it, for framing on another site.
 *
 * ### Why this is a page rather than an API
 *
 * The alternative was handing somebody raw markup that posts straight to
 * `/forms/{slug}` from their own domain, and it costs far more than it looks:
 * `config/cors.php` allows exactly `FRONTEND_URL` and sets
 * `supports_credentials: true`, which makes `allowed_origins: ['*']` illegal
 * rather than merely unwise — so every embedding domain would have to be
 * registered, and their page would carry none of the validation, the honeypot
 * or the error handling this one already has.
 *
 * Framing the real thing keeps the submission on our own origin, through the
 * same Server Action the contact page uses, which is why **nothing in the
 * submission path changed for this feature**: `FormValidator` builds the rules
 * from the stored definition, `website` is still the honeypot, the throttle is
 * still 10/min, and `LeadIntake` still writes the lead.
 *
 * ### What it refuses
 *
 * A form that is not published, and a form whose editor has not ticked
 * "allow embedding". The second is the only exposure control there is, and it
 * is not much on purpose — `POST /forms/{slug}` was always public, so this
 * decides which forms are *offered* for framing rather than which can be
 * posted to.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await publicApi.form(slug).then((r) => r.data).catch(() => null);

  return { title: form?.name ?? "Form" };
}

export default async function EmbeddedFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  /*
   * A failure is a 404 rather than an error state, and that is the right
   * answer *here* specifically. This page has no navigation, so "we could not
   * load the form" would be a dead end inside somebody else's layout with
   * nothing to press — and the host site can see a 404 in its own frame and
   * know the snippet is wrong, which an error page it cannot read does not
   * tell anybody.
   */
  const form = await publicApi.form(slug).then((r) => r.data).catch(() => null);

  if (!form || !form.embed_enabled) notFound();

  return (
    <>
      {/*
        A heading, and hidden.

        An iframe is its own document, so this one has a heading order of its
        own — and a document whose content starts at a form field is one a
        screen reader enters with nothing to say where it has arrived. Visible
        it would be wrong instead: the host page has already introduced this
        form in their own words and their own type, and a second title in our
        styling appearing inside their column is the thing that makes an embed
        look bolted on.

        `sr-only` rather than omitted is also what keeps the audit's single-h1
        rule meaningful on this route rather than exempting it.
      */}
      <h1 className="sr-only">{form.name}</h1>
      <FormBlock form={form} />
    </>
  );
}
