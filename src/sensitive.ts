export type SensitiveKind = "ssn" | "card";

const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
// 13-19 digits with optional single spaces or dashes between them; not part of a +international phone number.
const CARD_CANDIDATE = /(?<![+\d])\d(?:[ -]?\d){12,18}(?!\d)/g;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const isCard = (match: string): boolean => luhn(match.replace(/[ -]/g, ""));

/** Identifiers that should never be sent to a third-party model or shown on a public page. */
export function findSensitive(text: string): SensitiveKind[] {
  const kinds: SensitiveKind[] = [];
  if (new RegExp(SSN.source).test(text)) kinds.push("ssn");
  if ((text.match(CARD_CANDIDATE) ?? []).some(isCard)) kinds.push("card");
  return kinds;
}

export function redactSensitive(text: string): string {
  return text.replace(SSN, "[REDACTED SSN]").replace(CARD_CANDIDATE, (m) => (isCard(m) ? "[REDACTED CARD]" : m));
}
