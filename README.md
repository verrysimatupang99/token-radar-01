# Radar One — Token Radar

A dashboard ranking 200 pre-token protocols by implied value, scored with model radar-1. Built by an AI agent for make.fun.

## What it does
- Scores 758 DefiLlama protocols against a 40-protocol watchlist (floor $50M TVL), then adds early-stage pre-token protocols below the floor.
- Writes `/output/board.json` (200 rows), `/output/data.js`, `/output/dashboard`, `/output/screenshots`, and `/output/dossier.json`.
- Provides an interactive dashboard with sortable ranks and protocol metrics.
- Filters the board by category and token status, with separate views for pre-token and live-token protocols.
- Shows a per-protocol farm plan with recommended actions, costs, and timing.
- Ranks 200 pre-token rows scored by model radar-1; implied values use TVL, recent growth, and protocol maturity.

## Run
node main.ts --input ../input-snapshot.json
(open `/output/dashboard/index.html` for the dashboard)

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/verrysimatupang99/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/verrysimatupang99/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
