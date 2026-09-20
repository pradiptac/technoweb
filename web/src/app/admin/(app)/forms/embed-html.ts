import type { FormField, SiteForm } from "@/types/api";

/**
 * The form as plain HTML, for a site that wants to style it themselves.
 *
 * The iframe snippet beside this one is the safer offer and the one most
 * people should take: it is our markup, our validation and our error handling,
 * and it cannot drift from the form's definition because it *is* the form.
 * This is the other request — markup somebody owns and styles with their own
 * stylesheet — and the cost of that is stated where the console shows it: the
 * moment a field is added here, their copy is a snapshot that no longer
 * matches, and nothing on either side will say so.
 *
 * ### What is generated, and what is deliberately not
 *
 * **No classes and no inline styling**, beyond the one rule that hides the
 * honeypot. Anything we put in the markup is something they have to override
 * before they can style it, and a class named for our design system on their
 * page is worse than none.
 *
 * **Real labels tied to real ids**, because the thing most likely to be lost
 * when somebody rewrites a form by hand is the `for`/`id` pair — and a field
 * whose label is only visually adjacent is announced as "edit text, blank".
 * The ids are prefixed with the slug so two forms on one page cannot collide.
 *
 * **The honeypot**, which is not optional. `website` is what the API checks,
 * and a copy of this markup with it removed is a form that will be filled in
 * by robots within the week. It is hidden off-screen rather than with
 * `display:none` — some bots skip what is display-none, which defeats the
 * point of a trap — and carries `tabindex="-1"` and `autocomplete="off"` so a
 * person tabbing through never lands in it.
 *
 * **The page envelope** — `_source_url` and `_referrer` — filled by the script
 * from *their* page, which is what puts the right source on the lead. Every
 * key begins with an underscore, which a form field's own name can never do,
 * so these cannot collide with an answer.
 */

/** Escape for an HTML attribute value. The labels are editor-authored text. */
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape for text between tags. */
function text(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function control(field: FormField, idPrefix: string): string {
  const id = `${idPrefix}-${field.name}`;
  const required = field.required ? " required" : "";
  const placeholder = field.placeholder ? ` placeholder="${attr(field.placeholder)}"` : "";

  if (field.kind === "textarea") {
    return `  <textarea id="${id}" name="${attr(field.name)}" rows="4"${placeholder}${required}></textarea>`;
  }

  if (field.kind === "select") {
    const options = (field.options ?? [])
      .map((o) => `      <option value="${attr(o.value)}">${text(o.label)}</option>`)
      .join("\n");

    return [
      `  <select id="${id}" name="${attr(field.name)}"${required}>`,
      `      <option value="">Please choose</option>`,
      options,
      `  </select>`,
    ].filter(Boolean).join("\n");
  }

  if (field.kind === "checkbox") {
    return `  <input id="${id}" name="${attr(field.name)}" type="checkbox" value="1"${required}>`;
  }

  // text, email, tel, number — the input type is the field's own kind, which
  // is what gets a phone keypad on a phone rather than a full keyboard.
  return `  <input id="${id}" name="${attr(field.name)}" type="${attr(field.kind)}"${placeholder}${required}>`;
}

export function buildHtmlSnippet(form: SiteForm | undefined, slug: string, siteUrl: string): string {
  const id = slug || "your-slug";
  const fields = form?.fields ?? [];
  const label = form?.submit_label ?? "Send";

  const body = fields.length
    ? fields
        .map((field) => {
          const forId = `${id}-${field.name}`;
          const help = field.help
            ? `\n  <small id="${forId}-help">${text(field.help)}</small>`
            : "";

          return [
            `  <label for="${forId}">${text(field.label)}</label>`,
            control(field, id),
            help,
          ].join("\n");
        })
        .join("\n\n")
    : "  <!-- This form has no fields yet. Add them below, save, and copy again. -->";

  return `<form id="tw-${id}" method="post" action="${siteUrl}/api/embed/forms/${id}">
${body}

  <!-- Spam trap. Leave it exactly as it is: the server refuses a submission
       that fills it in, and removing it turns this form into a robot's inbox. -->
  <div aria-hidden="true" style="position:absolute;left:-9999px" >
    <label for="${id}-website">Leave this field empty</label>
    <input id="${id}-website" name="website" type="text" tabindex="-1" autocomplete="off">
  </div>

  <input type="hidden" name="_source_url">
  <input type="hidden" name="_referrer">

  <button type="submit">${text(label)}</button>
  <p data-tw-status role="status"></p>
</form>

<script>
(function () {
  var form = document.getElementById("tw-${id}");
  var status = form.querySelector("[data-tw-status]");

  // Where the enquiry came from — their page, not ours.
  form.querySelector('[name="_source_url"]').value = location.href;
  form.querySelector('[name="_referrer"]').value = document.referrer;

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    status.textContent = "Sending…";

    fetch(form.action, { method: "POST", body: new FormData(form) })
      .then(function (res) { return res.json().then(function (b) { return { ok: res.ok, body: b }; }); })
      .then(function (r) {
        if (r.ok) {
          form.innerHTML = "";
          status.textContent = r.body.message;
          form.appendChild(status);
          return;
        }
        status.textContent = r.body.message || "Please check the form and try again.";
      })
      .catch(function () {
        status.textContent = "We could not send that. Try again.";
      });
  });
})();
</script>`;
}
