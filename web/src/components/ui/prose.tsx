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
        "[&_h4]:mt-6 [&_h4]:mb-2.5 [&_h4]:text-[16.5px] [&_h4]:font-semibold [&_h4]:text-ink",
        "[&_p]:mb-4.5",
        "[&_ul]:mb-4.5 [&_ul]:list-disc [&_ul]:pl-5.5 [&_ul>li]:mb-2",
        "[&_ol]:mb-4.5 [&_ol]:list-decimal [&_ol]:pl-5.5 [&_ol>li]:mb-2",
        "[&_a]:font-medium [&_a]:text-brand-ink [&_a]:underline [&_a]:underline-offset-2",
        // b and i alongside strong and em because the editor writes
        // whichever the browser's execCommand produced. Same rendering for
        // both spellings, so which one is stored never shows.
        "[&_strong]:font-semibold [&_strong]:text-ink [&_b]:font-semibold [&_b]:text-ink",
        "[&_em]:italic [&_i]:italic",
        // Preflight resets neither, but saying so is a line of CSS against a
        // toolbar button that would otherwise render as plain text on a theme
        // that ever does reset them.
        "[&_u]:underline [&_u]:underline-offset-2 [&_s]:line-through",
        "[&_sub]:align-sub [&_sub]:text-[0.75em] [&_sup]:align-super [&_sup]:text-[0.75em]",
        "[&_code]:rounded-sm [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13.5px]",
        /*
          A code *block*, and the `pre code` rule that stops it being a chip.

          `[&_code]` above styles inline code as a small tinted pill. Inside a
          <pre> that produces a padded, rounded box for every line of the
          listing — so the block undoes it rather than the inline rule being
          narrowed, which would leave the far commoner case carrying the
          exception.

          `overflow-x-auto` is not decoration: a listing is the one block on
          the site whose lines cannot wrap, and `npm run audit:mobile` treats
          an element inside an `overflow-x-auto` ancestor as contained and
          anything else as overflow. Without it one long line fails the phone
          audit on whatever page embeds it.
        */
        "[&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line",
        "[&_pre]:bg-surface-2 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[13.5px] [&_pre]:leading-[1.6]",
        "[&_pre_code]:rounded-none [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-brand-300 [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_blockquote]:italic",
        "[&_hr]:my-8 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-line",
        // `max-w-full` and `h-auto` are the pair: the editor can set an
        // explicit width on an image it resized, and a `width` attribute or an
        // inline width wider than the column is horizontal overflow on a
        // phone. Capping without releasing the height squashes it instead.
        "[&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-line",
        /*
          A video embed arrives carrying width="640" height="360" — 640px of it
          inside a 360px viewport, which is the zero-tolerance overflow failure
          rather than a cosmetic one. The attributes stay (they are what tells
          a browser the ratio before the frame loads) and the box is sized here
          instead.
        */
        "[&_iframe]:my-6 [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:max-w-full",
        "[&_iframe]:rounded-lg [&_iframe]:border [&_iframe]:border-line",
        "[&_table]:my-6 [&_table]:w-full [&_table]:text-[14.5px]",
        "[&_th]:border-b [&_th]:border-line-strong [&_th]:pb-2.5 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border-b [&_td]:border-line [&_td]:py-2.5",

        /*
          A table with no header cells is a *layout*, not data — which is the
          only signal available, and it is a real one: the editor's layout
          templates build two columns out of a table because the sanitiser
          allows no `div` and no `class` at all (see `config/purifier.php`),
          and a data table written in this editor gets its header row from the
          table dialog. So the distinction is structural rather than a flag
          somebody has to remember to set.

          What it changes: no rules between cells, aligned to the top rather
          than centred, and a gutter on every cell after the first.
        */
        "[&_table:not(:has(th))_td]:border-0 [&_table:not(:has(th))_td]:align-top",
        "[&_table:not(:has(th))_td]:py-3 [&_table:not(:has(th))_td+td]:pl-6",

        /*
          And on a phone the two columns stack, because 40/60 of a 320px
          screen is two unreadable ribbons. `max-sm` rather than a width
          query on the table: the breakpoint is the same one the rest of the
          site stacks at.
        */
        "max-sm:[&_table:not(:has(th))_td]:block max-sm:[&_table:not(:has(th))_td]:w-full",
        "max-sm:[&_table:not(:has(th))_td]:py-2 max-sm:[&_table:not(:has(th))_td+td]:pl-0",
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
