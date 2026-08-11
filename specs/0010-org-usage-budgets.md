# 0010 — Self-hosted usage budgets

## Ledger

- Append-only `organization_usage_ledger` rows on each metered DataForSEO call when `!isHostedMode`.
- `creditFeature` attributes spend (e.g. `local_map_rank`, `rank_tracking`, `agent`).

## Enforcement

- Post-call: sum month-to-date; throw `USAGE_BUDGET_EXCEEDED` when over `monthlyBudgetUsd`.
- Pre-flight: `assertUsageBudgetForEstimate()` before rank checks, map scans, etc.
- SAM: `dailyAgentBudgetUsd` checked in `beforeTurn` on self-host.

## Settings

- Org-level `organization_usage_settings` edited from Settings (self-hosted only).
