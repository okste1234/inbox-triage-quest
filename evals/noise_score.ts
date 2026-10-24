import type { Label } from "../src/schema.js";
import { score, type Prediction } from "./score.js";

interface Spread {
  min: number;
  max: number;
  mean: number;
  range: number;
  /** Per-run values, in run order. null when the ratio was undefined in that run. */
  values: (number | null)[];
}

function spread(values: (number | null)[]): Spread {
  const v = values.filter((x): x is number => x !== null);
  if (v.length === 0) return { min: NaN, max: NaN, mean: NaN, range: NaN, values };
  const min = Math.min(...v);
  const max = Math.max(...v);
  return { min, max, mean: v.reduce((a, b) => a + b, 0) / v.length, range: max - min, values };
}

/**
 * Repeats of the same prompt on the same messages: how much do the numbers move on their own?
 * Pure, so it is unit-tested. `runs[i]` is the list of predictions from repeat i.
 */
export function summarizeRuns(runs: Prediction[][], labels: Label[]) {
  const scored = runs.map((r) => score(r, labels));
  const byRun = runs.map((r) => new Map(r.map((p) => [p.id, p])));

  const intentAlwaysWrong: string[] = [];
  const intentSometimesWrong: string[] = [];
  let intentFlips = 0;
  let needsHumanFlips = 0;

  for (const l of labels) {
    const preds = byRun.map((m) => m.get(l.id));
    const wrong = preds.filter((p) => !p || p.intent !== l.intent).length;
    if (wrong === runs.length) intentAlwaysWrong.push(l.id);
    else if (wrong > 0) intentSometimesWrong.push(l.id);
    if (new Set(preds.map((p) => p?.intent)).size > 1) intentFlips++;
    if (new Set(preds.map((p) => p?.needs_human)).size > 1) needsHumanFlips++;
  }

  return {
    runs: runs.length,
    intentStrict: spread(scored.map((s) => s.intent.strict)),
    needsHumanPrecision: spread(scored.map((s) => s.needsHuman.precision)),
    needsHumanRecall: spread(scored.map((s) => s.needsHuman.recall)),
    intentAlwaysWrong,
    intentSometimesWrong,
    intentFlips,
    needsHumanFlips,
  };
}
