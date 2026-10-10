import { Card } from "@/components/ui/card";
import { QuestionAccordion } from "@/components/ui/faq";
import { cn } from "@/lib/utils";
import type { LayoutAlign, LayoutChild, LayoutContainer, LayoutSlot } from "@/types/api";
import { ContainerTabs } from "./container-tabs";
import { GAP, VALIGN, gridClasses } from "./layout-grid";
import { Widget, type WidgetPlan } from "./widgets";

/*
 * Container widgets (0.154.0): a box, tabs, panels that open, and columns
 * inside a column. Each holds `slots`, a slot holds ordinary widgets, and that
 * is the whole depth — the API refuses a container, form, slider or gallery in
 * a slot, and the presenter drops one stored by hand.
 *
 * Every class is a literal (see `layout-grid.ts`), every cell `min-w-0`.
 * A tab's or a panel's name is a button / summary and never a heading: the
 * outline is the section's, and a label that is also a heading would put a
 * jump in it.
 */

const ALIGN = { inherit: "", start: "text-start", center: "text-center", end: "text-end" } as const;
const PAD = { s: "sm", m: "md", l: "lg" } as const;

/** The classes the section Style's "Show on" uses: the class, never the attribute (preflight's `[hidden]` is `!important`). */
function hide(showOn: LayoutContainer["show_on"]): string | undefined {
  if (!showOn) return undefined;
  return cn(!showOn.includes("phone") && "max-sm:hidden", !showOn.includes("tablet") && "sm:max-lg:hidden", !showOn.includes("desktop") && "lg:hidden") || undefined;
}

/** A slot's widgets, stacked. */
function Stack({ widgets, plans, align }: { widgets: LayoutChild[]; plans: Map<string, WidgetPlan>; align: LayoutAlign }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {widgets.map((child) => <Widget key={child.id} widget={child} plan={plans.get(child.id)} plans={plans} columnAlign={align} />)}
    </div>
  );
}

export function ContainerWidget({
  widget, plans, columnAlign = "inherit",
}: {
  widget: LayoutContainer;
  plans: Map<string, WidgetPlan>;
  columnAlign?: LayoutAlign;
}) {
  const gone = hide(widget.show_on);
  const slots: LayoutSlot[] = widget.slots;
  if (slots.length === 0) return null;

  switch (widget.type) {
    case "box": {
      // A box is the site's `Card` — its ground, border and corners come with
      // it (no ground-less outline surface); a tint is the same card washed
      // with the brand colour, and raised adds the floating shadow. Static: it
      // holds its own links, so a lift would say the whole box is one.
      const align = widget.align ?? "inherit";
      return (
        <Card
          interactive={false}
          padding={PAD[widget.pad ?? "m"] ?? "md"}
          tint={widget.surface === "tint" ? "var(--color-brand-600)" : undefined}
          className={cn("min-w-0", widget.surface === "raised" && "shadow-3", ALIGN[align], gone)}
        >
          <div data-widget="box" data-layout-widget={widget.id}>
            <Stack widgets={slots[0].widgets} plans={plans} align={align === "inherit" ? columnAlign : align} />
          </div>
        </Card>
      );
    }

    case "tabs":
      return (
        <div data-widget="tabs" data-layout-widget={widget.id} className={cn("min-w-0", gone)}>
          <ContainerTabs
            id={`ct-${widget.id}`}
            labels={slots.map((s, i) => s.label ?? `Tab ${i + 1}`)}
            panes={slots.map((s) => <Stack key={s.id} widgets={s.widgets} plans={plans} align={columnAlign} />)}
          />
        </div>
      );

    case "panels":
      return (
        <div data-widget="panels" data-layout-widget={widget.id} className={cn("min-w-0 [overflow-wrap:anywhere]", gone)}>
          <QuestionAccordion
            items={slots.map((s, i) => ({
              key: s.id, question: s.title ?? `Panel ${i + 1}`, open: s.open,
              answer: <Stack widgets={s.widgets} plans={plans} align={columnAlign} />,
            }))}
          />
        </div>
      );

    case "inner_row":
      return (
        <div
          data-widget="inner_row" data-layout-widget={widget.id}
          className={cn("grid min-w-0", gridClasses(slots.length, widget.stack_from, widget.split), GAP[widget.gap ?? "m"] ?? GAP.m, VALIGN[widget.valign ?? "stretch"] ?? VALIGN.stretch, gone)}
        >
          {slots.map((s) => (
            <div key={s.id} className="min-w-0">
              <Stack widgets={s.widgets} plans={plans} align={columnAlign} />
            </div>
          ))}
        </div>
      );
  }
}
