# Day 2 — 2026-10-20

> **Dating note.** This file was started 2026-10-20 and kept growing for four calendar days. Git dates: policy, tests and classify slice 10-20; open-model provider, draft stage, server and UI 10-21; first valid baseline and classify.v2 comparison 10-24. Work from 10-24 onward is logged in `day3.md`, so the day files follow the calendar. I did not notice the mismatch until the user asked whether we were already on Day 3 and 4; the log should have been split earlier.

## Goal today
Evals before features: settle what `needs_human` means, write the scoring and classifier tests first, then build the classify slice and an eval runner.

## What I did
- **directive v2.** Day 1's disagreements showed `needs_human` had two meanings ("don't trust the draft" vs "a person must act"). Chose the first. Wrote a 7-rule policy into `directive.md`; four rules are enforced in code (`src/policy.ts`), the rest are the model's judgment.
- **Changed 4 labels to match the new policy** (m015 and m045 true -> false, m038 and m051 false -> true), each with a note in `labels.json`. These were the labels I had overridden against the AI on Day 1, so I changed ground truth *after* seeing the disagreements. That is a legitimate use of disagreement but it is also moving the answer key; `labels.json` history in git shows exactly what changed.
- **Tests first.** Wrote 29 tests (`tests/policy.test.ts`, `classify.test.ts`, `score.test.ts`) before any implementation. First run: 3 of 3 test files failed to load (modules did not exist). After implementing `policy.ts`, `classify.ts` and `evals/score.ts`: 29/29 pass, typecheck clean.
- **Classify slice:** `src/classify.ts` (LLM injected so tests use a fake), `src/llm.ts` (Anthropic SDK, JSON-schema output, zod re-validation), `prompts/classify.v1.md`. Any failure (API error, refusal, cut-off, bad JSON, schema failure) becomes a `needs_human` result with `error` set, never a silent default. The sender's email is not sent to the model.
- **Eval runner:** `npm run eval` scores intent accuracy (strict and lenient for multi-intent), needs_human precision/recall, accuracy split by label provenance, cost and p50/p95 latency.

## Habit I dropped / caught myself in
**Dropped:** tests before code (29 tests failed to load before any classifier existed), and defining `needs_human` before measuring it, instead of tuning the prompt until the numbers looked fine. **Slipped back:** I asked for something deployable ("Something I can deploy.. Remember the requirements for submission includes live demo") while there was still no real accuracy number, pulling polish ahead of measurement. It was the right call for the submission, but a slip against the habit I was trying to build.

## AI usage: what I prompted, what was wrong, how I fixed it
**My prompts:** "Start Day 2: directive v2 first, then eval script and tests, then the classify slice."; "give me a free key I can use.. Any open model"; "Something I can deploy..". **What the AI got wrong:** its Day 1 label for m045 contradicted its own note; the first draft of the model-output schema allowed a confidence outside 0 to 1 (zod now checks it); the first deploy had no HTTP timeout. **How I responded:** reviewed the label disagreements, decided the `needs_human` policy myself, and had the AI write tests before each fix.

## What broke (with numbers)
- **First eval attempt was invalid.** I used `llama-3.1-8b-instant` on Groq; every one of the 51 calls returned `404 model_not_found`. The script still printed "13.7% accuracy" because failures fall back to `other` + `needs_human`. That number measured the fallback path, not the model. I deleted the result and made the runner refuse to report any run where more than 20% of calls fail (`runHealth`, tests first).
- **Second attempt hit Groq's free-tier limit** (8,000 tokens per minute): 44 of 51 calls failed with 429. Added wait-and-retry on 429 (tests first) and ran with concurrency 1.
- **Baseline (valid), `classify.v1` on `openai/gpt-oss-20b` via Groq, 51 messages, 0 errors:**
  - Intent accuracy: **94.1% strict (48/51), 96.1% lenient**. By label provenance: 97.8% of the 45 `human_ai_assisted` labels, **66.7% (4/6) of the `human` labels**. The 6 `human` labels are the ones I disagreed with the AI on, i.e. the hardest cases, so that split is not a fair comparison, and the 45 are partly AI-written.
  - `needs_human`: **precision 40.7%, recall 78.6%** (tp 11, fp 16, fn 3, tn 21). Missing an escalation is the costly direction, and it missed 3: m038 (a complaint classified as status_check, so the code rule for complaints never fired), m049 (status check plus frustration, complaint not listed as a secondary intent), m051 (just "Hello").
  - All 16 false positives came from the model's own `needs_human` judgment, not from the code rules.
  - Intent misses: m005 (take-home receipt: application_problem vs status_check, label arguable), m038 (above), m050 (start date plus pay: model chose compensation_question, I labeled scheduling; both are in the lenient set).
  - Cost: free tier. 35,273 input and 10,477 output tokens. p50 latency 3.9 s, p95 8.3 s per message; 224 s for the run at concurrency 1.

