import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getBlockList, getBrandOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { BlockMeta } from "@/types/api";
import { BlockForm } from "../../block-form";
import { createBlockAction } from "../../actions";
import { blockType } from "../../types";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New block", path: "/admin/blocks", seo: noIndex });

export default async function NewBlockPage({ params }: { params: Promise<{ type: string }> }) {
  await requireScreen();
  const type = blockType((await params).type);
  if (!type) notFound();

  let meta: BlockMeta;
  let brands: { id: number; name: string }[] = [];
  try {
    [meta, brands] = await Promise.all([
      getBlockList({ per_page: 1 }).then((r) => r.meta),
      type === "stack" ? getBrandOptions() : Promise.resolve([]),
    ]);
  } catch {
    return <ErrorState title="We could not load the form">The admin API is not responding. Try again shortly.</ErrorState>;
  }

  const typeMeta = meta.types.find((t) => t.value === type);
  return (
    <>
      <PageHeader
        back={{ href: `/admin/blocks/${type}`, label: typeMeta?.plural ?? "Blocks" }}
        title={`New ${(typeMeta?.label ?? "block").toLowerCase()}`}
      />
      <BlockForm type={type} meta={meta} brands={brands} action={createBlockAction} />
    </>
  );
}
