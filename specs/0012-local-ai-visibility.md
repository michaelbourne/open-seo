# 0012 — Local AI visibility monitoring

## Models

- ChatGPT, Claude, Gemini, Perplexity via DataForSEO `llm_responses`.

## Scoring

- Per keyword: `visibilityPct = modelsWithMention / 4 × 100`
- Mention detection uses business name and optional domain (see `mentionDetection.ts`).

## Schedule

- Weekly/monthly via `local_ai_monitor_configs.nextCheckAt` and cron handler.
