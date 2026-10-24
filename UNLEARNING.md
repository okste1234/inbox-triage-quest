# What I unlearned

I started with the familiar engineering instinct: write the code, check whether it looks right, and clean up the story afterward. This project taught me that working software, credible measurements, and a convincing demo are three different things. Below is what changed, where the repo shows it, and where I fell back.

## Habits I dropped

**1. Code first, tests after.** I wrote the failing test before the code, and watched it fail. Day 2 began with 29 tests for a classifier that did not exist yet; every fix on Days 3 and 4 lists a red run before the green one (`logs/day2.md`, `logs/day4.md`, `tests/`).

**2. "It looks right."** I judged the system against labeled messages and numbers. The clearest case: an eval printed 13.7% accuracy, and the log shows it was really 51 failed API calls falling back to a default. I made the eval refuse to report any run where more than 20% of calls fail. Later I re-measured my own claim about run-to-run noise, found I had overstated it, and retracted it in the README.

**3. Coding before the spec.** `intent.md` and `directive.md` were committed before any code. When my labels disagreed with the AI's on what `needs_human` meant, I rewrote the directive (v2) before tuning anything, instead of tweaking the prompt until the numbers looked fine.

**4. Tidying the story later.** I wrote the logs as things happened, failures included, and corrected them in the open (for example, splitting `day2.md` by calendar day after I noticed it covered four days).

## What working with the AI taught me
AI assistance still requires active technical judgment. I set up the structure, the intent and the plan, then reviewed and weighed every suggestion before accepting it. The moments that mattered were all ones where I checked the AI against something outside itself:
- **"Aren't we on Day 3 and 4 already?"** I compared the progress it reported against the brief, and found the stress testing had been skipped.
- **Groq's dashboard showed 831 requests used.** The AI had estimated about 200. I trusted the independent source over its estimate, which led to capped retries and a circuit breaker.
- **"Can't we deal with the issues first?"** I refused to move on to the paperwork. That caught a README update that had silently failed, and led to fixing drafts that claimed actions had happened.
- **Redoing the labels.** I saw that labels written by the AI could not be independent ground truth, and chose to redo them myself, though imperfectly (below).
- **Insisting on a live, deployable demo.** The submission needs software that can be shown, not just numbers.

## Where I slipped back
- **Polish and deploy before measuring.** I pushed for a live demo while the measurements were still failing to run. The demo existed before there was one trustworthy accuracy number.
- **Accepting output without checking.** I asked the AI to label the 51 messages, and when I redid them I looked at its labels first, and took 21 of them from the AI after seeing them. I did not record which, so 45 of 51 labels are marked `human_ai_assisted` to be safe, and every accuracy figure is optimistic. The labels were AI-assisted, which limits how independent my evaluation is, and the README and logs say so.

## The one thing I would do differently
**Attack it on Day 2.** I built guardrails before I had tried to break anything, so Day 3 found what I could have found earlier: a message that faked the model's own JSON got through as "safe", emoji and gibberish vanished with no reply and no flag, and a card number was sent to the model. Next time the adversarial set is written alongside the first working slice.

## What I would still get wrong
I would probably still underestimate how much time it takes to establish trustworthy evidence, because I naturally want to see the system working before I have fully proved that it works.
