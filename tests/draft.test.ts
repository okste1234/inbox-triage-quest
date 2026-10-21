import { describe, expect, it, vi } from "vitest";
import { DRAFT_OUTPUT, draftReply } from "../src/draft.js";
import type { LlmCall } from "../src/llm-types.js";
import type { Classification, Message } from "../src/schema.js";

const msg: Message = { id: "m1", from_name: "A", from_email: "a@example.com", subject: "Update?", body: "Any update?" };
const cls = (extra: Partial<Classification> = {}): Classification => ({
  id: "m1",
  intent: "status_check",
  secondary_intents: [],
  confidence: 0.9,
  needs_human: false,
  injection_suspected: false,
  reasons: "",
  escalation_reasons: [],
  ...extra,
});
const llmReturning = (text: string, extra: Record<string, unknown> = {}): LlmCall =>
  vi.fn(async () => ({ text, stopReason: "end_turn", inputTokens: 50, outputTokens: 30, ...extra }));

describe("draftReply", () => {
  it("returns the model's draft and token usage", async () => {
    const llm = llmReturning(JSON.stringify({ draft: "Thanks, I've passed this on." }));
    const r = await draftReply(msg, cls(), llm, "SYS");
    expect(r).toMatchObject({ draft: "Thanks, I've passed this on.", flags: [], blocked: false, usage: { inputTokens: 50, outputTokens: 30 } });
    expect(llm).toHaveBeenCalledWith(expect.objectContaining({ system: "SYS", output: DRAFT_OUTPUT }));
  });

  it("does not draft for messages that need a human, and does not call the model", async () => {
    const llm = llmReturning("{}");
    const r = await draftReply(msg, cls({ needs_human: true }), llm, "SYS");
    expect(r.draft).toBeNull();
    expect(llm).not.toHaveBeenCalled();
  });

  it("does not draft when classification failed", async () => {
    const llm = llmReturning("{}");
    expect((await draftReply(msg, cls({ error: "boom" }), llm, "S")).draft).toBeNull();
    expect(llm).not.toHaveBeenCalled();
  });

  it("treats an empty draft as 'no reply needed'", async () => {
    const r = await draftReply(msg, cls(), llmReturning(JSON.stringify({ draft: "  " })), "S");
    expect(r.draft).toBeNull();
    expect(r.error).toBeUndefined();
  });

  it("withholds a draft that violates a hard guardrail", async () => {
    const r = await draftReply(msg, cls(), llmReturning(JSON.stringify({ draft: "You got the job! Salary is $90k." })), "S");
    expect(r.draft).toBeNull();
    expect(r.blocked).toBe(true);
    expect(r.flags).toEqual(expect.arrayContaining(["money", "hiring_promise"]));
  });

  it("keeps a draft with only soft flags, and reports them", async () => {
    const r = await draftReply(msg, cls(), llmReturning(JSON.stringify({ draft: "We'll talk Thursday." })), "S");
    expect(r.draft).toBe("We'll talk Thursday.");
    expect(r.flags).toEqual(["date_time"]);
    expect(r.blocked).toBe(false);
  });

  it("returns no draft, with an error, on bad JSON, a refusal, or an API failure", async () => {
    expect((await draftReply(msg, cls(), llmReturning("not json"), "S")).error).toMatch(/json/i);
    expect((await draftReply(msg, cls(), llmReturning("{}", { stopReason: "refusal" }), "S")).error).toMatch(/refusal/);
    const boom: LlmCall = async () => {
      throw new Error("503");
    };
    const r = await draftReply(msg, cls(), boom, "S");
    expect(r.draft).toBeNull();
    expect(r.error).toContain("503");
  });
});
