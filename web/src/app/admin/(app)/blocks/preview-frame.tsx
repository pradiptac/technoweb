import { activeTheme } from "@/themes";
import { BlockView } from "@/components/blocks/block-view";
import type { AdminContentBlock, ContentBlock } from "@/types/api";

/**
 * Blocks drawn exactly as the public site draws them, inside the console:
 * the public wrapper (`.public-site` with the active theme's `data-theme`),
 * so the 12px floor, the card grounds and the theme's own rules all apply.
 * Each renders its saved public shape (`preview`), drafts included — which
 * is the point of looking.
 */
export async function PreviewFrame({ blocks }: { blocks: AdminContentBlock[] }) {
  const theme = await activeTheme();

  return (
    <div className="public-site overflow-hidden rounded-xl border border-line-strong bg-page" data-theme={theme.manifest.id} data-reveal-static>
      {blocks.map((b) => {
        const block = { id: b.id, type: b.type, layout: b.layout, name: b.name, slug: b.slug, content: b.preview } as unknown as ContentBlock;
        return (
          <section key={b.id} aria-label={b.name} className="border-b border-line last:border-b-0">
            <p className="bg-surface px-4 py-2 font-mono text-12 text-muted">
              {b.shortcode} · {b.layout} · {b.status}
            </p>
            <BlockView block={block} />
          </section>
        );
      })}
    </div>
  );
}
