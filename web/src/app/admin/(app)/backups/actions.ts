"use server";

import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  authorizeBackupDrive, cancelRestore, completeBackupDrive, deleteBackup, disconnectBackupDrive, forgetSftpKey,
  getBackups, getDestinationFolders, getRestore, startBackup, startRestore, testBackupDestination,
} from "@/lib/admin";
import type { BackupIndex, BackupRestoreSummary, BackupSummary, RemoteBackupFolder } from "@/types/api";
import { revalidateSettingsScreens } from "../settings/revalidate";

export type BackupActionResult = { ok?: string; error?: string };

const PAGE = "/admin/backups";

/** The API's own sentence: the first field error, else the message. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only an administrator can manage backups.";

    const first = Object.values(error.errors ?? {})[0]?.[0];

    return first || error.message || fallback;
  }

  return fallback;
}

export async function startBackupAction(type: "full" | "incremental"): Promise<{ backup?: BackupSummary; error?: string }> {
  try {
    const backup = await startBackup(type);
    revalidatePath(PAGE);

    return { backup };
  } catch (error) {
    return { error: reason(error, "The backup could not be started.") };
  }
}

/** What the screen polls. Null when the request failed — the screen keeps what it had. */
export async function pollBackupsAction(): Promise<BackupIndex | null> {
  try {
    return await getBackups();
  } catch {
    return null;
  }
}

export async function deleteBackupAction(id: number): Promise<BackupActionResult> {
  try {
    await deleteBackup(id);
    revalidatePath(PAGE);

    return { ok: "Done." };
  } catch (error) {
    return { error: reason(error, "That backup could not be deleted.") };
  }
}

export async function testDestinationAction(key: string): Promise<BackupActionResult> {
  try {
    return { ok: await testBackupDestination(key) };
  } catch (error) {
    return { error: reason(error, "The destination could not be reached.") };
  }
}

export async function destinationFoldersAction(key: string): Promise<{ folders?: RemoteBackupFolder[]; total?: number; error?: string }> {
  try {
    const res = await getDestinationFolders(key);

    return { folders: res.data, total: res.meta.total };
  } catch (error) {
    return { error: reason(error, "The destination could not be read.") };
  }
}

export async function forgetSftpKeyAction(): Promise<BackupActionResult> {
  try {
    await forgetSftpKey();
    revalidateSettingsScreens();

    return { ok: "Forgotten. The next test or backup pins whichever key the server offers." };
  } catch (error) {
    return { error: reason(error, "The key could not be forgotten.") };
  }
}

/**
 * Start the Drive consent. The shape of `connectInboundMailboxAction`: the
 * origin read from the request so the registered callback is the host the
 * administrator is actually on, and a redirect out of the action.
 */
export async function connectDriveAction(): Promise<BackupActionResult> {
  const host = (await headers()).get("host");
  const proto = (await headers()).get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  let url: string;
  try {
    url = await authorizeBackupDrive(`${proto}://${host}`);
  } catch (error) {
    return { error: reason(error, "We could not start the connection. Save the client ID and secret first.") };
  }

  redirect(url);
}

export async function finishDriveConnection(code: string, state: string): Promise<BackupActionResult> {
  try {
    const account = await completeBackupDrive(code, state);
    revalidateSettingsScreens();

    return { ok: account };
  } catch (error) {
    return { error: reason(error, "That connection did not complete. Start again from Backup settings.") };
  }
}

export async function disconnectDriveAction(): Promise<BackupActionResult> {
  try {
    await disconnectBackupDrive();
    revalidateSettingsScreens();

    return { ok: "Disconnected. Backups stop going to Google Drive until it is connected again." };
  } catch (error) {
    return { error: reason(error, "We could not disconnect Google Drive.") };
  }
}

export async function startRestoreAction(payload: Parameters<typeof startRestore>[0]): Promise<{ restore?: BackupRestoreSummary; error?: string }> {
  try {
    return { restore: await startRestore(payload) };
  } catch (error) {
    return { error: reason(error, "The restore could not be started.") };
  }
}

/** Null while the API is unreachable, or while a restored token table has signed us out. */
export async function pollRestoreAction(id: number): Promise<BackupRestoreSummary | null> {
  try {
    return await getRestore(id);
  } catch {
    return null;
  }
}

export async function cancelRestoreAction(id: number): Promise<{ restore?: BackupRestoreSummary; error?: string }> {
  try {
    return { restore: await cancelRestore(id) };
  } catch (error) {
    return { error: reason(error, "The restore could not be cancelled.") };
  }
}

/**
 * After a restore: every cached page on the public site was rendered from the
 * database that has just been replaced, so the whole layout's cache goes,
 * and the settings with it. Heavy — but a restore is the one time every
 * cached page is wrong at once.
 */
export async function afterRestoreAction(): Promise<void> {
  revalidatePath("/", "layout");
  updateTag("settings");
}
