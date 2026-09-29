import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "@/lib/api";
import { getMeetingSlotDate, getMeetingSlotRange } from "@/lib/meetings";

/**
 * The booking page's slots, both forms of `GET /meetings/slots`
 * (docs/meetings-contract.md): `?type=&from=&to=` for the day picker's
 * counts, `?type=&date=` for one day's times.
 *
 * Through the Next server rather than straight from the browser to the API,
 * because the API is a different origin CORS allows only for the site's own
 * server, and because `apiFetch` without `revalidate` is what forwards the
 * visitor's address — the API's 60-a-minute limit is per visitor, and
 * without the header every visitor would share one bucket. Never cached, on
 * either side: the answer changes with every booking.
 *
 * The parameters are held to their shapes here so nothing arbitrary is
 * forwarded; the API checks the rest (an unknown type, a range too long).
 */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type") ?? "";
  const date = params.get("date");
  const from = params.get("from");
  const to = params.get("to");
  const headers = { "Cache-Control": "no-store" };

  if (!SLUG.test(type)) {
    return NextResponse.json({ message: "Choose a kind of meeting." }, { status: 422, headers });
  }

  try {
    if (date !== null) {
      if (!DATE.test(date)) return NextResponse.json({ message: "That is not a date." }, { status: 422, headers });
      return NextResponse.json({ data: await getMeetingSlotDate(type, date) }, { headers });
    }

    if (!from || !to || !DATE.test(from) || !DATE.test(to)) {
      return NextResponse.json({ message: "Give a date, or a range." }, { status: 422, headers });
    }

    return NextResponse.json({ data: await getMeetingSlotRange(type, from, to) }, { headers });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return NextResponse.json({ message: error.message }, { status: error.status, headers });
    }

    return NextResponse.json({ message: "The times could not be loaded." }, { status: 502, headers });
  }
}
