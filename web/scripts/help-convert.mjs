/**
 * The manual's Markdown to the help drawer's HTML (docs/help-and-tours.md).
 *
 * Exactly the constructs manual/*.md uses — headings below ##, paragraphs,
 * one level of nested lists, GitHub tables, **bold**, *italic*, `code`,
 * fenced code, [links](…) and > quotes. Everything is escaped before any
 * markup is added, so raw HTML in the manual arrives as text; a link is kept
 * only when it is https://, a site path, an anchor, or another chapter of the
 * manual (which the drawer opens in place). Self-check:
 * scripts/help-convert.check.mjs.
 */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const slug = (s) =>
  s.toLowerCase().replace(/[`*_]/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function link(text, url) {
  const u = url.trim();
  const manual = u.match(/^(\d{2}-[a-z0-9-]+)\.md(?:#([a-z0-9-]+))?$/);
  if (manual) {
    const id = `${manual[1]}#${manual[2] ?? "overview"}`;
    return `<a href="#help:${id}" data-help-link="${id}">${text}</a>`;
  }
  if (/^https:\/\/[^\s"<>]+$/.test(u)) return `<a href="${u}" target="_blank" rel="noopener">${text}</a>`;
  if (/^(\/[^\s"<>]*|#[a-z0-9-]+)$/.test(u)) return `<a href="${u}">${text}</a>`;
  return text;
}

function inline(raw) {
  const codes = [];
  let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  // The URL was escaped with the rest; a quote in it is &quot; and fails link()'s patterns.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => link(t, u.replace(/&amp;/g, "&")));
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const ITEM = /^\s*([-*]|\d+\.)\s+/;
const NESTED = /^\s{2,}([-*]|\d+\.)\s+/;

export function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.trim().startsWith("```")) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{3,4})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (line.trim().startsWith("|") && /^\|?\s*:?-{3,}/.test(lines[i + 1]?.trim() ?? "")) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (ITEM.test(line) && !NESTED.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // A blank line ends the list unless the list carries on after it.
          const next = lines[i + 1] ?? "";
          if ((ITEM.test(next) && /^\s*\d+\./.test(next) === ordered) || NESTED.test(next) || /^\s{2,}\S/.test(next)) { i++; continue; }
          break;
        }
        if (NESTED.test(l) && items.length) items[items.length - 1].sub.push(l.replace(ITEM, ""));
        else if (ITEM.test(l)) {
          if (/^\s*\d+\./.test(l) !== ordered) break;
          items.push({ text: l.replace(ITEM, ""), sub: [] });
        } else if (/^\s{2,}\S/.test(l) && items.length) {
          const last = items[items.length - 1];
          if (last.sub.length) last.sub[last.sub.length - 1] += ` ${l.trim()}`;
          else last.text += ` ${l.trim()}`;
        } else break;
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text)}${it.sub.length ? `<ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (line.startsWith(">")) {
      const body = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote><p>${inline(body.join(" "))}</p></blockquote>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*```)/.test(lines[i]) && !(ITEM.test(lines[i]) && !NESTED.test(lines[i])) && !lines[i].trim().startsWith("|")) {
      para.push(lines[i++].trim());
    }
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    else { out.push(`<p>${inline(line.trim())}</p>`); i++; }
  }
  return out.join("");
}

const plain = (html) =>
  html.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** A chapter into its `##` sections; what sits under the `#` title is "overview". */
export function splitSections(md, stem) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const titleLine = lines.find((l) => /^#\s/.test(l)) ?? `# ${stem}`;
  const chapterTitle = titleLine.replace(/^#\s+/, "").trim();
  const parts = [];
  let current = { title: "Overview", key: "overview", body: [] };
  let fence = false;
  for (const l of lines) {
    if (l.trim().startsWith("```")) fence = !fence;
    if (!fence && /^#\s/.test(l)) continue;
    const m = !fence && l.match(/^##\s+(.*)$/);
    if (m) { parts.push(current); current = { title: m[1].trim(), key: slug(m[1]), body: [] }; continue; }
    current.body.push(l);
  }
  parts.push(current);
  return parts
    .filter((p) => p.body.join("").trim())
    .map((p) => {
      const html = markdownToHtml(p.body.join("\n"));
      return { id: `${stem}#${p.key}`, chapter: stem, chapterTitle, title: p.title.replace(/[`*]/g, ""), html, text: plain(html) };
    });
}
