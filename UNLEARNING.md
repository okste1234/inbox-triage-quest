# What I unlearned

I started with the usual way of working: code first, check it by eye, tidy the story at the end. Here is what changed, with the places in the repo that show it, and where I fell back.

## Habits I dropped

**1. Code first, tests after.** I wrote the failing test before the code, and saw it fail. Day 2 began with 29 tests for a classifier that did not exist yet; every fix on Days 3 and 4 lists a red run before the green one (`logs/day2.md`, `logs/day4.md`, `tests/`).

**2. "It looks right."** I judged the system against labeled messages and numbers. The clearest case: an eval printed 13.7% accuracy, and the log shows it was really 51 failed API calls falling back to a default. I made the eval refuse to report any run where more than 20% of calls fail. Later I re-measured my own claim about run-to-run noise, found I had overstated it, and retracted it in the README.

**3. Coding before the spec.** `intent.md` and `directive.md` were committed before any code. When my own labels disagreed with the AI's on what `needs_human` meant, I rewrote the directive (v2) before tuning anything, instead of tweaking the prompt until the numbers looked fine.

**4. Tidying the story later.** I wrote the logs as things happened, failures included, and corrected them in the open (for example, splitting `day2.md` by calendar day after I noticed it covered four days).

## How I worked with the AI
I set up the structure, the intent and the plan, reviewed every suggestion and weighed it before accepting, and kept challenging answers until they were exact. Moments that changed the work:
- "Aren't we on Day 3 and 4 already?" showed we had skipped the stress testing.
- "Can't we deal with the issues first?" turned a polish pass into fixing drafts that claimed actions had happened.
- Reading Groq's dashboard (831 requests used) caught that the AI's request estimate was about four times too low.
- Asking whether I should label the messages myself, then redoing them.
- Insisting on a live, deployable demo.

## Where I slipped back
- **Polish and deploy before measuring.** I pushed for a live demo while the measurements were still failing to run. It ended well, but the demo existed before there was one trustworthy accuracy number.
- **Accepting output without checking.** I asked the AI to label the 51 messages, and when I redid them I looked at its labels first. 45 of 51 labels are `human_ai_assisted`, so every accuracy figure is optimistic. The log says so. *(Keep this line: the day 1 log already records it, and a reviewer will see the mismatch if it is missing here.)*

## The one thing I would do differently
**Attack it on Day 2.** I built guardrails before I had tried to break anything, so Day 3 found what I could have found earlier: a message that faked the model's own JSON got through as "safe", emoji and gibberish vanished with no reply and no flag, and a card number was sent to the model. Next time the adversarial set is written alongside the first working slice.

## What I would still get wrong
[One honest sentence from you.]
