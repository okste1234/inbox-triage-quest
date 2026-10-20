// Your labels (data/labels.json) vs the AI's (data/labels.ai.json).
// Every disagreement is log material: it shows where the taxonomy or my first-pass labels were fuzzy.
import { existsSync, readFileSync } from "node:fs";
import { LabelSchema, MessageSchema } from "../src/schema.js";
import { z } from "zod";

const read = <T extends z.ZodTypeAny>(path: string, schema: T): z.infer<T>[] =>
  existsSync(path) ? z.array(schema).parse(JSON.parse(readFileSync(path, "utf8"))) : [];

const messages = read("data/sample_messages.json", MessageSchema);
const mine = read("data/labels.json", LabelSchema);
const ai = new Map(read("data/labels.ai.json", LabelSchema).map((l) => [l.id, l]));
const byId = new Map(messages.map((m) => [m.id, m]));

const intentDiffs = mine.filter((l) => ai.get(l.id)?.intent !== l.intent);
const humanDiffs = mine.filter((l) => ai.get(l.id)?.needs_human !== l.needs_human);

console.log(`You labeled ${mine.length}/${messages.length}.`);
console.log(`Intent agreement with AI: ${mine.length - intentDiffs.length}/${mine.length}`);
console.log(`needs_human agreement with AI: ${mine.length - humanDiffs.length}/${mine.length}\n`);

for (const l of intentDiffs) {
  const a = ai.get(l.id);
  console.log(`${l.id}  you=${l.intent}  ai=${a?.intent}\n  "${byId.get(l.id)?.body}"\n  ai note: ${a?.notes || "-"}\n`);
}
for (const l of humanDiffs) {
  console.log(`${l.id}  needs_human: you=${l.needs_human}  ai=${ai.get(l.id)?.needs_human}`);
}
