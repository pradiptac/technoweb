"use server";

import { cookies } from "next/headers";

import { apiFetch, ApiError } from "@/lib/api";
import { getToken as portalToken } from "@/lib/auth";

/**
 * The assistant, from the Next server.
 *
 * The conversation's token lives in an **httpOnly cookie** and is forwarded
 * from here — browser JavaScript never sees it, exactly as the basket's token
 * works. That matters more here than it looks: the token is the only thing
 * standing between a stranger and a transcript that may hold somebody's name,
 * telephone number and a description of their network.
 *
 * Server Actions rather than a route handler, because these are writes and that
 * is this project's convention for one. There is no streaming: the specification
 * asks for a typing indicator, and a typing indicator with a complete answer
 * behind it is a simpler thing that fails in fewer ways than a stream.
 */

const COOKIE = "tw_chat";

/** Two hours. Long enough to come back from a phone call, short enough not to be a profile. */
const COOKIE_MAX_AGE = 60 * 60 * 2;

/**
 * A product, as the shop describes it.
 *
 * Every figure here came from the database on the request that produced the
 * answer — never from the answer's text. The model writes the sentence; the
 * shop states the price and the availability.
 */
export type ChatProduct = {
  id: number;
  slug: string;
  brand: string | null;
  image: string | null;
  price_paise: number;
  /** Absent unless it is genuinely higher, so it cannot render a discount that is not there. */
  compare_at_paise: number | null;
  in_stock: boolean;
  returnable: boolean;
  type: string | null;
  /** A product with variations cannot be added without choosing one. */
  has_variations: boolean;
  specifications: Record<string, string>;
};

/**
 * A screen to put in front of somebody: the support portal, the contact form.
 *
 * The assistant does not diagnose and does not touch a ticket — §14 and §41.
 * What it does is get the right page in front of the right person, and which
 * page that is depends on whether they were signed in when they asked.
 */
export type ChatAction = { label: string; url: string; primary?: boolean };

export type ChatSource = {
  title: string;
  url: string;
  label: string;
  type?: string;
  product?: ChatProduct;
};

export type ChatReply = {
  ok: boolean;
  /** The answer's row id, so a thumb knows what it is rating. */
  id?: number;
  content: string;
  /** False when nothing was retrieved — the interface says so rather than dressing it up. */
  grounded: boolean;
  sources: ChatSource[];
  actions: ChatAction[];
  /** A refusal the visitor can act on: too long, conversation over, cap reached. */
  refusal?: string;
};

export type ChatOpening = {
  welcome: string;
  quickActions: { label: string; message: string }[];
  maxChars: number;
  /**
   * What was already said, when the cookie pointed at a live conversation.
   *
   * Empty on a fresh one. The panel renders these instead of the welcome, so
   * somebody who closes it and comes back finds what they were reading rather
   * than a greeting and a blank slate.
   */
  messages: ChatOpeningMessage[];
};

/** One earlier turn, as the transcript endpoint returns it. */
export type ChatOpeningMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  grounded: boolean;
  sources: ChatSource[];
  actions: ChatAction[];
};

