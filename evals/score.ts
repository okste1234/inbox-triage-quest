import type { Intent, Label } from "../src/schema.js";

export interface Prediction {
  id: string;
  intent: Intent;
  needs_human: boolean;
}

type Provenance = Label["labeled_by"];

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

/** Pure scoring: no I/O, so it is unit-tested. Labels with no prediction count as wrong. */
export function score(preds: Prediction[], labels: Label[]) {
  const byId = new Map(preds.map((p) => [p.id, p]));

  let strict = 0;
  let lenient = 0;
  const misses: { id: string; expected: Intent; got: Intent }[] = [];
  const missing: string[] = [];
  const needsHumanMisses: { id: string; expected: boolean; got: boolean }[] = [];
  const prov = new Map<Provenance, { n: number; ok: number }>();
  let tp = 0, fp = 0, fn = 0, tn = 0;

  for (const l of labels) {
    const p = byId.get(l.id);
    const bucket = prov.get(l.labeled_by) ?? { n: 0, ok: 0 };
    bucket.n++;
    prov.set(l.labeled_by, bucket);

    if (!p) {
      missing.push(l.id);
      continue;
    }
    if (p.intent === l.intent) {
      strict++;
      bucket.ok++;
    } else {
      misses.push({ id: l.id, expected: l.intent, got: p.intent });
    }
    if (p.intent === l.intent || l.secondary_intents.includes(p.intent)) lenient++;

    if (l.needs_human && p.needs_human) tp++;
    else if (!l.needs_human && p.needs_human) fp++;
    else if (l.needs_human && !p.needs_human) fn++;
    else tn++;
    if (l.needs_human !== p.needs_human) needsHumanMisses.push({ id: l.id, expected: l.needs_human, got: p.needs_human });
  }

  const total = labels.length;
  const byProvenance = Object.fromEntries(
    [...prov].map(([k, v]) => [k, { n: v.n, strict: v.n === 0 ? 0 : v.ok / v.n }]),
  ) as Record<string, { n: number; strict: number }>;

  return {
    intent: { correct: strict, total, strict: total === 0 ? 0 : strict / total, lenient: total === 0 ? 0 : lenient / total },
    byProvenance,
    needsHuman: { tp, fp, fn, tn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) },
    misses,
    missing,
    needsHumanMisses,
  };
}

export const MAX_ERROR_RATE = 0.2;

/** A run where many calls failed measures the fallback path, not the model, so its scores must not be reported. */
export function runHealth(n: number, errorCount: number): { valid: boolean; errorRate: number } {
  const errorRate = n === 0 ? 1 : errorCount / n;
  return { valid: n > 0 && errorRate <= MAX_ERROR_RATE, errorRate };
}
