import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getStaff } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PostForm } from "../post-form";
import type { StaffUser } from "@/types/api";

export const metadata = buildMetadata({ title: "New post", path: "/admin/blog/new", seo: noIndex });

export default async function NewBlogPostPage() {
  let staff: StaffUser[] = [];
  try {
    staff = await getStaff();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/blog", label: "All posts" }}
        title="New post"
      />

      <PostForm staff={staff} />
    </>
  );
}
