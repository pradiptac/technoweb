import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getAnswerBlockKinds, getBlogCategoryList, getStaff, getCustomFieldGroups, getPageBuilderOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PostForm } from "../post-form";
import type { StaffUser, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New post", path: "/admin/blog/new", seo: noIndex });

export default async function NewBlogPostPage() {
  await requireScreen();
  let staff: StaffUser[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  let categories: { id: number; name: string }[] = [];
  try {
    let list;
    [staff, kinds, list] = await Promise.all([getStaff(), getAnswerBlockKinds("/admin/blog-posts"), getBlogCategoryList({ per_page: 100 })]);
    categories = list.data.map((c) => ({ id: c.id, name: c.name }));
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

      <PostForm staff={staff} categories={categories} kinds={kinds} fieldGroups={await getCustomFieldGroups("/admin/blog-posts")} builder={await getPageBuilderOptions()} />
    </>
  );
}
