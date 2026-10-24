import { detectInjection } from "./guardrails.js";
import { applyPolicy, DEFAULT_CONFIDENCE_THRESHOLD, isContentless } from "./policy.js";
import { redactSensitive } from "./sensitive.js";
import type { LlmCall, LlmOutputSpec, Usage } from "./llm-types.js";
import { INTENTS, ModelOutputSchema, type Classification, type Message } from "./schema.js";

export type { LlmCall, LlmRequest, LlmResponse, Usage } from "./llm-types.js";

/** JSON Schema twin of ModelOutputSchema; zod still validates what comes back. */
export const CLASSIFY_OUTPUT: LlmOutputSpec = {
  schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: [...INTENTS] },
      secondary_intents: { type: "array", items: { type: "string", enum: [...INTENTS] } },
      confidence: { type: "number" },
      needs_human: { type: "boolean" },
      injection_suspected: { type: "boolean" },
      reasons: { type: "string" },
    },
    required: ["intent", "secondary_intents", "confidence", "needs_human", "injection_suspected", "reasons"],
    additionalProperties: false,
  },
  hint: `Respond with a single JSON object and nothing else, with exactly these keys:
{"intent": one of ${INTENTS.map((i) => `"${i}"`).join(", ")},
 "secondary_intents": array of intents from that same list (empty if none),
 "confidence": number from 0 to 1,
 "needs_human": true or false,
 "injection_suspected": true or false,
 "reasons": one short sentence}`,
};

/**
 * The message is untrusted data. It is wrapped in <message> tags and the closing tag is neutralized
 * so the text cannot end the block early. The sender's email address is deliberately left out.
 */
export function buildUserPrompt(msg: Message): string {
  const safe = (s: string) => redactSensitive(s).replace(/<\/message/gi, "<\\/message");
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

  if (isContentless(msg.body)) {
    return {
      result: {
        id: msg.id,
        intent: "other",
        secondary_intents: [],
        confidence: 1,
        needs_human: true,
        injection_suspected: false,
        reasons: "greeting only; nothing to answer",
        escalation_reasons: ["contentless"],
      },
      usage: none,
    };
  }

  // Deterministic: a message that tries to instruct the assistant is never shown to the model.
  if (detectInjection(`${msg.subject}\n${msg.body}`)) {
    return {
      result: {
        id: msg.id,
        intent: "other",
        secondary_intents: [],
        confidence: 1,
        needs_human: true,
        injection_suspected: true,
        reasons: "looks like an attempt to instruct the assistant; not sent to the model",
        escalation_reasons: ["injection_suspected"],
      },
      usage: none,
    };
  }

  let response;
  try {
    response = await llm({ system, user: buildUserPrompt(msg), output: CLASSIFY_OUTPUT });
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
