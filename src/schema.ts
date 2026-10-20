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
