export type WritingSurface = "body" | "summary" | "ticket_reply" | "campaign_block" | "email_template";
export type WritingModeKey = "write" | "rewrite" | "shorten" | "expand" | "grammar" | "tone";
export type WritingToneKey = "default" | "formal" | "friendly" | "plain";

export interface WritingStatus {
  available: boolean;
  reason: string | null;
  used: number;
  cap: number;
  tones: { value: WritingToneKey; label: string; blurb: string }[];
  modes: { value: WritingModeKey; label: string; needs_brief: boolean }[];
}

export interface WritingRequest {
  surface: WritingSurface;
  mode: WritingModeKey;
  tone?: WritingToneKey;
  brief?: string;
  /** A string for every surface; a campaign block is JSON-encoded. */
  input: string;
  ref: Record<string, unknown>;
  max?: number;
}

/** What a rich-text editor needs to offer writing help: the surface and what the API needs to find the record. */
export interface BodyAi {
  surface: "body" | "email_template";
  ref: Record<string, unknown>;
}

export type WritingOutcome = { ok: true; output: string } | { ok: false; error: string };
