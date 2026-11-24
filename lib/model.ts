// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   base       = tvl_usd x BASE_MULTIPLE
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// The constants are the house model's, stated in the dashboard and changeable in the model sandbox. No
// protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-1';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  family: Family;
  why: string;
  plan: FarmStep[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The farm families the plans are written for: one per way a protocol rewards its users. */
export type Family = 'curator' | 'lending' | 'cdp' | 'dex' | 'perps' | 'rwa' | 'staking' | 'bridge' | 'yield' | 'stable' | 'prediction' | 'insurance' | 'chain' | 'other';

/** The family a category belongs to; matching is on the category string only, never on a name. */
export function familyOf(category: string | null): Family {
  const c = (category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator')) return 'curator';
  if (c.includes('cdp') || c.includes('collateral')) return 'cdp';
  if (c.includes('lend')) return 'lending';
  if (c.includes('perp') || c.includes('derivative') || c.includes('options')) return 'perps';
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('amm')) return 'dex';
  if (c.includes('rwa') || c.includes('cedefi') || c.includes('payments') || c.includes('card')) return 'rwa';
  if (c.includes('staking') || c.includes('restak')) return 'staking';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('basis') || c.includes('yield') || c.includes('farm') || c.includes('index') || c.includes('anchor') || c.includes('btc')) return 'yield';
  if (c.includes('stable')) return 'stable';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('chain') || c.includes('governance')) return 'chain';
  return 'other';
}

/** Two lines on why the family matters to a farmer: where the points come from and what to watch. */
export function whyFor(p: SnapshotProtocol): string {
  switch (familyOf(p.category)) {
    case 'curator': return 'Curators earn fees on the vaults they run, so a token usually rewards early depositors by share-time held. TVL in the flagship vault is the number they will snapshot.';
    case 'lending': return 'Lending markets reward both sides, so supplied and borrowed balances both count. Airdrops here usually weight time in the market, not trade count.';
    case 'cdp': return 'Minting the protocol stablecoin is the action the team wants to grow. Debt outstanding and stablecoin held in its savings module are the usual point inputs.';
    case 'dex': return 'Exchanges reward volume and in-range liquidity. Many sybil filters look at trade count and size spread, so a few real swaps beat hundreds of dust trades.';
    case 'perps': return 'Derivatives venues pay for traded volume and open interest. Early seasons are thin, so small accounts often rank high per dollar traded.';
    case 'rwa': return 'RWA issuers gate by KYC and region, which thins the farmer crowd. Holding the yield-bearing asset over several snapshots is the cleanest qualifier.';
    case 'staking': return 'Liquid staking receipts only count if you hold them, so the airdrop follows the receipt token balance and any DeFi use of it on partner venues.';
    case 'bridge': return 'Bridges reward unique routes and repeat transfers over months. One-way dust transfers are filtered; use the funds in the destination app too.';
    case 'yield': return 'Yield and basis vaults reward deposit size and duration. The vault share token is the receipt, so keep it in the wallet you farmed with.';
    case 'stable': return 'Stablecoin issuers reward minting, holding and use in partner venues. The holding period of the stable asset is typically the weighted input.';
    case 'prediction': return 'Prediction markets reward active markets traded and volume. Resolved positions across several markets look more human than one big bet.';
    case 'insurance': return 'Cover protocols are thin on users, so each buyer is a larger share of the pool. Active policies at snapshot time are the likely input.';
    case 'chain': return 'Chain-level programs reward activity across its apps. Spread small actions over several native apps rather than one.';
    default: return 'No clear points program is known for this category. Treat the plan as a low-cost position and watch the official channels before adding size.';
  }
}

