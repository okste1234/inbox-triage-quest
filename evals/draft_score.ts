import type { DraftResult } from "../src/draft.js";

/** Aggregates a batch of draft results into counts and rates. Pure, so it is unit-tested. */
export function summarizeDrafts(results: Pick<DraftResult, "draft" | "flags" | "blocked" | "error">[]) {
  const drafted = results.filter((r) => r.draft !== null);
  const flagCounts: Record<string, number> = {};
  for (const r of drafted) for (const f of r.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  const flagRates = Object.fromEntries(Object.entries(flagCounts).map(([k, v]) => [k, v / drafted.length]));
  const words = drafted.map((r) => (r.draft as string).trim().split(/\s+/).filter(Boolean).length);
  return {
    n: results.length,
    drafted: drafted.length,
    empty: results.filter((r) => r.draft === null && !r.blocked && !r.error).length,
    blocked: results.filter((r) => r.blocked).length,
    errors: results.filter((r) => r.error).length,
    flagCounts,
    flagRates,
    avgWords: words.length === 0 ? 0 : words.reduce((a, b) => a + b, 0) / words.length,
    maxWords: words.length === 0 ? 0 : Math.max(...words),
  };
}
