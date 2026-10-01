/**
 * Backups and restores, as `GET /admin/backups` and friends answer them
 * (2026-09-27, docs/backups.md). Byte counts are numbers; dates ISO strings.
 */

export type BackupDestinationKey = "s3" | "gdrive" | "ftp";

export type BackupStatus =
  | "pending" | "dumping" | "indexing" | "archiving" | "uploading"
  | "completed" | "completed_with_errors" | "failed" | "cancelled";

export type BackupSummary = {
  id: number;
  uuid: string;
  folder: string;
  type: "full" | "incremental";
  trigger: "schedule" | "manual" | "pre_restore";
  status: BackupStatus;
  error: string | null;
  includes: { database?: boolean; public?: boolean; private?: boolean };
  base_id: number | null;
  parent_id: number | null;
  dumper: "mysqldump" | "php" | null;
  db_bytes: number | null;
  file_count: number;
  files_bytes: number;
  deleted_count: number;
  total_bytes: number;
  created_by: string | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  /** The files are still on this server. */
  local: boolean;
  destinations: {
    key: BackupDestinationKey;
    label: string;
    status: "waiting" | "uploading" | "done" | "failed";
    bytes_sent: number;
    bytes: number;
    error: string | null;
  }[];
  /** Where the whole chain up to this backup can be read from: destination keys and `local`. */
  restorable_from: (BackupDestinationKey | "local")[];
  progress: { archived: number; volumes: number; dump_table: string | null };
  files?: { name: string; size: number; sha256: string }[];
  chain?: { id: number; folder: string; type: "full" | "incremental" }[];
};

export type BackupRestoreStatus =
  | "pending" | "safety" | "downloading" | "importing" | "files" | "finishing"
  | "completed" | "failed" | "cancelled";

export type BackupRestoreSummary = {
  id: number;
  status: BackupRestoreStatus;
  scope: "database" | "files" | "both";
  prune_missing: boolean;
  source: { kind: "local" | "remote"; destination?: BackupDestinationKey; folder: string; from?: string | null };
  folder: string | null;
  chain: { folder: string | null; type: string | null }[];
  error: string | null;
  created_by: string | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  safety_folder: string | null;
  progress: {
    downloaded: number;
    current: { file: string; bytes: number; size: number } | null;
    statements: number;
    sql_percent: number | null;
    files_written: number;
    files_refused: number;
    files_removed: number;
    migrated: boolean;
  };
};

export type BackupDestinationInfo = {
  key: BackupDestinationKey;
  label: string;
  enabled: boolean;
  configured: boolean;
  error: string | null;
  detail: { bucket?: string; endpoint?: string; account?: string; protocol?: string; host?: string; fingerprint?: string };
};

export type BackupIndex = {
  data: BackupSummary[];
  meta: {
    running: BackupSummary | null;
    restore: BackupRestoreSummary | null;
    restoring: boolean;
    last_success: string | null;
    next_run: string | null;
    schedule: { enabled: boolean; time: string; full_day: string; incremental_every: number | null; keep_chains: number };
    includes: { database: boolean; public: boolean; private: boolean };
    destinations: BackupDestinationInfo[];
    error: string | null;
    scheduler: { known?: boolean; last_run_seconds?: number | null; running?: boolean };
    dumper: { chosen: "mysqldump" | "php"; binary: boolean };
    disk_free: number | null;
    code_schema: string;
  };
};

/** A backup folder found on a destination, read from its manifest. */
export type RemoteBackupFolder = {
  folder: string;
  complete: boolean;
  error?: string;
  type?: "full" | "incremental";
  created_at?: string | null;
  includes?: { database?: boolean; public?: boolean; private?: boolean };
  total_bytes?: number;
  chain?: string[];
  newer_schema?: boolean;
};

export type BackupDriveStatus = {
  is_connected: boolean;
  account: string | null;
  connected_at: string | null;
  client_configured: boolean;
  error: string | null;
  callback_path: string;
};
