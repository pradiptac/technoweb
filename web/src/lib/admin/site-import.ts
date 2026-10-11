import "server-only";
import { apiFetch } from "@/lib/api";
import type { SiteImport, SiteImportDecisions, SiteImportIndex } from "@/types/api";
import { token } from "./_shared";

/** The last twenty imports, and the one in flight or waiting, if any. */
export async function getSiteImports(): Promise<SiteImportIndex> {
  return apiFetch<SiteImportIndex>("/admin/imports/site", { token: await token() });
}

export async function getSiteImport(id: number): Promise<SiteImport> {
  const res = await apiFetch<{ data: SiteImport }>(`/admin/imports/site/${id}`, { token: await token() });
  return res.data;
}

/** Start a scan of an address, or of a ZIP already uploaded. */
export async function startSiteImport(payload: Record<string, unknown>): Promise<SiteImport> {
  const res = await apiFetch<{ data: SiteImport }>("/admin/imports/site", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function saveSiteImportDecisions(id: number, decisions: SiteImportDecisions): Promise<SiteImport> {
  const res = await apiFetch<{ data: SiteImport }>(`/admin/imports/site/${id}`, {
    method: "PATCH", body: { decisions }, token: await token(),
  });
  return res.data;
}

/** Commit a reviewed import, or resume one that stopped. */
export async function commitSiteImport(id: number): Promise<SiteImport> {
  const res = await apiFetch<{ data: SiteImport }>(`/admin/imports/site/${id}/commit`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function discardSiteImport(id: number): Promise<SiteImport> {
  const res = await apiFetch<{ data: SiteImport }>(`/admin/imports/site/${id}`, {
    method: "DELETE", token: await token(),
  });
  return res.data;
}
