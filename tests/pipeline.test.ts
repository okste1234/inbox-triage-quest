import { describe, expect, it } from "vitest";
import { CLASSIFY_OUTPUT } from "../src/classify.js";
import { DRAFT_OUTPUT } from "../src/draft.js";
import type { LlmCall } from "../src/llm-types.js";
import { triageMessages } from "../src/pipeline.js";
import type { Message } from "../src/schema.js";

const m = (id: string, body: string): Message => ({ id, from_name: "N", from_email: `${id}@example.com`, subject: "S", body });

const cls = (o: object) => JSON.stringify({ intent: "status_check", secondary_intents: [], confidence: 0.9, needs_human: false, injection_suspected: false, reasons: "r", ...o });

/** Routes by output spec so one fake serves both stages. */
const fake = (classify: (user: string) => string, draft: (user: string) => string): LlmCall =>
  async ({ user, output }) => ({
    text: output === CLASSIFY_OUTPUT ? classify(user) : output === DRAFT_OUTPUT ? draft(user) : "",
    stopReason: "end_turn",
    inputTokens: 10,
    outputTokens: 5,
  });

const deps = (llm: LlmCall) => ({ llm, classifySystem: "C", draftSystem: "D" });

describe("triageMessages", () => {
  it("classifies then drafts, preserving input order", async () => {
    const llm = fake(() => cls({}), () => JSON.stringify({ draft: "Thanks." }));
    const { items } = await triageMessages([m("a", "x"), m("b", "y"), m("c", "z")], deps(llm));
    expect(items.map((i) => i.message.id)).toEqual(["a", "b", "c"]);
    expect(items.every((i) => i.draft === "Thanks.")).toBe(true);
  });

  it("does not expose the sender's email in the output", async () => {
    const llm = fake(() => cls({}), () => JSON.stringify({ draft: "ok" }));
    const [item] = (await triageMessages([m("a", "x")], deps(llm))).items;
    expect(JSON.stringify(item)).not.toContain("@example.com");
  });

  it("gives no draft to messages that need a human", async () => {
    const llm = fake(() => cls({ intent: "complaint" }), () => JSON.stringify({ draft: "should not be used" }));
    const [item] = (await triageMessages([m("a", "awful")], deps(llm))).items;
    expect(item.classification.needs_human).toBe(true);
    expect(item.draft).toBeNull();
  });

  it("escalates when a draft is blocked by a guardrail", async () => {
    const llm = fake(() => cls({}), () => JSON.stringify({ draft: "You got the job!" }));
    const [item] = (await triageMessages([m("a", "x")], deps(llm))).items;
    expect(item.draft).toBeNull();
    expect(item.draft_blocked).toBe(true);
    expect(item.classification.needs_human).toBe(true);
    expect(item.classification.escalation_reasons).toContain("draft_blocked");
  });

  it("never drops a message silently: an empty draft sends it to a person", async () => {
    const llm = fake(() => cls({}), () => JSON.stringify({ draft: "" }));
    const [item] = (await triageMessages([m("a", "x")], deps(llm))).items;
    expect(item.draft).toBeNull();
    expect(item.classification.needs_human).toBe(true);
    expect(item.classification.escalation_reasons).toContain("no_draft");
  });

  it("a failed draft call also goes to a person", async () => {
    const llm: LlmCall = async ({ output }) => {
      if (output === CLASSIFY_OUTPUT) return { text: cls({}), stopReason: "end_turn", inputTokens: 1, outputTokens: 1 };
      throw new Error("503");
    };
    const [item] = (await triageMessages([m("a", "x")], deps(llm))).items;
    expect(item.classification.escalation_reasons).toContain("no_draft");
  });

  it("does not add no_draft on top of draft_blocked or an existing escalation", async () => {
    const blocked = (await triageMessages([m("a", "x")], deps(fake(() => cls({}), () => JSON.stringify({ draft: "You got the job!" }))))).items[0];
    expect(blocked.classification.escalation_reasons).toEqual(["draft_blocked"]);
    const complaint = (await triageMessages([m("a", "x")], deps(fake(() => cls({ intent: "complaint" }), () => "{}")))).items[0];
    expect(complaint.classification.escalation_reasons).not.toContain("no_draft");
  });

  it("redacts sensitive numbers in the message returned to the reviewer", async () => {
    const llm = fake(() => cls({}), () => JSON.stringify({ draft: "ok" }));
    const [item] = (await triageMessages([m("a", "SSN 123-45-6789")], deps(llm))).items;
    expect(item.message.body).not.toContain("123-45-6789");
    expect(item.message.body).toContain("[REDACTED SSN]");
  });

  it("one failure does not sink the batch", async () => {
    const llm = fake((u) => (u.includes("BAD") ? "not json" : cls({})), () => JSON.stringify({ draft: "ok" }));
    const { items } = await triageMessages([m("a", "fine"), m("b", "BAD"), m("c", "fine")], deps(llm));
    expect(items[1].classification.error).toBeDefined();
    expect(items[1].classification.needs_human).toBe(true);
    expect(items[0].draft).toBe("ok");
    expect(items[2].draft).toBe("ok");
  });

  it("respects the concurrency limit", async () => {
    let running = 0;
    let peak = 0;
    const llm: LlmCall = async ({ output }) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { text: output === CLASSIFY_OUTPUT ? cls({}) : JSON.stringify({ draft: "ok" }), stopReason: "end_turn", inputTokens: 1, outputTokens: 1 };
    };
    await triageMessages(Array.from({ length: 10 }, (_, i) => m(`m${i}`, "x")), { ...deps(llm), concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("sums token usage across both stages", async () => {
    const llm = fake(() => cls({}), () => JSON.stringify({ draft: "ok" }));
    const { usage } = await triageMessages([m("a", "x"), m("b", "y")], deps(llm));
    expect(usage).toEqual({ inputTokens: 40, outputTokens: 20 });
  });
});
