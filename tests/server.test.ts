import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { CLASSIFY_OUTPUT } from "../src/classify.js";
import { detectInjection } from "../src/guardrails.js";
import { createApp } from "../src/server.js";
import type { LlmCall } from "../src/llm-types.js";

const llm: LlmCall = async ({ output }) => ({
  text:
    output === CLASSIFY_OUTPUT
      ? JSON.stringify({ intent: "status_check", secondary_intents: [], confidence: 0.9, needs_human: false, injection_suspected: false, reasons: "r" })
      : JSON.stringify({ draft: "Thanks, noted." }),
  stopReason: "end_turn",
  inputTokens: 10,
  outputTokens: 5,
});

let server: Server | undefined;
async function start(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  server = createApp({ llm, classifySystem: "C", draftSystem: "D", maxMessagesPerHour: 5, ...overrides });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}/api/triage`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("server", () => {
  it("serves the page and a health check", async () => {
    const url = await start();
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>");
    const health = await fetch(`${url}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true });
  });

  it("reports which commit is running, when the host provides it", async () => {
    process.env.RENDER_GIT_COMMIT = "abcdef1234567890";
    try {
      const url = await start();
      expect(await (await fetch(`${url}/healthz`)).json()).toEqual({ ok: true, commit: "abcdef1" });
    } finally {
      delete process.env.RENDER_GIT_COMMIT;
    }
  });

  it("serves a small curated demo set without email addresses", async () => {
    const url = await start();
    const body = await (await fetch(`${url}/api/sample`)).text();
    const sample = JSON.parse(body) as { body: string }[];
    expect(sample.length).toBeGreaterThanOrEqual(5);
    expect(sample.length).toBeLessThanOrEqual(8);
    expect(body).not.toContain("@example.com");
    expect(sample.some((m) => detectInjection(m.body))).toBe(true);
  });

  it("triages posted messages", async () => {
    const url = await start();
    const res = await post(url, { messages: [{ subject: "Hi", body: "Any update?" }] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0]).toMatchObject({ draft: "Thanks, noted.", classification: { intent: "status_check" } });
  });

  it("rejects bad input with 400", async () => {
    const url = await start();
    expect((await post(url, { messages: [] })).status).toBe(400);
    expect((await post(url, { messages: [{ body: "x".repeat(2001) }] })).status).toBe(400);
    expect((await post(url, { messages: Array.from({ length: 21 }, () => ({ body: "x" })) })).status).toBe(400);
    expect((await post(url, { nope: 1 })).status).toBe(400);
    const bad = await fetch(`${url}/api/triage`, { method: "POST", body: "{not json" });
    expect(bad.status).toBe(400);
  });

  it("rejects oversized request bodies with 413", async () => {
    const url = await start();
    const res = await fetch(`${url}/api/triage`, { method: "POST", body: "x".repeat(200_000) });
    expect(res.status).toBe(413);
  });

  it("rate-limits per client by message count and says so", async () => {
    const url = await start();
    const batch = { messages: Array.from({ length: 3 }, () => ({ body: "hi" })) };
    expect((await post(url, batch, { "x-forwarded-for": "1.1.1.1" })).status).toBe(200);
    const second = await post(url, batch, { "x-forwarded-for": "1.1.1.1" });
    expect(second.status).toBe(429);
    expect((await second.json()).error).toMatch(/limit/i);
    expect((await post(url, batch, { "x-forwarded-for": "2.2.2.2" })).status).toBe(200);
  });

  it("has a server-wide daily budget so strangers cannot drain the model quota", async () => {
    const url = await start({ maxMessagesPerHour: 100, maxMessagesPerDay: 4 });
    const batch = { messages: Array.from({ length: 3 }, () => ({ body: "hi" })) };
    expect((await post(url, batch, { "x-forwarded-for": "1.1.1.1" })).status).toBe(200);
    const other = await post(url, batch, { "x-forwarded-for": "2.2.2.2" });
    expect(other.status).toBe(429);
    expect((await other.json()).error).toMatch(/daily/i);
  });

  it("answers 504 with a clear message when the model takes too long, instead of hanging", async () => {
    const never: LlmCall = () => new Promise(() => {});
    const url = await start({ llm: never, requestDeadlineMs: 80 });
    const t0 = Date.now();
    const res = await post(url, { messages: [{ body: "any update on my application?" }] });
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/too long|slow/i);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("does not count a timed-out request against the daily budget twice or break later requests", async () => {
    const url = await start({ requestDeadlineMs: 5000 });
    expect((await post(url, { messages: [{ body: "any update?" }] })).status).toBe(200);
  });

  it("returns 404 for unknown routes and 405 for wrong methods", async () => {
    const url = await start();
    expect((await fetch(`${url}/nope`)).status).toBe(404);
    expect((await fetch(`${url}/api/triage`)).status).toBe(405);
  });

  it("does not leak internals when the pipeline throws", async () => {
    const url = await start({ llm: async () => { throw new Error("secret-key-abc"); } });
    const res = await post(url, { messages: [{ body: "hi" }] });
    const text = await res.text();
    expect(text).not.toContain("secret-key-abc");
  });
});
