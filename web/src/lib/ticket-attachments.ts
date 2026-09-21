/**
 * The ticket attachment rules as the three ticket forms state them — the
 * portal reply, the console reply and the new-ticket form used to carry
 * three copies of the `accept` list and the hint. The API's rule is
 * `App\Support\Tickets\AttachmentStore` (the extensions, `MAX_FILES`,
 * `support.attachment_max_kb`); these restate it so a refusal is a sentence
 * under the list rather than a 422 after the upload, and they have to agree
 * with it.
 */
export const TICKET_ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv";
export const TICKET_ATTACHMENT_MAX = 5;
export const TICKET_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** The line under the control — the allowed extensions derived from `accept`, never typed twice. */
export const TICKET_ATTACHMENT_HINT =
  `Allowed: ${TICKET_ATTACHMENT_ACCEPT.split(",").join(", ")}. Up to ${TICKET_ATTACHMENT_MAX} files, 10 MB each — or paste a screenshot with Ctrl+V.`;
