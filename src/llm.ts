import Anthropic from "@anthropic-ai/sdk";
import { INTENTS } from "./schema.js";
import type { LlmCall } from "./classify.js";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** JSON Schema twin of ModelOutputSchema; zod still validates what comes back. */
const OUTPUT_JSON_SCHEMA = {
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
} as const;

export function makeAnthropicCall(model: string = process.env.MODEL || DEFAULT_MODEL): LlmCall {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  return async ({ system, user }) => {
    const response = await client.messages.create({
      model,
      // Thinking tokens count toward max_tokens, so leave room even at low effort.
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_JSON_SCHEMA } },
    });
    const text = response.content.find((b) => b.type === "text");
    return {
      text: text && text.type === "text" ? text.text : "",
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  };
}
