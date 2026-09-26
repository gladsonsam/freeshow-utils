/**
 * Asking a language model for structured data, through OpenRouter.
 *
 * Core rather than part of any one module because "hand this to a model and get
 * JSON back in a shape I chose" is a capability, not a feature: translating a
 * song needs it today, and tagging, cleaning up an import or suggesting a
 * running order will want exactly the same call. One key, one model setting,
 * one place that knows OpenRouter's wire format.
 *
 * Output is always schema-constrained (`response_format: json_schema`, strict),
 * and requests are only routed to providers that honour that, so a caller gets
 * parsed data of the shape it asked for or an error - never prose to scrape.
 *
 * The key lives in this window's local storage, on the operator's own machine,
 * and is only ever sent to OpenRouter.
 */

import { get, writable } from "svelte/store";

export type AiSettings = {
  apiKey: string;
  /** any OpenRouter model id that supports structured outputs */
  model: string;
};

const SETTINGS_KEY = "freeshow-utils.ai";
const ENDPOINT = "https://openrouter.ai/api/v1";

const DEFAULTS: AiSettings = { apiKey: "", model: "anthropic/claude-sonnet-5" };

function loadSettings(): AiSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export const aiSettings = writable<AiSettings>(loadSettings());

aiSettings.subscribe((value) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable - the key just won't survive a restart
  }
});

export type StructuredRequest = {
  /** a short identifier for the schema, e.g. "rewritten_show" */
  name: string;
  /** a JSON Schema object; strict mode needs `additionalProperties: false` throughout */
  schema: Record<string, unknown>;
  system: string;
  user: string;
  signal?: AbortSignal;
};

export type StructuredResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Run one schema-constrained completion.
 *
 * Returns rather than throws, since every caller is a UI that wants to put the
 * reason in front of the operator.
 */
export async function completeStructured<T>(request: StructuredRequest): Promise<StructuredResult<T>> {
  const { apiKey, model } = get(aiSettings);
  if (!apiKey) return { ok: false, error: "Add an OpenRouter API key in App settings first." };
  if (!model) return { ok: false, error: "Choose a model in App settings first." };

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/chat/completions`, {
      method: "POST",
      signal: request.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "FreeShow Utils",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: request.name, strict: true, schema: request.schema },
        },
        provider: { require_parameters: true },
      }),
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return { ok: false, error: "Cancelled." };
    return { ok: false, error: `Could not reach OpenRouter (${error}).` };
  }

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // handled below - a non-JSON reply is an error whatever the status
  }

  if (!response.ok || body?.error) {
    const message = body?.error?.message || `${response.status} ${response.statusText}`;
    return { ok: false, error: `OpenRouter: ${message}` };
  }

  const choice = body?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, error: "The model returned nothing." };
  }
  if (choice.finish_reason === "length") {
    return { ok: false, error: "The model ran out of room before finishing. Try a model with a longer output limit." };
  }

  try {
    return { ok: true, data: JSON.parse(content) as T };
  } catch {
    return { ok: false, error: "The model's reply was not valid JSON." };
  }
}

/** the ids of models that can do schema-constrained output, for a picker */
export async function listStructuredModels(): Promise<string[]> {
  try {
    const response = await fetch(`${ENDPOINT}/models`);
    const body = await response.json();
    return (body?.data ?? [])
      .filter((model: any) => model?.supported_parameters?.includes("structured_outputs"))
      .map((model: any) => String(model.id))
      .filter((id: string) => !id.endsWith(":batch"))
      .sort();
  } catch {
    return [];
  }
}