async function token(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

/**
 * Start a conversation, or reuse the one this browser already has.
 *
 * Called when the window is first opened rather than on page load: a
 * conversation row per visitor who never clicks is a table full of nothing,
 * and it would make "conversations" a meaningless figure on the day somebody
 * counts them.
 */
export async function openChatAction(page: {
  url?: string;
  title?: string;
}): Promise<ChatOpening | null> {
  /*
   * Resume before starting, which this did not do.
   *
   * The cookie has always been written with a two-hour life and a comment
   * saying it is long enough to come back from a phone call — and nothing ever
   * read it on the way in, so every press of the launcher created a *new*
   * conversation and overwrote the old one. Close the panel, reopen it, and
   * what you had been reading was gone; the model's context window started
   * empty again, so a follow-up like "and the 48-port one?" stopped meaning
   * anything; and six presses tripped the 6/min conversation throttle. It also
   * inflated every figure on the console's overview, since each open was
   * counted as somebody arriving.
   *
   * A comment stating an intent the code does not implement is the kind of
   * thing this project has been caught by before — the sanitiser that said
   * "no svg-as-document" with `svg` in the allowlist four lines below.
   */
  const existing = await token();

  if (existing) {
    try {
      const resumed = await apiFetch<{
        data: { status: string; messages: ChatOpeningMessage[] };
      }>(`/chat/conversations/${existing}`);

      if (resumed.data.status === "active") {
        const settings = await openingSettings();

        return { ...settings, messages: resumed.data.messages ?? [] };
      }
    } catch {
      // Expired, pruned, or closed at its ceiling. Fall through and start a
      // new one rather than leaving somebody with a launcher that does
      // nothing — a 404 here is the ordinary end of a conversation.
    }
  }

  try {
    const res = await apiFetch<{
      data: { token: string; welcome: string; quick_actions: { label: string; message: string }[]; max_message_chars: number };
    }>("/chat/conversations", {
      method: "POST",
      /*
       * The portal session, when there is one, and the conversation is started
       * perfectly well without it.
       *
       * The chat routes carry no auth middleware — a visitor with no account is
       * the ordinary case — so this is the only thing that can tell the API who
       * is asking. Not sending it meant `customer_id` was never stamped, every
       * conversation looked anonymous on the console, and a signed-in customer
       * asking for help was handed a link to the sign-in page.
       */
      ...(await signedIn()),
      body: {
        _source_url: page.url,
        _source_title: page.title,
      },
    });

    (await cookies()).set(COOKIE, res.data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return {
      welcome: res.data.welcome,
      quickActions: res.data.quick_actions ?? [],
      maxChars: res.data.max_message_chars ?? 1000,
      messages: [],
    };
  } catch {
    /*
     * Null, and the launcher renders nothing. A chatbot that cannot start is
     * better absent than present and broken — the button is an offer, and an
     * offer that fails on the first press is worse than no offer.
     */
    return null;
  }
}

/**
 * The presentational settings, for a conversation that already exists.
 *
 * A resume needs the welcome, the chips and the length ceiling, and the only
 * endpoint carrying them is the one that *creates* a conversation — which is
 * exactly what a resume must not do. They are public settings, so the public
 * settings endpoint has them; the welcome is unused on a resume anyway, since
 * the transcript is rendered in its place, but the chips and the ceiling are
 * both live controls.
 */
async function openingSettings(): Promise<Omit<ChatOpening, "messages">> {
  try {
    const res = await apiFetch<{ data: Record<string, string> }>("/settings");
    const raw = res.data ?? {};

    return {
      welcome: raw.chatbot_welcome ?? "",
      quickActions: raw.chatbot_quick_actions
        ? String(raw.chatbot_quick_actions)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [label, message] = line.split("|");

              return { label: (label ?? "").trim(), message: (message ?? label ?? "").trim() };
            })
            .filter((a) => a.label !== "")
        : [],
      maxChars: Number(raw.chatbot_max_message_chars) || 1000,
    };
  } catch {
    return { welcome: "", quickActions: [], maxChars: 1000 };
  }
}

