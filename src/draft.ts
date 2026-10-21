import { z } from "zod";
import { buildUserPrompt } from "./classify.js";
import { checkDraft, type DraftFlag } from "./guardrails.js";
import type { LlmCall, LlmOutputSpec, Usage } from "./llm-types.js";
import type { Classification, Message } from "./schema.js";

export const DRAFT_OUTPUT: LlmOutputSpec = {
  schema: {
    type: "object",
    properties: { draft: { type: "string" } },
    required: ["draft"],
    additionalProperties: false,
  },
  hint: 'Respond with a single JSON object and nothing else: {"draft": "<the reply text, or an empty string if no reply is needed>"}',
};

const DraftOutputSchema = z.object({ draft: z.string() });

export interface DraftResult {
  draft: string | null;
  flags: DraftFlag[];
  /** True when a hard guardrail removed the draft. */
  blocked: boolean;
  error?: string;
  usage: Usage;
}

const none: Usage = { inputTokens: 0, outputTokens: 0 };

/** Never throws. Messages that need a human, or failed classification, get no draft and no model call. */
export async function draftReply(msg: Message, cls: Classification, llm: LlmCall, system: string): Promise<DraftResult> {
  const empty = { draft: null, flags: [] as DraftFlag[], blocked: false, usage: none };
  if (cls.needs_human || cls.error) return empty;

  let response;
  try {
    response = await llm({
      system,
      user: `Intent: ${cls.intent}\n\n${buildUserPrompt(msg)}`,
      output: DRAFT_OUTPUT,
    });
  } catch (err) {
    return { ...empty, error: `api error: ${err instanceof Error ? err.message : String(err)}` };
  }
  const usage = { inputTokens: response.inputTokens, outputTokens: response.outputTokens };
  if (response.stopReason === "refusal") return { ...empty, usage, error: "model refusal" };
  if (response.stopReason === "max_tokens") return { ...empty, usage, error: "output cut off (max_tokens)" };

  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch {
    return { ...empty, usage, error: "output was not valid JSON" };
  }
  const parsed = DraftOutputSchema.safeParse(json);
  if (!parsed.success) return { ...empty, usage, error: "schema validation failed" };

  const text = parsed.data.draft.trim();
  if (text === "") return { ...empty, usage };

  const { flags, blocked } = checkDraft(text);
  return { draft: blocked ? null : text, flags, blocked, usage };
}
