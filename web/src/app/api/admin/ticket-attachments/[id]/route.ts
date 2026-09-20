import { getToken } from "@/lib/admin-auth";
import { streamAttachment } from "@/lib/stream-attachment";

/**
 * A ticket attachment, streamed to a signed-in member of staff. The staff
 * endpoint performs no ownership check and *does* serve internal-note
 * attachments; the customer half is `app/api/portal/ticket-attachments`,
 * with a different rule. See `lib/stream-attachment.ts`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return streamAttachment(await getToken(), "admin/ticket-attachments", id);
}
