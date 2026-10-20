# Day 1 — 2026-10-20
## Goal today
Thin end-to-end slice. First step: a ground-truth set (about 50 synthetic messages, hand-labeled by me) before any classifier exists.

## What I did (timestamped)
- 04:00 Had AI generate 51 synthetic candidate messages (`data/sample_messages.json`). Distribution: roughly 6-9 per intent plus 4 deliberately ambiguous or multi-intent ones.
- 04:00 AI also recorded the intent it *intended* for each message in `data/.ai_guess_labels.json`, kept hidden from me while labeling so my labels are independent.
- 04:00 AI built a resumable labeling CLI (`npm run label`) and a comparison script (`npm run label:compare`). Smoke-tested with scripted input; typecheck passes.
- **First pass (superseded, see Update below):** I asked the AI to do the labeling for me (I did not label by hand). It labeled all 51 with intent, secondary intents, needs_human and an ideal reply, validated against the zod schema, each marked `labeled_by: "ai"`. These now live in `data/labels.ai.json`.
- First-pass check: 0 disagreements between those AI labels and the AI's own hidden guesses. This is the same model agreeing with itself, so it proves nothing. (My own labels later disagreed with the AI's on 1 intent and 5 needs_human; see below.)

## Habit I dropped / caught myself in
(fill in honestly. Slip to record: I delegated the labeling, which was the one step meant to stay human. e.g. "Wanted to write the message set by hand; had AI generate it and spent my time on labeling, which is the part only I can do.")

## AI usage: what I prompted, what was wrong, how I fixed it
- Piped-stdin smoke test of the labeler first failed ("unsettled top-level await"). Cause: readline/promises loses prompts when piped input hits EOF immediately; not a bug for interactive use. Re-tested with paced input and it worked. Typecheck also failed at first (TypeScript 7 does not auto-include @types/node); fixed with `"types": ["node"]` in tsconfig.

## What broke (with numbers)
- Nothing in the product yet. Known weakness of the data itself: AI-written messages are cleaner and more polite than real ones. That inflates any accuracy number measured on them; Day 3 adversarial data is meant to counter this.

## What I didn't fix
- **The ground truth is not independent.** The same model wrote the messages, guessed the intents and then produced the labels, so "0 disagreements" says almost nothing; it is agreement with itself. Any accuracy number measured on `labels.json` will be optimistic until a human reviews it. (Status after the update below: I did the review and labeled with AI help; provenance is now recorded per label. The answer key is still not fully independent.)
- Labels also encode the AI's taxonomy decisions (e.g. m019 "running late" and m025 "remote/hours" have no good home; flagged in notes).
- Ideal replies are optional in the labeler; not all 51 will have one.

## Tomorrow
Evals before features: write the eval script against labels.json, then the classify/draft slice.

## Update (same day): redoing the labels myself
Asked whether it was better to label by hand; decided yes. Moved the AI's labels to `data/labels.ai.json` (kept in git, `labeled_by: "ai"`) so they don't anchor me, and I'm labeling `data/labels.json` from scratch with `npm run label`. `npm run label:compare` will report my agreement with the AI, and each disagreement goes in the notes below.

- Human labels done: 51/51 (23 with notes, 7 with an ideal reply; the rest of the replies are left for later).
- Intent agreement with AI: **50/51**. `needs_human` agreement: **46/51**.
- I fixed 4 mechanical errors in my own file afterwards: ideal_reply for m032 and m043 held note text instead of a reply (blanked), and stray leading quote marks on m027 (note) and m028 (reply).

### Disagreements (1 intent, 5 needs_human)
| id | message | me | AI | What it shows |
|---|---|---|---|---|
| m050 | "Can I start in two months... flexibility on the base pay?" | scheduling | compensation_question | Genuine multi-intent. Both of us listed the other intent as secondary and both set needs_human=true, so the outcome in the tool is the same. The eval must not treat this as a plain miss. |
| m014 | "Happy to proceed... how do I book a slot?" | needs_human=no | yes | AI over-escalated a routine message. |
| m015 | "Conflict on Wednesday... move it to next week?" | yes | no | Rescheduling needs a human to act on the calendar, but a safe draft is easy. |
| m045 | "Send me your postal address" | yes | no | The AI's own note said "a human decision" but it set no, so the AI contradicted itself. My label is the consistent one. |
| m038 | "Told Friday, now Wednesday, nobody replied" | no | yes | I escalated the other five complaints but not this one. Mild complaint or not? I need a rule. |
| m051 | "Hello" | no | yes | directive.md says empty messages go to a human; "Hello" is not empty but has no request. |

**What the five needs_human disagreements have in common:** `needs_human` has two meanings that I never separated. (a) "The draft can't be trusted" and (b) "a person must take an action (calendar, address, records)". m015 and m045 are (b); m014, m038 and m051 are about how risky the message feels. Next step: decide one meaning and write it into `directive.md` (v2) before the Day 2 eval, otherwise the eval measures noise.

### Independence caveat (be honest here)
The 50/51 figure is **not** strong evidence that the taxonomy is clear. Several of my notes and ideal replies are word-for-word identical to the AI's (for example the notes on m015, m020, m033, m038, m039, m041, m043 and the ideal replies on m024 and m036). I labeled the messages myself **with AI help**: I looked at `labels.ai.json` (or the earlier AI output) while labeling, and some of my answers were copied or lightly edited from it. That is different from what I planned (labeling from scratch with the AI files out of sight). [Add the specifics only you know: roughly how many you took from the AI, and which you decided yourself.] The six labels where I diverged from the AI (m050, m014, m015, m045, m038, m051) are the clearest cases of my own judgment.

So these are human labels made with AI assistance, not independent ground truth. In `labels.json` I marked the six divergent rows `labeled_by: "human"` and the other 45 `human_ai_assisted`. Day 2 evals will report accuracy overall and split by that field, so an accuracy number is never presented as if the answer key were independent of the model.

**Habit slip to carry into the unlearning note:** I said I would do the one step that needed my own judgment, then let the AI's answers anchor me. The fix I tried (move the AI labels aside) only works if the files are out of sight while labeling.
