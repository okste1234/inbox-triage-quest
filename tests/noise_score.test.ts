import { describe, expect, it } from "vitest";
import { summarizeRuns } from "../evals/noise_score.js";
import type { Prediction } from "../evals/score.js";
import type { Label } from "../src/schema.js";

const label = (id: string, intent: Label["intent"], needs_human = false): Label => ({
  id, intent, secondary_intents: [], needs_human, ideal_reply: "", notes: "", labeled_by: "human",
});
const p = (id: string, intent: Prediction["intent"], needs_human = false): Prediction => ({ id, intent, needs_human });

const labels = [label("a", "status_check"), label("b", "scheduling"), label("c", "complaint", true)];

describe("summarizeRuns", () => {
  it("reports min, max, mean and spread of strict intent accuracy across runs", () => {
    const runs = [
      [p("a", "status_check"), p("b", "scheduling"), p("c", "complaint", true)], // 3/3
      [p("a", "status_check"), p("b", "other"), p("c", "complaint", true)], // 2/3
      [p("a", "other"), p("b", "other"), p("c", "complaint", true)], // 1/3
    ];
    const s = summarizeRuns(runs, labels);
    expect(s.runs).toBe(3);
    expect(s.intentStrict.min).toBeCloseTo(1 / 3);
    expect(s.intentStrict.max).toBe(1);
    expect(s.intentStrict.range).toBeCloseTo(2 / 3);
    expect(s.intentStrict.mean).toBeCloseTo(2 / 3);
  });

  it("separates messages that are wrong every time (systematic) from wrong only sometimes (noise)", () => {
    const runs = [
      [p("a", "other"), p("b", "scheduling"), p("c", "other", false)],
      [p("a", "other"), p("b", "other"), p("c", "other", false)],
      [p("a", "other"), p("b", "scheduling"), p("c", "other", false)],
    ];
    const s = summarizeRuns(runs, labels);
    expect(s.intentAlwaysWrong.sort()).toEqual(["a", "c"]);
    expect(s.intentSometimesWrong).toEqual(["b"]);
  });

  it("counts messages whose intent or needs_human answer changed between runs", () => {
    const runs = [
      [p("a", "status_check", false), p("b", "scheduling", false), p("c", "complaint", true)],
      [p("a", "status_check", true), p("b", "other", false), p("c", "complaint", true)],
    ];
    const s = summarizeRuns(runs, labels);
    expect(s.intentFlips).toBe(1);
    expect(s.needsHumanFlips).toBe(1);
  });

  it("reports needs_human precision and recall spread, ignoring runs where a ratio is undefined", () => {
    const runs = [
      [p("a", "status_check", true), p("b", "scheduling"), p("c", "complaint", true)],
      [p("a", "status_check"), p("b", "scheduling"), p("c", "complaint", true)],
    ];
    const s = summarizeRuns(runs, labels);
    expect(s.needsHumanRecall).toMatchObject({ min: 1, max: 1 });
    expect(s.needsHumanPrecision).toMatchObject({ min: 0.5, max: 1 });
  });

  it("handles a single run without inventing a spread", () => {
    const s = summarizeRuns([[p("a", "status_check"), p("b", "scheduling"), p("c", "complaint", true)]], labels);
    expect(s.intentStrict.range).toBe(0);
    expect(s.intentFlips).toBe(0);
  });
});
