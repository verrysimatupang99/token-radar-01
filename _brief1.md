You are upgrading a working make.fun entry for the "best token launch radar" bounty. A judge model compares dashboards pairwise — screenshots and readable source — and picks the better-looking, more useful one. The starter dashboard is plain: your job is to make it clearly better: professional, information-dense, genuinely useful to a crypto airdrop farmer.

## What exists

- `main.ts` — reads /input/snapshot.json (or --input), builds the board via lib/model.ts, writes /output/{board.json, data.js, dossier.json}, copies dashboard/ + screenshots/ to /output. Run locally: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input-snapshot.json` (copy input/snapshot.json to ../input-snapshot.json — do NOT read ../token-radar-01-kit, treat this repo as standalone; copy the snapshot into the repo parent as ../input-snapshot.json once).
- `lib/model.ts` — radar model (constants MODEL, buildRadar, dataScript, boardIssue). data.js feeds the page a global `window.RADAR` object; READ dataScript() to see the exact shape the page receives.
- `dashboard/index.html`, `app.css`, `app.js` — the static page (no framework, no network allowed).
- `vendor/makefun-board.ts` — DO NOT TOUCH (byte-for-byte required).
- `input snapshot`: 758 protocols; watchlist=40 pre-token ≥$50M TVL; board has 160 early + 40 watchlist rows; 24 live-token rows set aside. Top watchlist TVL: steakhouse-financial $2.75B (Risk Curators), gauntlet $1.58B, veda $1.56B, usdd $1.06B, nonce-capital, upshift, bittensor-dtao, onre, rockawayx, symbiotic, opentrade, hyperithm...

## Rewrite the dashboard completely (index.html, app.css, app.js)

Design: dark, dense, professional trading-terminal look. No framework, no network, no fonts/CDN imports (no-network rule). System font stack, ~13px dense text. Suggested palette: near-black background (#0b0e13/#10141b), panel #141a22, borders #232c38, accent electric green #3fd68f for implied value and links, amber #f2b35c for watchlist stars, red/green for 7d change. All in app.css.

Layout (index.html + app.js):
1. **Top bar**: title "TOKEN RADAR" + subtitle "Pre-token protocol watchlist — snapshot 2026-11-14"; right side: stat chips (40 watchlist · 160 early · 24 live · total implied $).
2. **Controls row**: search box (slug/name), category multi-filter (chips of top categories: Risk Curators, Onchain Capital Allocator, RWA, CDP, Dexs, Lending, Collateral Markets, Derivatives...), chain select, tier toggle (All / ★ Watchlist / Early), sort select (implied, TVL, 7d change, name). Show active count.
3. **Board table** (virtualized or paginated 50/page): rank#, ★watchlist marker, protocol name+slug, category chip (colored per category family), chains (abbrev), TVL ($B/$M), Δ7d colored, **implied value** with an inline horizontal bar scaled to max, farm difficulty badge (Easy/Med/Hard by heuristic: Easy=deposit-only categories like Risk Curators/Lending/CDP; Hard=Dexs/Perps needing volume), and a "farm →" button opening the detail.
4. **Detail drawer** (right slide-in, ~420px): protocol name, slug, star if watchlist; stat grid (TVL, rank by TVL among watchlist, 7d change, listed_at age, chains, category); implied-value breakdown (base = TVL×0.25, growth mult, maturity mult, final); **farm plan**: numbered steps each with text + cost + time chips; a "why it matters" 2-line note per category; close button + prev/next protocol keys.
5. **Model footnote**: collapsible panel stating radar-1 formula and constants.
6. Empty state + responsive ≥1280px.

Farm plans must be genuinely useful per category (the judge reads them): e.g. Risk Curators → "Deposit into the curator's flagship vault on its home chain; hold ≥30d; watch for points program announcements" with cost "gas + deposit" and time "weeks"; Dexs → swap volume + LP position; RWA → waitlist/KYC + deposit; CDP → mint stablecoin against collateral; Derivatives → testnet → mainnet volume; Bridge-adjacent → transfers. Give each row a plan array of 3-6 steps (the model already emits plans — extend/improve lib/model.ts plan generation per category if needed, keep boardIssue() gate passing).

## Also required

1. **main.ts**: accept env DOSSIER_DIR like other entries AND keep behavior identical otherwise. Add a `--quick` flag that skips nothing but prints less (or any small real change — requirement is the file must contain lines the agent authored, not just the starter).
2. Keep `lib/model.ts` gate-compatible: board 100–4000 rows, watchlist all covered, farm steps 3-12 items of 20-600 chars, implied ≤1e14. After changes run the program and confirm no gate refusal.
3. **README.md**: title "Token Radar", one-paragraph description, run instructions (`node main.ts`, MAKEFUN_OUTPUT_DIR), the implied-value model summary, and this exact block at the end:

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/verrysimatupang99/makefun-tokenradar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/verrysimatupang99/makefun-tokenradar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

4. **Delete the starter screenshots** (screenshots/*.png) — new ones get captured after the dashboard is live. Leave screenshots/ dir empty or remove it.
5. Delete _brief1.md when done (it's instructions, not part of the entry).
6. Verify: run the program, then open out/dashboard/index.html + out/data.js and confirm the page renders the board (do a quick sanity check of the generated data).

Work efficiently: this is one focused build session. When done, report what you changed.
