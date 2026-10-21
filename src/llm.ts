import Anthropic from "@anthropic-ai/sdk";
import { INTENTS } from "./schema.js";
import type { LlmCall } from "./classify.js";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** JSON Schema twin of ModelOutputSchema; zod still validates what comes back. */
const OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...INTENTS] },
    secondary_intents: { type: "array", items: { type: "string", enum: [...INTENTS] } },
    confidence: { type: "number" },
    needs_human: { type: "boolean" },
    injection_suspected: { type: "boolean" },
    reasons: { type: "string" },
  },
  required: ["intent", "secondary_intents", "confidence", "needs_human", "injection_suspected", "reasons"],
  additionalProperties: false,
} as const;

export function makeAnthropicCall(model: string = process.env.MODEL || DEFAULT_MODEL): LlmCall {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  return async ({ system, user }) => {
    const response = await client.messages.create({
      model,
      // Thinking tokens count toward max_tokens, so leave room even at low effort.
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_JSON_SCHEMA } },
    });
    const text = response.content.find((b) => b.type === "text");
    return {
      text: text && text.type === "text" ? text.text : "",
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  };
}

export type Provider = "anthropic" | "openai-compatible";
type Env = Record<string, string | undefined>;

export function resolveProvider(env: Env = process.env): Provider {
  const p = env.PROVIDER || "anthropic";
  if (p !== "anthropic" && p !== "openai-compatible") {
    throw new Error(`PROVIDER must be "anthropic" or "openai-compatible", got "${p}"`);
  }
  return p;
}

export function resolveModel(env: Env = process.env): string {
  if (env.MODEL) return env.MODEL;
  if (resolveProvider(env) === "anthropic") return DEFAULT_MODEL;
  throw new Error("MODEL is required when PROVIDER=openai-compatible (for example llama-3.1-8b-instant)");
}

/** Open models in JSON mode need the exact shape spelled out; Anthropic's schema output does not. */
const JSON_SHAPE_INSTRUCTION = `Respond with a single JSON object and nothing else, with exactly these keys:
{"intent": one of ${INTENTS.map((i) => `"${i}"`).join(", ")},
 "secondary_intents": array of intents from that same list (empty if none),
 "confidence": number from 0 to 1,
 "needs_human": true or false,
 "injection_suspected": true or false,
 "reasons": one short sentence}`;

export interface OpenAICompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/** Works with Ollama, Groq, OpenRouter, Together and anything else that speaks /chat/completions. */
export function makeOpenAICompatibleCall({ baseUrl, model, apiKey }: OpenAICompatibleConfig): LlmCall {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  return async ({ system, user }) => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${system}\n\n${JSON_SHAPE_INSTRUCTION}` },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = data.choices?.[0];
    const finish = choice?.finish_reason ?? null;
    return {
      text: choice?.message?.content ?? "",
      stopReason: finish === "length" ? "max_tokens" : finish === "stop" ? "end_turn" : finish,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  };
}

/** Picks the provider from the environment. Throws on missing configuration. */
export function makeLlmCall(env: Env = process.env): LlmCall {
  const model = resolveModel(env);
  if (resolveProvider(env) === "anthropic") return makeAnthropicCall(model);
  return makeOpenAICompatibleCall({
    baseUrl: env.OPENAI_BASE_URL || "http://localhost:11434/v1",
    model,
    apiKey: env.OPENAI_API_KEY,
  });
}