/** The family's own steps, between the shared wallet step and the shared hold and claim steps. */
function familySteps(p: SnapshotProtocol, capital: number, chain: string): FarmStep[] {
  const n = p.name;
  const gas = capital >= 150 ? 8 : 4;
  switch (familyOf(p.category)) {
    case 'curator':
      return [
        { text: `Open ${n}'s app on ${chain} and pick its flagship vault, the one with the most deposits and a stablecoin base asset. Check the vault's curator and allocation page first.`, cost: `gas ($${gas}) + $${capital} deposit`, time: '20 minutes' },
        { text: `Deposit $${capital} of the base asset and keep the vault shares in the same wallet. Do not unwrap or move them between wallets.`, cost: `$${capital} deposit`, time: '10 minutes' },
        { text: `Add a second, smaller deposit into a different vault from ${n} so the wallet shows more than one position.`, cost: `$${Math.round(capital / 2)} + gas`, time: 'week 2' },
      ];
    case 'lending':
      return [
        { text: `Supply $${capital} of USDC to ${n} on ${chain} and enable it as collateral.`, cost: `$${capital} + $${gas} gas`, time: '15 minutes' },
        { text: `Borrow a small amount, around 20% of the collateral value, in another stable asset, so both the supply and the borrow side are recorded. Stay far from liquidation.`, cost: 'interest of a few cents a week', time: '10 minutes' },
        { text: `Repay and re-borrow once a month to log a second round of activity.`, cost: 'about $2 gas', time: 'monthly' },
      ];
    case 'cdp':
      return [
        { text: `Deposit $${capital * 2} of the accepted collateral on ${n} (${chain}) and check the collateral ratio before minting.`, cost: `$${capital * 2} collateral + $${gas} gas`, time: '20 minutes' },
        { text: `Mint the protocol stablecoin at no more than 40% of the collateral value, keeping a wide margin over the liquidation ratio.`, cost: 'stability fee, a few cents a week', time: '10 minutes' },
        { text: `Park the minted stablecoin in the protocol's savings or staking module if it has one, since that balance is often what is counted.`, cost: 'gas', time: '10 minutes' },
      ];
    case 'dex':
      return [
        { text: `Swap $${capital} between two major assets on ${n} (${chain}) a few times across different days. Vary the size a little.`, cost: `about 0.3% fee per swap + gas`, time: '15 minutes a session' },
        { text: `Open a liquidity position of $${capital} in the highest-volume pool, a stable pair first to limit impermanent loss, and keep it in range.`, cost: `$${capital} + $${gas} gas`, time: '15 minutes' },
        { text: `Check the position every week and rebalance only if it drifts out of range.`, cost: 'gas', time: '5 minutes a week' },
      ];
    case 'perps':
      return [
        { text: `If ${n} runs a testnet or a points beta, use it first and note which actions are scored. Then go to mainnet on ${chain}.`, cost: 'free on testnet', time: '1 hour' },
        { text: `Deposit $${capital} of margin and trade at low leverage (2x or less). Aim for a few trades a week on liquid markets.`, cost: `$${capital} margin + fees`, time: '20 minutes a session' },
        { text: `Open one hedged pair (long and short) to build volume with little price risk, and close it the same day.`, cost: 'trading fees, about 0.1% of volume', time: '10 minutes a week' },
      ];
    case 'rwa':
      return [
        { text: `Check ${n}'s site for a waitlist or KYC requirement and your region's eligibility. Join the waitlist with the farming wallet's address if it asks for one.`, cost: 'free', time: '1 day or more to approve' },
        { text: `Complete KYC if required, using your own identity only. Never share a document through a link you were sent.`, cost: 'free, sometimes a fee', time: '1 to 3 days' },
        { text: `Deposit $${capital * 2} or buy the minimum into the yield asset on ${chain} and hold it. Note the minimum and the redemption terms.`, cost: `$${capital * 2} + $${gas} gas`, time: '20 minutes' },
      ];
    case 'staking':
      return [
        { text: `Stake $${capital} of the staking asset through ${n} on ${chain} and receive the liquid receipt token.`, cost: `$${capital} + $${gas} gas`, time: '15 minutes' },
        { text: `Use the receipt on one partner venue, as collateral or in a pool, and keep it there. Check that the partner is listed on ${n}'s own site.`, cost: `gas ($${gas})`, time: '20 minutes' },
        { text: `Keep the receipt token unredeemed through the snapshot window; an unstake can cost the position its time weight.`, cost: 'none while held', time: 'ongoing' },
      ];
    case 'bridge':
      return [
        { text: `Bridge $${capital} of USDC or ETH to ${chain} through ${n}. Do it from a wallet with a few months of history if you can.`, cost: `bridge fee + about $${gas} gas`, time: '10 to 30 minutes' },
        { text: `Use the bridged funds in an app on the destination chain, such as a swap or a deposit, so the transfer is not a dust hop.`, cost: `gas ($${gas})`, time: '15 minutes' },
        { text: `Bridge back in a second transfer a week later, then repeat once a month on a different route.`, cost: 'bridge fee + gas', time: 'monthly' },
      ];
    case 'yield':
      return [
        { text: `Open ${n} on ${chain} and compare its vaults by TVL and strategy. Choose a stable-asset vault with audited contracts.`, cost: 'free', time: '20 minutes' },
        { text: `Deposit $${capital} and keep the share token in the wallet.`, cost: `$${capital} + $${gas} gas`, time: '10 minutes' },
        { text: `Add to the deposit once, a few weeks later. A steady balance with a top-up looks organic.`, cost: `$${Math.round(capital / 2)} + gas`, time: 'week 3' },
      ];
    case 'stable':
      return [
        { text: `Mint or buy $${capital} of ${n}'s stable asset on ${chain}, following its official mint page.`, cost: `$${capital} + $${gas} gas`, time: '15 minutes' },
        { text: `Put the stable asset into its yield or savings module, or the largest pool that lists it.`, cost: `gas ($${gas})`, time: '15 minutes' },
        { text: `Hold it through the snapshot window; do not swap it out and back in.`, cost: 'none', time: 'ongoing' },
      ];
    case 'prediction':
      return [
        { text: `Fund the wallet with $${capital} on ${n} and choose three liquid markets that resolve at different dates.`, cost: `$${capital} + $${gas} gas`, time: '20 minutes' },
        { text: `Place a small position in each market, on both sides across different markets, and trade out of one early.`, cost: 'fees, about 1-2% of volume', time: '15 minutes' },
        { text: `Return weekly to open one new market so the wallet shows steady use.`, cost: 'a few dollars', time: '10 minutes a week' },
      ];
    case 'insurance':
      return [
        { text: `Choose the cover product on ${n} (${chain}) that matches a protocol you already use.`, cost: 'free to browse', time: '10 minutes' },
        { text: `Buy $${capital} of cover for the shortest period that counts and keep the policy token.`, cost: `premium (a few % a year) + gas`, time: '15 minutes' },
        { text: `Renew once before the cover ends so there is more than one active period.`, cost: 'premium + gas', time: 'monthly' },
      ];
    case 'chain':
      return [
        { text: `Bridge $${capital} to ${chain} and use two or three of its native apps rather than one.`, cost: `bridge fee + $${gas} gas`, time: '30 minutes' },
        { text: `Do one swap, one deposit and one governance vote or interaction on the chain, each on a different day.`, cost: 'a few dollars of gas', time: '15 minutes each' },
        { text: `Check the chain's official page for a quest or points program and join it only through that link.`, cost: 'free', time: '10 minutes' },
      ];
    default:
      return [
        { text: `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`, cost: `$${capital} + about $${gas} gas`, time: '15 minutes' },
        { text: `Use one more feature of the app, such as a swap, a vote or a stake, so the wallet shows more than a bare deposit.`, cost: 'a few dollars of gas', time: '15 minutes' },
        { text: `Read ${n}'s official channels for any points program before adding more.`, cost: 'free', time: '10 minutes' },
      ];
  }
}

/**
 * A protocol's farm plan: six to eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    ...familySteps(p, capital, chain),
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Never sign an unknown approval.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    family: familyOf(row.category),
    why: whyFor(row as unknown as SnapshotProtocol),
    plan: farmSteps(row as unknown as SnapshotProtocol, row.age_days),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
