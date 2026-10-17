import type { Paginated } from "@/types/api";

export type HealthSeverity = "error" | "warning" | "notice";
export type HealthGroup = "links" | "stale" | "accessibility";

/** One problem on one record, worded by the API (docs/health.md). */
export type HealthRow = {
  id: number;
  check: string;
  group: HealthGroup;
  severity: HealthSeverity;
  sentence: string;
  field: string;
  field_label: string;
  detail: Record<string, string | number>;
  subject: { type: string; type_label: string; id: number; title: string | null };
  /** A console path to the record's edit screen, on the right tab. Null when the record has gone. */
  admin_path: string | null;
  first_seen_at: string | null;
  ignored_at: string | null;
};

type Counts = Record<HealthSeverity, number>;
type Option = { value: string; label: string };

export type HealthList = Paginated<HealthRow> & {
  meta: {
    summary: Record<HealthGroup, Counts>;
    /** Administrators only; absent for every other role. */
    score?: { value: number | null; series: { date: string; score: number | null }[]; change: number | null };
    last_sweep_at: string | null;
    /** Administrators only. */
    links_due?: number;
    groups: Option[];
    severities: Option[];
    kinds: Option[];
  };
};
