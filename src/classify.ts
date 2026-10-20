import { applyPolicy, DEFAULT_CONFIDENCE_THRESHOLD } from "./policy.js";
import { ModelOutputSchema, type Classification, type Message } from "./schema.js";

export interface LlmRequest {
  system: string;
  user: string;
}

export interface LlmResponse {
  text: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/** The only thing classify needs from an LLM. Tests pass a fake; src/llm.ts passes the real one. */
export type LlmCall = (req: LlmRequest) => Promise<LlmResponse>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * The message is untrusted data. It is wrapped in <message> tags and the closing tag is neutralized
 * so the text cannot end the block early. The sender's email address is deliberately left out.
 */
export function buildUserPrompt(msg: Message): string {
  const safe = (s: string) => s.replace(/<\/message/gi, "<\\/message");
  return `<message>\nSubject: ${safe(msg.subject)}\n\n${safe(msg.body)}\n</message>`;
}

function fallback(msg: Message, error: string): Classification {
  return {
    id: msg.id,
    intent: "other",
    secondary_intents: [],
    confidence: 0,
    needs_human: true,
    injection_suspected: false,
    reasons: "classification failed; needs a person",
    escalation_reasons: ["error"],
    error,
  };
}

/** Never throws: any failure becomes a needs_human result with `error` set. */
export async function classifyMessage(
  msg: Message,
  llm: LlmCall,
  system: string,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): Promise<{ result: Classification; usage: Usage }> {
  const none: Usage = { inputTokens: 0, outputTokens: 0 };

  if (msg.body.trim() === "") {
    return {
      result: {
        id: msg.id,
        intent: "other",
        secondary_intents: [],
        confidence: 1,
        needs_human: true,
        injection_suspected: false,
        reasons: "blank message",
        escalation_reasons: ["blank"],
      },
      usage: none,
    };
  }

  let response;
  try {
    response = await llm({ system, user: buildUserPrompt(msg) });
  } catch (err) {
    return { result: fallback(msg, `api error: ${err instanceof Error ? err.message : String(err)}`), usage: none };
  }
  const usage = { inputTokens: response.inputTokens, outputTokens: response.outputTokens };

  if (response.stopReason === "refusal") return { result: fallback(msg, "model refusal"), usage };
  if (response.stopReason === "max_tokens") return { result: fallback(msg, "output cut off (max_tokens)"), usage };

  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch {
    return { result: fallback(msg, "output was not valid JSON"), usage };
  }
  const parsed = ModelOutputSchema.safeParse(json);
  if (!parsed.success) {
    return { result: fallback(msg, `schema validation failed: ${parsed.error.issues[0]?.message ?? "unknown"}`), usage };
  }

  const policy = applyPolicy(parsed.data, msg.body, threshold);
  return { result: { id: msg.id, ...parsed.data, ...policy }, usage };
}
