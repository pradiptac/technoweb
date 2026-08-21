import Link from "next/link";
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
      <Link href="/admin/blog" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All posts
      </Link>
      <h2 className="display-3 mt-4 mb-6">New post</h2>

      <PostForm staff={staff} />
    </>
  );
}
