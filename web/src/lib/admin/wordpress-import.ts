import "server-only";
import { apiFetch } from "@/lib/api";
import type { WordPressImport, WordPressImportDecisions, WordPressImportIndex } from "@/types/api";
import { token } from "./_shared";

/** The last twenty imports, and the one in flight or waiting, if any. */
export async function getWordPressImports(): Promise<WordPressImportIndex> {
  return apiFetch<WordPressImportIndex>("/admin/imports/wordpress", { token: await token() });
}

export async function getWordPressImport(id: number): Promise<WordPressImport> {
  const res = await apiFetch<{ data: WordPressImport }>(`/admin/imports/wordpress/${id}`, { token: await token() });
  return res.data;
}

/** Start a scan. The credentials go to the API once and are never stored. */
export async function startWordPressImport(payload: Record<string, unknown>): Promise<WordPressImport> {
  const res = await apiFetch<{ data: WordPressImport }>("/admin/imports/wordpress", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function saveWordPressDecisions(id: number, decisions: WordPressImportDecisions): Promise<WordPressImport> {
  const res = await apiFetch<{ data: WordPressImport }>(`/admin/imports/wordpress/${id}`, {
    method: "PATCH", body: { decisions }, token: await token(),
  });
  return res.data;
}

/** Commit a reviewed import, or resume one that stopped. */
export async function commitWordPressImport(id: number): Promise<WordPressImport> {
  const res = await apiFetch<{ data: WordPressImport }>(`/admin/imports/wordpress/${id}/commit`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function discardWordPressImport(id: number): Promise<WordPressImport> {
  const res = await apiFetch<{ data: WordPressImport }>(`/admin/imports/wordpress/${id}`, {
    method: "DELETE", token: await token(),
  });
  return res.data;
}
