/** `GET /admin/search/semantic` — search by meaning's status (docs/semantic-search.md). */
export type SemanticStatus = {
  enabled: boolean;
  model: string;
  passages: { total: number; embedded: number; waiting: number };
  today: { phrases: number; cap: number };
  /** OpenRouter's last refusal in its own words, or null. */
  error: string | null;
  /** ISO 8601 of the last full index, or null before the first. */
  last_index_at: string | null;
  /** An index run is in progress (a re-index is refused meanwhile). */
  indexing: boolean;
};
