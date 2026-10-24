import { findSensitive } from "./sensitive.js";
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
  if (isTimeCritical(body)) reasons.push("time_critical");
  if (findSensitive(body).length > 0) reasons.push("sensitive_data");
  if (output.needs_human) reasons.push("model_judgment");

  return { needs_human: reasons.length > 0, escalation_reasons: reasons };
}

const GREETING_WORDS = new Set(["hi", "hello", "hey", "hiya", "good", "morning", "afternoon", "evening", "there", "greetings", "dear", "sir", "madam", "team", "all", "everyone"]);

/** True for a message that is only a greeting: there is nothing to answer, so a person decides what to do. */
export function isContentless(body: string): boolean {
  const words = body.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 && words.every((w) => GREETING_WORDS.has(w));
}

const URGENT =
  /\b(running (?:\w+ )*late|(?:am|i'm|be|will be) late|late (?:for|to)|asap|as soon as (?:you can|possible)|right now|this (?:morning|afternoon|evening)|tonight|today|in \d+ (?:min|minutes|mins|hours?)|cancel(?:l)?ed)\b/i;

/**
 * Words that mean a person has to act within hours (directive.md rule 4). The model misses these when
 * they are phrased in a way it was not tuned on, and a false alarm only costs a reviewer a glance.
 */
export function isTimeCritical(body: string): boolean {
  return URGENT.test(body);
}
