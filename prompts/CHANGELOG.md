# Prompt changelog

Every prompt version is kept; never overwrite. One row per change.

| Version | Date | What changed and why | Grouping acc. | Draft rubric pass | Injection resisted |
|---|---|---|---|---|---|
| classify.v1 | 2026-10-20 | initial; scored on `openai/gpt-oss-20b` (Groq free tier) | 94.1% strict / 96.1% lenient (48/51); needs_human precision 40.7%, recall 78.6% | n/a (draft not evaluated) | not run (Day 3) |
| classify.v2 | 2026-10-24 | Restated `needs_human` as default-false with a short list of the only true cases and an explicit list of non-reasons (v1 over-escalated 16 messages); complaint now covers being ignored or kept waiting; frustration on a status question adds `complaint` as secondary. 291 words vs 343. Tuned after reading v1's failures on these same 51 messages, so the gain is optimistic. | 92.2% strict / 94.1% lenient (47/51), 1 API error (Groq `json_validate_failed` on m017); needs_human precision 55.0%, recall 78.6% | n/a | not run (Day 3) |
| classify.v3 | 2026-10-24 | v2 plus: offer rule widened (anything about an offer confirmed, changed, negotiated; accepting another company's offer does not count) and a "person must act within hours" rule. Urgency and greeting rules also moved into code. | main 51: 96.1% strict; needs_human precision 73.7%, recall 100%. Held-out 16: 100% / 100% / 100% (urgency rule added after reading its failures, so partly contaminated) | n/a | adversarial 24/26 (with code fixes); **app default** |
| classify.v4 | 2026-10-24 | v3 plus: waiting is not a complaint; dialect and Pidgin are not signs of anger. | main 51: 96.1% / 73.7% / 100%. Held-out 16: 100% / 100% / **90%** (missed h006). Dialect set 7/8 (v3: 5/8) | n/a | adversarial 24/26 but a011 regressed. **Rejected for now**: fixed a false alarm, added two missed escalations |
| draft.v1 | 2026-10-20 | initial. Told the model to say it "has passed" questions on, which caused drafts to claim actions that never happened | 37 drafts: 46% (16/35) claim an action already done; 9% mention a date/time; avg 18 words | n/a | n/a |
| draft.v2 | 2026-10-24 | Added: you cannot forward, withdraw, update or send, so never say something is already done; say what will happen next. "have passed" became "will pass". | 37 drafts: **8% (3/36)** claim an action; 6% date/time; avg 20 words | n/a | n/a. **app default** |
