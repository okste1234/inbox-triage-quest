import { afterEach, describe, expect, it, vi } from "vitest";
import { makeOpenAICompatibleCall, resolveProvider } from "../src/llm.js";
import type { LlmOutputSpec } from "../src/llm-types.js";

const output: LlmOutputSpec = { schema: { type: "object" }, hint: 'HINT with "injection_suspected"' };

const okBody = (content: string, finish = "stop") => ({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 12, completion_tokens: 7 },
});

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("makeOpenAICompatibleCall", () => {
  it("posts a chat completion with JSON mode and the system prompt", async () => {
    const fetchMock = stubFetch(okBody('{"a":1}'));
    const call = makeOpenAICompatibleCall({ baseUrl: "http://localhost:11434/v1", model: "llama3.1", apiKey: "k" });
    await call({ system: "SYS", user: "USER", output });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("llama3.1");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(body.messages[0].content).toContain("SYS");
    expect(body.messages[0].content).toMatch(/"injection_suspected"/);
    expect(body.messages[1]).toEqual({ role: "user", content: "USER" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("returns text, token usage and a normalized stop reason", async () => {
    stubFetch(okBody('{"a":1}'));
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m" });
    expect(await call({ system: "s", user: "u", output })).toEqual({
      text: '{"a":1}',
      stopReason: "end_turn",
      inputTokens: 12,
      outputTokens: 7,
    });
  });

  it("maps finish_reason length to max_tokens", async () => {
    stubFetch(okBody("{", "length"));
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m" });
    expect((await call({ system: "s", user: "u", output })).stopReason).toBe("max_tokens");
  });

  it("omits the Authorization header when there is no key (local Ollama)", async () => {
    const fetchMock = stubFetch(okBody("{}"));
    await makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m" })({ system: "s", user: "u", output });
    const init = fetchMock.mock.calls[0][1] as unknown as RequestInit;
    expect(init.headers as Record<string, string>).not.toHaveProperty("Authorization");
  });

  it("throws on a non-2xx response so classifyMessage can turn it into needs_human", async () => {
    stubFetch({ error: { message: "server error" } }, 500);
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m" });
    await expect(call({ system: "s", user: "u", output })).rejects.toThrow(/500/);
  });
});

describe("makeOpenAICompatibleCall: rate limits", () => {
  const rateLimited = (headers: Record<string, string> = {}) => new Response('{"error":{"message":"Please try again in 2s"}}', { status: 429, headers });

  it("waits and retries on 429, honoring retry-after", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(rateLimited({ "retry-after": "3" }))
      .mockResolvedValueOnce(new Response(JSON.stringify(okBody("{}")), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const sleeps: number[] = [];
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", sleep: async (ms) => void sleeps.push(ms) });
    expect((await call({ system: "s", user: "u", output })).text).toBe("{}");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([3000]);
  });

  it("falls back to the 'try again in Ns' text, then to exponential backoff", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(okBody("{}")), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const sleeps: number[] = [];
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", sleep: async (ms) => void sleeps.push(ms) });
    await call({ system: "s", user: "u", output });
    expect(sleeps[0]).toBeGreaterThanOrEqual(2000);
    expect(sleeps[0]).toBeLessThan(3500);
    expect(sleeps[1]).toBeGreaterThanOrEqual(2000);
  });

  it("gives up after maxRetries and reports the 429", async () => {
    const fn = vi.fn(async (..._a: unknown[]) => rateLimited({ "retry-after": "0" }));
    vi.stubGlobal("fetch", fn);
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", maxRetries: 2, sleep: async () => {} });
    await expect(call({ system: "s", user: "u", output })).rejects.toThrow(/429/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry other errors", async () => {
    const fn = vi.fn(async (..._a: unknown[]) => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fn);
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", sleep: async () => {} });
    await expect(call({ system: "s", user: "u", output })).rejects.toThrow(/400/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("makeOpenAICompatibleCall: malformed JSON from the provider", () => {
  const badJson = () => new Response('{"error":{"message":"Failed to generate JSON.","code":"json_validate_failed"}}', { status: 400 });

  it("retries json_validate_failed (a bad sample, not a bad request) and then succeeds", async () => {
    const fn = vi.fn().mockResolvedValueOnce(badJson()).mockResolvedValueOnce(new Response(JSON.stringify(okBody("{}")), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", sleep: async () => {} });
    expect((await call({ system: "s", user: "u", output })).text).toBe("{}");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after 2 such retries", async () => {
    const fn = vi.fn(async (..._a: unknown[]) => badJson());
    vi.stubGlobal("fetch", fn);
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", sleep: async () => {} });
    await expect(call({ system: "s", user: "u", output })).rejects.toThrow(/json_validate_failed/);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("makeOpenAICompatibleCall: hung connections", () => {
  /** A fetch that never answers on its own, but honors the abort signal like the real one. */
  const hang = (_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")));
    });

  it("gives up on a call that never answers, instead of waiting forever", async () => {
    vi.stubGlobal("fetch", vi.fn(hang));
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", timeoutMs: 20, maxTimeoutRetries: 0 });
    await expect(call({ system: "s", user: "u", output })).rejects.toThrow(/timed out/i);
  });

  it("retries a timed-out call and succeeds on the next attempt", async () => {
    const fn = vi.fn().mockImplementationOnce(hang).mockResolvedValueOnce(new Response(JSON.stringify(okBody("{}")), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", timeoutMs: 20, sleep: async () => {} });
    expect((await call({ system: "s", user: "u", output })).text).toBe("{}");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("resolveProvider", () => {
  it("defaults to anthropic", () => {
    expect(resolveProvider({})).toBe("anthropic");
  });
  it("selects openai-compatible when asked", () => {
    expect(resolveProvider({ PROVIDER: "openai-compatible" })).toBe("openai-compatible");
  });
  it("rejects unknown providers instead of guessing", () => {
    expect(() => resolveProvider({ PROVIDER: "banana" })).toThrow(/PROVIDER/);
  });
});
