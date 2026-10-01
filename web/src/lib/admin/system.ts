import "server-only";
import { apiFetch } from "@/lib/api";
import type { SystemStatus, UpdateRun, UpdatesIndex } from "@/types/system";
import { token } from "./_shared";

/** System → Status: the installed version, the server's PHP, the scheduler, the website. */
export async function getSystemStatus(): Promise<SystemStatus> {
  const res = await apiFetch<{ data: SystemStatus }>("/admin/system/status", { token: await token() });
  return res.data;
}

/** System → Updates: the zips waiting, the run in progress, the history. */
export async function getUpdates(): Promise<UpdatesIndex> {
  const res = await apiFetch<{ data: UpdatesIndex }>("/admin/system/updates", { token: await token() });
  return res.data;
}

export async function applyUpdate(file: string): Promise<UpdateRun> {
  const res = await apiFetch<{ data: UpdateRun }>("/admin/system/updates/apply", {
    method: "POST", body: { file }, token: await token(),
  });
  return res.data;
}

/**
 * One slice of the run; the screen calls this until the run stops moving.
 *
 * With the run's key it goes to `/system/updates/continue`, which needs no
 * session: a rollback's restore drops the sign-in tables while these steps
 * are what drive it (`Updater::stepWithKey`). Without one — a run the screen
 * has not been handed yet — it goes as the signed-in administrator.
 */
export async function stepUpdate(key?: string): Promise<UpdateRun | null> {
  const res = key
    ? await apiFetch<{ data: UpdateRun | null }>("/system/updates/continue", { method: "POST", headers: { "X-Update-Key": key } })
    : await apiFetch<{ data: UpdateRun | null }>("/admin/system/updates/step", { method: "POST", token: await token() });
  return res.data;
}

export async function retryUpdate(): Promise<UpdateRun> {
  const res = await apiFetch<{ data: UpdateRun }>("/admin/system/updates/retry", { method: "POST", token: await token() });
  return res.data;
}

export async function rollbackUpdate(): Promise<UpdateRun> {
  const res = await apiFetch<{ data: UpdateRun }>("/admin/system/updates/rollback", { method: "POST", token: await token() });
  return res.data;
}

export async function abandonUpdate(): Promise<void> {
  await apiFetch("/admin/system/updates/abandon", { method: "POST", token: await token() });
}

export async function deleteUpdatePackage(file: string): Promise<void> {
  await apiFetch(`/admin/system/updates/packages/${encodeURIComponent(file)}`, { method: "DELETE", token: await token() });
}
