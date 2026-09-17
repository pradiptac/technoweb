import { getToken } from "@/lib/auth";
import { streamAttachment } from "@/lib/stream-attachment";

/**
 * A ticket attachment, streamed to the customer whose ticket it is. The
 * customer endpoint checks `customer_id` ownership and refuses anything
 * hanging off an internal note — the staff half is a separate route on
 * purpose. See `lib/stream-attachment.ts`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return streamAttachment(await getToken(), "ticket-attachments", id);
}
