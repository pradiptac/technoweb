"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast, type ToastTone } from "./toast";

/**
 * Turns the console's `?done=` convention into a toast.
 *
 * **Why a bridge rather than changing every action.** Server actions here
 * finish with `redirect("/admin/jobs?done=vacancy-deleted")`, and they do that
 * for a reason worth keeping: an action whose button is conditional on the
 * status it changes cannot report success into its own component, because
 * `revalidatePath` re-renders and the button unmounts with the message inside
 * it. The redirect survives that. What it could not do was *say* anything —
 * so each screen hand-rolled an inline `Alert` from the parameter, on the
 * screens where somebody remembered. This reads the parameter once and every
 * screen under the provider gets it.
 *
 * **The parameter is stripped once it has been shown**, with `replace` so it
 * does not enter the history. Otherwise a refresh re-announces something that
 * happened ten minutes ago — and the URL somebody copies out of the bar to
 * send a colleague carries a claim that they have just deleted something.
 */

type Message = { tone: ToastTone; title: string; body?: string };

/**
 * Every outcome, keyed by exactly what the action writes.
 *
 * **A lookup rather than a sentence in the URL.** A query parameter is
 * attacker-controlled — anyone can send a colleague
 * `/admin/staff?done=Your+account+has+been+suspended`, and a toast is precisely
 * the chrome somebody would believe. An unknown key shows nothing at all.
 *
 * **The keys name the thing, not the verb.** A bare `deleted` meant "the
 * vacancy, and its applications were kept" on one screen and "the application
 * and its CV are gone" on another — two different facts behind one word, which
 * a single map cannot hold and which one screen would have got wrong. `saved`
 * and `created` stay generic because there is genuinely nothing to add.
 */
