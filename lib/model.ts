// The token radar's model, version radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// pre-token protocol below the floor that passes the same launch test the watchlist itself states:
// not a wrapped, staked or bridged product of a token that already trades, not an exchange product,
// not a versioned pool of another protocol. The snapshot's live-token protocols are kept apart and
// shown as the market's own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures. The one change from the house model
// (radar-1, a flat 0.25 x TVL for every protocol) is where the base multiple comes from: the market
// itself. Every live-token protocol in the same snapshot prices its token against its TVL, so each
// category's base multiple is the median market-cap/TVL of that category's own live protocols,
// shrunk toward the global median by the peer count, and clamped:
//
//   multiple(cat) = clamp( (n x median_cat + K x median_global) / (n + K), 0.04, 2.5 )   (n >= 3 peers)
//   multiple      = median_global                                                        (fewer peers)
//   growth        = clamp(change_7d, -60, 120) per cent
//   growthMult    = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity      = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied       = max(1, round(tvl_usd x multiple(cat) x growthMult x maturity))
//
// On this snapshot the global median is 0.205, close to the house's flat 0.25, but the category
// medians are far apart (Lending 0.13, Dexs 0.34, RWA 0.28): a flat multiple overprices lending
// protocols and underprices exchanges. No protocol name is ever special-cased: the same function
// scores every row, and the dashboard states the calibration table the multiples came from.

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

/** The model's fixed knobs, as the dashboard states them. The multiples are not knobs: they are calibrated from the snapshot at run time. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  shrink_k: number;
  min_peers: number;
  multiple_min: number;
  multiple_max: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  shrink_k: 8,
  min_peers: 3,
  multiple_min: 0.04,
  multiple_max: 2.5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's calibration: how many live peers priced it, their median, and the multiple the board used. */
export interface CategoryCalibration {
  category: string;
  peers: number;
  median_multiple: number;
  used_multiple: number;
}

/** The calibration the multiples came from: the snapshot's own live-token market. */
export interface Calibration {
  global_multiple: number;
  live_peers: number;
  categories: CategoryCalibration[];
}

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

/** One live-token peer in a protocol's category: the market's own pricing, for the detail view. */
export interface PeerRow {
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  multiple: number;
}

/** The dashboard's view of one row: the board row's figures, the multiple behind them, and the farm plan. */
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
  base_usd: number;
  multiple: number;
  peers: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  tier: 'watchlist' | 'early';
  peers_list: PeerRow[];
  farm_steps: string[];
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
  multiple: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  universe_size: number;
  pre_token_size: number;
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

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of another asset. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Categories that are products of another protocol's asset, or an exchange's own shelf. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchanges whose name at the front of a protocol's name marks the exchange's own product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Whether a protocol is one the board may rank: pre-token, and passing the watchlist's own launch
 * test — not a wrapped, staked or bridged product, not an exchange product, not a versioned pool.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The calibration: what the snapshot's own live-token market pays, per unit of TVL, overall and by
 * category. A category's used multiple is its median shrunk toward the global median by its peer
 * count and clamped; a category with too few peers, or none, takes the global median.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const globalMedian = live.length > 0 ? median(live.map((p) => p.mcap_usd! / p.tvl_usd)) : 0.25;
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    if (p.category === null) continue;
    const list = byCategory.get(p.category) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(p.category, list);
  }
  const clampMult = (n: number): number => Math.min(model.multiple_max, Math.max(model.multiple_min, n));
  const categories: CategoryCalibration[] = [...byCategory.entries()]
    .map(([category, ratios]) => {
      const med = median(ratios);
      const used = ratios.length >= model.min_peers ? clampMult((ratios.length * med + model.shrink_k * globalMedian) / (ratios.length + model.shrink_k)) : clampMult(globalMedian);
      return { category, peers: ratios.length, median_multiple: round4(med), used_multiple: round4(used) };
    })
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  return { global_multiple: round4(clampMult(globalMedian)), live_peers: live.length, categories };
}

/** The base multiple one protocol is scored with, and how many live peers stand behind it. */
function multipleFor(p: SnapshotProtocol, calibration: Calibration, model: ModelConstants): { multiple: number; peers: number } {
  if (p.category !== null) {
    const row = calibration.categories.find((c) => c.category === p.category);
    if (row !== undefined && row.peers >= model.min_peers) return { multiple: row.used_multiple, peers: row.peers };
  }
  return { multiple: calibration.global_multiple, peers: 0 };
}

