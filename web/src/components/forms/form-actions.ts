"use server";

import { redirect } from "next/navigation";
import { ApiError, apiFetch, apiUpload } from "@/lib/api";
import { safeRedirectTarget } from "./form-logic";

export type SubmitState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /**
   * Where the form would have sent the visitor, when it was told not to go
   * there itself — the embed frame, which offers it as a link instead.
   */
  redirectUrl?: string | null;
};

type Reply = { message?: string; redirect_url?: unknown } | undefined;

/**
 * Submits an editor-built form.
 *
 * A Server Action rather than a fetch from the browser, for the same reason
 * every other write here is: the API base URL and any future credential stay
 * on the server, and the visitor's browser never talks to Laravel directly.
 *
 * Everything the form posted is forwarded, honeypot and page envelope
 * included — the API decides what is a field and what is not, from the
 * stored definition. Filtering here would put a second, weaker copy of that
 * decision in front of the real one.
 *
 * ## Two shapes on the wire
 *
 * **JSON when nothing was attached**, as it always was: `apiFetch` encodes
 * the body, and a group of checkboxes — posted by the browser as repeated
 * `name[]` entries — is folded into one array under `name`.
 *
 * **Multipart when the form has an upload field** (`has_files` on its
 * definition, passed in as `multipart`), through `apiUpload`. `apiFetch`
 * would JSON-encode a `FormData` into `{}` and Laravel would answer "the file
 * field is required", which reads as the upload being refused rather than as
 * never having been sent. The `name[]` keys go through untouched: PHP reads
 * those as an array by itself. An upload field left empty still posts — a
 * `File` with no name and no bytes — and that part is left out, so the API
 * sees an absent file rather than an empty one. A form without an upload
 * field never takes this path, whatever arrives. Both helpers forward the
 * visitor's address (`clientIpHeaders`), so the endpoint's 10/min limit is
 * per visitor either way.
 *
 * `multipart` and `embedded` are bound by the page, so a visitor's browser
 * could send either differently. Neither is a permission: the API accepts
 * both encodings from anybody and validates the same way, and `embedded`
 * only decides whether this action navigates.
 *
 * ## After a success
 *
 * A form may name a `redirect_url`. On this site the visitor is sent there —
 * `redirect()` sits **outside** the `try`, because it works by throwing and a
 * `catch` around it reports a submission that went through as one that
 * failed. `embedded` is the form inside somebody else's page: navigating a
 * frame to a third address inside a partner's column is not what either of
 * them asked for, so there the target comes back in the state and the form
 * offers it as a link that opens in the whole window.
 */
export async function submitFormAction(
  slug: string,
  embedded: boolean,
  multipart: boolean,
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const path = `/forms/${encodeURIComponent(slug)}`;
  let reply: Reply;

  try {
    reply = multipart
      ? await apiUpload<Reply>(path, multipartOf(formData))
      : await apiFetch<Reply>(path, { method: "POST", body: jsonOf(formData) });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      // The API being unreachable must read as "try again", not as a stack
      // trace or a silent no-op.
      return { error: "We could not reach us just then. Try again, or call the number above." };
    }
    if (error.status === 422) {
      return { error: said(error) ?? "Please check the highlighted fields.", fieldErrors: error.errors };
    }
    if (error.status === 429) {
      return { error: "Too many messages from this connection. Wait a minute and try again." };
    }
    if (error.status === 413) {
      // The web server in front of the API refused the body before PHP saw it.
      return { error: "That file is larger than the server accepts. Choose a smaller one and send again." };
    }
    return { error: "We could not send that. Try again, or call us instead." };
  }

  const message = reply?.message ?? "Thank you — we will be in touch shortly.";
  const target = safeRedirectTarget(reply?.redirect_url);

  if (!target || embedded) return { ok: true, message, redirectUrl: target };

  redirect(target);
}

/** The API's own sentence, when it sent one — never the helper's "Request failed (422)". */
function said(error: ApiError): string | undefined {
  return /^(Request|Upload) failed \(\d+\)$/.test(error.message) ? undefined : error.message;
}

/** React's own transport fields on a form posted without JavaScript. */
const isTransport = (key: string) => key.startsWith("$ACTION");

/**
 * The submission as multipart: every text entry as it came, and each file
 * that is one. An upload field left empty posts a `File` with no name and no
 * bytes, which is "nothing chosen" and is left out.
 */
function multipartOf(formData: FormData): FormData {
  const out = new FormData();

  for (const [key, value] of formData.entries()) {
    if (isTransport(key)) continue;
    if (typeof value === "string") out.append(key, value);
    else if (value.size > 0) out.append(key, value, value.name);
  }

  return out;
}

function jsonOf(formData: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || isTransport(key)) continue;

    if (key.endsWith("[]")) {
      const name = key.slice(0, -2);
      const list = out[name];
      out[name] = Array.isArray(list) ? [...list, value] : [value];
    } else {
      out[key] = value;
    }
  }

  return out;
}
