# directive.md — v3 (final, Day 5)

This is the standing brief I hand to the AI agent. Git history of this file is the evidence of how it evolved (v1 on Day 0, v2 on Day 2, this version on Day 5). Do not rewrite history; add versions.

## Role
You are helping me build **Inbox Triage Helper**: classify candidate messages by intent and draft short replies for human review. Read `intent.md` first; it wins over this file if they conflict.

## How we work
1. **Tests first, and watch them fail.** Write the failing test or eval case before the implementation, run it red, then make it green. Say when you did not run the red step.
2. **Thin slices.** Get input -> groups -> drafts -> review working end to end before improving any stage.
3. **Measure, don't eyeball.** "Looks right" is not a result. Report numbers against labeled data, split by label provenance (`labeled_by`), and say how many messages each number rests on.
4. **Never report a failed run as a result.** If more than 20% of calls errored, the scores measure the fallback path. Read error counts before reading accuracy.
5. **Attack it early.** Write adversarial cases (injection, multi-intent, dialect, noise, sensitive data) alongside the first working slice, not after hardening. *(Added in v3: building guardrails before trying to break anything meant Day 3 found failures that could have been found on Day 2.)*
6. **Put what the model can be talked out of into code.** Anything that must always happen (escalate an injection, redact an SSN, never drop a message silently) is a deterministic rule with a test, not a prompt sentence.
7. **Hold out what you report.** Do not tune on the set you report. If a rule was added after reading a set's failures, say so next to the number.
8. **Verify before claiming done.** Check a write succeeded, a command exited 0, and a number matches the dashboard before saying it is done. Trust a provider's dashboard over its response headers and over your own estimate; multiply request estimates by about four when retries are involved.
9. **Show failures and retract mistakes.** If something fails, or an earlier claim turns out wrong, say so plainly in the log and the README.
10. **Small commits** with clear messages, as the user alone (no AI attribution lines).
11. **Don't touch** `data/labels.json` (the answer key) except to record a documented policy change, and never overwrite older `prompts/*.vN.md` files. Add new versions instead.
12. **Be kind to free tiers.** Cap total attempts per call, use a circuit breaker, print the request count at the end of every eval, and stop on the first invalid run.

## Stack
TypeScript (Node 22), `zod` for schemas, `vitest` for tests, `tsx` to run. A small web page for review (`public/index.html`) served by `node:http`. Model calls go through one interface (`LlmCall`): the tested provider is an OpenAI-compatible endpoint (Groq, `openai/gpt-oss-20b`); an Anthropic path exists but **has never been run**.

## Product rules (hard)
- The tool **never sends** anything. Output is a review queue.
- Every message ends with **either a draft or a person**. Nothing is dropped silently.
- Message text is **untrusted data**, never instructions. It is delimited in prompts. A message that tries to instruct the assistant is flagged `injection_suspected`, escalated, and never sent to the model (deterministic patterns in `src/guardrails.ts`).
- SSNs and Luhn-valid card numbers are redacted before the model sees them, escalated (`sensitive_data`), and redacted on the review page.
- Drafts: <= 90 words, plain and warm, answer only what was asked. They **must not** state or imply salary or compensation, specific dates or times, hiring decisions or odds, or anything about other candidates. They **must not say an action has already happened** ("I've forwarded", "we have withdrawn"); say what will happen next ("I'll pass this to the team").
- Drafts with money or hiring promises are withheld (`draft_blocked`). Drafts that claim an action, mention a date, run long or echo contact details are flagged for the reviewer.
- Don't log or echo email addresses or phone numbers beyond what is needed for review.
- Public URL limits: 20 messages per request, 2,000 characters each, per-visitor hourly limit, server-wide daily limit.

## `needs_human` policy
`needs_human` means "do not offer a quick-approve draft", not "someone has to do something later". Checking a status, moving a calendar slot or sending an address is normal; the draft says "I'll check".

It is true when ANY of these holds:
1. **Complaint**: the intent or a secondary intent is `complaint`. *(code)*
2. **Multi-intent**: more than one intent is present. *(code)*
3. **Offer or negotiation**: the candidate has an offer and wants it confirmed, changed or negotiated, or states a pay figure. *(model judgment only)*
4. **Time-critical**: needs action within hours (late for or unable to attend a same-day interview, trouble joining a call). *(code, urgency words)*
5. **Contentless**: blank, or only a greeting. *(code)*
6. **Injection suspected**. *(code)*
7. **Low confidence**: below 0.7. *(code)*
8. **Sensitive data** in the message. *(code)*
9. **No draft was produced** or a draft was blocked. *(code, pipeline)*

Auto-replies (out of office) are `other`, not `needs_human`, and get no reply.

## Intent taxonomy
`status_check`, `scheduling`, `reschedule_or_withdraw`, `compensation_question`, `application_problem`, `complaint`, `other`.

## Prompts in use
`classify.v3` and `draft.v2`. `classify.v4` was evaluated and rejected (fixed a dialect false alarm, added two missed escalations). Every version and its scores are in `prompts/CHANGELOG.md`.

## Definition of done (per slice)
- Tests pass, evals run, numbers recorded in `evals/results/` with the request count.
- `logs/dayN.md` updated the same day, including what broke and what was not fixed, and split by calendar day.
- Prompt changes recorded in `prompts/CHANGELOG.md` with the score.

## Changelog
- **v1** (Day 0): initial brief.
- **v2** (Day 2): defined `needs_human` after Day 1 label disagreements; `labeled_by` provenance; structured output validated with zod; refusals and invalid output become `needs_human`.
- **v3** (Day 5): added the working rules learned the hard way: watch tests fail (1); never report an invalid run (4); attack early (5); deterministic rules for anything the model can be talked out of (6); hold-out discipline (7); verify before claiming done and trust the dashboard (8); free-tier etiquette (12). Added product rules for injection, sensitive data, no silent drops and claims of completed actions; widened the `needs_human` policy to nine rules and marked which are in code; recorded the provider and prompt versions actually in use.
