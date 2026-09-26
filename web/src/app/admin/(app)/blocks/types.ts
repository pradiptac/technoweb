import type { BlockType } from "@/types/api";

/** The four kinds, as the path segment names them (`/admin/blocks/cta`). */
export const BLOCK_TYPES: BlockType[] = ["cta", "stats", "pricing", "stack"];

export function blockType(value: string | undefined): BlockType | null {
  return BLOCK_TYPES.includes(value as BlockType) ? (value as BlockType) : null;
}
