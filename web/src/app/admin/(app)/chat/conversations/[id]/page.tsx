import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { getChatConversation } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";

export const metadata = buildMetadata({ title: "Conversation", path: "/admin/chat", seo: noIndex });

/**
 * One conversation, as it happened.
 *
 * The system message is absent here as well as from the visitor's browser.
 * That is not secrecy from staff: the boundary is structural —
 * `visibleMessages` — and a second reader with a second rule is how the first
 * one stops being true.
 */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await getChatConversation(Number(id)).catch(() => null);

  if (!conversation) notFound();

  return (
    <>
      <PageHeader
        title="Conversation"
        lede={conversation.source_path ? `Started on ${conversation.source_path}` : undefined}
        back={{ href: "/admin/chat/conversations", label: "Conversations" }}
      >
        {conversation.lead && (
          <Link
            href={`/admin/leads/${conversation.lead.id}`}
            className="ml-auto rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            Open the lead
          </Link>
        )}
      </PageHeader>

      <section className="rounded-lg border border-line-strong bg-card p-4">
        <ol className="grid gap-3">
          {conversation.messages.map((message) => (
            <li key={message.id} className={cn(message.role === "user" && "border-l-2 border-brand-300 pl-3")}>
              <p className="mb-1 flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
                <span className="font-semibold">{message.role === "user" ? "They asked" : "Assistant"}</span>
                {/*
                  An answer that stood on nothing retrieved is marked, because
                  that is the interesting one: it is a question the website does
                  not answer, and it is already on the unanswered list.
                */}
                {message.role === "assistant" && !message.grounded && (
                  <Badge tone="urgent">answered from nothing</Badge>
                )}
                {message.rating === 1 && <Badge tone="resolved">rated helpful</Badge>}
                {message.rating === -1 && <Badge tone="urgent">rated unhelpful</Badge>}
              </p>
              <p className="text-[13.5px] whitespace-pre-line">{message.content}</p>
              {message.rating_note && (
                <p className="mt-1 text-[12.5px] text-muted">They said: {message.rating_note}</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-3 text-[12.5px] text-faint">
        {conversation.tokens_used.toLocaleString("en-IN")} tokens. Transcripts are deleted by age —
        see the retention setting.
      </p>
    </>
  );
}
