// Scores the DRAFT stage on its own, with intents taken from the labels so classifier mistakes do not mix in.
//   npm run eval:drafts -- [--prompt draft.v2] [--out evals/results/drafts_v2.json]
// Measures guardrail flag rates (claims of actions, dates, money, length), not whether a reply is "nice".
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { draftReply } from "../src/draft.js";
import { makeLlmCall, requestStats, resolveModel } from "../src/llm.js";
import { LabelSchema, MessageSchema, type Classification } from "../src/schema.js";
import { summarizeDrafts } from "./draft_score.js";
import { withProgress } from "./progress.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const prompt = arg("prompt", "draft.v1");
  const out = arg("out", `evals/results/drafts_${prompt}.json`);
  const system = readFileSync(`prompts/${prompt}.md`, "utf8");
  const messages = new Map(z.array(MessageSchema).parse(JSON.parse(readFileSync("data/sample_messages.json", "utf8"))).map((m) => [m.id, m]));
  const labels = z.array(LabelSchema).parse(JSON.parse(readFileSync("data/labels.json", "utf8"))).filter((l) => !l.needs_human);
  const llm = withProgress(makeLlmCall());

  const rows = [];
  for (const l of labels) {
    const msg = messages.get(l.id)!;
    const cls: Classification = { id: l.id, intent: l.intent, secondary_intents: [], confidence: 1, needs_human: false, injection_suspected: false, reasons: "", escalation_reasons: [] };
    const r = await draftReply(msg, cls, llm, system);
    rows.push({ id: l.id, ...r });
  }
  const summary = summarizeDrafts(rows);
  if (summary.errors / Math.max(1, summary.n) > 0.2) {
    console.error(`INVALID RUN: ${summary.errors}/${summary.n} draft calls failed. Nothing written.`);
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify({ prompt, model: resolveModel(), ran_at: new Date().toISOString(), summary, rows }, null, 2) + "\n");

  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  console.log(`\n${prompt} on ${resolveModel()}: ${summary.n} messages that should get a draft`);
  console.log(`drafted ${summary.drafted}, empty ${summary.empty}, blocked ${summary.blocked}, errors ${summary.errors}; avg ${summary.avgWords.toFixed(0)} words, max ${summary.maxWords}`);
  console.log(`flags: ${Object.entries(summary.flagCounts).map(([k, v]) => `${k} ${v} (${pct(summary.flagRates[k])})`).join(", ") || "none"}`);
  console.log(`HTTP requests sent: ${requestStats.requests}\nWrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
