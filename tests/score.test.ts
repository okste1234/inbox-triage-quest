import { describe, expect, it } from "vitest";
import { score, type Prediction } from "../evals/score.js";
import type { Label } from "../src/schema.js";

const label = (id: string, intent: Label["intent"], extra: Partial<Label> = {}): Label => ({
  id,
  intent,
  secondary_intents: [],
  needs_human: false,
  ideal_reply: "",
  notes: "",
  labeled_by: "human",
  ...extra,
});
const pred = (id: string, intent: Prediction["intent"], needs_human = false): Prediction => ({ id, intent, needs_human });

describe("score: intent accuracy", () => {
  it("is strict on primary intent", () => {
    const r = score([pred("a", "status_check"), pred("b", "other")], [label("a", "status_check"), label("b", "scheduling")]);
    expect(r.intent).toMatchObject({ correct: 1, total: 2, strict: 0.5 });
    expect(r.misses).toEqual([{ id: "b", expected: "scheduling", got: "other" }]);
  });

  it("lenient also accepts a labeled secondary intent", () => {
    const r = score(
      [pred("a", "compensation_question")],
      [label("a", "scheduling", { secondary_intents: ["compensation_question"] })],
    );
    expect(r.intent.strict).toBe(0);
    expect(r.intent.lenient).toBe(1);
  });

  it("counts a missing prediction as wrong and reports it", () => {
    const r = score([], [label("a", "other")]);
    expect(r.intent.strict).toBe(0);
    expect(r.missing).toEqual(["a"]);
  });

  it("ignores predictions with no label", () => {
    const r = score([pred("zzz", "other")], [label("a", "other")]);
    expect(r.intent.total).toBe(1);
  });

  it("splits accuracy by label provenance", () => {
    const r = score(
      [pred("a", "other"), pred("b", "other"), pred("c", "scheduling")],
      [
        label("a", "other", { labeled_by: "human" }),
        label("b", "status_check", { labeled_by: "human_ai_assisted" }),
        label("c", "scheduling", { labeled_by: "human_ai_assisted" }),
      ],
    );
    expect(r.byProvenance.human).toEqual({ n: 1, strict: 1 });
    expect(r.byProvenance.human_ai_assisted).toEqual({ n: 2, strict: 0.5 });
  });
});

describe("score: needs_human", () => {
  it("builds a confusion matrix with precision and recall", () => {
    const labels = [
      label("tp", "complaint", { needs_human: true }),
      label("fn", "complaint", { needs_human: true }),
      label("fp", "other"),
      label("tn", "other"),
    ];
    const preds = [pred("tp", "complaint", true), pred("fn", "complaint", false), pred("fp", "other", true), pred("tn", "other", false)];
    const r = score(preds, labels).needsHuman;
    expect(r).toMatchObject({ tp: 1, fn: 1, fp: 1, tn: 1, precision: 0.5, recall: 0.5 });
  });

  it("reports null, not 1, when a ratio has no denominator", () => {
    const r = score([pred("a", "other", false)], [label("a", "other")]).needsHuman;
    expect(r.precision).toBeNull();
    expect(r.recall).toBeNull();
  });

  it("lists the disagreements so they can be read", () => {
    const r = score([pred("a", "other", false)], [label("a", "other", { needs_human: true })]);
    expect(r.needsHumanMisses).toEqual([{ id: "a", expected: true, got: false }]);
  });
});
