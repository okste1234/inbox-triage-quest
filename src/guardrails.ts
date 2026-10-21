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
