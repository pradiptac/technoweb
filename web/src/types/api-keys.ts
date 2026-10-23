/*
 * API keys for the `/ext` surface, as the admin API sends them
 * (`App\Http\Resources\Admin\ApiKeyResource`, `docs/api-keys`).
 *
 * `key` is on the 201 that made a key and on the roll that replaced it, and
 * on no read: only its hash is stored, so it cannot be sent again.
 */

export type ApiKeyStatus = "active" | "expired" | "revoked";

export type ApiScopeOption = { value: string; label: string; blurb: string };

export type AdminApiKey = {
  id: number;
  name: string;
  /** The first characters of the key, enough to tell two apart. */
  prefix: string;
  scopes: string[];
  scope_labels: string[];
  expires_at: string | null;
  is_expired: boolean;
  revoked_at: string | null;
  status: ApiKeyStatus;
  allowed_ips: string[];
  last_used_at: string | null;
  last_used_ip: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  /** The index only. */
  requests_30d?: number;
  /** Present once, on a create or a roll. */
  key?: string;
};

export type ApiKeyRequestRow = {
  id: number;
  method: string;
  path: string;
  status: number;
  ip: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type ApiKeyDayCount = { date: string; count: number };
