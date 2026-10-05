import { ImageResponse } from "next/og";
import { getSiteSettings } from "@/lib/settings";
import { themeFor } from "@/lib/presets";
import { brandName } from "@/lib/brand";
import { initials, pwaFor, PWA_ICON_SIZES } from "@/lib/pwa";

/**
 * The installed app's icon, drawn at the size asked for (2026-10-05).
 *
 * `/pwa-icon/192`, `/pwa-icon/512`, `/pwa-icon/180` (Apple's touch icon), and
 * `?maskable=1` for the version a launcher crops into a circle or a squircle.
 *
 * Generated rather than committed, the `opengraph-image.tsx` argument: there
 * is nothing to forget to add, and it wears the palette chosen in the console.
 * An uploaded icon (`pwa_icon_path`) is drawn onto the same square — centred,
 * with the page's colour behind a transparent PNG — so a logo that is not
 * square still makes a square icon, and the maskable variant keeps the mark
 * inside the middle 80% every launcher's mask leaves visible. With none
 * uploaded, the company's initials on the brand fill, in the fill's own ink:
 * `brandOn` is the token the site pairs with `brand-600` for exactly that.
 *
 * Any other size is a 404, so the route cannot be asked to render an
 * arbitrarily large image.
 */
export const revalidate = 600;

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!(PWA_ICON_SIZES as readonly number[]).includes(size)) {
    return new Response("Not found", { status: 404 });
  }
  const maskable = new URL(request.url).searchParams.get("maskable") === "1";

  const settings = await getSiteSettings().catch(() => ({}) as Awaited<ReturnType<typeof getSiteSettings>>);
  const c = themeFor(settings).colors;
  const pwa = pwaFor(settings, brandName());

  // The mark's share of the square: the safe zone for a maskable icon, a
  // little breathing room for an ordinary one.
  const mark = maskable ? 0.6 : 0.78;
  const radius = maskable ? 0 : Math.round(size * 0.22);

  const body = pwa.iconUrl ? (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: c.page, borderRadius: radius }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders an <img>, not next/image */}
      <img src={pwa.iconUrl} alt="" width={Math.round(size * mark)} height={Math.round(size * mark)} style={{ objectFit: "contain" }} />
    </div>
  ) : (
    <div
      style={{
        width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(145deg, ${c.brand500} 0%, ${c.brand700} 100%)`,
        borderRadius: radius,
        color: c.brandOn ?? "#ffffff",
        fontSize: Math.round(size * mark * 0.5),
        fontWeight: 700,
        letterSpacing: "-0.04em",
        fontFamily: "sans-serif",
      }}
    >
      {initials(pwa.name)}
    </div>
  );

  return new ImageResponse(body, {
    width: size,
    height: size,
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
