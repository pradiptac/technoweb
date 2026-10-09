/**
 * Bulk actions on a console list (0.139.0): what `POST /admin/{entity}/bulk`
 * answers, and what the bar over a list's rows is told about it.
 *
 * No directive: both the server library and the client bar import these.
 */

/** The four things a list's ticked rows can be asked to do. */
export type BulkAction = "publish" | "draft" | "archive" | "delete";

export const BULK_ACTIONS: readonly BulkAction[] = ["publish", "draft", "archive", "delete"];

/** One row the API would not move, in its own words. */
export type BulkRefusal = { id: number; title: string; message: string };

/** The API's answer — 200 always, with what it did and what it refused. */
export type BulkResult = { updated: number[]; refused: BulkRefusal[] };

/**
 * What a bulk Server Action hands back to the bar.
 *
 * `ok` is the sentence for a toast; `refused` is listed in place until
 * dismissed; `error` is a failure of the whole request (a role, the network)
 * and nothing was changed.
 */
export type BulkState = {
  ok?: string;
  error?: string;
  refused?: BulkRefusal[];
};
