import "server-only";
import { apiFetch } from "@/lib/api";
import type {
  BackupDriveStatus, BackupIndex, BackupRestoreSummary, BackupSummary, RemoteBackupFolder,
} from "@/types/api";
import { token } from "./_shared";

/** The last sixty backups, and the state of the whole feature. */
export async function getBackups(): Promise<BackupIndex> {
  return apiFetch<BackupIndex>("/admin/backups", { token: await token() });
}

export async function getBackup(id: number): Promise<BackupSummary> {
  const res = await apiFetch<{ data: BackupSummary }>(`/admin/backups/${id}`, { token: await token() });
  return res.data;
}

/** "Back up now". 202: the backup worker picks it up within the minute. */
export async function startBackup(type: "full" | "incremental"): Promise<BackupSummary> {
  const res = await apiFetch<{ data: BackupSummary }>("/admin/backups", {
    method: "POST", body: { type }, token: await token(),
  });
  return res.data;
}

/** Cancel one running, or delete one that nothing builds on. */
export async function deleteBackup(id: number): Promise<void> {
  await apiFetch(`/admin/backups/${id}`, { method: "DELETE", token: await token() });
}

export async function testBackupDestination(key: string): Promise<string> {
  const res = await apiFetch<{ data: { message: string } }>(`/admin/backups/destinations/${key}/test`, {
    method: "POST", token: await token(),
  });
  return res.data.message;
}

/** What a destination holds, newest first — the disaster-recovery view. */
export async function getDestinationFolders(key: string): Promise<{ data: RemoteBackupFolder[]; meta: { total: number } }> {
  return apiFetch(`/admin/backups/destinations/${key}/folders`, { token: await token() });
}

export async function forgetSftpKey(): Promise<void> {
  await apiFetch("/admin/backups/destinations/ftp/forget-key", { method: "POST", token: await token() });
}

export async function getBackupDriveStatus(): Promise<BackupDriveStatus> {
  const res = await apiFetch<{ data: BackupDriveStatus }>("/admin/backups/drive", { token: await token() });
  return res.data;
}

/** The consent URL. The callback is this console's own path on the host it is being used at. */
export async function authorizeBackupDrive(origin: string): Promise<string> {
  const res = await apiFetch<{ data: { url: string } }>("/admin/backups/drive/authorize", {
    method: "POST", body: { redirect_uri: `${origin}/admin/backups/drive/callback` }, token: await token(),
  });
  return res.data.url;
}

export async function completeBackupDrive(code: string, state: string): Promise<string> {
  const res = await apiFetch<{ data: { account: string } }>("/admin/backups/drive/callback", {
    method: "POST", body: { code, state }, token: await token(),
  });
  return res.data.account;
}

export async function disconnectBackupDrive(): Promise<void> {
  await apiFetch("/admin/backups/drive/disconnect", { method: "POST", token: await token() });
}

export async function startRestore(payload: {
  backup_id?: number; from?: string; destination?: string; folder?: string;
  scope: "database" | "files" | "both"; prune_missing: boolean; confirm: string;
}): Promise<BackupRestoreSummary> {
  const res = await apiFetch<{ data: BackupRestoreSummary }>("/admin/backups/restores", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function getRestore(id: number): Promise<BackupRestoreSummary> {
  const res = await apiFetch<{ data: BackupRestoreSummary }>(`/admin/backups/restores/${id}`, { token: await token() });
  return res.data;
}

export async function cancelRestore(id: number): Promise<BackupRestoreSummary> {
  const res = await apiFetch<{ data: BackupRestoreSummary }>(`/admin/backups/restores/${id}`, {
    method: "DELETE", token: await token(),
  });
  return res.data;
}
