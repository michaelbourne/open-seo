# 0011 — Read-only GBP analytics

## Google Performance API

- OAuth scope: `https://www.googleapis.com/auth/business.manage` (GBP provider).
- Daily metrics stored in `gbp_performance_snapshots` per location.

## DataForSEO

- Profile: `my_business_info/live`
- Reviews: `reviews/task_post` + poll `task_get`; optional `extended_reviews`

## UI

- `/p/$projectId/local-presence/` — overview, reviews, profile, performance tabs (v1 combined view).
