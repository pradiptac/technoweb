import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getClient, getIndustries } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ClientForm } from "../client-form";
import { deleteClientAction } from "../actions";
import type { AdminClient, AdminIndustry } from "@/types/api";

export const metadata = buildMetadata({ title: "Edit client", path: "/admin/clients", seo: noIndex });

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  let client: AdminClient;
  let industries: AdminIndustry[];
  try {
    [client, industries] = await Promise.all([getClient(numericId), getIndustries()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/clients", label: "All clients" }} title="Edit client">
        <Badge tone={client.status === "published" ? "resolved" : "progress"}>{client.status}</Badge>
      </PageHeader>

      <ClientForm client={client} industries={industries} />

      <form action={deleteClientAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={client.id} />
        <p className="mb-2 text-[13px] text-muted">
          Deleting this takes the logo off the site. The file stays in the media library.
        </p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete client</Button>
      </form>
    </>
  );
}