export async function sendChatAction(message: string, quickAction?: string): Promise<ChatReply> {
  const session = await token();

  if (!session) {
    return {
      ok: false,
      content: "",
      grounded: false,
      sources: [],
      actions: [],
      refusal: "That conversation has expired. Close this and open it again.",
    };
  }

  try {
    const res = await apiFetch<{
      data: { id: number; content: string; grounded: boolean; sources: ChatSource[]; actions: ChatAction[] };
    }>(
      `/chat/conversations/${session}/messages`,
      /*
       * Sent on every message, not only when the conversation is created.
       *
       * Who is asking can change mid-conversation: somebody told to sign in
       * does, comes back, and must not be told again. The API fills
       * `customer_id` only when it is empty, so this can be forwarded freely —
       * a conversation already belonging to somebody is never reassigned to
       * whoever holds the token next.
       */
      { method: "POST", ...(await signedIn()), body: { message, quick_action: quickAction } },
    );

    return {
      ok: true,
      id: res.data.id,
      content: res.data.content,
      grounded: res.data.grounded,
      sources: res.data.sources ?? [],
      actions: res.data.actions ?? [],
    };
  } catch (error) {
    /*
     * A 422 here is something the visitor can act on and is said in the API's
     * own words — the message was too long, the conversation has run its
     * course, the assistant is off for the day. Anything else is ours, and
     * says so without blaming them.
     */
    if (error instanceof ApiError && error.status === 422) {
      return {
        ok: false,
        content: "",
        grounded: false,
        sources: [],
        actions: [],
        refusal: error.errors?.message?.[0] ?? error.message,
      };
    }

    return {
      ok: false,
      content: "",
      grounded: false,
      sources: [],
      actions: [],
      refusal: "Something went wrong at our end. Try again in a moment, or use the contact form.",
    };
  }
}

/**
 * Add a product to the basket from the conversation.
 *
 * Straight through the shop's own cart endpoint — the specification is
 * explicit that the chatbot must not touch cart records itself, and the reason
 * is not tidiness: that endpoint is where a variation is required, where too
 * many is warned about, and where the basket's token is minted. A second path
 * into the cart is a second set of those rules to keep right.
 *
 * The quantity is one and cannot be anything else. Nothing here sets a price.
 */
export async function addToBasketFromChatAction(
  productId: number,
): Promise<{ ok?: string; warning?: string; error?: string }> {
  const { addToCartAction } = await import("@/app/(marketing)/store/actions");

  const form = new FormData();
  form.set("product_id", String(productId));
  form.set("quantity", "1");

  const result = await addToCartAction({}, form);

  return { ok: result.ok, warning: result.warning, error: result.error };
}

/**
 * A callback request, from inside the conversation.
 *
 * Goes into the one lead pipeline — `channel = 'chatbot'`, visible at
 * `/admin/leads` beside every other enquiry, scored on the same rubric, with
 * the conversation attached so the desk can read what was said before ringing.
 */
export async function captureChatLeadAction(fields: {
  name: string;
  email: string;
  phone: string;
  requirement: string;
  company?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await token();

  if (!session) {
    return { ok: false, error: "That conversation has expired. Close this and open it again." };
  }

  try {
    await apiFetch(`/chat/conversations/${session}/lead`, { method: "POST", body: fields });

    return { ok: true };
  } catch (error) {
    // A 422 is something they can fix and says so in the API's own words.
    if (error instanceof ApiError && error.status === 422) {
      const first = Object.values(error.errors ?? {})[0]?.[0];

      return { ok: false, error: first ?? error.message };
    }

    return { ok: false, error: "We could not record that just now. The contact page reaches the team directly." };
  }
}

/**
 * "Was that any use?"
 *
 * One rating per answer, and it may be changed — a rating that cannot be taken
 * back is one people stop giving, and a mis-press should not be permanent. The
 * API checks the message belongs to this conversation, so a token can only
 * rate its own answers.
 */
export async function rateChatAnswerAction(messageId: number, rating: 1 | -1): Promise<boolean> {
  const session = await token();

  if (!session) return false;

  try {
    await apiFetch(`/chat/conversations/${session}/messages/${messageId}/rating`, {
      method: "POST",
      body: { rating },
    });

    return true;
  } catch {
    // Silent. A thumb that fails is not worth an error message in the middle
    // of a conversation — the visitor asked a question, not for a form.
    return false;
  }
}

/**
 * `{ token }` for a signed-in customer, and `{}` for everybody else.
 *
 * Spread into an `apiFetch` call so the anonymous case sends no header at all
 * rather than an empty one. The chat endpoints are public by design, and this
 * is the whole of what being signed in changes: the conversation is filed
 * against the account and the assistant offers the portal rather than the
 * sign-in page.
 */
async function signedIn(): Promise<{ token?: string }> {
  const token = await portalToken();

  return token ? { token } : {};
}
