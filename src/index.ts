// Starts the web demo: a review queue over HTTP. Nothing is ever sent anywhere.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeLlmCall, resolveModel, resolveProvider } from "./llm.js";
import { createApp } from "./server.js";

const port = Number(process.env.PORT || 3000);
const classifySystem = readFileSync(new URL("../prompts/classify.v1.md", import.meta.url), "utf8");
const draftSystem = readFileSync(new URL("../prompts/draft.v1.md", import.meta.url), "utf8");

createApp({
  llm: makeLlmCall(),
  classifySystem,
  draftSystem,
  maxMessagesPerHour: Number(process.env.MAX_MESSAGES_PER_HOUR || 60),
}).listen(port, () => {
  console.log(`Inbox triage on http://localhost:${port}  (${resolveProvider()}, ${resolveModel()})`);
});
