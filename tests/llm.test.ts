import { afterEach, describe, expect, it, vi } from "vitest";
import { makeOpenAICompatibleCall, requestStats, resolveProvider, withCircuitBreaker } from "../src/llm.js";
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

describe("makeOpenAICompatibleCall: long rate-limit waits", () => {
  it("fails fast instead of sleeping when the provider says to retry after a long time (daily limit)", async () => {
    const fn = vi.fn(async (..._a: unknown[]) => new Response('{"error":{"message":"Rate limit reached ... requests per day (RPD)"}}', { status: 429, headers: { "retry-after": "28800" } }));
    vi.stubGlobal("fetch", fn);
    const sleeps: number[] = [];
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", sleep: async (ms) => void sleeps.push(ms) });
    await expect(call({ system: "s", user: "u", output })).rejects.toThrow(/429/);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("still waits for short per-minute limits", async () => {
    const fn = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "12" } })).mockResolvedValueOnce(new Response(JSON.stringify(okBody("{}")), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const sleeps: number[] = [];
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", sleep: async (ms) => void sleeps.push(ms) });
    await call({ system: "s", user: "u", output });
    expect(sleeps).toEqual([12000]);
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

describe("makeOpenAICompatibleCall: network blips", () => {
  const netFail = () => Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }));

  it("retries a connection failure with backoff and then succeeds", async () => {
    const fn = vi.fn().mockImplementationOnce(netFail).mockImplementationOnce(netFail).mockResolvedValueOnce(new Response(JSON.stringify(okBody("{}")), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const sleeps: number[] = [];
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", sleep: async (ms) => void sleeps.push(ms) });
    expect((await call({ system: "s", user: "u", output })).text).toBe("{}");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
  });

  it("gives up after the retry budget and says it was a network failure", async () => {
    const fn = vi.fn(netFail);
    vi.stubGlobal("fetch", fn);
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", maxNetworkRetries: 2, sleep: async () => {} });
    await expect(call({ system: "s", user: "u", output })).rejects.toThrow(/network/i);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("makeOpenAICompatibleCall: total attempt cap", () => {
  it("never sends more than maxAttempts requests for one call, whatever mix of failures happens", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response('{"error":{"code":"json_validate_failed"}}', { status: 400 }))
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), {}))
      .mockResolvedValue(new Response("{}", { status: 429, headers: { "retry-after": "0" } }));
    vi.stubGlobal("fetch", fn);
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", maxAttempts: 3, sleep: async () => {} });
    await expect(call({ system: "s", user: "u", output })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("counts every HTTP request it sends, retries included", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(okBody("{}")), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const before = requestStats.requests;
    await makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m", sleep: async () => {} })({ system: "s", user: "u", output });
    expect(requestStats.requests - before).toBe(2);
  });
});

describe("withCircuitBreaker", () => {
  const req = { system: "s", user: "u", output };
  const ok = { text: "{}", stopReason: "end_turn", inputTokens: 1, outputTokens: 1 };

  it("opens after N consecutive failures and stops calling the provider", async () => {
    const inner = vi.fn(async () => {
      throw new Error("down");
    });
    const call = withCircuitBreaker(inner, { maxConsecutiveFailures: 3, cooldownMs: 1000, now: () => 0 });
    for (let i = 0; i < 3; i++) await expect(call(req)).rejects.toThrow("down");
    await expect(call(req)).rejects.toThrow(/circuit open/i);
    await expect(call(req)).rejects.toThrow(/circuit open/i);
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it("a success resets the failure count", async () => {
    const inner = vi.fn().mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(ok).mockRejectedValue(new Error("x"));
    const call = withCircuitBreaker(inner, { maxConsecutiveFailures: 3, cooldownMs: 1000, now: () => 0 });
    await expect(call(req)).rejects.toThrow("x");
    await expect(call(req)).rejects.toThrow("x");
    await call(req);
    await expect(call(req)).rejects.toThrow("x");
    await expect(call(req)).rejects.toThrow("x");
    await expect(call(req)).rejects.toThrow("x"); // 3rd consecutive since the success, still a real call
    await expect(call(req)).rejects.toThrow(/circuit open/i);
  });

  it("lets one trial call through after the cooldown and closes again on success", async () => {
    let t = 0;
    const inner = vi.fn().mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x")).mockResolvedValue(ok);
    const call = withCircuitBreaker(inner, { maxConsecutiveFailures: 2, cooldownMs: 1000, now: () => t });
    await expect(call(req)).rejects.toThrow("x");
    await expect(call(req)).rejects.toThrow("x");
    await expect(call(req)).rejects.toThrow(/circuit open/i);
    t = 1500;
    expect((await call(req)).text).toBe("{}");
    expect((await call(req)).text).toBe("{}");
    expect(inner).toHaveBeenCalledTimes(4);
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
