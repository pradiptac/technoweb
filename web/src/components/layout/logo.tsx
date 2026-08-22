import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The site wordmark.
 *
 * Renders an uploaded logo when one is set in Settings, and falls back to the
 * text treatment otherwise. The fallback is not a placeholder to be removed —
 * it is what a site with no logo file should look like, and it keeps the
 * header intact if the image 404s after a media file is deleted.
 *
 * `logoUrl` is passed down rather than read here, because this renders inside
 * the header and footer on every page and a settings read per instance would
 * be a fetch the layout has already done.
 */
export function Logo({
  className, onDark = false, logoUrl, companyName = "Technoware",
}: {
  className?: string;
  onDark?: boolean;
  logoUrl?: string | null;
  companyName?: string;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={companyName}
        width={180}
        height={40}
        // The uploaded file decides its own aspect ratio; height is capped so
        // a tall logo cannot push the header open.
        className={cn("h-[34px] w-auto object-contain", className)}
        priority
        unoptimized
      />
    );
  }

  return (
    <span className={cn("font-display text-[23px] font-bold leading-none tracking-[-.045em]", className)}>
      <span className={onDark ? "text-white" : "text-ink"}>TECHNO</span>
      <span className={onDark ? "text-brand-400" : "text-brand-600"}>WARE</span>
    </span>
  );
}
