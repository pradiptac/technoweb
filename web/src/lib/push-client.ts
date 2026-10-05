"use client";

import type { PushConfig } from "@/lib/push";

/**
 * Turning this browser into an FCM registration token — imported only when
 * the bell is pressed, so nothing here costs a visitor who never presses it.
 *
 * **No Firebase SDK.** The SDK's `getToken()` is three steps, and this is
 * those three steps against the same two public endpoints it calls: a Web
 * Push subscription with the project's VAPID key, a Firebase installation
 * (`firebaseinstallations.googleapis.com`), and a registration that trades
 * the subscription for a token (`fcmregistrations.googleapis.com`). Both
 * hosts are in `connect-src`; nothing is loaded from a CDN, and the service
 * worker handles the push itself.
 *
 * The worker is the site's one worker, `/sw.js`, which imports the push
 * handlers (2026-10-05): a scope holds one worker, and the installable app
 * registers at the same scope. So a registration that already exists is
 * reused as it is — re-registering with a different query string would
 * switch the app's offline caching off — and only a browser with none
 * registers the push-only form.
 */

const WORKER = "/sw.js?pwa=0";
export const TOKEN_KEY = "tw_push_token";
export const PUSH_EVENT = "tw:push";

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  arr.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/** A Firebase installation id: 22 characters of base64url, the first nibble 0111. */
function fid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(17));
  bytes[0] = 0b01110000 + (bytes[0] % 0b00010000);
  return b64url(bytes).slice(0, 22);
}

export function supported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Ask, subscribe, register — and answer the FCM token, or throw a sentence. */
export async function subscribe(config: PushConfig): Promise<string> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked for this site in your browser's settings.");

  const existing = await navigator.serviceWorker.getRegistration("/");
  const registration = existing?.active ? existing : await navigator.serviceWorker.register(WORKER, { scope: "/" });
  await navigator.serviceWorker.ready;

  const subscription = (await registration.pushManager.getSubscription())
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(config.vapidKey) });

  const install = await fetch(`https://firebaseinstallations.googleapis.com/v1/projects/${config.projectId}/installations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "x-goog-api-key": config.apiKey },
    body: JSON.stringify({ fid: fid(), authVersion: "FIS_v2", appId: config.appId, sdkVersion: "w:0.6.4" }),
  });
  if (!install.ok) throw new Error("Firebase refused this site's web configuration.");
  const auth = (await install.json())?.authToken?.token as string | undefined;
  if (!auth) throw new Error("Firebase did not answer as expected.");

  const p256dh = subscription.getKey("p256dh");
  const key = subscription.getKey("auth");
  if (!p256dh || !key) throw new Error("This browser's push subscription is incomplete.");

  const registered = await fetch(`https://fcmregistrations.googleapis.com/v1/projects/${config.projectId}/registrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json",
      "x-goog-api-key": config.apiKey, "x-goog-firebase-installations-auth": `FIS ${auth}`,
    },
    body: JSON.stringify({ web: { endpoint: subscription.endpoint, auth: b64url(key), p256dh: b64url(p256dh), applicationPubKey: config.vapidKey } }),
  });
  if (!registered.ok) throw new Error("Firebase could not register this browser for notifications.");
  const token = (await registered.json())?.token as string | undefined;
  if (!token) throw new Error("Firebase did not return a token.");

  return token;
}

/** Drop the browser's push subscription; the API is told separately. */
export async function unsubscribe(): Promise<void> {
  // By the scope the page is in, not the script: the worker may be `/sw.js`
  // with any query string, or the push worker a browser registered before.
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}
