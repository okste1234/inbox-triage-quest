import { describe, expect, it } from "vitest";
import { summarizeDrafts } from "../evals/draft_score.js";

const r = (draft: string | null, flags: string[] = [], extra: Record<string, unknown> = {}) => ({ draft, flags, blocked: false, ...extra });

describe("summarizeDrafts", () => {
  it("counts drafted, empty, blocked and errored results", () => {
    const s = summarizeDrafts([r("Hello there."), r(null), r(null, ["money"], { blocked: true }), r(null, [], { error: "boom" })] as never);
    expect(s).toMatchObject({ n: 4, drafted: 1, empty: 1, blocked: 1, errors: 1 });
  });

  it("counts each flag kind over drafted replies and reports rates", () => {
    const s = summarizeDrafts([r("a", ["claims_action"]), r("b", ["claims_action", "date_time"]), r("c")] as never);
    expect(s.flagCounts).toEqual({ claims_action: 2, date_time: 1 });
    expect(s.flagRates.claims_action).toBeCloseTo(2 / 3);
  });

  it("reports word counts for drafted replies only", () => {
    const s = summarizeDrafts([r("one two three"), r("one two three four five"), r(null)] as never);
    expect(s.avgWords).toBe(4);
    expect(s.maxWords).toBe(5);
  });

  it("handles an empty run without dividing by zero", () => {
    const s = summarizeDrafts([] as never);
    expect(s).toMatchObject({ n: 0, drafted: 0, avgWords: 0, maxWords: 0 });
    expect(s.flagRates).toEqual({});
  });
});
