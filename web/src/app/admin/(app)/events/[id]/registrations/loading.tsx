import { DetailSkeleton } from "@/components/admin/skeletons";

/**
 * This list while it loads. Its own file, or the event form's skeleton —
 * `[id]/loading.tsx`, one segment up — would stand in for a table.
 */
export default function Loading() {
  return <DetailSkeleton />;
}
