/**
 * The shape and size each picture in the product is drawn at (0.169.0,
 * docs/media.md "Crop before upload").
 *
 * One list, read by every image field's hint ("Best at 1200 × 630 px …") and
 * by the crop step that opens before an upload, which starts on — or is
 * locked to — the field's ratio. It is the frontend's list on purpose, the
 * one exception to "lists live in the API": a ratio is how the website draws
 * a picture, which only the website knows. Change a value here when a
 * component's frame changes, never the other way round.
 *
 * `ratio` is width / height, or "free" for a picture drawn at its own shape
 * (a logo, an icon in a body); `width`/`height` are the size worth uploading
 * — the crop never scales up, and scales down to this. `lock` keeps the crop
 * to the one ratio (a favicon must be square).
 *
 * No directive: server components import the hint too.
 */
export type ImageSpec = {
  ratio: number | "free";
  width: number;
  height: number;
  lock?: boolean;
};

export const IMAGE_SPECS = {
  /** A post, case study, event or entry cover — and the share image. */
  cover: { ratio: 1200 / 630, width: 1200, height: 630 },
  share: { ratio: 1200 / 630, width: 1200, height: 630, lock: true },
  /** Full-width hero, slider slide, video poster. */
  hero: { ratio: 16 / 9, width: 1920, height: 1080 },
  slide: { ratio: 16 / 9, width: 1920, height: 1080 },
  /** The phone picture of a slide, shown below 768px. */
  "slide-mobile": { ratio: 4 / 5, width: 1080, height: 1350 },
  /** The section banner behind a page heading. */
  banner: { ratio: 2000 / 560, width: 2000, height: 560 },
  /** The sign-in screen's picture. */
  login: { ratio: 4 / 3, width: 1600, height: 1200 },
  team: { ratio: 4 / 5, width: 800, height: 1000 },
  certificate: { ratio: 3 / 4, width: 900, height: 1200 },
  gallery: { ratio: 4 / 3, width: 1600, height: 1200 },
  product: { ratio: 1, width: 1200, height: 1200 },
  category: { ratio: 4 / 3, width: 1200, height: 900 },
  service: { ratio: 4 / 3, width: 1200, height: 900 },
  store_icon: { ratio: 1, width: 256, height: 256, lock: true },
  favicon: { ratio: 1, width: 512, height: 512, lock: true },
  pwa_icon: { ratio: 1, width: 512, height: 512, lock: true },
  qr: { ratio: 1, width: 600, height: 600, lock: true },
  popup: { ratio: "free", width: 1200, height: 1200 },
  /** The shop's promo band (the picture bleeds off the band's right side). */
  promo: { ratio: 3 / 2, width: 1500, height: 1000 },
  /** The two promo tiles above it. */
  tile: { ratio: 2, width: 1600, height: 800 },
  /** The before/after slider draws both at 16:10. */
  before_after: { ratio: 16 / 10, width: 1600, height: 1000, lock: true },
  /** A messaging template's header picture. */
  message: { ratio: 1.91, width: 1125, height: 589 },
  logo: { ratio: "free", width: 600, height: 160 },
  brand_logo: { ratio: "free", width: 600, height: 300 },
  client_logo: { ratio: "free", width: 600, height: 300 },
  /** A picture inside a rich-text body or a builder section's own column. */
  body: { ratio: "free", width: 1600, height: 1600 },
} satisfies Record<string, ImageSpec>;

export type ImageSpecKey = keyof typeof IMAGE_SPECS;

/** The picture settings, by key: what each is drawn as. */
export function settingImageSpec(key: string): ImageSpecKey | undefined {
  if (key === "logo_path") return "logo";
  if (key === "favicon_path") return "favicon";
  if (key === "pwa_icon_path") return "pwa_icon";
  if (key === "login_image_path") return "login";
  if (key === "coming_soon_image_path") return "hero";
  if (key.startsWith("banner_") && key.endsWith("_path")) return "banner";
  return key.endsWith("_path") ? "body" : undefined;
}

export function specFor(spec: ImageSpecKey | ImageSpec | undefined): ImageSpec | undefined {
  if (!spec) return undefined;
  return typeof spec === "string" ? IMAGE_SPECS[spec] : spec;
}

/** "16 : 9", "1.91 : 1", or null for a free shape. */
export function ratioLabel(ratio: number | "free"): string | null {
  if (ratio === "free") return null;
  const known: [number, string][] = [
    [1, "1 : 1"], [4 / 3, "4 : 3"], [3 / 4, "3 : 4"], [16 / 9, "16 : 9"], [9 / 16, "9 : 16"],
    [4 / 5, "4 : 5"], [5 / 4, "5 : 4"], [3 / 2, "3 : 2"], [2 / 3, "2 : 3"],
  ];
  const hit = known.find(([r]) => Math.abs(r - ratio) < 0.005);
  if (hit) return hit[1];
  return ratio >= 1 ? `${ratio.toFixed(2).replace(/\.?0+$/, "")} : 1` : `1 : ${(1 / ratio).toFixed(2).replace(/\.?0+$/, "")}`;
}

/** The library's limits, as the console learns them (`meta.library`). */
export type UploadLimits = { maxKb: number | null };

function sizeLabel(kb: number): string {
  return kb >= 1024 ? `${Math.round((kb / 1024) * 10) / 10} MB` : `${kb} KB`;
}

/**
 * The line under an image field: what to upload, in the field's own terms.
 * "Best at 1200 × 630 px (1.91 : 1) · JPG, PNG or WebP · up to 5 MB" — the
 * size is left out when the console does not know the limit.
 */
export function imageHint(spec: ImageSpecKey | ImageSpec | undefined, limits?: UploadLimits): string {
  const s = specFor(spec);
  const parts: string[] = [];
  if (s) {
    const ratio = ratioLabel(s.ratio);
    parts.push(s.ratio === "free"
      ? `Best up to ${s.width} × ${s.height} px`
      : `Best at ${s.width} × ${s.height} px${ratio ? ` (${ratio})` : ""}`);
  }
  parts.push("JPG, PNG or WebP");
  if (limits?.maxKb) parts.push(`up to ${sizeLabel(limits.maxKb)}`);
  return parts.join(" · ");
}
