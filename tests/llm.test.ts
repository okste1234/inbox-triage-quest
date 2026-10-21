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
    stubFetch({ error: { message: "rate limited" } }, 429);
    const call = makeOpenAICompatibleCall({ baseUrl: "http://x/v1", model: "m" });
    await expect(call({ system: "s", user: "u", output })).rejects.toThrow(/429/);
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
