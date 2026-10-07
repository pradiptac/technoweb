/**
 * The props that make a picture load over its blurred preview (0.123.0).
 *
 * Every library picture carries a tiny preview — a twelve-pixel WebP as a
 * `data:` URL, made by the API when the file is uploaded or edited — and
 * every resource publishes it as `*_blur` beside the `*_focus` it already
 * sent. Spread onto a `next/image`, it becomes the picture's placeholder:
 * `next/image` stretches and blurs it behind the `<img>` until the real
 * bytes arrive, then removes it.
 *
 * An empty object for a missing preview, deliberately — the rule
 * `focalStyle` follows: a vector, a path with no library row, or a response
 * from before the column existed renders byte-identically to how it always
 * did. The placeholder also follows the picture's `object-position`, so a
 * focal point moves the blur with it.
 *
 * No directive at the top: server components (tiles, heroes) and client
 * components (sliders, galleries) both use it.
 *
 * Not for a picture drawn smaller than about 120px: the preview is a
 * couple of hundred bytes in the page's HTML for every picture that carries
 * one, and an avatar is painted before anybody could see it load.
 */
export function blurProps(blur?: string | null): { placeholder?: "blur"; blurDataURL?: string } {
  return blur && blur.startsWith("data:image/") ? { placeholder: "blur", blurDataURL: blur } : {};
}
