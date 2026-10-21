"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { refreshNewSince, useUnreadNotifications } from "@/app/admin/(app)/new-since";
import { IconAlert, IconAt, IconBell, IconPerson } from "@/components/icons-ui";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { relativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { StaffNotificationRow, StaffNotificationsPage } from "@/types/notifications";

type Filter = "unread" | "all";
type Load = { state: "loading" } | { state: "error" } | { state: "ready"; rows: StaffNotificationRow[] };

const GLYPH = { mention: IconAt, assigned: IconPerson, alert: IconAlert } as const;

/**
 * The console's bell (C2, docs/notifications.md): mentions, assignments and
 * alerts for whoever is signed in. The count rides on the sidebar's minute
 * poll (`useUnreadNotifications`), so the bell adds no request of its own
 * until it is opened. No number is drawn when the count could not be read,
 * and a failed load says so — it is never "Nothing unread".
 *
 * Every sentence on a row is the API's `line`. `tw:notifications` on
 * `window` opens it from the account menu on a phone, where the bar has no
 * room for the button.
 */
export function NotificationBell() {
  const router = useRouter();
  const count = useUnreadNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("unread");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [marking, setMarking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const fetchRows = useCallback(async (which: Filter) => {
    setLoad({ state: "loading" });
    const res = await fetch(`/api/admin/notifications?filter=${which}`, { cache: "no-store" }).catch(() => null);
    const page = res?.ok ? ((await res.json().catch(() => null)) as StaffNotificationsPage | null) : null;
    setLoad(Array.isArray(page?.data) ? { state: "ready", rows: page.data } : { state: "error" });
  }, []);

  const show = useCallback(() => {
    setFilter("unread");
    setOpen(true);
    void fetchRows("unread");
  }, [fetchRows]);

  useEffect(() => {
    window.addEventListener("tw:notifications", show);
    return () => window.removeEventListener("tw:notifications", show);
  }, [show]);

  const choose = (which: Filter) => {
    if (which === filter) return;
    setFilter(which);
    void fetchRows(which);
  };

  const mark = (body: { id: number } | { all: true }) =>
    fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.ok, () => false);

  const openRow = async (row: StaffNotificationRow) => {
    if (row.read_at === null) await mark({ id: row.id });
    refreshNewSince();
    if (row.path) {
      setOpen(false);
      router.push(row.path);
    } else {
      void fetchRows(filter);
    }
  };

  const markAll = async () => {
    setMarking(true);
    await mark({ all: true });
    setMarking(false);
    refreshNewSince();
    void fetchRows(filter);
  };

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const unread = typeof count === "number" && count > 0 ? count : 0;

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={show}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        data-tour="notifications"
        // From `sm`: on a phone the account menu carries "Notifications".
        className="relative hidden size-8 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition-colors hover:border-faint hover:text-brand-ink sm:grid"
      >
        <IconBell width={16} height={16} aria-hidden />
        {unread > 0 && (
          <span aria-hidden className="absolute -right-1.5 -top-1.5 min-w-4.5 rounded-full bg-brand-600 px-1 text-center text-10-5 font-semibold leading-4.5 text-brand-on tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <Modal
        open={open}
        onClose={close}
        title="Notifications"
        size="side"
        dataAttr="notifications-drawer"
        footer={
          load.state === "ready" && load.rows.some((r) => r.read_at === null) ? (
            <Button variant="secondary" size="sm" pending={marking} disabled={marking} onClick={markAll}>
              Mark all read
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-3">
          <div role="tablist" aria-label="Which notifications" className="flex gap-1">
            {(["unread", "all"] as const).map((which) => (
              <button
                key={which}
                type="button"
                role="tab"
                aria-selected={filter === which}
                onClick={() => choose(which)}
                className={cn(
                  "rounded-full px-3 py-1 text-13 font-semibold transition-colors",
                  filter === which ? "bg-brand-600 text-brand-on" : "text-muted hover:text-ink",
                )}
              >
                {which === "unread" ? "Unread" : "All"}
              </button>
            ))}
          </div>

          {load.state === "loading" && (
            <ul aria-busy className="grid gap-2" aria-label="Loading">
              {[0, 1, 2].map((i) => <li key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />)}
            </ul>
          )}

          {load.state === "error" && (
            <p className="text-13 text-err">
              We could not load your notifications. Try again.{" "}
              <button type="button" onClick={() => void fetchRows(filter)} className="font-semibold underline">Retry</button>
            </p>
          )}

          {load.state === "ready" && load.rows.length === 0 && (
            <p className="px-4 py-6 text-center text-14 font-semibold text-ink">{filter === "unread" ? "Nothing unread" : "Nothing yet"}</p>
          )}

          {load.state === "ready" && load.rows.length > 0 && (
            <ul className="grid gap-1.5">
              {load.rows.map((row) => {
                const Glyph = GLYPH[row.group] ?? IconBell;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => void openRow(row)}
                      className="flex w-full items-start gap-3 rounded-lg border border-line-strong bg-card px-3 py-2.5 text-left transition-colors hover:border-faint"
                    >
                      <Glyph width={18} height={18} aria-hidden className="mt-0.5 shrink-0 text-brand-ink" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-14 text-ink [overflow-wrap:anywhere]", row.read_at === null && "font-semibold")}>{row.line}</span>
                        <span className="block text-12 text-muted">{relativeTime(row.created_at, "")}</span>
                      </span>
                      {row.read_at === null && (
                        <>
                          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" />
                          <span className="sr-only">Unread</span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
