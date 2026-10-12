// Self-check for scripts/help-convert.mjs (docs/help-and-tours.md).
// Run from web/: node scripts/help-convert.check.mjs
import { markdownToHtml, splitSections } from "./help-convert.mjs";

let failed = 0;
const eq = (got, want, label) => {
  if (got !== want) { failed++; console.error(`FAIL ${label}\n  got:  ${got}\n  want: ${want}`); } else console.log(`ok   ${label}`);
};
const has = (got, frag, label) => {
  if (!got.includes(frag)) { failed++; console.error(`FAIL ${label}\n  in: ${got}\n  missing: ${frag}`); } else console.log(`ok   ${label}`);
};
const lacks = (got, frag, label) => {
  if (got.includes(frag)) { failed++; console.error(`FAIL ${label}\n  in: ${got}\n  has: ${frag}`); } else console.log(`ok   ${label}`);
};

eq(markdownToHtml("Plain **bold** and *it* and `code`."), "<p>Plain <strong>bold</strong> and <em>it</em> and <code>code</code>.</p>", "inline marks");
eq(markdownToHtml("- one\n- two"), "<ul><li>one</li><li>two</li></ul>", "bullet list");
eq(markdownToHtml("1. one\n2. two"), "<ol><li>one</li><li>two</li></ol>", "numbered list");
eq(markdownToHtml("1. one\n\n2. two"), "<ol><li>one</li><li>two</li></ol>", "a blank line between numbered items keeps one list");
eq(markdownToHtml("1. one\n   - a\n   - b\n2. two"), "<ol><li>one<ul><li>a</li><li>b</li></ul></li><li>two</li></ol>", "nested list");
eq(markdownToHtml("### Sub"), "<h3>Sub</h3>", "h3");
has(markdownToHtml("| A | B |\n|---|---|\n| 1 | **2** |"), "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>", "table");
has(markdownToHtml("```\n<b>x</b>\n```"), "<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>", "code block escaped");
eq(markdownToHtml("> Note"), "<blockquote><p>Note</p></blockquote>", "quote");
has(markdownToHtml("[site](https://example.com)"), '<a href="https://example.com" target="_blank" rel="noopener">site</a>', "external link");
has(markdownToHtml("[roles](17-users-and-roles.md#staff-accounts)"), '<a href="#help:17-users-and-roles#staff-accounts" data-help-link="17-users-and-roles#staff-accounts">roles</a>', "manual link stays in the drawer");
has(markdownToHtml("[chapter](18-settings.md)"), 'data-help-link="18-settings#overview"', "a chapter link opens its overview");
has(markdownToHtml("[queue](/admin/tickets)"), '<a href="/admin/tickets">queue</a>', "site path link");
lacks(markdownToHtml("<script>alert(1)</script>"), "<script>", "raw html escaped");
lacks(markdownToHtml("[x](javascript:alert(1))"), "javascript:", "javascript link dropped");
lacks(markdownToHtml('[x](https://a.test" onmouseover="y)'), 'onmouseover="', "quote in url cannot break out");

lacks(markdownToHtml("[x](//evil.test/a)"), "href", "a protocol-relative link is dropped");
lacks(markdownToHtml("[x](/\\evil.test)"), "href", "a backslash-host link is dropped");
has(markdownToHtml("[x](https://a.test/**b**)"), 'href="https://a.test/**b**"', "emphasis markers in an address are left alone");
eq(markdownToHtml('[x](https://a.test/"q)'), "<p>x</p>", "a quote in an address drops the link");

const secs = splitSections("# The support desk\n\nIntro.\n\n## The ticket queue\n\nText **here**.\n\n### Statuses\n\nMore.\n\n## Saved replies\n\nLast.", "08-tickets");
eq(secs.map((s) => s.id).join(","), "08-tickets#overview,08-tickets#the-ticket-queue,08-tickets#saved-replies", "section ids");
eq(secs[1].chapterTitle, "The support desk", "chapter title");
has(secs[1].html, "<h3>Statuses</h3>", "sub-headings stay inside their section");
eq(secs[1].text.includes("**"), false, "text has no markup");

process.exit(failed ? 1 : 0);
