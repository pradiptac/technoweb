import { llmsFull } from "@/lib/llms";

/** `/llms-full.txt` — the index plus the text of every page it lists. See `lib/llms.ts`. */
export const revalidate = 3600;

export async function GET() {
  return new Response(await llmsFull(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
