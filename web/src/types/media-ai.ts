export type ImageShapeKey = "wide" | "landscape" | "square" | "portrait" | "banner";
export type ImageStyleKey = "photo" | "illustration" | "render" | "flat";

export interface ImageStatus {
  available: boolean;
  reason: string | null;
  used: number;
  cap: number;
  styles: { value: ImageStyleKey; label: string }[];
  shapes: { value: ImageShapeKey; label: string; ratio: string }[];
}

export interface MadeImage { token: string; width: number; height: number; model: string; mime: string }

export type MakeOutcome = { ok: true; image: MadeImage } | { ok: false; error: string };

/** What a picker hands its caller; the same five fields whether a file was picked, uploaded or made. */
export interface PickedFile { url: string; alt: string; path: string; name: string; bytes: number }

export type KeepOutcome = { ok: true; file: PickedFile } | { ok: false; error: string };
