import type { EscalationReason, ModelOutput } from "./schema.js";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Rules from directive.md "needs_human policy" that code enforces regardless of what the model says.
 * Judgment-based rules (offer negotiation, time-critical, contentless) arrive via `output.needs_human`.
 */
export function applyPolicy(
  output: ModelOutput,
  body: string,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): { needs_human: boolean; escalation_reasons: EscalationReason[] } {
  const reasons: EscalationReason[] = [];
  const intents = [output.intent, ...output.secondary_intents];

  if (intents.includes("complaint")) reasons.push("complaint");
  if (output.secondary_intents.length > 0) reasons.push("multi_intent");
  if (output.injection_suspected) reasons.push("injection_suspected");
  if (output.confidence < threshold) reasons.push("low_confidence");
  if (body.trim() === "") reasons.push("blank");
  if (output.needs_human) reasons.push("model_judgment");

  return { needs_human: reasons.length > 0, escalation_reasons: reasons };
}
