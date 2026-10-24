# Prompt changelog

Every prompt version is kept; never overwrite. One row per change.

| Version | Date | What changed and why | Grouping acc. | Draft rubric pass | Injection resisted |
|---|---|---|---|---|---|
| classify.v1 | 2026-10-20 | initial; scored on `openai/gpt-oss-20b` (Groq free tier) | 94.1% strict / 96.1% lenient (48/51); needs_human precision 40.7%, recall 78.6% | n/a (draft not evaluated) | not run (Day 3) |
| classify.v2 | 2026-10-24 | Restated `needs_human` as default-false with a short list of the only true cases and an explicit list of non-reasons (v1 over-escalated 16 messages); complaint now covers being ignored or kept waiting; frustration on a status question adds `complaint` as secondary. 291 words vs 343. Tuned after reading v1's failures on these same 51 messages, so the gain is optimistic. | 92.2% strict / 94.1% lenient (47/51), 1 API error (Groq `json_validate_failed` on m017); needs_human precision 55.0%, recall 78.6% | n/a | not run (Day 3) |
| draft.v1 | | initial | | | |
