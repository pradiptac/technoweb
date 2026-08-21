"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createKnowledgeArticle, deleteKnowledgeArticle, updateKnowledgeArticle,
  type KnowledgeArticlePayload,
} from "@/lib/admin";
import { seoFromFormData, str, tagsFromFormData } from "@/lib/admin-form";
import type { PublishStatus } from "@/types/api";

export type ArticleFormState = { error?: string; fieldErrors?: Record<string, string[]> };

function payloadFrom(formData: FormData): KnowledgeArticlePayload {
  const seo = seoFromFormData(formData);
  const categoryId = str(formData, "knowledge_category_id");

  return {
    title: str(formData, "title") ?? "",
    slug: str(formData, "slug"),
    excerpt: str(formData, "excerpt"),
    body: str(formData, "body"),
    tags: tagsFromFormData(formData),
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    published_at: str(formData, "published_at"),
    knowledge_category_id: categoryId ? Number(categoryId) : null,
    ...(seo ? { seo: seo as KnowledgeArticlePayload["seo"] } : {}),
  };
}

function toState(error: unknown): ArticleFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the article. Try again shortly." };
}

export async function createArticleAction(_prev: ArticleFormState, formData: FormData): Promise<ArticleFormState> {
  let id: number;

  try {
    const article = await createKnowledgeArticle(payloadFrom(formData));
    id = article.id;
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/knowledge-base");
  redirect(`/admin/knowledge-base/${id}?saved=1`);
}

export async function updateArticleAction(_prev: ArticleFormState, formData: FormData): Promise<ArticleFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing article id." };

  try {
    await updateKnowledgeArticle(id, payloadFrom(formData));
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/knowledge-base");
  revalidatePath(`/admin/knowledge-base/${id}`);
  redirect(`/admin/knowledge-base/${id}?saved=1`);
}

export async function deleteArticleAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await deleteKnowledgeArticle(id).catch(() => null);
  revalidatePath("/admin/knowledge-base");
  redirect("/admin/knowledge-base?deleted=1");
}
