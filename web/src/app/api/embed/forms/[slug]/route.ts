import { NextResponse } from "next/server";
import { publicApi } from "@/lib/api";
import { clientIpHeaders } from "@/lib/client-ip";
import { safeRedirectTarget } from "@/components/forms/form-logic";

/**
 * Where a form pasted as raw HTML onto another website posts.
 *
 * ### Why this exists rather than the API's own endpoint
 *
 * A page on somebody else's domain posting straight to Laravel needs
 * `Access-Control-Allow-Origin` from Laravel, and `config/cors.php` sets
 * `supports_credentials: true` — which makes `allowed_origins: ['*']` illegal
 * rather than merely unwise, and the config says so in its own first comment.
 * The alternatives there were registering every embedding domain, or widening
 * CORS for `api/*` as a whole, which would loosen it for every authenticated
 * route in the product to serve one public form.
 *
 * So the permissive header lives on one route that we own and that does
 * exactly one thing. Laravel's CORS configuration is untouched.
 *
 * ### Why `*` is safe here specifically
 *
 * **No credentials, ever.** `Access-Control-Allow-Credentials` is absent, so a
 * browser sends no cookies with these requests and there is no session to ride
 * — which is the whole of what CSRF would need. The endpoint behind it has
 * always been public and unauthenticated: anybody could already post to
 * `POST /forms/{slug}` with curl, and CORS never restrained that. What it
 * restrains is a *browser* on another origin reading the reply, and the reply
 * is a success sentence or a list of validation messages about the submission
 * the caller just made.
 *
 * What bounds abuse is unchanged and is not this header: the 10/min throttle,
 * the `website` honeypot, and `FormValidator` dropping every key the stored
 * definition does not declare.
 *
 * ### It refuses a form that has not opted in
 *
 * The same gate the iframe route applies, for the same reason — the HTML
 * snippet is the same feature in a different shape, and a form nobody ticked
 * should not be postable from anywhere just because the markup was copied.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
  // Nothing here varies by origin — the answer is `*` for everybody — but a
  // cache in front of this should still be told that the request's Origin was
  // looked at, or the next person debugging it has to prove that it was not.
  Vary: "Origin",
};

export async function OPTIONS() {
  /*
   * A preflight, answered without touching the API.
   *
   * The snippet posts `FormData`, which is a simple request and never
   * preflights — but a copy of the markup rewired to send JSON does, and a
   * missing OPTIONS handler there fails as a CORS error with no clue in it.
   */
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const form = await publicApi.form(slug).then((r) => r.data).catch(() => null);

  if (!form || !form.embed_enabled) {
    return NextResponse.json({ message: "That form is not available." }, { status: 404, headers: CORS });
  }

  /*
   * A form that takes a file is not served here, and says so.
   *
   * This route forwards JSON. An upload needs the bytes carried through as
   * multipart, a size the web server in front of Node will accept from any
   * origin, and progress and refusal handling the pasted snippet does not
   * have — so a file posted here would arrive as a submission with its
   * upload silently missing, and a *required* one as a 422 about a field the
   * visitor filled in. The frame at `/embed/forms/{slug}` is the real form
   * and takes the file; the message names it. Answered before the body is
   * read, so nothing is uploaded only to be thrown away.
   */
  const fields = form.fields ?? [];

  if (form.has_files || fields.some((field) => field.kind === "file")) {
    return NextResponse.json(
      { message: "This form takes a file and can only be embedded as a frame." },
      { status: 422, headers: CORS },
    );
  }

  /*
   * Both shapes, because the snippet is markup somebody will edit.
   *
   * It ships posting `FormData`; the moment it is wired into a framework on
   * the far side it becomes JSON, and refusing that would be a contract that
   * breaks for the reason nobody would guess from the error.
   *
   * **A group of checkboxes has to reach the API as an array**, and there
   * are three ways a third party's page will send one: `interests[]` repeated
   * (what a browser's own `FormData` does with the markup we hand out),
   * `interests` repeated without the brackets (hand-written markup), and a
   * JSON array. All three end as `interests: [...]`. Which keys are groups is
   * read from the stored definition, so a text field posted twice is still
   * one value — the last — rather than an array the API would refuse.
   */
  const groups = new Set(fields.filter((field) => field.kind === "checkboxes").map((field) => field.name));
  const payload: Record<string, string | string[]> = {};
  const type = request.headers.get("content-type") ?? "";

  const put = (rawKey: string, value: string) => {
    const bracketed = rawKey.endsWith("[]");
    const key = bracketed ? rawKey.slice(0, -2) : rawKey;

    if (bracketed || groups.has(key)) {
      const list = payload[key];
      payload[key] = Array.isArray(list) ? [...list, value] : [value];
    } else {
      payload[key] = value;
    }
  };

  /** A JSON value as a form would have posted it; anything else is not an answer. */
  const scalar = (value: unknown): string | null =>
    typeof value === "string" ? value
      : typeof value === "number" && Number.isFinite(value) ? String(value)
      : value === true ? "1"
      : null;

  if (type.includes("application/json")) {
    const body: unknown = await request.json().catch(() => null);

    if (body && typeof body === "object" && !Array.isArray(body)) {
      for (const [key, value] of Object.entries(body)) {
        for (const item of Array.isArray(value) ? value : [value]) {
          const text = scalar(item);
          if (text !== null) put(key, text);
        }
        // A group sent as an empty array is still an answer: nothing ticked.
        const name = key.endsWith("[]") ? key.slice(0, -2) : key;
        if (Array.isArray(value) && value.length === 0 && (name !== key || groups.has(name))) payload[name] = [];
      }
    }
  } else {
    const body = await request.formData().catch(() => null);
    if (body) for (const [key, value] of body.entries()) if (typeof value === "string") put(key, value);
  }

  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

  try {
    const res = await fetch(`${base}/api/v1/forms/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(await clientIpHeaders()) },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const body = await res.json().catch(() => ({}));

    /*
     * The API's own words for a refusal, and a sentence of ours for a failure.
     *
     * A 422 is about what the visitor typed and is the only thing on this page
     * that can tell them which field to fix, so it is passed through with its
     * `errors` map intact. Everything else is ours: the API's transport
     * failures mean nothing to somebody filling in a form on a third site.
     */
    if (res.status === 422) {
      return NextResponse.json(
        { message: body.message ?? "Please check the highlighted fields.", errors: body.errors ?? {} },
        { status: 422, headers: CORS },
      );
    }

    if (res.status === 429) {
      return NextResponse.json(
        { message: "Too many messages from this connection. Wait a minute and try again." },
        { status: 429, headers: CORS },
      );
    }

    if (!res.ok) {
      return NextResponse.json({ message: "We could not send that. Try again." }, { status: 502, headers: CORS });
    }

    /*
     * `redirect_url` rides along, checked the way the form's own action
     * checks it: a path on this site or an http(s) URL, else null. This
     * route never follows it — what a third party's page does after a
     * success is theirs to decide, and the snippet we hand out shows the
     * message — but a page that wants to send its visitor on has the address
     * the editor chose rather than a copy of it that will go stale.
     */
    return NextResponse.json(
      {
        message: body.message ?? form.success_message ?? "Thank you — we will be in touch shortly.",
        redirect_url: safeRedirectTarget(body.redirect_url),
      },
      { status: 201, headers: CORS },
    );
  } catch {
    return NextResponse.json({ message: "We could not send that. Try again." }, { status: 502, headers: CORS });
  }
}
