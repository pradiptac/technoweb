/**
 * The copyright and developer credit, on one line.
 *
 * Extracted so the console and the portal say exactly what the public footer
 * says. It was in `site-footer.tsx` only, which meant two of the three areas
 * of this application carried no copyright at all — and the version that
 * eventually got pasted into them would have been a copy free to drift.
 *
 * The year is computed, not written. A hard-coded one is wrong every January
 * and nobody notices until a client does.
 */
export function CreditLine({
  companyName = "Technoware",
  className = "",
  linkClassName = "",
}: {
  companyName?: string;
  className?: string;
  linkClassName?: string;
}) {
  return (
    <p className={className}>
      © {new Date().getFullYear()} {companyName}. All rights reserved.
      {" · "}
      Developed by{" "}
      {/* Leaves the site, so it opens away from it and does not hand the
          opener a window handle back. */}
      <a
        href="https://www.altisinfonet.com"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName || "font-medium text-brand-ink hover:underline"}
      >
        Altis Infonet Private Limited
      </a>
    </p>
  );
}
