import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { PageSection } from "@/types/api";

/**
 * The page builder's unsaved preview, held for a few minutes on the server.
 *
 * The preview used to be JSX returned from a Server Action into the console's
 * Modal. That breaks as soon as a section contains a client component the
 * console page never imports — the YouTube facade, a gallery's lightbox, a
 * form, a CTA's countdown — because the RSC payload names a client module
 * the page's client manifest does not hold ("Could not find the module … in
 * the React Client Manifest", found 2026-09-26 by driving it). So the action
 * keeps the presented sections here and the Modal frames a real page,
 * `/admin/draft-preview/{id}`, which gets its own full client bundle — the
 * way the saved preview already worked.
 *
 * A draft is bound to the staff session that made it (a hash of its token,
 * never the token), lives ten minutes and is read by that session only. It
 * is process memory on `globalThis`, so every route bundle in the one Node
 * process shares it; a restart loses the drafts, which costs one more press
 * of Preview.
 */
type Draft = { owner: string; sections: PageSection[]; expires: number };

const TTL_MS = 10 * 60 * 1000;
/*
 * The live preview (0.112.0) makes one draft per pause in typing, so the cap
 * has room for several editors at once; a draft is a few kilobytes of JSON.
 */
const MAX = 400;

const store = ((globalThis as { __twPreviewDrafts?: Map<string, Draft> }).__twPreviewDrafts ??= new Map());

const ownerOf = (token: string) => createHash("sha256").update(token).digest("hex");

export function keepPreviewDraft(token: string, sections: PageSection[]): string {
  const now = Date.now();
  for (const [id, draft] of store) if (draft.expires < now) store.delete(id);
  while (store.size >= MAX) store.delete(store.keys().next().value as string);

  const id = randomBytes(16).toString("hex");
  store.set(id, { owner: ownerOf(token), sections, expires: now + TTL_MS });

  return id;
}

export function readPreviewDraft(id: string, token: string): PageSection[] | null {
  const draft = /^[a-f0-9]{32}$/.test(id) ? store.get(id) : undefined;
  if (!draft || draft.expires < Date.now() || draft.owner !== ownerOf(token)) return null;

  return draft.sections;
}
