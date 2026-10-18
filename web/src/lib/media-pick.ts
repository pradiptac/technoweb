import type { MediaItem } from "@/types/api";
import type { PickedFile } from "@/types/media-ai";

/** A media row as `MediaBrowser`'s `onPick` wants it — the one mapping for a picked, an uploaded and a made picture. */
export function pickedFile(item: Pick<MediaItem, "url" | "alt_text" | "path" | "filename" | "size">): PickedFile {
  return { url: item.url, alt: item.alt_text ?? "", path: item.path, name: item.filename, bytes: item.size };
}
