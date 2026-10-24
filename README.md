# Inbox Triage Helper

Takes a pile of candidate messages, groups them by what the person wants, and drafts a short reply for each. **It never sends anything.** A human reviews every draft: approve, edit or reject. Messages that are risky, unclear or hostile go to a "Needs a person" group with no draft.

**Live demo:** https://inbox-triage-by7n.onrender.com/ (free hosting: the first load after idle takes about a minute; it runs on a free-tier open model and has a shared daily budget, so it may say it is used up)

Built for the Unlearn / Use / Raise-the-Load quest, Option A. The process is the point: see `intent.md`, `directive.md`, `logs/` and `UNLEARNING.md`.

## Run it
```bash
cp .env.example .env      # then set the key and model, see below
npm install
npm start                 # http://localhost:3000, click "Try 6 sample messages"
```
The tested setup is a free open model on [Groq](https://console.groq.com):
```
PROVIDER=openai-compatible
OPENAI_BASE_URL=https://api.groq.com/openai/v1
MODEL=openai/gpt-oss-20b
OPENAI_API_KEY=<your key>
```
Any OpenAI-compatible endpoint works (local Ollama needs no key: `OPENAI_BASE_URL=http://localhost:11434/v1`). An Anthropic API path exists in `src/llm.ts` but **has never been run** (no key was available), so every number below comes from `openai/gpt-oss-20b` on Groq's free tier. That tier allows 8,000 tokens a minute and 1,000 requests a day.

## Test and evaluate
```bash
npm test                   # deterministic tests, the model is mocked
npm run eval               # 51 labeled messages (uses the live model)
npm run eval -- --messages data/holdout_messages.json --labels data/holdout_labels.json
npm run eval:adv           # 26 adversarial messages through the full pipeline
npm run eval:drafts        # draft stage only: how often drafts trip the guardrails
```
Each eval prints the HTTP requests it sent (free tiers cap requests per day) and **refuses to report a run where more than 20% of calls failed**, because that would score the fallback path, not the model.

## Deploy
Push to GitHub, then on [Render](https://render.com): **New > Blueprint**, pick the repo (it reads `render.yaml` and the `Dockerfile`), and paste your model key as `OPENAI_API_KEY` when asked. Stalls are handled: each model call gives up after 25 s (`LLM_TIMEOUT_MS`), and a page request shows a clear "taking too long" message after 50 s (`REQUEST_DEADLINE_MS`) instead of freezing. Public-URL protections: at most 20 messages per request, 2,000 characters each, 30 messages an hour per visitor (`MAX_MESSAGES_PER_HOUR`) and 120 a day for the whole server (`MAX_MESSAGES_PER_DAY`), so a stranger cannot drain the key's free quota.

## How it works
`classify` (model) then policy (code) then `draft` (model) then guardrails (code). The code rules run no matter what the model says:
- **Injection detection** (`src/guardrails.ts`): messages that try to instruct the assistant are escalated, flagged, and never sent to the model.
- **Sensitive data** (`src/sensitive.ts`): SSNs and card numbers (Luhn-checked) are redacted before the model sees them, escalated, and redacted on the review page.
- **Escalation rules** (`src/policy.ts`): complaints, several requests, low confidence, urgent wording, bare greetings.
- **Never drop silently:** a message that ends with no draft goes to a person.
- **Draft guardrails:** drafts with money or hiring promises are withheld; drafts that say an action is already done, mention dates or run long are flagged for the reviewer.

## Results (one run each, one free-tier model; the logs have the full story)
| What | Result |
|---|---|
| Intent accuracy, 51 labeled messages | 96.1% strict (classify.v3) |
| `needs_human`, same set | precision 73.7%, recall 100% |
| Held-out 16 messages | 100% intent, 100% / 100% precision and recall (a rule was added after seeing its failures) |
| Adversarial set (26), before fixes | 19/26 |
| Adversarial set (26), after fixes | **24/26** |
| Adversarial set vs a simulated fully-fooled model | 13/26 still pass; code alone stops 7 of 8 injections |
| Drafts claiming an action already done | 46% with draft.v1, **8%** with draft.v2 |

## What broke, and what is still wrong
- **The ground truth is not independent.** The same AI wrote the 51 messages and drafted the labels; 45 labels are marked `human_ai_assisted`, 6 are `human` (by my count I took about 21 labels from the AI's after seeing them and decided the rest myself, but did not record which). All accuracy figures are optimistic for that reason.
- **Prompt tuning did not generalize on its own.** v3 "fixed" the escalations it was tuned on and missed new ones in the held-out set; urgent cases had to move into code. v4 fixed a Pidgin false alarm but added two missed escalations, so it was rejected.
- **Pidgin fairness is only partly fixed.** classify.v3 sometimes reads a Pidgin status question as a complaint and escalates it, so those candidates get slower handling. This is open.
- **Known injection gap:** "please confirm my salary will be X" is not caught as an injection (other rules still escalate it).
- **Pattern-based injection detection is brittle.** A rephrased attack can slip past it. It is a layer, not a guarantee.
- **Drafts can still claim actions that did not happen (8% of the time).** The reviewer sees a warning flag, and a human must catch it before sending.
- **Draft quality is only rule-checked** (flags and length), not judged for helpfulness.
- **Run-to-run noise is small but not zero.** Three repeats of the same prompt on the 51 messages: intent accuracy 94.1%, 94.1%, 92.2% (a one-message swing), `needs_human` precision and recall identical every time. Treat a one-message difference as noise; two or more as a signal. (I first claimed the noise was large; that came from comparing runs under different code, and I retracted it. Details in `logs/day4.md`.) Sample sizes are small: 51 messages, 16 held-out, 8 dialect.
- **Infrastructure cost me time and quota:** a network outage, a missing HTTP timeout (a stalled call froze an eval), and retry logic that multiplied requests and used 831 of a day's 1,000 free requests. All fixed and tested; details in `logs/day4.md`.

## Repo map
`intent.md` (goals and metrics) | `directive.md` (the AI brief, versioned in git) | `logs/` (daily logs) | `prompts/` (every version, with `CHANGELOG.md`) | `data/` (messages, labels, held-out, adversarial, dialect, demo set) | `evals/` (runners and results) | `src/`, `tests/`, `public/`