*(The classify.v2 vs v1 comparison is now in `day3.md`, since it was run on 10-24.)*

## What I didn't fix
- Draft quality has not been evaluated at all (no rubric run). Only classification has a baseline.
- `needs_human` precision is poor (16 false alarms on 51). Not tuned.
- The live Anthropic API path has still never been run; all numbers are from an open model.
- Server-side refusal fallbacks are not enabled; a refusal just routes the message to a person. Fine for this task, but untested.
- Labels are `human_ai_assisted` for 45 of 51, so any accuracy number overstates how independent the answer key is.

## Addendum: open-model option
No API key was available and I did not want the eval blocked on one, so I added an OpenAI-compatible provider (`PROVIDER=openai-compatible`, works with local Ollama, Groq, OpenRouter). Tests first again: 8 new tests failed ("not a function"), then 37/37 pass. Not yet run against any real model. Caveat: open models run in JSON mode with the schema spelled out in the prompt (no enforced schema), so more parse failures are likely than with Anthropic's structured output; they fall back to `needs_human` and are counted as errors in the eval.

## Addendum 2: a deployable demo (draft stage, server, review UI)
The brief wants something I can show live, so I built the rest of the pipeline in the same session instead of waiting for Day 3.
- **Tests first again:** wrote 29 tests for guardrails, draft, pipeline and server before the code; all 4 files failed to load, then 66/66 pass overall.
- **Draft stage** (`src/draft.ts`, `prompts/draft.v1.md`): no draft for messages that need a person. **Guardrails** (`src/guardrails.ts`): drafts with money or hiring-promise language are withheld and the message is escalated; dates/times, length and contact details are shown to the reviewer as warnings.
- **Web server** (`src/server.ts`) with limits (20 messages, 2,000 chars each, 100 KB body, 60 messages/hour/IP) and a review UI (`public/index.html`): groups by intent, "Needs a person" first, editable drafts, approve/reject, copy approved. It never sends.
- **Deploy files:** `Dockerfile`, `render.yaml`, README steps (Render + a free Groq key kept server-side).
- **A test caught a design flaw:** `classifyMessage` never throws, so provider error text (which can contain request details) was ending up in the `error` field returned to browsers. The server now replaces it with a generic message (verified against an unreachable model endpoint).
- **A browser check caught a real bug:** after triage finished the page re-enabled every button, including Approve on cards with no reply text. Fixed, rechecked at desktop and 375px width, no horizontal scroll.

**What is NOT verified:** (1) The UI was exercised against a keyword stub standing in for the model, so everything I saw (including a salary draft being blocked by the guardrail) shows the plumbing works, not that any real model behaves well. (2) No real model has been called yet, so there is still no accuracy, latency or cost number. (3) `docker build` was not run (the Docker daemon was not running here), and nothing is deployed. (4) The in-memory rate limit resets on restart, and trusts the `x-forwarded-for` header, which is correct behind Render's proxy but spoofable if the server is exposed directly.

## Tomorrow
Try a shorter `classify.v2` prompt (fewer tokens per call) and compare against this baseline. Then Day 3: build adversarial data (injection, multi-intent, Pidgin, blank) and a 1,000-message load test.