const OUTCOMES: Record<string, Message> = {
  created: { tone: "ok", title: "Created." },
  saved: { tone: "ok", title: "Saved." },

  "lead-deleted": {
    tone: "ok",
    title: "Lead deleted",
    // The reassurance that matters: the pipeline record has gone and the
    // submission it was made from has not. Clearing a queue is not a reason to
    // destroy the record of something a person actually sent.
    body: "The enquiry it came from was kept.",
  },
  "ticket-merged": {
    tone: "ok",
    title: "Tickets merged.",
    body: "The other ticket is closed and points here. The customer has been told which reference to quote.",
  },
  "saved-reply-deleted": {
    tone: "ok",
    title: "Saved reply deleted",
    body: "It is off every ticket's picker. Replies already sent with it are unchanged.",
  },
  "page-drafted": {
    tone: "ok",
    title: "Drafted by the assistant.",
    // The one thing that must happen before it goes live, said where the
    // editor lands: the draft is unpublished and its gaps are marked.
    body: "Check every [CHECK: …] before publishing.",
  },
  "block-saved": {
    tone: "ok",
    title: "Block saved",
    body: "Pages embedding its shortcode show the change on their next render.",
  },
  "block-copied": {
    tone: "ok",
    title: "Copy made",
    body: "The copy is a draft under its own slug. Rename it, then publish when it is ready.",
  },
  "block-not-copied": {
    tone: "err",
    title: "Could not make a copy",
    body: "Nothing was changed. Try again in a moment.",
  },
  "block-deleted": {
    tone: "ok",
    title: "Block deleted",
    body: "Anything embedding its shortcode now renders nothing in its place.",
  },
  /*
    The twelve content lists' delete (pages, posts, articles, case studies,
    solutions, services, industries, products, categories, brands, FAQs,
    landing pages) when the API refused it. Those actions used to swallow the
    refusal and report "deleted" — and purge the caches — whatever happened.
  */
  "not-deleted": {
    tone: "err",
    title: "Could not delete that",
    body: "Nothing was changed and it is still there. If it keeps failing, something may still depend on it.",
  },
  "block-not-deleted": {
    tone: "err",
    title: "Could not delete the block",
    body: "It is still there. Try again in a moment.",
  },
  "custom-field-group-deleted": {
    tone: "ok",
    title: "Field group deleted",
    body: "Its fields, and every value typed into them, went with it.",
  },
  "content-type-deleted": {
    tone: "ok",
    title: "Content type deleted",
  },
  "entry-deleted": {
    tone: "ok",
    title: "Entry deleted",
    body: "Its address now answers 404; add a redirect if it was linked from anywhere.",
  },
  "vacancy-deleted": {
    tone: "ok",
    title: "Vacancy deleted",
    body: "The applications it received were kept.",
  },
  "coupon-saved": {
    tone: "ok",
    title: "Discount code saved",
  },
  "coupon-deleted": {
    tone: "ok",
    title: "Discount code deleted",
  },
  "coupon-in-use": {
    tone: "warn",
    title: "That code has been used",
    // The alternative, named. A refusal that does not say what to do instead
    // is a refusal somebody argues with.
    body: "It cannot be deleted, because the orders it discounted still refer to it. Switch it off instead.",
  },
  "store-product-deleted": {
    tone: "ok",
    title: "Product deleted",
    // The reassurance that matters here: an order is a record of what was
    // sold, not a pointer at a product that might change or vanish.
    body: "Orders already placed keep their own copy of the name and price.",
  },
  "store-category-saved": {
    tone: "ok",
    title: "Category saved",
  },
  "store-category-deleted": {
    tone: "ok",
    title: "Category deleted",
    body: "The products in it stayed on sale and are now uncategorised.",
  },
  "campaign-deleted": {
    tone: "ok",
    title: "Campaign deleted",
    // The reassurance that matters, and the one people ask about: the
    // do-not-mail list is keyed on the address and outlives every campaign,
    // so deleting one cannot put anybody back on a list they left.
    // "Any report", not "its report": the same key is used deleting a draft
    // from the list, which never had one, and a toast that describes
    // something that did not happen is a toast people stop reading.
    body: "Any report went with it. Unsubscribes are unaffected.",
  },
  "sequence-deleted": {
    tone: "ok",
    title: "Sequence deleted",
    // What went with it, and what did not: the steps were campaign rows
    // nobody could send by hand, and the subscribers are untouched.
    body: "Its steps and their reports went with it. Nobody was unsubscribed.",
  },
  "campaign-resent": {
    tone: "ok",
    title: "Resending to the people who did not open",
    // The screen has moved to the resend's own report, so say where the
    // reader is: the original's figures are untouched, and this campaign's
    // fill in as the queue works through it.
    body: "This is the resend's own report. The original campaign's figures are unchanged.",
  },
  "certification-deleted": {
    tone: "ok",
    title: "Certification deleted",
    body: "The badge and the PDF are still in the media library.",
  },
  "client-deleted": {
    tone: "ok",
    title: "Client deleted",
    body: "The logo is still in the media library.",
  },
  "team-member-deleted": {
    tone: "ok",
    title: "Team member deleted",
    body: "Their certifications went with them; the photo is still in the media library.",
  },
  "popup-deleted": {
    tone: "ok",
    title: "Popup deleted",
    // The reassurance that matters: nothing was removed from the media
    // library. A popup is very often built from artwork a page uses as well,
    // and nothing in this product tracks what references a path.
    body: "The picture is still in the media library.",
  },
  "message-template-deleted": {
    tone: "ok",
    title: "Template deleted",
    // Automations that pointed at it now point at nothing, which sends nothing.
    body: "Any automation that used it is now empty and sends nothing until another is chosen.",
  },
  "message-template-not-deleted": { tone: "err", title: "That template could not be deleted", body: "The API refused it. Try again shortly." },
  "message-template-submitted": {
    tone: "ok",
    title: "Submitted for approval",
    body: "WhatsApp reviews it, usually within minutes and sometimes a day. Nothing is sent against it until it is approved.",
  },
  "broadcast-deleted": { tone: "ok", title: "Broadcast deleted" },
  "broadcast-not-deleted": { tone: "err", title: "That broadcast could not be deleted", body: "One that has been sent or scheduled is kept; cancel a scheduled one first." },
  "broadcast-queued": {
    tone: "ok",
    title: "Broadcast queued",
    body: "It goes out in batches, inside the quiet-hours window. The report below fills in as the provider answers.",
  },
  "broadcast-scheduled": { tone: "ok", title: "Broadcast scheduled", body: "It is queued at the time you chose, and waits for the quiet-hours window if that falls outside it." },
  "broadcast-cancelled": { tone: "ok", title: "Broadcast cancelled", body: "Nothing more goes out. Anything already sent stays sent." },
  "contact-opted-out": { tone: "ok", title: "Opt-out recorded", body: "Nothing more is sent to that contact on that channel." },
  // Online meetings (docs/meetings.md).
  "meeting-scheduled": { tone: "ok", title: "Meeting scheduled", body: "The customer and the host are being told. The Meet link appears here once Google has made the event." },
  "meeting-moved": { tone: "ok", title: "Meeting moved", body: "The customer and the host are being told, and the calendar event moves with the same Meet link." },
  "meeting-cancelled": { tone: "ok", title: "Meeting cancelled", body: "The customer has been told and the calendar event is being removed." },
  "meeting-type-deleted": { tone: "ok", title: "Meeting type deleted", body: "It is gone from the booking page too." },
  "webhook-deleted": {
    tone: "ok",
    title: "Webhook deleted",
    // Its delivery log went with it: a record of attempts against an address
    // nobody is sent to any more is nobody's to read.
    body: "Its delivery log went with it. Nothing else changed.",
  },
  "webhook-not-deleted": {
    tone: "err",
    title: "That webhook could not be deleted",
    body: "The API refused it. Try again shortly.",
  },
  "webhook-pinged": {
    tone: "ok",
    title: "Ping queued",
    // The send is a queued job, so the answer lands in the log below rather
    // than in this toast; saying so stops somebody waiting on the toast.
    body: "The result will appear in the deliveries as soon as the queue runs it.",
  },
  "webhook-ping-failed": {
    tone: "err",
    title: "Nothing was queued",
    body: "The API refused the request. Try again shortly.",
  },
  "delivery-resent": {
    tone: "ok",
    title: "Delivery queued again",
    body: "A fresh delivery with the same payload. The original row is kept as it was.",
  },
  "template-reset": {
    tone: "ok",
    title: "Back to the built-in message",
    // The reassurance that matters: nothing stopped working. The built-in is
    // what every message uses until somebody rewrites it.
    body: "Your wording was discarded. The email still goes out, in its original words.",
  },
  "menu-deleted": {
    tone: "ok",
    title: "Menu deleted",
    body: "If it was assigned to a location, that part of the site is back to its built-in navigation.",
  },
  "application-deleted": {
    tone: "ok",
    title: "Application deleted",
    body: "The record and its CV are gone.",
  },

  approved: {
    tone: "ok",
    title: "Account activated",
    body: "They can sign in now, and we have emailed them to say so.",
  },
  rejected: {
    tone: "info",
    title: "Registration rejected",
    body: "Their sessions have ended and they have had a neutral email. The note is staff-only.",
  },
  suspended: {
    tone: "info",
    title: "Account suspended",
    body: "Every session has ended. Their tickets are untouched, and they have not been emailed.",
  },
  reactivated: {
    tone: "ok",
    title: "Account is active again",
    body: "They can sign in with their existing password.",
  },
  resent: {
    tone: "ok",
    title: "Confirmation link sent",
    body: "A fresh link is on its way to them. It expires in 24 hours.",
  },
  "impersonation-ended": {
    tone: "ok",
    title: "Stopped viewing as the customer",
    body: "Their own session was not affected.",
  },
};

export function ToastFromParams() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const done = params.get("done");

  /*
    Guarded against firing twice for one parameter.

    React mounts effects twice in development on purpose, and the strip below
    is itself a navigation that re-runs this component — either one alone
    produces two identical toasts stacked on each other. The guard key is the
    parameter, so a second, genuinely different `?done=` still announces.
  */
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (!done || announced.current === done) return;

    const message = OUTCOMES[done];

    /*
      Handle it and strip it, or leave it entirely alone.

      Stripping a parameter this does not recognise would break the screens
      that deliberately keep an inline `Alert` — `/admin/applications/[id]`
      explains that changing a status does not email the candidate, which is
      standing information about what the control does rather than a
      confirmation that it worked, and it belongs on the page rather than in
      something that leaves after five seconds. Removing `?done=status` from
      under it would make that panel vanish mid-read.
    */
    if (!message) return;

    announced.current = done;
    toast(message);

    // Only the parameter this owns. A list screen's filters live in the same
    // query string, and rebuilding it would drop the status and search
    // somebody had set before they pressed the button.
    const next = new URLSearchParams(params);
    next.delete("done");

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [done, params, pathname, router, toast]);

  return null;
}
