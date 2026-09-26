import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getBlock, getBrandOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminContentBlock, BlockMeta } from "@/types/api";
import { BlockForm } from "../../block-form";
import { deleteBlockAction, duplicateBlockAction, updateBlockAction } from "../../actions";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Edit block", path: "/admin/blocks", seo: noIndex });

export default async function EditBlockPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  await requireScreen();
  const { type, id } = await params;

  let block: AdminContentBlock;
  let meta: BlockMeta;
  try {
    ({ data: block, meta } = await getBlock(Number(id)));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  // A link with the wrong kind in it goes to the right screen rather than
  // drawing a CTA form around a pricing table.
  if (block.type !== type) redirect(`/admin/blocks/${block.type}/${block.id}`);

  const brands = block.type === "stack" ? await getBrandOptions().catch(() => []) : [];
  const typeMeta = meta.types.find((t) => t.value === block.type);
  const base = `/admin/blocks/${block.type}`;

  return (
    <>
      <PageHeader back={{ href: base, label: typeMeta?.plural ?? "Blocks" }} title={block.name}>
        <Badge tone={block.status === "published" ? "resolved" : "progress"}>{block.status}</Badge>
        {block.is_default && <Badge tone="brand">Site default</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          {/* Opened beside the form: the preview is the saved block. */}
          <ButtonLink href={`${base}/${block.id}/preview`} variant="secondary" size="sm" target="_blank" rel="noopener">
            Preview
          </ButtonLink>
        </div>
      </PageHeader>

      <BlockForm type={block.type} meta={meta} block={block} brands={brands} action={updateBlockAction.bind(null, block.id, block.slug)} />

      {/* Outside the form: a form inside another is invalid markup. */}
      <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-6">
        <form action={duplicateBlockAction}>
          <input type="hidden" name="id" value={block.id} />
          <input type="hidden" name="type" value={block.type} />
          <Button type="submit" variant="secondary" size="sm">Make a copy</Button>
        </form>
        <form action={deleteBlockAction}>
          <input type="hidden" name="id" value={block.id} />
          <input type="hidden" name="slug" value={block.slug} />
          <input type="hidden" name="type" value={block.type} />
          <Button type="submit" variant="destructive" size="sm">Delete {(typeMeta?.label ?? "block").toLowerCase()}</Button>
        </form>
      </div>
    </>
  );
}
