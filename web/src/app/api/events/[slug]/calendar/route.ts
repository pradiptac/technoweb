import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";
import { isEventSlug } from "@/components/events/data";

/**
 * An event as an `.ics`, for "Add to calendar"
 * (`GET /events/{slug}/calendar`, docs/events-contract.md).
 *
 * A route handler because the API is another origin: an absolute API URL
 * cannot be an `<a href>` on this site (`CLAUDE.md`, the ticket attachments).
 * The link that points here is a plain `<a download>` and never a
 * `next/link`, which would prefetch it.
 *
 * **Cached like the event itself**, on the same two tags — the file is
 * public, the same for every visitor, and holds no joining link (the API
 * never puts one in it). So a console save that moves the time purges this
 * along with the page, and a hundred people pressing the button on the day
 * the invitation goes out is one request to the API. Being cached, the fetch
 * names no visitor; a body that is not a calendar is never passed through.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!isEventSlug(slug)) return notFound();

  let upstream: Response;

  try {
    upstream = await fetch(apiUrl(`/events/${encodeURIComponent(slug)}/calendar`), {
      headers: { Accept: "text/calendar" },
      next: { revalidate: 120, tags: ["events", `event:${slug}`] },
    });
  } catch {
    return new NextResponse("The calendar file could not be built just now.", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  if (upstream.status === 404) return notFound();

  const type = upstream.headers.get("content-type") ?? "";

  if (!upstream.ok || !type.toLowerCase().includes("text/calendar")) {
    return new NextResponse("The calendar file could not be built just now.", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  // The name is rebuilt from the slug rather than echoed from upstream: it
  // goes into a header, and only these characters are let through.
  const filename = `${slug.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "event"}.ics`;

  return new NextResponse(await upstream.text(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=120",
      "X-Robots-Tag": "noindex",
    },
  });
}

function notFound() {
  return new NextResponse("There is no such event.", { status: 404, headers: { "Cache-Control": "no-store" } });
}
