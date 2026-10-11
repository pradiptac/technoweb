/**
 * Importing a website with no API (docs/site-import.md) — the shapes
 * `GET /admin/imports/site/{id}` answers with. The report's steps are the
 * WordPress import's (`WordPressImportStep`), so one table draws both.
 */
import type { WordPressImportStep } from "./wordpress-import";

export type SiteImportStatus =
  | "pending" | "scanning" | "analysing" | "ready" | "running" | "completed" | "failed" | "cancelled" | "expired";

export type SiteImportSource = "url" | "zip";

/** What can be asked for: pages are always imported; the rest follow them. */
export type SiteImportSection = "pages" | "menus" | "redirects";

/** Why a page or file was not brought in, grouped, with a few names. */
export type SiteImportSkipped = { reason: string; count: number; examples: string[] };

/** One row of the review's page table. */
export type SiteImportPage = {
  path: string;
  title: string;
  action: "create" | "update" | "skip";
  sections: number;
  /** Section type => how many of it. */
  types: Record<string, number>;
  note: string | null;
};

export type SiteImportMenuChoice = { key: string; label: string; items: number; value: boolean };

/** What the review asks a person to settle, as the API offers it. */
export type SiteImportOptions = {
  set_homepage?: { value: boolean; page: { path: string; title: string } | null };
  menus?: SiteImportMenuChoice[];
};

/** What a `PATCH` sends back. */
export type SiteImportDecisions = {
  set_homepage?: boolean;
  menus?: string[];
  skip?: string[];
};

export type SiteImport = {
  id: number;
  source: SiteImportSource;
  /** The start address, or the ZIP's file name. */
  site_url: string;
  status: SiteImportStatus;
  sections: SiteImportSection[];
  settings: { depth?: number; max_pages?: number };
  error: string | null;
  uploaded_by: string | null;
  created_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  can_resume: boolean;
  /** On history rows only. */
  site_name?: string;
  decisions?: SiteImportDecisions;
  progress?: {
    phase: string | null;
    pages: number;
    queued: number;
    requests: number;
    current: string | null;
    capped: boolean;
    zip_files: number;
    analyse_step: string | null;
    analyse_percent: number;
    commit_step: string | null;
    commit_percent: number;
  };
  site?: {
    name: string;
    url: string;
    pages: number;
    home_path: string | null;
    chrome_blocks: number;
    menus: Record<string, number>;
    capped: boolean;
    skipped: SiteImportSkipped[];
    notes: string[];
  } | null;
  analysis?: {
    steps: WordPressImportStep[];
    notices: string[];
    pages: SiteImportPage[];
    decisions: SiteImportOptions;
    analysed_at: string | null;
  } | null;
  result?: { steps: WordPressImportStep[]; notices: string[] } | null;
};

/** `GET /admin/imports/site`. */
export type SiteImportIndex = {
  data: SiteImport[];
  meta: {
    active: SiteImport | null;
    delivering: boolean;
    sections: SiteImportSection[];
    chunk_bytes: number;
    limits: { depth: number; pages: number; zip_bytes: number };
  };
};
