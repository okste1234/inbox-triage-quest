# Day 1 — 2026-10-20
## Goal today
Thin end-to-end slice. First step: a ground-truth set (about 50 synthetic messages, hand-labeled by me) before any classifier exists.

## What I did (timestamped)
- 04:00 Had AI generate 51 synthetic candidate messages (`data/sample_messages.json`). Distribution: roughly 6-9 per intent plus 4 deliberately ambiguous or multi-intent ones.
- 04:00 AI also recorded the intent it *intended* for each message in `data/.ai_guess_labels.json`, kept hidden from me while labeling so my labels are independent.
- 04:00 AI built a resumable labeling CLI (`npm run label`) and a comparison script (`npm run label:compare`). Smoke-tested with scripted input; typecheck passes.
- (fill in) Hand-labeled N/51 messages.

## Habit I dropped / caught myself in
(fill in, e.g. "Wanted to write the message set by hand; had AI generate it and spent my time on labeling, which is the part only I can do.")

## AI usage: what I prompted, what was wrong, how I fixed it
- Piped-stdin smoke test of the labeler first failed ("unsettled top-level await"). Cause: readline/promises loses prompts when piped input hits EOF immediately; not a bug for interactive use. Re-tested with paced input and it worked. Typecheck also failed at first (TypeScript 7 does not auto-include @types/node); fixed with `"types": ["node"]` in tsconfig.

## What broke (with numbers)
- Nothing in the product yet. Known weakness of the data itself: AI-written messages are cleaner and more polite than real ones. That inflates any accuracy number measured on them; Day 3 adversarial data is meant to counter this.

## What I didn't fix
- Ideal replies are optional in the labeler; not all 51 will have one.

## Tomorrow
Evals before features: write the eval script against labels.json, then the classify/draft slice.
