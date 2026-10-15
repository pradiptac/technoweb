/**
 * The website's own address for a library animation or 3D model (0.172.0).
 *
 * The player fetches the file from script, and a browser refuses a script
 * fetch from another origin unless that origin sends CORS headers — which
 * `php artisan serve` never does. `/motion-file/…` hands the same file on
 * from this origin (the `/font/[name]` reasoning). Anything that is not a
 * library upload of one of the three kinds is returned unchanged.
 * shortcut: a media CDN is bypassed for these files; route them through the
 * CDN once it sends CORS headers.
 */
const LIBRARY_FILE = /\/storage\/(media\/\d{4}\/\d{2}\/[A-Za-z0-9]{40}\.(?:json|lottie|glb))$/;

export function motionFileUrl(url: string): string {
  try {
    const parsed = new URL(url, "http://local");
    const match = LIBRARY_FILE.exec(parsed.pathname);
    return match ? `/motion-file/${match[1]}${parsed.search}` : url;
  } catch {
    return url;
  }
}
