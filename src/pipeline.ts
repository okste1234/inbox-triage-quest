import { classifyMessage } from "./classify.js";
import { draftReply } from "./draft.js";
import { redactSensitive } from "./sensitive.js";
import type { DraftFlag } from "./guardrails.js";
import type { LlmCall, Usage } from "./llm-types.js";
import type { Classification, Message } from "./schema.js";

export interface TriageItem {
  /** The sender's email address is deliberately not carried through. */
  message: Pick<Message, "id" | "from_name" | "subject" | "body">;
  classification: Classification;
  draft: string | null;
  draft_flags: DraftFlag[];
  draft_blocked: boolean;
  draft_error?: string;
}

export interface TriageDeps {
  llm: LlmCall;
  classifySystem: string;
  draftSystem: string;
  concurrency?: number;
}

/** Classify then draft each message. Output order matches input order. Nothing is ever sent. */
export async function triageMessages(
  messages: Message[],
  { llm, classifySystem, draftSystem, concurrency = 4 }: TriageDeps,
): Promise<{ items: TriageItem[]; usage: Usage }> {
  const items: TriageItem[] = new Array(messages.length);
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let next = 0;

  async function worker(): Promise<void> {
    while (next < messages.length) {
      const i = next++;
      const msg = messages[i];
      const c = await classifyMessage(msg, llm, classifySystem);
      const d = await draftReply(msg, c.result, llm, draftSystem);

      const classification = { ...c.result };
      if (d.blocked) {
        classification.needs_human = true;
        classification.escalation_reasons = [...classification.escalation_reasons, "draft_blocked"];
      } else if (!classification.needs_human && d.draft === null) {
        // Invariant: every message ends with either a draft or a person. Nothing is dropped silently.
        classification.needs_human = true;
        classification.escalation_reasons = [...classification.escalation_reasons, "no_draft"];
      }
      usage.inputTokens += c.usage.inputTokens + d.usage.inputTokens;
      usage.outputTokens += c.usage.outputTokens + d.usage.outputTokens;
      items[i] = {
        message: { id: msg.id, from_name: msg.from_name, subject: redactSensitive(msg.subject), body: redactSensitive(msg.body) },
        classification,
        draft: d.draft,
        draft_flags: d.flags,
        draft_blocked: d.blocked,
        ...(d.error ? { draft_error: d.error } : {}),
      };
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { items, usage };
}
