import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getBlockList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminContentBlock } from "@/types/api";
import { PreviewFrame } from "../../preview-frame";
import { blockType } from "../../types";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Block showcase", path: "/admin/blocks", seo: noIndex });

/**
 * Every block of one kind, drafts included, drawn as the public site draws
 * it — the place to compare layouts, and the screen the audits point at to
 * reach every layout without a public page carrying placeholder content.
 */
export default async function BlockShowcasePage({ params }: { params: Promise<{ type: string }> }) {
  await requireScreen();
  const type = blockType((await params).type);
  if (!type) notFound();

  let blocks: AdminContentBlock[];
  let plural = "Blocks";
  try {
    const res = await getBlockList({ type, per_page: 100 });
    blocks = res.data;
    plural = res.meta.types.find((t) => t.value === type)?.plural ?? plural;
  } catch {
    return <ErrorState title="We could not load the blocks">The admin API is not responding. Try again shortly.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        back={{ href: `/admin/blocks/${type}`, label: plural }}
        title={`${plural} — as the site draws them`}
        lede="Every one, drafts included, in the active theme."
      />
      <PreviewFrame blocks={blocks} />
    </>
  );
}
