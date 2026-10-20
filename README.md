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

## Test and evaluate
```bash
npm test        # deterministic, LLM mocked
npm run eval    # runs against data/labels.json and data/adversarial.json (uses the API)
```

## Known limitations / what broke
(Filled honestly from the day logs. See `logs/`.)
