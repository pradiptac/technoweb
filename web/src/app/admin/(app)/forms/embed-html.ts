import type { AdminForm, AdminFormField, FormKindOption } from "@/lib/admin";
import { isFileKind, isLayoutKind } from "./form-kinds";

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
 *
 * ### Which fields it can carry
 *
 * Everything that is markup: text-like inputs, a dropdown, a radio group, a
 * group of tick boxes (posted as `name[]`), a single tick box, a date, a
 * number, a rating (as a dropdown of 1 to 5 — stars are styling, and styling
 * is theirs), and a heading as a heading. A **hidden** field is left out on
 * purpose: its value is the form's own and the server fills it in, so a copy
 * in somebody else's markup would only be a value they could edit.
 *
 * What it cannot carry is behaviour — an upload, a step break, a condition.
 * The console does not offer this snippet for a form that uses any of them
 * (`needsFrame`); `buildHtmlSnippet` still skips those fields rather than
 * emit something that half works, should it ever be asked.
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

const NL = "\n";

/** `min`/`max` for a number or a date. "today" cannot be written into markup, so the script fills it. */
function limits(field: AdminFormField): string {
  const { min, max } = field.settings ?? {};
  const fixed = (name: string, value: string | number | null | undefined) =>
    value === null || value === undefined || value === "" || value === "today" ? "" : ` ${name}="${attr(String(value))}"`;
  const today = [min === "today" ? "min" : "", max === "today" ? "max" : ""].filter(Boolean).join(" ");

  return `${fixed("min", min)}${fixed("max", max)}${today ? ` data-tw-today="${today}"` : ""}`;
}

/** One field as markup, or null for a field the snippet does not carry. */
function block(field: AdminFormField, idPrefix: string, kinds: FormKindOption[]): string | null {
  const id = `${idPrefix}-${field.name}`;
  const name = attr(field.name);
  const required = field.required ? " required" : "";
  const placeholder = field.placeholder ? ` placeholder="${attr(field.placeholder)}"` : "";
  const help = field.help ? `${NL}  <small id="${id}-help">${text(field.help)}</small>` : "";
  const labelled = (control: string) => `  <label for="${id}">${text(field.label)}</label>${NL}${control}${help}`;

  // The server's own value, an upload, a step: see the note at the top of this file.
  if (field.kind === "hidden" || field.kind === "step" || isFileKind(kinds, field.kind)) return null;

  if (field.kind === "heading") {
    return `  <h3>${text(field.label)}</h3>${field.help ? `${NL}  <p>${text(field.help)}</p>` : ""}`;
  }
  if (isLayoutKind(kinds, field.kind)) return null;

  if (field.kind === "textarea") {
    return labelled(`  <textarea id="${id}" name="${name}" rows="4"${placeholder}${required}></textarea>`);
  }

  if (field.kind === "select" || field.kind === "rating") {
    const options = field.kind === "rating"
      ? [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))
      : field.options ?? [];

    return labelled([
      `  <select id="${id}" name="${name}"${required}>`,
      `      <option value="">Please choose</option>`,
      ...options.map((o) => `      <option value="${attr(o.value)}">${text(o.label)}</option>`),
      `  </select>`,
    ].join(NL));
  }

  /*
   * A group: a fieldset whose legend is the question, and a label per choice.
   *
   * `required` goes on every radio — the browser reads it as "one of this
   * group". There is no such attribute for "at least one of these boxes", so
   * a required group of tick boxes is left to the server, whose refusal the
   * script shows under the form.
   */
  if (field.kind === "radio" || field.kind === "checkboxes") {
    const radio = field.kind === "radio";
    const choices = (field.options ?? []).map((o, n) => [
      `    <input id="${id}-${n + 1}" name="${name}${radio ? "" : "[]"}" type="${radio ? "radio" : "checkbox"}" value="${attr(o.value)}"${radio ? required : ""}>`,
      `    <label for="${id}-${n + 1}">${text(o.label)}</label>`,
    ].join(NL));

    return [
      `  <fieldset>`,
      `    <legend>${text(field.label)}</legend>`,
      ...choices,
      `  </fieldset>${help}`,
    ].join(NL);
  }

  if (field.kind === "checkbox") {
    return labelled(`  <input id="${id}" name="${name}" type="checkbox" value="1"${required}>`);
  }

  if (field.kind === "number" || field.kind === "date") {
    return labelled(`  <input id="${id}" name="${name}" type="${field.kind}"${limits(field)}${placeholder}${required}>`);
  }

  // text, email, tel, url — the input type is the field's own kind, which
  // is what gets a phone keypad on a phone rather than a full keyboard.
  const type = ["email", "tel", "url"].includes(field.kind) ? field.kind : "text";
  return labelled(`  <input id="${id}" name="${name}" type="${type}"${placeholder}${required}>`);
}

export function buildHtmlSnippet(
  form: AdminForm | undefined, slug: string, siteUrl: string, kinds: FormKindOption[],
): string {
  const id = slug || "your-slug";
  const fields = form?.fields ?? [];
  const label = form?.submit_label ?? "Send";

  const blocks = fields.map((field) => block(field, id, kinds)).filter((b): b is string => b !== null);
  const body = blocks.length
    ? blocks.join(NL + NL)
    : "  <!-- This form has no fields yet. Add them, save, and copy again. -->";

  // "Today" as a date limit is the visitor's today, so it is set when their page loads.
  const today = fields.some((f) => f.kind === "date" && (f.settings?.min === "today" || f.settings?.max === "today"))
    ? `
  // A date field limited to "today": the visitor's own today, set as the page loads.
  var now = new Date();
  var today = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
  form.querySelectorAll("[data-tw-today]").forEach(function (el) {
    el.getAttribute("data-tw-today").split(" ").forEach(function (limit) { el.setAttribute(limit, today); });
  });
`
    : "";

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
${today}
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
