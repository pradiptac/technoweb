import { NextResponse } from "next/server";
import icons from "@/content/material-symbols.json";

/**
 * One Material Symbols Rounded icon (Apache-2.0, Google), as a file a page
 * draws with `<use href="/icons/material/router.svg#i">` (0.179.0,
 * docs/icons.md).
 *
 * Served from here so the path data — about 4 MB for the whole set — never
 * enters a client bundle, and from this origin so a visitor never contacts
 * Google. The path carries no fill: it takes `currentColor` from the
 * `<svg>` that uses it. The name is held to its own alphabet and looked up in
 * our committed file, so nothing from the request reaches the markup.
 */
const MAP = icons as Record<string, string>;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = /^([a-z0-9_]{1,37})\.svg$/.exec(file)?.[1];
  const d = name ? MAP[name] : undefined;

  if (!d) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path id="i" d="${d}"/></svg>`, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
