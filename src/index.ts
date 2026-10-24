// Starts the web demo: a review queue over HTTP. Nothing is ever sent anywhere.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeLlmCall, resolveModel, resolveProvider } from "./llm.js";
import { createApp } from "./server.js";

const port = Number(process.env.PORT || 3000);
const classifyVersion = process.env.CLASSIFY_PROMPT || "classify.v3";
const classifySystem = readFileSync(new URL(`../prompts/${classifyVersion}.md`, import.meta.url), "utf8");
const draftVersion = process.env.DRAFT_PROMPT || "draft.v2";
const draftSystem = readFileSync(new URL(`../prompts/${draftVersion}.md`, import.meta.url), "utf8");

createApp({
  llm: makeLlmCall(),
  classifySystem,
  draftSystem,
  maxMessagesPerHour: Number(process.env.MAX_MESSAGES_PER_HOUR || 60),
  maxMessagesPerDay: Number(process.env.MAX_MESSAGES_PER_DAY || 150),
  requestDeadlineMs: Number(process.env.REQUEST_DEADLINE_MS || 60000),
}).listen(port, () => {
  console.log(`Inbox triage on http://localhost:${port}  (${resolveProvider()}, ${resolveModel()}, ${classifyVersion}, ${draftVersion})`);
});
