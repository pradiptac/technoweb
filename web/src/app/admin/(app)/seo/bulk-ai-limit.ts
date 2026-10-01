/**
 * The most records one bulk assistant run queues per record type: the API's
 * `ids` maximum on `POST /admin/seo/ai/bulk`. Shared by the button, which
 * counts what will actually be queued, and the action, which sends no more.
 *
 * A module with no directive, because a constant exported from a
 * `"use client"` file reaches a server module as a reference, and a
 * `"use server"` file may export only async functions (the `COMPARE_MAX`
 * lesson in `lib/compare-max.ts`).
 */
export const BULK_AI_PER_TYPE = 25;
