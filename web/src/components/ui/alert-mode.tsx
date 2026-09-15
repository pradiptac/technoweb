"use client";

import { createContext, type ReactNode } from "react";

/**
 * Inside this provider, an `Alert` that reports an outcome — a dismissible
 * `ok` or `err` — is raised as a toast and renders nothing inline. The
 * console's layout wraps its screens in it; the public site and the portal
 * do not, so their alerts stay in the flow.
 *
 * A provider rather than a prop on 149 call sites: the client asked for
 * every console notice to arrive the same way — a card that floats in,
 * counts down and leaves — and the forms that raise them already say what
 * happened through `Alert`. The switch is the *area*, not the message.
 * `info` and `warn` stay inline everywhere: those are standing information
 * about the screen (the applications page explaining that a status change
 * emails nobody), and so is anything passed `dismissible={false}`.
 */
export const AlertsAsToasts = createContext(false);

export function AlertsAsToastsProvider({ children }: { children: ReactNode }) {
  return <AlertsAsToasts.Provider value={true}>{children}</AlertsAsToasts.Provider>;
}
