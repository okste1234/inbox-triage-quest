// Day 3: push hostile and awkward messages through the FULL pipeline (classify + draft + guardrails).
//   npm run eval:adv -- [--prompt classify.v3] [--out evals/results/day3_adversarial.json] [--messages file] [--labels file]
// A message passes only if it is escalated when it should be, injections are flagged, and no draft
// contains text from its `forbidden` list. Failures are listed, not hidden.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { makeLlmCall, requestStats, resolveModel, resolveProvider } from "../src/llm.js";
import { triageMessages } from "../src/pipeline.js";
import { AdversarialLabelSchema, MessageSchema } from "../src/schema.js";
import { scoreAdversarial } from "./adversarial_score.js";
import { withProgress } from "./progress.js";
import { runHealth } from "./score.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const promptName = arg("prompt", "classify.v3");
  const out = arg("out", "evals/results/day3_adversarial.json");
  const messages = z.array(MessageSchema).parse(JSON.parse(readFileSync(arg("messages", "data/adversarial.json"), "utf8")));
  const labels = z.array(AdversarialLabelSchema).parse(JSON.parse(readFileSync(arg("labels", "data/adversarial_labels.json"), "utf8")));

  const t0 = performance.now();
  const { items, usage } = await triageMessages(messages, {
    llm: withProgress(makeLlmCall()),
    classifySystem: readFileSync(`prompts/${promptName}.md`, "utf8"),
    draftSystem: readFileSync("prompts/draft.v1.md", "utf8"),
    concurrency: 1,
  });
  const wallMs = performance.now() - t0;

  const errored = items.filter((i) => i.classification.error || i.draft_error);
  const health = runHealth(messages.length, errored.length);
  if (!health.valid) {
    console.error(`INVALID RUN: ${errored.length}/${messages.length} calls failed. Nothing written.`);
    console.error(errored[0]?.classification.error ?? errored[0]?.draft_error);
    process.exit(1);
  }

  const result = scoreAdversarial(items, labels);
  const report = {
    prompt: promptName,
    provider: resolveProvider(),
    model: resolveModel(),
    ran_at: new Date().toISOString(),
    ...result,
    errors: errored.map((i) => ({ id: i.message.id, error: i.classification.error ?? i.draft_error })),
    usage,
    wall_ms: Math.round(wallMs),
    items: items.map((i) => ({
      id: i.message.id,
      intent: i.classification.intent,
      needs_human: i.classification.needs_human,
      injection_suspected: i.classification.injection_suspected,
      escalation_reasons: i.classification.escalation_reasons,
      draft: i.draft,
      draft_blocked: i.draft_blocked,
    })),
  };
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

  console.log(`\nAdversarial: ${result.passed}/${result.total} passed  (${promptName}, ${report.model})`);
  for (const [cat, b] of Object.entries(result.byCategory)) console.log(`  ${cat.padEnd(15)} ${b.passed}/${b.n}`);
  console.log(`Failures: ${result.failures.map((f) => `${f.id}:${f.kind}`).join(", ") || "none"}`);
  console.log(`Errors ${errored.length}  tokens in/out ${usage.inputTokens}/${usage.outputTokens}  wall ${Math.round(wallMs / 1000)}s\nHTTP requests sent: ${requestStats.requests}\nWrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
