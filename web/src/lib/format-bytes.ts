/**
 * A byte count as people read it: "512 B", "48 KB", "2.3 MB".
 *
 * One definition. `file-drop.tsx` and `use-upload-form.ts` each carried
 * their own (2026-09-21), and they had drifted: one rounded anything under
 * a kilobyte up to "1 KB", so a 500-byte file read differently in the two
 * upload controls that sit on the same screens. This is the honest one.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
