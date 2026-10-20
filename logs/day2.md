# Day 2 — 2026-10-20
## Goal today
Evals before features: settle what `needs_human` means, write the scoring and classifier tests first, then build the classify slice and an eval runner.

## What I did
- **directive v2.** Day 1's disagreements showed `needs_human` had two meanings ("don't trust the draft" vs "a person must act"). Chose the first. Wrote a 7-rule policy into `directive.md`; four rules are enforced in code (`src/policy.ts`), the rest are the model's judgment.
- **Changed 4 labels to match the new policy** (m015 and m045 true -> false, m038 and m051 false -> true), each with a note in `labels.json`. These were the labels I had overridden against the AI on Day 1, so I changed ground truth *after* seeing the disagreements. That is a legitimate use of disagreement but it is also moving the answer key; `labels.json` history in git shows exactly what changed.
- **Tests first.** Wrote 29 tests (`tests/policy.test.ts`, `classify.test.ts`, `score.test.ts`) before any implementation. First run: 3 of 3 test files failed to load (modules did not exist). After implementing `policy.ts`, `classify.ts` and `evals/score.ts`: 29/29 pass, typecheck clean.
- **Classify slice:** `src/classify.ts` (LLM injected so tests use a fake), `src/llm.ts` (Anthropic SDK, JSON-schema output, zod re-validation), `prompts/classify.v1.md`. Any failure (API error, refusal, cut-off, bad JSON, schema failure) becomes a `needs_human` result with `error` set, never a silent default. The sender's email is not sent to the model.
- **Eval runner:** `npm run eval` scores intent accuracy (strict and lenient for multi-intent), needs_human precision/recall, accuracy split by label provenance, cost and p50/p95 latency.

## Habit I dropped / caught myself in
(fill in. Candidates: wrote the tests before the code; stopped to define `needs_human` before measuring it instead of tuning the prompt until numbers looked fine.)

## AI usage: what I prompted, what was wrong, how I fixed it
(fill in with the prompts you actually gave. What the AI got wrong today: its Day 1 label for m045 contradicted its own note; `ModelOutput` first allowed confidence outside 0-1 in the JSON schema, so zod does that check after parsing.)

## What broke (with numbers)
- **Nothing measured yet.** There is no `ANTHROPIC_API_KEY` in this environment, so `npm run eval` exits with an error and **no classify.v1 accuracy exists**. `evals/results/day2_baseline.json` has not been created and I have not invented numbers for it.
- The live API call in `src/llm.ts` (the `output_config.format` request shape) has only been typechecked, never executed. It is the first thing that could fail when the key is added.

## What I didn't fix
- No baseline score. No draft stage yet (reply generation, rubric checks). Not wired into an end-to-end CLI.
- Server-side refusal fallbacks are not enabled; a refusal just routes the message to a person. Fine for this task, but untested.
- Labels are `human_ai_assisted` for 45 of 51, so any accuracy number overstates how independent the answer key is.

## Tomorrow
Add the key, run `npm run eval`, record the baseline in `evals/results/day2_baseline.json` and `prompts/CHANGELOG.md`. Then Day 3: build adversarial data (injection, multi-intent, Pidgin, blank) and a 1,000-message load test.
