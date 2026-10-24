import { z } from "zod";

export const INTENTS = [
  "status_check",
  "scheduling",
  "reschedule_or_withdraw",
  "compensation_question",
  "application_problem",
  "complaint",
  "other",
] as const;

export const IntentSchema = z.enum(INTENTS);
export type Intent = z.infer<typeof IntentSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  from_name: z.string(),
  from_email: z.string(),
  subject: z.string(),
  body: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

/** Hand-labeled ground truth for one message. */
export const LabelSchema = z.object({
  id: z.string(),
  intent: IntentSchema,
  /** Other intents present in the message, if it has more than one. */
  secondary_intents: z.array(IntentSchema).default([]),
  /** Should a human look at this before any draft is trusted? */
  needs_human: z.boolean().default(false),
  /** What a good reply would say. Optional; blank means "not written yet". */
  ideal_reply: z.string().default(""),
  notes: z.string().default(""),
  /**
   * Provenance. "human" = decided without AI input, "human_ai_assisted" = I made the call with AI help,
   * "ai" = AI label I did not review. Weaker provenance means weaker ground truth; keep it visible.
   */
  labeled_by: z.enum(["human", "human_ai_assisted", "ai"]).default("human"),
});
export type Label = z.infer<typeof LabelSchema>;

/** What the model must return for one message (validated after parsing). */
export const ModelOutputSchema = z.object({
  intent: IntentSchema,
  secondary_intents: z.array(IntentSchema).default([]),
  confidence: z.number().min(0).max(1),
  needs_human: z.boolean(),
  injection_suspected: z.boolean(),
  reasons: z.string(),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export type EscalationReason =
  | "complaint"
  | "multi_intent"
  | "injection_suspected"
  | "low_confidence"
  | "blank"
  | "contentless"
  | "time_critical"
  | "model_judgment"
  | "draft_blocked"
  | "error";

/** Final per-message result after code-enforced policy is applied. */
export interface Classification extends ModelOutput {
  id: string;
  /** Why needs_human is true. Empty when it is false. */
  escalation_reasons: EscalationReason[];
  /** Set when the model call or its output failed; the result is then a safe fallback. */
  error?: string;
}

export const ADVERSARIAL_CATEGORIES = ["injection", "multi_intent", "non_english", "noise", "pii_abuse", "benign_control"] as const;

/** What a safe system must do with one adversarial message. */
export const AdversarialLabelSchema = z.object({
  id: z.string(),
  category: z.enum(ADVERSARIAL_CATEGORIES),
  needs_human: z.boolean(),
  /** Set when the message contains an attempt to instruct the assistant. */
  injection: z.boolean().default(false),
  /** Primary intent, when the message has one worth checking. */
  intent: IntentSchema.optional(),
  /** Text that must never appear in a draft (promises, amounts, leaked data). Case-insensitive. */
  forbidden: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type AdversarialLabel = z.infer<typeof AdversarialLabelSchema>;
