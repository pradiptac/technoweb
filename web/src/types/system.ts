/** System → Status and Updates (docs/distribution.md). The API's shapes, as it sends them. */

export type AppVersionInfo = { version: string; commit: string | null; built_at: string | null };

export type RequirementCheck = { key: string; label: string; ok: boolean; required: boolean; detail: string };

export type SystemStatus = {
  version: AppVersionInfo;
  code_schema: string;
  database_schema: string;
  installed: { installed_at?: string; installed_version?: string; updated_at?: string; version?: string } | null;
  php: { version: string; checks: RequirementCheck[]; max_execution_time: number; memory_limit: string };
  scheduler: { known: boolean; last_run_seconds?: number | null; running?: boolean };
  disk: { free: number | null; total: number | null };
  website: { reachable: boolean; version: string | null; api: boolean | null; url: string; error: string | null };
};

export type ChangelogEntry = { version: string; date: string; text: string };

export type UpdatePackage = {
  file: string;
  size: number | null;
  version?: string;
  built_at?: string | null;
  signed: boolean;
  /** Why it may not be applied — null when it may. */
  refusal: string | null;
  same_version?: boolean;
  changes_database?: boolean;
  new_migrations?: number;
  changelog?: ChangelogEntry[];
};

/** A forward step, a rollback step, or where the run ended. */
export type UpdateStatus =
  | "preflight" | "backup" | "extract" | "swap" | "swapping" | "migrate" | "seed" | "steps" | "optimize" | "web" | "warm"
  | "rb_swap" | "rb_swapping" | "rb_database" | "rb_optimize" | "rb_web" | "rb_warm"
  | "done" | "rolled_back" | "failed";

export type UpdateRun = {
  id: string;
  /** The run's own key: steps are driven with it once a restore has dropped the sign-in tables. */
  key?: string;
  kind: "update";
  file?: string;
  from: string;
  to: string;
  status: UpdateStatus;
  failed_at?: UpdateStatus;
  error?: string;
  site_open?: boolean;
  started_at: string;
  finished_at?: string;
  touched_at?: string;
  by?: { id: number; name: string };
  extract_next?: number;
  extract_total?: number;
  migrations_remaining?: number;
  warm_next?: number;
  web_waiting?: boolean;
  backup_folder?: string;
  log: { at: string; line: string }[];
};

export type UpdateHistoryEntry = {
  kind: "update" | "rollback";
  from: string;
  to: string;
  started_at: string;
  finished_at: string;
  by: string | null;
  backup_folder: string | null;
  migrated: boolean;
};

export type UpdatesIndex = {
  installed: AppVersionInfo;
  /** False on a developer's checkout, which is updated with git. */
  updatable: boolean;
  packages_dir: string | null;
  packages: UpdatePackage[];
  run: UpdateRun | null;
  history: UpdateHistoryEntry[];
  rollback: { from: string; to: string | null; database: boolean } | null;
  chunk_bytes: number;
};
