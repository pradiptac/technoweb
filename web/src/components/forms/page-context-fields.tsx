"use client";

import { useEffect, useRef } from "react";

/**
 * The keys the API reads off the envelope.
 *
 * **Every one begins with an underscore, and that is load-bearing.** These
 * travel in the same body as an editor-built form's own answers, where a
 * collision would let a field called `source_url` overwrite the attribution or
 * be overwritten by it. A form field key is validated server-side against
 * `^[a-z][a-z0-9_]*$`, so a field named `_source_url` **cannot be created** —
 * the collision is impossible by construction rather than forbidden by a rule
 * somebody has to remember, which is a stronger guarantee than the
 * `not_in:website` the honeypot relies on.
 */
const FIELDS = [
  "_source_url",
  "_source_title",
  "_referrer",
  "_utm_source",
  "_utm_medium",
  "_utm_campaign",
] as const;

/**
 * Where this form is, posted with the submission.
 *
 * ### It has to be captured here, and nowhere else
 *
 * Every form in this product submits through a Server Action: browser → Next
 * server → Laravel. So by the time the API sees the request, `Referer` is the
 * Next server and the visitor's page is gone. A `source_url` column filled from
 * the request header on the API side would record one plausible-looking value
 * for the entire site, report no error, and quietly measure nothing — which is
 * the whole reason this component exists rather than three lines in a
 * controller.
 *
 * ### Refs rather than state
 *
 * The server cannot know `window.location`, so rendering it during the first
 * pass is a hydration mismatch, and seeding state from an effect is a cascading
 * render that `react-hooks/set-state-in-effect` refuses outright. Writing the
 * DOM value in an effect is neither: a hidden input's value is exactly the kind
 * of thing a ref is for, and nothing re-renders.
 *
 * The ref callback uses a block body deliberately. An arrow returning the
 * assignment would hand React 19 that value as a **cleanup function**, which is
 * the current version of this trap.
 *
 * ### What it degrades to
 *
 * With JavaScript off the inputs post empty and the lead is created with no
 * attribution. That is the honest outcome: this is decoration on a submission
 * that has already been accepted, and refusing an enquiry for want of knowing
 * which page it came from would be absurd.
 */
export function PageContextFields() {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const values: Record<(typeof FIELDS)[number], string> = {
      _source_url: window.location.href,
      _source_title: document.title,
      /*
       * The page *before* this site, not the previous route.
       *
       * `document.referrer` is fixed at document load and a client-side
       * navigation does not change it — so on a site this heavily
       * client-routed it answers "which search engine or campaign sent them
       * here", which is the question worth answering. The previous internal
       * page is already implied by the URL this form is on.
       */
      _referrer: document.referrer,
      _utm_source: params.get("utm_source") ?? "",
      _utm_medium: params.get("utm_medium") ?? "",
      _utm_campaign: params.get("utm_campaign") ?? "",
    };

    for (const name of FIELDS) {
      const el = inputs.current[name];
      if (el) el.value = values[name];
    }
  }, []);

  return (
    <>
      {FIELDS.map((name) => (
        <input
          key={name}
          type="hidden"
          name={name}
          ref={(el) => {
            inputs.current[name] = el;
          }}
        />
      ))}
    </>
  );
}
