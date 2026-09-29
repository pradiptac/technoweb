"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  abandonUpdate, applyUpdate, deleteUpdatePackage, getUpdates, retryUpdate, rollbackUpdate, stepUpdate,
} from "@/lib/admin";
import type { UpdateRun, UpdatesIndex } from "@/types/system";

type Result<T> = { data?: T; error?: string };

/** The API's own sentence: the first field error, else the message. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only an administrator can update the software.";

    return Object.values(error.errors ?? {})[0]?.[0] || error.message || fallback;
  }

  return fallback;
}

async function attempt<T>(fn: () => Promise<T>, fallback: string): Promise<Result<T>> {
  try {
    return { data: await fn() };
  } catch (error) {
    return { error: reason(error, fallback) };
  }
}

export async function loadUpdatesAction(): Promise<Result<UpdatesIndex>> {
  return attempt(getUpdates, "The update screen could not be refreshed.");
}

export async function applyUpdateAction(file: string): Promise<Result<UpdateRun>> {
  return attempt(() => applyUpdate(file), "The update could not be started.");
}

/**
 * One step of the run. A network failure is not an update failure — the
 * request may simply have been cut off while the folders were swapped — so
 * the screen retries a failed step a few times before it says anything.
 */
export async function stepUpdateAction(key?: string): Promise<Result<UpdateRun | null>> {
  return attempt(() => stepUpdate(key), "The server did not answer this step.");
}

export async function retryUpdateAction(): Promise<Result<UpdateRun>> {
  return attempt(retryUpdate, "The update could not be carried on.");
}

export async function rollbackUpdateAction(): Promise<Result<UpdateRun>> {
  return attempt(rollbackUpdate, "The rollback could not be started.");
}

export async function abandonUpdateAction(): Promise<Result<null>> {
  return attempt(async () => { await abandonUpdate(); return null; }, "The update could not be put aside.");
}

export async function deletePackageAction(file: string): Promise<Result<null>> {
  return attempt(async () => { await deleteUpdatePackage(file); return null; }, "That file could not be deleted.");
}
