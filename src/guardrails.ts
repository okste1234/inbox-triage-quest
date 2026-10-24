export type DraftFlag = "too_long" | "money" | "hiring_promise" | "date_time" | "contact_details";

export const MAX_DRAFT_WORDS = 90;

const MONEY = /[$£€₦]\s?\d|\b\d[\d,.]*\s?(k|usd|ngn|naira|dollars?|pounds?|euros?)\b|\bsalary (of|is|will be)\b|\b\d+\s+thousand\b/i;
const HIRING_PROMISE =
  /\byou(?:'re| are) hired\b|\byou got the (?:job|role|position)\b|\bwe(?:'ll| will) (?:offer|hire)\b|\boffer you\b|\bguarantee\b|\byou(?:'ve| have) (?:been )?(?:selected|accepted)\b/i;
const DATE_TIME =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|tomorrow|tonight|next week)\b|\bmay \d|\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i;
const CONTACT = /\S+@\S+\.\S+|\+?\d[\d\s-]{8,}\d/;

/**
 * Deterministic checks on a drafted reply (directive.md: drafts must not commit to anything).
 * `money` and `hiring_promise` block the draft; the rest are shown to the reviewer as warnings.
 */
export function checkDraft(text: string): { flags: DraftFlag[]; blocked: boolean } {
  const flags: DraftFlag[] = [];
  if (text.trim().split(/\s+/).filter(Boolean).length > MAX_DRAFT_WORDS) flags.push("too_long");
  if (MONEY.test(text)) flags.push("money");
  if (HIRING_PROMISE.test(text)) flags.push("hiring_promise");
  if (DATE_TIME.test(text)) flags.push("date_time");
  if (CONTACT.test(text)) flags.push("contact_details");
  return { flags, blocked: flags.includes("money") || flags.includes("hiring_promise") };
}

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(instructions?|rules?|prompts?|guidelines?)\b/i,
  /\b(system|developer|hidden)\s+(prompt|message|instructions?)\b/i,
  /\byour (system )?(prompt|instructions)\b/i,
  /\byou are now\b|\b(admin|developer|god|jailbreak(?:ed)?)\s+mode\b/i,
  /\bnew instructions?\s*:/i,
  /\bpretend (?:that )?(?:you are|you're|to be)\b/i,
  /<\/?(?:message|system)\b/i,
  /"(?:needs_human|injection_suspected|escalation_reasons|secondary_intents|intent)"\s*:/i,
  /^\s*(?:system|assistant)\s*:/im,
  /\bother candidates['’]?s?\s*(?:names?|emails?|details|data|information)\b|\b(?:names?|emails?)\b[^.\n]{0,30}\bother candidates\b/i,
  /\bthis is (?:the|your) (?:hiring manager|recruiter|admin|ceo|developer)\b/i,
];

/**
 * Phrases that only appear when someone is trying to instruct the assistant rather than write to a
 * recruiter. Deterministic on purpose: the model can be talked into saying a message is safe.
 * Known gap: a plain request like "confirm my salary will be X" is negotiation, not matched here.
 */
export function detectInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}
