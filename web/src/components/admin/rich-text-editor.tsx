"use client";

import { CKEditor } from "@ckeditor/ckeditor5-react";
import {
  ClassicEditor, Autoformat, BlockQuote, Bold, Code, Essentials, Heading,
  Italic, Link, List, Paragraph, PasteFromOffice, Table, TableToolbar,
} from "ckeditor5";
import "ckeditor5/ckeditor5.css";

/**
 * Rich-text editor for CMS bodies.
 *
 * The toolbar is deliberately limited to the tags web/src/components/ui/prose.tsx
 * styles — h2/h3, bold, italic, lists, link, blockquote, code, table. Anything
 * outside that renders unstyled on the live site, so it is better that an
 * editor cannot produce it than that they produce it and wonder why it looks
 * wrong. Notably absent: font, colour and alignment tools, which would fight
 * the design system.
 *
 * This is a usability guardrail, not a security boundary. The API sanitises
 * every body on write (App\Support\HtmlSanitiser) and treats whatever arrives
 * as hostile regardless of what this toolbar allows.
 *
 * CKEditor touches `document` at module scope, so this file must never be
 * imported by a server component — see editor-field.tsx, which loads it with
 * next/dynamic and ssr: false.
 */
export function RichTextEditor({
  value, onChange, id,
}: {
  value: string;
  onChange: (html: string) => void;
  id?: string;
}) {
  return (
    <div id={id} className="cms-editor">
      <CKEditor
        editor={ClassicEditor}
        data={value}
        onChange={(_event, editor) => onChange(editor.getData())}
        config={{
          // CKEditor 5 requires an explicit licence key. 'GPL' is the free
          // option and is valid for a GPL-compatible open-source project.
          // A proprietary deployment needs a commercial key here instead.
          licenseKey: "GPL",
          plugins: [
            Essentials, Paragraph, Heading, Autoformat, PasteFromOffice,
            Bold, Italic, Code, Link, List, BlockQuote, Table, TableToolbar,
          ],
          toolbar: [
            "undo", "redo", "|",
            "heading", "|",
            "bold", "italic", "code", "|",
            "link", "bulletedList", "numberedList", "|",
            "blockQuote", "insertTable",
          ],
          heading: {
            options: [
              { model: "paragraph", title: "Paragraph", class: "ck-heading_paragraph" },
              // h1 is the page title, rendered by the site, never the body.
              { model: "heading2", view: "h2", title: "Heading", class: "ck-heading_heading2" },
              { model: "heading3", view: "h3", title: "Subheading", class: "ck-heading_heading3" },
            ],
          },
          link: {
            addTargetToExternalLinks: true,
            defaultProtocol: "https://",
          },
          table: { contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"] },
        }}
      />
    </div>
  );
}
