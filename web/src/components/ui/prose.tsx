import { cn } from "@/lib/utils";

/**
 * Renders rich text authored in the CMS.
 *
 * The body is inserted as HTML, so the API must sanitise on write — a
 * content-manager account is trusted, but not trusted enough to inject script
 * into every visitor's page. Sanitisation belongs on the Laravel side (Phase 3)
 * where the value is persisted, not here where it is merely displayed.
 */
export function Prose({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-[68ch] text-[16px] leading-[1.72] text-ink-2",
        "[&_h2]:display-3 [&_h2]:mt-10 [&_h2]:mb-3.5",
        "[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-[19px]",
        "[&_p]:mb-4.5",
        "[&_ul]:mb-4.5 [&_ul]:list-disc [&_ul]:pl-5.5 [&_ul>li]:mb-2",
        "[&_ol]:mb-4.5 [&_ol]:list-decimal [&_ol]:pl-5.5 [&_ol>li]:mb-2",
        "[&_a]:font-medium [&_a]:text-brand-ink [&_a]:underline [&_a]:underline-offset-2",
        "[&_strong]:font-semibold [&_strong]:text-ink",
        "[&_code]:rounded-sm [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13.5px]",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-brand-300 [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_blockquote]:italic",
        "[&_img]:my-6 [&_img]:rounded-lg [&_img]:border [&_img]:border-line",
        "[&_table]:my-6 [&_table]:w-full [&_table]:text-[14.5px]",
        "[&_th]:border-b [&_th]:border-line-strong [&_th]:pb-2.5 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border-b [&_td]:border-line [&_td]:py-2.5",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Key/value spec table for product specifications. */
export function SpecTable({ specs }: { specs: Record<string, string> }) {
  const rows = Object.entries(specs);
  if (!rows.length) return null;

  return (
    <table className="w-full text-[14.5px]">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-line last:border-b-0">
            <th scope="row" className="w-2/5 py-3 pr-4 text-left align-top font-semibold text-muted">{k}</th>
            <td className="py-3 align-top font-mono text-[13.5px]">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
