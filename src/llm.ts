import Anthropic from "@anthropic-ai/sdk";
import type { LlmCall } from "./llm-types.js";

export const DEFAULT_MODEL = "claude-opus-5-5";

export function makeAnthropicCall(model: string = process.env.MODEL || DEFAULT_MODEL): LlmCall {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  return async ({ system, user, output }) => {
    const response = await client.messages.create({
      model,
      // Thinking tokens count toward max_tokens, so leave room even at low effort.
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low", format: { type: "json_schema", schema: output.schema } },
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
  throw new Error("MODEL is required when PROVIDER=openai-compatible (for example openai/gpt-oss-20b on Groq)");
}

const MAX_BAD_JSON_RETRIES = 2;

/** Every HTTP request this process has sent to an OpenAI-compatible provider, retries included. Free tiers cap requests per day. */
export const requestStats = { requests: 0 };

export interface OpenAICompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Retries after a 429 (rate limit). Free tiers cap tokens per minute, so waiting is normal. */
  maxRetries?: number;
  /** Per-attempt limit. Without one, a stalled connection freezes the caller forever. */
  timeoutMs?: number;
  maxTimeoutRetries?: number;
  /** Retries for connection failures (DNS, reset, offline), with exponential backoff. */
  maxNetworkRetries?: number;
  /** Total HTTP requests per call across all retry kinds. */
  maxAttempts?: number;
  /** Injected in tests so they do not really wait. */
  sleep?: (ms: number) => Promise<void>;
}

/** How long to wait after a 429: the retry-after header, else "try again in 2.5s" in the body, else exponential. */
function retryDelayMs(res: Response, body: string, attempt: number): number {
  const header = Number(res.headers.get("retry-after"));
  if (res.headers.get("retry-after") !== null && Number.isFinite(header)) return header * 1000;
  const m = body.match(/try again in ([\d.]+)s/i);
  if (m) return Math.ceil(Number(m[1]) * 1000) + 500;
  return Math.min(2000 * 2 ** attempt, 30_000);
}

/** Works with Ollama, Groq, OpenRouter, Together and anything else that speaks /chat/completions. */
export function makeOpenAICompatibleCall({
  baseUrl,
  model,
  apiKey,
  maxRetries = 6,
  timeoutMs = 60_000,
  maxTimeoutRetries = 2,
  maxNetworkRetries = 4,
  maxAttempts = 5,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}: OpenAICompatibleConfig): LlmCall {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  return async ({ system, user, output }) => {
    const body = JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${system}\n\n${output.hint}` },
        { role: "user", content: user },
      ],
    });
    let res: Response;
    let rateLimitRetries = 0;
    let badJsonRetries = 0;
    let timeoutRetries = 0;
    let networkRetries = 0;
    let attempts = 0;
    let lastError = new Error("no attempt made");
    for (;;) {
      // Hard cap across every kind of retry: one stalled provider must not multiply into dozens of requests.
      if (attempts >= maxAttempts) throw lastError;
      attempts++;
      requestStats.requests++;
      try {
        res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        if (!timedOut) {
          lastError = err instanceof TypeError ? new Error(`network failure: ${err.message}`) : (err as Error);
          if (err instanceof TypeError && networkRetries < maxNetworkRetries) {
            await sleep(Math.min(1000 * 2 ** networkRetries++, 15_000));
            continue;
          }
          throw lastError;
        }
        lastError = new Error(`request timed out after ${timeoutMs}ms`);
        if (timeoutRetries++ < maxTimeoutRetries) continue;
        throw lastError;
      }
      if (res.ok) break;
      const text = await res.text();
      lastError = new Error(`${res.status} ${text.slice(0, 200)}`);
      // Providers that validate JSON mode reject an occasional malformed sample; resampling usually works.
      if (res.status === 400 && text.includes("json_validate_failed") && badJsonRetries < MAX_BAD_JSON_RETRIES) {
        badJsonRetries++;
        continue;
      }
      if (res.status !== 429 || rateLimitRetries >= maxRetries) throw lastError;
      await sleep(retryDelayMs(res, text, rateLimitRetries++));
    }

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
  if (resolveProvider(env) === "anthropic") return withCircuitBreaker(makeAnthropicCall(model));
  return withCircuitBreaker(makeOpenAICompatibleCall({
    baseUrl: env.OPENAI_BASE_URL || "http://localhost:11434/v1",
    model,
    apiKey: env.OPENAI_API_KEY,
    timeoutMs: Number(env.LLM_TIMEOUT_MS) || undefined,
    maxAttempts: Number(env.LLM_MAX_ATTEMPTS) || undefined,
  }));
}

export interface BreakerOptions {
  maxConsecutiveFailures?: number;
  cooldownMs?: number;
  now?: () => number;
}

/**
 * After N consecutive failed calls, fail fast without touching the provider until the cooldown passes,
 * then let one trial call through. Stops a down or throttled provider from being hammered by every message.
 */
export function withCircuitBreaker(inner: LlmCall, { maxConsecutiveFailures = 4, cooldownMs = 30_000, now = Date.now }: BreakerOptions = {}): LlmCall {
  let failures = 0;
  let openedAt = 0;
  return async (req) => {
    if (failures >= maxConsecutiveFailures && now() - openedAt < cooldownMs) {
      throw new Error("circuit open: the model provider is failing, not sending more requests for now");
    }
    try {
      const res = await inner(req);
      failures = 0;
      return res;
    } catch (err) {
      failures++;
      if (failures >= maxConsecutiveFailures) openedAt = now();
      throw err;
    }
  };
}
