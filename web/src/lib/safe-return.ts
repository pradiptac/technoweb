/**
 * Where to send somebody after they sign in, from a `return` parameter.
 *
 * The parameter is attacker-controlled — anybody can mail a link to
 * `/portal/login?return=…` — so only a **same-site path** is honoured: it
 * begins with `/`, and not with `//` or `/\`, which a browser reads as
 * another host ("protocol-relative"). A backslash or a control character
 * anywhere is refused too, because browsers normalise `\` to `/` and strip
 * tabs and newlines from URLs before they resolve them, so `/\t/evil.test`
 * is `//evil.test` by the time it is followed. Anything else is the
 * fallback. No directive: the login page, its actions and a check script
 * all import it.
 */
export function safeReturnPath(value: unknown, fallback = "/portal"): string {
  if (typeof value !== "string") return fallback;

  const path = value.trim();

  if (
    path === "" ||
    path.length > 512 ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(path)
  ) {
    return fallback;
  }

  return path;
}
