// Human labeling CLI. Resumable: re-run to continue where you stopped.
//   npm run label            label unlabeled messages
//   npm run label -- --redo  walk every message again (existing answers shown as defaults)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { INTENTS, LabelSchema, MessageSchema, type Intent, type Label } from "../src/schema.js";
import { z } from "zod";

const MESSAGES = "data/sample_messages.json";
const LABELS = "data/labels.json";

const messages = z.array(MessageSchema).parse(JSON.parse(readFileSync(MESSAGES, "utf8")));
const labels = new Map<string, Label>(
  existsSync(LABELS)
    ? z.array(LabelSchema).parse(JSON.parse(readFileSync(LABELS, "utf8"))).map((l) => [l.id, l])
    : [],
);
const redo = process.argv.includes("--redo");

function save(): void {
  const ordered = messages.flatMap((m) => (labels.has(m.id) ? [labels.get(m.id)!] : []));
  writeFileSync(LABELS, JSON.stringify(ordered, null, 2) + "\n");
}

function menu(): string {
  return INTENTS.map((name, i) => `  ${i + 1}) ${name}`).join("\n");
}

function parseIntents(input: string): Intent[] | null {
  const picks = input.split(/[,\s]+/).filter(Boolean).map(Number);
  if (picks.some((n) => !Number.isInteger(n) || n < 1 || n > INTENTS.length)) return null;
  return picks.map((n) => INTENTS[n - 1]);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const todo = messages.filter((m) => redo || !labels.has(m.id));
console.log(`\n${labels.size}/${messages.length} labeled. ${todo.length} to go. Type q at the first prompt to quit (progress is saved).\n`);

for (const [n, m] of todo.entries()) {
  const prev = labels.get(m.id);
  console.log("=".repeat(70));
  console.log(`[${n + 1}/${todo.length}] ${m.id}  From: ${m.from_name}\nSubject: ${m.subject}\n\n${m.body}\n`);
  console.log(menu());

  let intent: Intent | undefined;
  while (!intent) {
    const hint = prev ? ` [${INTENTS.indexOf(prev.intent) + 1}]` : "";
    const a = (await rl.question(`Main intent (1-${INTENTS.length}, q=quit)${hint}: `)).trim();
    if (a === "q") {
      save();
      rl.close();
      console.log(`\nSaved ${labels.size}/${messages.length}. Re-run to continue.`);
      process.exit(0);
    }
    if (a === "" && prev) intent = prev.intent;
    else intent = parseIntents(a)?.[0];
  }

  let secondary: Intent[] = [];
  for (;;) {
    const a = (await rl.question("Other intents also present? (e.g. 2,5 or Enter for none): ")).trim();
    if (a === "") break;
    const parsed = parseIntents(a);
    if (parsed) {
      secondary = parsed.filter((i) => i !== intent);
      break;
    }
  }

  const needsAnswer = (await rl.question("Needs a human regardless of confidence? (y/N): ")).trim().toLowerCase();
  const ideal = (await rl.question("Ideal reply, one line (Enter to skip for now): ")).trim();
  const notes = (await rl.question("Notes (Enter to skip): ")).trim();

  labels.set(
    m.id,
    LabelSchema.parse({
      id: m.id,
      intent,
      secondary_intents: secondary,
      needs_human: needsAnswer === "y",
      ideal_reply: ideal || prev?.ideal_reply || "",
      notes: notes || prev?.notes || "",
    }),
  );
  save();
}

rl.close();
console.log(`\nDone. ${labels.size}/${messages.length} labeled -> ${LABELS}`);
