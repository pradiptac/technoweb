"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert } from "@/components/ui/input";
import { createHomepageFromThemeAction, type HomepageState } from "./homepage-action";

/**
 * "New homepage from the theme": one press, nothing typed. A refusal comes
 * back as an alert (a toast, in the console); success leaves for the new
 * page's Builder tab.
 */
export function NewHomepageButton() {
  const [state, action, pending] = useActionState<HomepageState, FormData>(createHomepageFromThemeAction, {});

  return (
    <Form action={action} state={state}>
      <Button type="submit" size="sm" variant="secondary" pending={pending}
        title="A draft builder page holding the homepage the active theme draws today">
        New homepage from the theme
      </Button>
      {state.error && <Alert tone="err" title="The homepage was not made">{state.error}</Alert>}
    </Form>
  );
}
