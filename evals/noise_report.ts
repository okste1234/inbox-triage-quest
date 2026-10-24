// Reads the repeat runs written by run_evals and prints the spread.
//   npm run eval:noise -- evals/results/noise_run1.json evals/results/noise_run2.json evals/results/noise_run3.json
import { readFileSync } from "node:fs";
import { z } from "zod";
import { LabelSchema } from "../src/schema.js";
import { summarizeRuns } from "./noise_score.js";

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error("Give at least two result files from `npm run eval`.");
  process.exit(1);
}
const labels = z.array(LabelSchema).parse(JSON.parse(readFileSync("data/labels.json", "utf8")));
const runs = files.map((f) => JSON.parse(readFileSync(f, "utf8")).predictions);
const s = summarizeRuns(runs, labels);

const pct = (x: number | null) => (x === null || Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(1)}%`);
const line = (name: string, sp: ReturnType<typeof summarizeRuns>["intentStrict"]) =>
  console.log(`${name.padEnd(22)} runs: ${sp.values.map(pct).join(", ").padEnd(28)} min ${pct(sp.min)}  max ${pct(sp.max)}  range ${pct(sp.range)}`);

console.log(`\n${s.runs} repeats of the same prompt on ${labels.length} messages`);
line("intent (strict)", s.intentStrict);
line("needs_human precision", s.needsHumanPrecision);
line("needs_human recall", s.needsHumanRecall);
console.log(`messages whose intent changed between runs:       ${s.intentFlips}`);
console.log(`messages whose needs_human changed between runs:  ${s.needsHumanFlips}`);
console.log(`wrong on intent in every run (systematic):        ${s.intentAlwaysWrong.join(", ") || "none"}`);
console.log(`wrong on intent in some runs only (noise):        ${s.intentSometimesWrong.join(", ") || "none"}`);
