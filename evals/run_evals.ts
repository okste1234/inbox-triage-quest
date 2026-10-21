// Runs the classifier over data/sample_messages.json and scores it against data/labels.json.
//   npm run eval -- [--prompt classify.v1] [--out evals/results/day2_baseline.json] [--concurrency 5]
// Uses a live model (Anthropic API, or any OpenAI-compatible endpoint such as local Ollama; see .env.example). Cost and latency are measured, not estimated.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { classifyMessage, type Usage } from "../src/classify.js";
import { makeLlmCall, resolveModel, resolveProvider } from "../src/llm.js";
import { LabelSchema, MessageSchema, type Classification } from "../src/schema.js";
import { score } from "./score.js";

// $ per million tokens (input, output). Update when the model changes.
const PRICES: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20] };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const percentile = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

async function main(): Promise<void> {
  if (resolveProvider() === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add a key, or set PROVIDER=openai-compatible (see README).");
    process.exit(1);
  }
  const prompt = arg("prompt", "classify.v1");
  const out = arg("out", "evals/results/day2_baseline.json");
  const concurrency = Number(arg("concurrency", "5"));
  const model = resolveModel();

  const system = readFileSync(`prompts/${prompt}.md`, "utf8");
  const messages = z.array(MessageSchema).parse(JSON.parse(readFileSync("data/sample_messages.json", "utf8")));
  const labels = z.array(LabelSchema).parse(JSON.parse(readFileSync("data/labels.json", "utf8")));
  const llm = makeLlmCall();

  const results: Classification[] = new Array(messages.length);
  const latencies: number[] = new Array(messages.length);
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let next = 0;

  async function worker(): Promise<void> {
    while (next < messages.length) {
      const i = next++;
      const t0 = performance.now();
      const r = await classifyMessage(messages[i], llm, system);
      latencies[i] = performance.now() - t0;
      results[i] = r.result;
      usage.inputTokens += r.usage.inputTokens;
      usage.outputTokens += r.usage.outputTokens;
    }
  }
  const wallStart = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wallMs = performance.now() - wallStart;

  const scored = score(results, labels);
  const price = PRICES[model];
  const costUsd = price ? (usage.inputTokens * price[0] + usage.outputTokens * price[1]) / 1e6 : null;
  const errors = results.filter((r) => r.error).map((r) => ({ id: r.id, error: r.error }));

  const report = {
    prompt,
    provider: resolveProvider(),
    model,
    ran_at: new Date().toISOString(),
    n: messages.length,
    ...scored,
    errors,
    usage,
    cost_usd: costUsd,
    latency_ms: { p50: Math.round(percentile(latencies, 0.5)), p95: Math.round(percentile(latencies, 0.95)), wall: Math.round(wallMs) },
    predictions: results.map((r) => ({
      id: r.id,
      intent: r.intent,
      secondary_intents: r.secondary_intents,
      confidence: r.confidence,
      needs_human: r.needs_human,
      escalation_reasons: r.escalation_reasons,
      injection_suspected: r.injection_suspected,
    })),
  };
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

  const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
  console.log(`\n${prompt} on ${model}  (${messages.length} messages)`);
  console.log(`Intent accuracy  strict ${pct(scored.intent.strict)}  lenient ${pct(scored.intent.lenient)}  (${scored.intent.correct}/${scored.intent.total})`);
  for (const [k, v] of Object.entries(scored.byProvenance)) console.log(`  labels ${k}: ${pct(v.strict)} of ${v.n}`);
  console.log(`needs_human      precision ${pct(scored.needsHuman.precision)}  recall ${pct(scored.needsHuman.recall)}  (tp ${scored.needsHuman.tp} fp ${scored.needsHuman.fp} fn ${scored.needsHuman.fn} tn ${scored.needsHuman.tn})`);
  console.log(`Errors ${errors.length}  Tokens in/out ${usage.inputTokens}/${usage.outputTokens}  Cost ${costUsd === null ? "n/a" : "$" + costUsd.toFixed(4)}  p50 ${report.latency_ms.p50}ms p95 ${report.latency_ms.p95}ms`);
  console.log(`Intent misses: ${scored.misses.map((m) => `${m.id}(${m.expected}->${m.got})`).join(", ") || "none"}`);
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
