# Inbox Triage Helper

Groups candidate messages by intent and drafts a short reply for each. **It never sends anything**; a human approves, edits or rejects every draft.

> Status: scaffold only (Day 0). Sections below are filled in as the tool is built.

## Run
```bash
cp .env.example .env   # add ANTHROPIC_API_KEY
npm install
npm start -- data/sample_messages.json
npm run review
```

### Using a free open model instead of the Anthropic API
Any OpenAI-compatible endpoint works. Easiest is local [Ollama](https://ollama.com) (no account, no key):
```bash
ollama pull llama3.1:8b
# in .env:
# PROVIDER=openai-compatible
# OPENAI_BASE_URL=http://localhost:11434/v1
# MODEL=llama3.1:8b
```
Hosted free tiers (Groq, OpenRouter) also work: set their base URL, model name and `OPENAI_API_KEY`. Results are recorded with the provider and model, and are not comparable across models.

## Web demo and deploy
```bash
npm start        # http://localhost:3000, a review queue: approve / edit / reject each draft
```
The page groups messages by intent (messages that need a person come first), shows confidence and why something was escalated, and lets the reviewer edit every draft. Approve only copies text to the clipboard; **nothing is sent anywhere**.

Deploy on [Render](https://render.com) (free): push this repo to GitHub, then **New > Blueprint**, pick the repo (it reads `render.yaml`), and set `OPENAI_API_KEY` to a free [Groq](https://console.groq.com) key when prompted. The key stays on the server. Public-URL protections: at most 20 messages per request, 2,000 characters per message, 60 messages per hour per IP (`MAX_MESSAGES_PER_HOUR`). The in-memory rate limit resets when the free instance restarts or sleeps, and the first request after sleep takes about a minute.

## Test and evaluate
```bash
npm test        # deterministic, LLM mocked
npm run eval    # runs against data/labels.json and data/adversarial.json (uses the API)
```

## Known limitations / what broke
(Filled honestly from the day logs. See `logs/`.)
