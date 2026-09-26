/*
 * The push service worker, at the path Firebase expects one to live.
 *
 * It carries no Firebase code. FCM delivers an ordinary Web Push message, so
 * this handles `push` and `notificationclick` itself: the payload FCM sends a
 * browser is `{ notification: { title, body, image }, data: { link }, ... }`,
 * and anything it leaves out — a title, an icon — comes from
 * `/push/sw-config`, a route handler built from the site's settings, because
 * a static file cannot read them.
 *
 * Registered only when somebody presses the push bell (`lib/push-client.ts`);
 * nothing on the site registers it on load.
 */

let config = null;

async function siteConfig() {
  if (config) return config;
  try {
    const res = await fetch("/push/sw-config", { credentials: "omit" });
    config = res.ok ? await res.json() : {};
  } catch {
    config = {};
  }
  return config;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { body: event.data ? event.data.text() : "" } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};

  event.waitUntil(
    siteConfig().then((site) => self.registration.showNotification(notification.title || site.name || "Technoware", {
      body: notification.body || "",
      icon: notification.icon || site.icon || "/favicon.ico",
      image: notification.image || undefined,
      data: { link: data.link || (payload.fcmOptions && payload.fcmOptions.link) || "/" },
    })),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  const url = new URL(link, self.location.origin);

  // Only this site's pages are opened from a notification.
  const target = url.origin === self.location.origin ? url.href : self.location.origin + "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
