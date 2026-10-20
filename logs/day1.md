# Day 1 — 2026-10-20
## Goal today
Thin end-to-end slice. First step: a ground-truth set (about 50 synthetic messages, hand-labeled by me) before any classifier exists.

## What I did (timestamped)
- 04:00 Had AI generate 51 synthetic candidate messages (`data/sample_messages.json`). Distribution: roughly 6-9 per intent plus 4 deliberately ambiguous or multi-intent ones.
- 04:00 AI also recorded the intent it *intended* for each message in `data/.ai_guess_labels.json`, kept hidden from me while labeling so my labels are independent.
- 04:00 AI built a resumable labeling CLI (`npm run label`) and a comparison script (`npm run label:compare`). Smoke-tested with scripted input; typecheck passes.
- I asked the AI to do the labeling for me instead (decision: I did not label by hand). It labeled all 51 with intent, secondary intents, needs_human and an ideal reply, validated against the zod schema. Every label carries `labeled_by: "ai"`.
- `npm run label:compare` reports 0 disagreements with the AI's own hidden guesses.

## Habit I dropped / caught myself in
(fill in honestly. Slip to record: I delegated the labeling, which was the one step meant to stay human. e.g. "Wanted to write the message set by hand; had AI generate it and spent my time on labeling, which is the part only I can do.")

## AI usage: what I prompted, what was wrong, how I fixed it
- Piped-stdin smoke test of the labeler first failed ("unsettled top-level await"). Cause: readline/promises loses prompts when piped input hits EOF immediately; not a bug for interactive use. Re-tested with paced input and it worked. Typecheck also failed at first (TypeScript 7 does not auto-include @types/node); fixed with `"types": ["node"]` in tsconfig.

## What broke (with numbers)
- Nothing in the product yet. Known weakness of the data itself: AI-written messages are cleaner and more polite than real ones. That inflates any accuracy number measured on them; Day 3 adversarial data is meant to counter this.

## What I didn't fix
- **The ground truth is not independent.** The same model wrote the messages, guessed the intents and then produced the labels, so "0 disagreements" says almost nothing; it is agreement with itself. Any accuracy number measured on `labels.json` will be optimistic until a human reviews it. Not fixed yet: I still need to read through `data/labels.json`, change what I disagree with, and set `labeled_by` to `human` on the reviewed ones.
- Labels also encode the AI's taxonomy decisions (e.g. m019 "running late" and m025 "remote/hours" have no good home; flagged in notes).
- Ideal replies are optional in the labeler; not all 51 will have one.

## Tomorrow
Evals before features: write the eval script against labels.json, then the classify/draft slice.
