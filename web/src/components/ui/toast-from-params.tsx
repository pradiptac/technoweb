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
