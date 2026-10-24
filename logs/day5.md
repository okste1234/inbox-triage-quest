# Day 5 — 2026-10-24 (packaging; continues the work in day3.md and day4.md)
## Goal today
Package it: a live deployed demo, an honest README, the final directive and intent, and the unlearning note. Videos and the submission form are still mine to do.

## What I did
- **Deployed** to Render from the repo's `Dockerfile` and `render.yaml`: https://inbox-triage-by7n.onrender.com/. First built and ran the image locally (health check, the 6-message sample, no email addresses leaked), then ran the real 6-message sample through the live service: 2.2 s, 3 drafted, 3 sent to a person (an offer confirmation, a same-day cancellation, and an injection attempt that was never sent to the model).
- **Protected the public URL:** per-request, per-visitor-hour and server-wide daily message limits, so a stranger cannot drain the model key's free quota.
- **Fixed the live-demo drafts problem** seen in that smoke test: drafts claimed actions that had not happened ("We have withdrawn your application"). 46% before, 8% after, now flagged for the reviewer (details in `day4.md`).
- **Measured run-to-run noise** (three repeats) and retracted my earlier claim that noise was large (`day4.md`).
- **Rewrote the README** with the live link, the real results and the honest limitations; wrote the final `directive.md` (v3) and scored `intent.md` against what happened; wrote `UNLEARNING.md`; filled the blank habit and AI-usage sections in the day logs.

## Habit I dropped / caught myself in
**Dropped:** tidying the story at the end. The logs, the retraction of my noise claim and the scorecard in `intent.md` all say where I fell short, including the 1,000-message test I never ran. **Caught myself:** polishing before measuring (the demo went up before the Day 4 numbers existed), and trusting output I had not checked (the README write that had silently failed).

## AI usage: what I prompted, what was wrong, how I fixed it
**My prompts:** "Move to the docs: interview me for the unlearning note and the blank habit and AI-usage sections, then do the final directive, intent and day5 log."; earlier, "Can't we deal with the issues first?" and "Measure the run-to-run noise...". **What the AI got wrong today:** it told me the README was updated and pushed when the write had failed and only a different file was committed; I caught it when I asked to deal with the issues first, and the README was then properly rewritten. It also first overstated run-to-run noise (retracted after measuring).

## What broke (with numbers)
- The README write failed silently once, and the commit message described a change that was not in the commit.
- Groq's free tier stalled intermittently (one call took 372 s; repeat 3 had p95 latency 90 s versus 4.7 s in repeat 1).
- **The live demo froze when Groq stalled.** After the last deploy, a triage request hung for 120 s with no reply (the health check was fine): the server waited through up to 5 retries of 60 s each. Fixed, tests first: each model call now gives up after 25 s and 3 attempts on the deployed service (`LLM_TIMEOUT_MS`, `LLM_MAX_ATTEMPTS`), and the page gets a clear 504 ("The model is taking too long right now") after 50 s (`REQUEST_DEADLINE_MS`). Not a fix for Groq's stalls themselves; it makes them visible and short.
- Live model requests: one organization's free daily quota was exhausted earlier; on the second key my own request counters add up to roughly 700 across the adversarial, dialect, draft, main/held-out and noise runs. Groq's response headers did not match that count (they showed more remaining), so the dashboard is the number to trust.

## What I didn't fix
- **Pidgin fairness is open.** classify.v3 sometimes escalates a Pidgin status question as a complaint. v4 fixed that but cost two missed escalations, so it was rejected; a v5 (v3 plus only the dialect sentence) is untested.
- **a006** (a request to confirm a salary in a reply) is not caught as an injection; pattern-based detection is brittle in general.
- **No 1,000-message load test.** I never ran it, and there is no `data/scale_1000.json`. The free tier's 1,000-requests-a-day cap makes it impossible to run honestly in one day.
- **Draft quality is only rule-checked**, not judged. 86% of drafts have no warning flag, below the 95% target.
- **Labels are `human_ai_assisted`** (45 of 51), so accuracy is optimistic. The Anthropic API path has never been run.

## Still to do (mine, not the AI's)
- Record the **Loom** video and the **5-minute demo video**; paste both links into `media/links.md`.
- Fill the two remaining bracketed lines: the label-independence specifics in `logs/day1.md`, and the last sentence in `UNLEARNING.md`.
- Optionally review `data/labels.json` and mark rows you checked as `human`.
- Open the live URL a couple of minutes before recording (free hosting sleeps), then attach the 7 deliverables on the submission page.
