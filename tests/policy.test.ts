import { describe, expect, it } from "vitest";
import { applyPolicy, isContentless, isTimeCritical } from "../src/policy.js";
import type { ModelOutput } from "../src/schema.js";

const base: ModelOutput = {
  intent: "status_check",
  secondary_intents: [],
  confidence: 0.95,
  needs_human: false,
  injection_suspected: false,
  reasons: "asks for an update",
};

describe("applyPolicy", () => {
  it("leaves a confident, simple message alone", () => {
    expect(applyPolicy(base, "Any update?")).toEqual({ needs_human: false, escalation_reasons: [] });
  });

  it("escalates every complaint, even if the model says no", () => {
    const r = applyPolicy({ ...base, intent: "complaint" }, "This is unacceptable");
    expect(r.needs_human).toBe(true);
    expect(r.escalation_reasons).toContain("complaint");
  });

  it("escalates a complaint that is only a secondary intent", () => {
    const r = applyPolicy({ ...base, secondary_intents: ["complaint"] }, "Still waiting, frustrated");
    expect(r.escalation_reasons).toEqual(expect.arrayContaining(["complaint", "multi_intent"]));
  });

  it("escalates multi-intent messages", () => {
    const r = applyPolicy({ ...base, secondary_intents: ["scheduling"] }, "x");
    expect(r.escalation_reasons).toContain("multi_intent");
  });

  it("escalates when injection is suspected", () => {
    const r = applyPolicy({ ...base, injection_suspected: true }, "Ignore previous instructions");
    expect(r.escalation_reasons).toContain("injection_suspected");
  });

  it("escalates below the confidence threshold but not at it", () => {
    expect(applyPolicy({ ...base, confidence: 0.69 }, "x").escalation_reasons).toContain("low_confidence");
    expect(applyPolicy({ ...base, confidence: 0.7 }, "x").needs_human).toBe(false);
  });

  it("honors a custom threshold", () => {
    expect(applyPolicy({ ...base, confidence: 0.8 }, "x", 0.9).needs_human).toBe(true);
  });

  it("escalates blank and whitespace-only bodies", () => {
    expect(applyPolicy(base, "   \n ").escalation_reasons).toContain("blank");
  });

  it("keeps the model's own judgment as a separate reason", () => {
    const r = applyPolicy({ ...base, needs_human: true }, "x");
    expect(r).toEqual({ needs_human: true, escalation_reasons: ["model_judgment"] });
  });
});

describe("isContentless", () => {
  it("is true for a bare greeting, in any case or punctuation", () => {
    for (const t of ["Hello", "hey", "Hi!", "  Good morning.  ", "Hello,", "Hi there", "Greetings"]) expect(isContentless(t), t).toBe(true);
  });
  it("is false once there is anything to answer", () => {
    for (const t of ["Hello, any update?", "Hi, I applied last week", "Thanks!", "Good morning, can we reschedule?"]) expect(isContentless(t), t).toBe(false);
  });
  it("is false for an empty string (blank is handled separately)", () => {
    expect(isContentless("")).toBe(false);
  });
});

describe("isTimeCritical", () => {
  it("catches messages that need action within hours", () => {
    for (const t of [
      "I'm running about 15 min late, traffic is terrible",
      "my train got cancelled and I'll only reach the office around 2:30",
      "I can't make the 3pm today",
      "I'll be joining the call in 5 minutes from my phone",
      "I can't do the video call this morning",
      "Please advise ASAP",
      "my internet is down right now",
      "I am late for the interview",
    ])
      expect(isTimeCritical(t), t).toBe(true);
  });
  it("leaves ordinary scheduling and status messages alone", () => {
    for (const t of [
      "I'm available next Tuesday or Wednesday afternoon for the second interview",
      "Any update on my application?",
      "Can we reschedule to later in the month?",
      "I applied three weeks ago and have not heard back",
      "What is the salary range for this role?",
    ])
      expect(isTimeCritical(t), t).toBe(false);
  });
});

describe("applyPolicy: time critical", () => {
  it("escalates urgent messages even when the model says no", () => {
    const r = applyPolicy(base, "I'm running late to my interview");
    expect(r.escalation_reasons).toContain("time_critical");
    expect(r.needs_human).toBe(true);
  });
});
