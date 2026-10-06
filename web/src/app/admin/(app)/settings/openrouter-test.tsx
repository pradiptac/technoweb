"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Select } from "@/components/ui/input";
import type { AiModels } from "@/lib/admin";
import { aiModelsAction, testOpenRouterAction, type IntegrationActionState } from "./integrations-actions";

/**
 * Prove a model answers through the saved OpenRouter key, from the screen
 * the key was typed into (0.116.0).
 *
 * The Hunter button's shape, with one difference that is the point of it:
 * the key alone proves little here. Every AI feature goes through
 * OpenRouter, and the client's own OpenAI and Google AI Studio keys sit
 * behind it, so a Google model answers only when the Google key is set up
 * *there* — and the failure otherwise arrives on a visitor's first question.
 * So this tests a **model**, any of the ones the API offers, and shows
 * OpenRouter's own words when one refuses.
 *
 * The list is the API's (`GET /admin/seo/ai/models`), read after mount; the
 * two saved models are marked so the ones in use are the ones tested first.
 * `type="button"`: it stands inside the settings form.
 */
export function OpenRouterTest({ configured }: { configured: boolean }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<IntegrationActionState>({});
  const [info, setInfo] = useState<AiModels | null>(null);
  const [model, setModel] = useState("");

  useEffect(() => {
    let live = true;
    void aiModelsAction().then((found) => {
      if (!live || !found) return;
      setInfo(found);
      setModel((current) => current || found.seoModel || found.models[0]?.value || "");
    });
    return () => { live = false; };
  }, []);

  const uses = (value: string) => {
    if (!info) return "";
    const by = [value === info.chatbotModel && "website assistant", value === info.seoModel && "SEO assistant"].filter(Boolean);
    return by.length ? ` — used by the ${by.join(" and the ")}` : "";
  };

  return (
    <div className="mb-6 mt-2 border-y border-line py-4 sm:col-span-2">
      {result.error && <Alert tone="err" title="OpenRouter refused the request">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="The model answered">{result.ok}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        {info && info.models.length > 0 && (
          <Field label="Model to test" htmlFor="openrouter-test-model" variant="float-static" className="mb-0 min-w-0 flex-1 basis-64">
            <Select id="openrouter-test-model" value={model} onChange={(e) => setModel(e.currentTarget.value)} disabled={busy || !configured}>
              {info.models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}{uses(m.value)}</option>
              ))}
            </Select>
          </Field>
        )}
        <Button
          type="button" variant="secondary" size="sm" disabled={busy || !configured}
          onClick={() => start(async () => setResult(await testOpenRouterAction(model)))}
        >
          {busy ? "Asking OpenRouter…" : "Test this model"}
        </Button>
      </div>
      <p className="measure mt-2 text-12-5 text-muted">
        {configured
          ? "Sends one short request through the saved key, not what is on screen — so save first. A model from OpenAI or Google answers only when that provider’s key is set up in your OpenRouter account."
          : "Save an OpenRouter API key first."}
      </p>
    </div>
  );
}
