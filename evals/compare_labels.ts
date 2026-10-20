// After you've labeled: how often did you disagree with the AI's own idea of each message's intent?
// Disagreements are log material: they show where the taxonomy or the AI-generated data is fuzzy.
import { readFileSync } from "node:fs";
import { LabelSchema, MessageSchema } from "../src/schema.js";
import { z } from "zod";

const messages = z.array(MessageSchema).parse(JSON.parse(readFileSync("data/sample_messages.json", "utf8")));
const labels = z.array(LabelSchema).parse(JSON.parse(readFileSync("data/labels.json", "utf8")));
const guess = JSON.parse(readFileSync("data/.ai_guess_labels.json", "utf8")) as Record<string, { intent: string }>;

const byId = new Map(messages.map((m) => [m.id, m]));
const diffs = labels.filter((l) => guess[l.id]?.intent !== l.intent);

console.log(`Labeled ${labels.length}/${messages.length}. You disagreed with the AI on ${diffs.length}.\n`);
for (const l of diffs) {
  console.log(`${l.id}  you=${l.intent}  ai=${guess[l.id]?.intent}\n  "${byId.get(l.id)?.body}"\n`);
}