/** The multipliers and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants,
): { implied: number; base: number; multiple: number; peers: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { multiple, peers } = multipleFor(protocol, calibration, model);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, base, multiple, peers, growthPct, growthMult, maturityMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every pre-token protocol below the floor that passes the same launch test the
  // watchlist states, by TVL. Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, calibration, model) }));
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
      base_multiple: s.multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

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

/** The category's two qualifying actions, in the words a farmer can follow: the main position, then a second, different one. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { first: string; second: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('cdp')) {
    return {
      first: `Deposit $${capital} of collateral into ${name} on ${chain} and mint its stablecoin against it, keeping the collateral ratio well above the liquidation line.`,
      second: `Repay part of the minted stablecoin after a week and mint again, so the wallet shows both sides of the CDP over time.`,
    };
  }
  if (c.includes('lend') || c.includes('collateral')) {
    return {
      first: `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open, staying far from any liquidation threshold.`,
      second: `Borrow a small amount against the supply for a few days and repay it, so the wallet is a two-sided user of the market, not a passive deposit.`,
    };
  }
  if (c.includes('dex')) {
    return {
      first: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}; expect impermanent loss if the pair's prices move apart.`,
      second: `Route a small swap through ${name} each week in both directions, so the wallet trades as well as provides.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return {
      first: `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, sized so a liquidation is out of reach.`,
      second: `Close the position after a few days and open one in a second market, so the activity is trading, not a single deposit.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return {
      first: `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares; the vault's curator chooses the strategy, so read its mandate first.`,
      second: `Top the vault position up once more after two weeks, or open a second ${name} vault, so the wallet's activity spans more than one snapshot.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      first: `Mint $${capital} of ${name}'s yield asset on ${chain} through its own app and hold it.`,
      second: `Mint a second, smaller tranche a few weeks later instead of all at once, so the wallet builds the position over time.`,
    };
  }
  if (c.includes('payment')) {
    return {
      first: `Fund a wallet ${name} settles through with $${capital} and make one real payment or channel opening, keeping the receipt.`,
      second: `Use the same wallet for a small payment each week, so the activity is usage, not a single funding.`,
    };
  }
  if (c.includes('stable')) {
    return {
      first: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`,
      second: `Put part of the stable asset to work in ${name}'s own market or pool, so the wallet does more than hold.`,
    };
  }
  if (c.includes('yield')) {
    return {
      first: `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
      second: `Move a small part of the position to a second ${name} strategy after two weeks, so the wallet uses more than one vault.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      first: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy for its full term.`,
      second: `Renew or extend the cover once, so the wallet's history is a continuing policy, not a one-off.`,
    };
  }
  return {
    first: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    second: `Make one further deposit or interaction in ${name}'s app after two weeks, so the wallet's activity spans more than one snapshot.`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names:
 * a fresh wallet, the category's main position, a second qualifying action, a weekly cadence, a hold
 * matched to the protocol's age, and a safe claim check with a farm log.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const { first, second } = actionsFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm with, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: first,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: 'about $2 of gas',
      time: '10 minutes',
    },
    {
      text: `Repeat one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet reads as a regular user.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before withdrawing, check the protocol's own points or rewards page and claim only from a link it publishes; write the wallet, dates and transactions in a farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view: the calibration set's leaders. */
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
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** The top live-token protocols of each category by market cap: the peers a detail view compares against. */
function livePeersByCategory(snapshot: Snapshot): Map<string, PeerRow[]> {
  const byCategory = new Map<string, PeerRow[]>();
  const live = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== null && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));
  for (const p of live) {
    const list = byCategory.get(p.category!) ?? [];
    if (list.length < 3) {
      list.push({ name: p.name, mcap_usd: p.mcap_usd!, tvl_usd: p.tvl_usd, multiple: round4(p.mcap_usd! / p.tvl_usd) });
      byCategory.set(p.category!, list);
    }
  }
  return byCategory;
}

/** A board row's form for data.js, with the calibration behind its multiple and its farm plan. */
export function radarRow(row: BoardRow, snapshot: Snapshot, calibration: Calibration, model: ModelConstants, peersByCategory: Map<string, PeerRow[]>): RadarRow {
  const p = snapshot.protocols.find((x) => x.slug === row.slug)!;
  const { multiple, peers } = multipleFor(p, calibration, model);
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
    base_usd: Math.round(row.tvl_usd * multiple),
    multiple,
    peers,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    tier: snapshot.watchlist.includes(row.slug) ? 'watchlist' : 'early',
    peers_list: row.category !== null ? (peersByCategory.get(row.category) ?? []) : [],
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, calibration, model);
  const peersByCategory = livePeersByCategory(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    universe_size: snapshot.protocols.length,
    pre_token_size: snapshot.protocols.filter(isPreToken).length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot, calibration, model, peersByCategory)),
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
