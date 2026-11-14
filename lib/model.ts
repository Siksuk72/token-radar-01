// The token radar's model (radar-3): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// strongest pre-token protocols the watchlist does not name, ranked by implied value — whether they
// sit above or below the watchlist floor. A protocol is pre-token when its index entry records no
// token (no market cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are kept
// apart and shown as the market's own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures — no protocol name is ever special-cased:
//
//   category multiple  a trimmed median of the live-token protocols in the same category, each one's
//                      mcap_usd / tvl_usd, shrunk toward the global median when the category has
//                      few live peers, and capped (see categoryMultiples below)
//   growth multiplier  from change_7d RELATIVE to the category's median 7d change: above-category
//                      growth is rewarded, below-category growth is penalised, clamped
//   tenure multiplier  a hump in age: it rises to a peak at ~2 years of running with no token (the
//                      accumulated launch expectation), then gently declines for very old no-token
//                      protocols, which may never launch at all
//   chain multiplier   a small log-scale boost for protocols live on more chains, capped
//
//   implied_value_usd = tvl_usd x category_multiple x growth_mult x tenure_mult x chain_mult
//
// The constants are the model's, stated in the dashboard and changeable in the model sandbox, which
// re-ranks the board live in the page from the same arithmetic. The dashboard's app.js carries the
// same four multipliers, so the page's code and the board's data are visibly the same model.

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
  /** Shrinkage strength: a category with n live peers keeps weight n / (n + shrink_k) on its own median. */
  shrink_k: number;
  /** The highest category multiple the model will use: thin-sample medians above this are artefacts. */
  multiple_cap: number;
  /** Weight of the relative-growth term (0..1). */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  growth_mult_floor: number;
  growth_mult_cap: number;
  /** Tenure hump: floor at listing, peak at tenure_peak_days, then a gentle decline. */
  tenure_floor: number;
  tenure_peak: number;
  tenure_peak_days: number;
  tenure_decline: number;
  tenure_decline_days: number;
  unknown_age_days: number;
  /** Chain-diversity weight; the boost caps at ln(16) chains. */
  chain_weight: number;
  chain_cap_ln: number;
}

export const MODEL: ModelConstants = {
  // Shrinkage k=5: a category with a single live peer keeps only 1/6 weight on that peer's
  // median and 5/6 on the global median. With thin categories (n=1) this is the honest
  // choice — one peer must not set the price of the whole board. It lands Risk Curators at
  // 0.674x, Veda back to rank 6, and the top implied value at $2.30B instead of $3.09B.
  shrink_k: 5,
  multiple_cap: 3,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  growth_mult_floor: 0.5,
  growth_mult_cap: 1.6,
  tenure_floor: 0.85,
  tenure_peak: 1.2,
  tenure_peak_days: 730,
  tenure_decline: 0.2,
  tenure_decline_days: 1120,
  unknown_age_days: 365,
  chain_weight: 0.1,
  chain_cap_ln: 2.772588722239781, // ln(16)
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by implied value. */
export const EARLY_ROWS = 158;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many live peers the detail view shows per category. */
export const PEER_ROWS = 5;

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
    category_multiple: number;
    category_peers: number;
    category_range_low: number;
    category_range_high: number;
    growth_pct: number;
    category_growth_pct: number;
    growth_multiplier: number;
    tenure_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan and the model breakdown. */
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
  category_multiple: number;
  category_peers: number;
  category_range_low: number;
  category_range_high: number;
  growth_multiplier: number;
  tenure_multiplier: number;
  chain_multiplier: number;
  farm_steps: string[];
}

/** One live-token peer a category multiple is built from. */
export interface PeerRow {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

/** One category's multiple, with the numbers behind it, for the model section and the detail view. */
export interface CategoryMultiple {
  category: string;
  peers: number;
  median: number;
  trimmed_median: number;
  multiple: number;
  capped: boolean;
  /** The lowest and highest live-peer multiple in the category: the range the median came from. */
  range_low: number;
  range_high: number;
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

/** Everything the dashboard needs: the board, the live set, the multiples and the model it runs. */
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
  global_multiple: number;
  categories: CategoryMultiple[];
  peers: Record<string, PeerRow[]>;
  growth_medians: { global: number; by: Record<string, number> };
  watchlist: string[];
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

/** The median of a sorted array (already sorted ascending); the plain median of an empty array is 0. */
function medianSorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The categories the house's watchlist rule keeps out: wrapped, staked or bridged products of a token that already trades, and exchanges. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name carrying a whole word wrapped, staked or staking is a product of a token that trades. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/** A name beginning with an exchange's name is the exchange's own product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a protocol is one the board may rank: pre-token, and passing the same exclusion rule the
 * house's watchlist uses — no wrapped, staked or bridged product, no exchange, no versioned pool.
 * The rule matters because the early radar is not floored: it ranks the strongest pre-token
 * protocols whether they sit above or below the watchlist floor, and the wrapped products above the
 * floor (WBTC, Binance staked ETH, USDT0) are products of tokens that already trade, not launches.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The category comparables: for every category, the live-token protocols' mcap/TVL multiples.
 * Each category's multiple is a trimmed median (the middle half of its peers, dropping the top and
 * bottom quartiles, so one 400x or 0.002x peer cannot drag it), shrunk toward the global median by
 * peer count — weight n / (n + shrink_k) on the category's own median — and capped at multiple_cap.
 * The cap is 3.00x: high enough that a genuinely dear category (Prediction Market, whose one live
 * peer trades at 400x its TVL) still prices far above a cheap one (Liquid Staking at 0.04x), but
 * low enough that no single peer's extreme ratio becomes the multiple. A category with no live
 * peers, or a null category, takes the global median.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; byCategory: Map<string, CategoryMultiple>; peers: Map<string, PeerRow[]> } {
  const byCat = new Map<string, number[]>();
  const peerList = new Map<string, PeerRow[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.tvl_usd <= 0 || p.mcap_usd === null || p.mcap_usd <= 0) continue;
    const mult = p.mcap_usd / p.tvl_usd;
    all.push(mult);
    const cat = p.category ?? 'Uncategorized';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(mult);
    if (!peerList.has(cat)) peerList.set(cat, []);
    peerList.get(cat)!.push({ slug: p.slug, name: p.name, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, multiple: round4(mult) });
  }
  const global = medianSorted([...all].sort((a, b) => a - b));
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [cat, mults] of byCat) {
    const sorted = [...mults].sort((a, b) => a - b);
    const n = sorted.length;
    const lo = Math.floor(n / 4);
    const hi = n - Math.floor(n / 4);
    const trimmed = medianSorted(sorted.slice(lo, hi > lo ? hi : n));
    const weight = n / (n + model.shrink_k);
    const shrunk = weight * trimmed + (1 - weight) * global;
    const capped = shrunk > model.multiple_cap;
    byCategory.set(cat, {
      category: cat,
      peers: n,
      median: round4(medianSorted(sorted)),
      trimmed_median: round4(trimmed),
      multiple: round4(capped ? model.multiple_cap : shrunk),
      capped,
      range_low: round4(sorted[0]!),
      range_high: round4(sorted[n - 1]!),
    });
  }
  const peers = new Map<string, PeerRow[]>();
  for (const [cat, list] of peerList) {
    peers.set(
      cat,
      [...list].sort((a, b) => b.mcap_usd - a.mcap_usd).slice(0, PEER_ROWS),
    );
  }
  return { global, byCategory, peers };
}

/** The median 7d change of a category's protocols (live and pre-token alike), else the global median. */
export function categoryGrowthMedians(snapshot: Snapshot): { global: number; byCategory: Map<string, number> } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.change_7d === null || !Number.isFinite(p.change_7d)) continue;
    all.push(p.change_7d);
    const cat = p.category ?? 'Uncategorized';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(p.change_7d);
  }
  const global = medianSorted([...all].sort((a, b) => a - b));
  const byCategory = new Map<string, number>();
  for (const [cat, vals] of byCat) byCategory.set(cat, medianSorted([...vals].sort((a, b) => a - b)));
  return { global, byCategory };
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: { global: number; byCategory: Map<string, CategoryMultiple> },
  growthMedians: { global: number; byCategory: Map<string, number> },
): {
  implied: number;
  categoryMultiple: number;
  categoryPeers: number;
  categoryRangeLow: number;
  categoryRangeHigh: number;
  growthPct: number;
  categoryGrowthPct: number;
  growthMult: number;
  tenureMult: number;
  chainMult: number;
  age: number | null;
} {
  const cat = protocol.category ?? 'Uncategorized';
  const entry = multiples.byCategory.get(cat);
  const categoryMultiple = entry !== undefined ? entry.multiple : multiples.global;
  const categoryPeers = entry !== undefined ? entry.peers : 0;
  const categoryRangeLow = entry !== undefined ? entry.range_low : 0;
  const categoryRangeHigh = entry !== undefined ? entry.range_high : 0;
  const catGrowth = growthMedians.byCategory.get(cat) ?? growthMedians.global;
  const rawGrowth = finite(protocol.change_7d, catGrowth);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const rel = growthPct - catGrowth;
  const growthMult = Math.min(model.growth_mult_cap, Math.max(model.growth_mult_floor, 1 + (rel / 100) * model.growth_weight));
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const rise = Math.min(ageForModel, model.tenure_peak_days) / model.tenure_peak_days;
  const fall = Math.max(0, ageForModel - model.tenure_peak_days) / model.tenure_decline_days;
  const tenureMult = Math.max(
    model.tenure_floor,
    model.tenure_floor + (model.tenure_peak - model.tenure_floor) * rise - model.tenure_decline * Math.min(fall, 1),
  );
  const nChains = Math.max(1, protocol.chains.length);
  const chainMult = 1 + model.chain_weight * (Math.min(Math.log(nChains), model.chain_cap_ln) / model.chain_cap_ln);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * tenureMult * chainMult));
  return { implied, categoryMultiple, categoryPeers, categoryRangeLow, categoryRangeHigh, growthPct, categoryGrowthPct: round4(catGrowth), growthMult, tenureMult, chainMult, age };
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

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and hold the position.`;
  if (c.includes('chain')) return `Use $${capital} of ${name}'s app on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, category-specific action: the repeatable step that keeps the farm active. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const half = Math.max(25, Math.floor(capital / 2));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${half} of USDC against the supplied collateral on ${name} and repay it within a week, so the position shows both sides.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $${half} through ${name}'s main pool on ${chain} once a week, in and out, to register trading activity.`;
  if (c.includes('bridge')) return `Bridge $${half} back and forth through ${name} once a week, keeping the route active.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the rewards ${name} pays out, so the stake compounds and the wallet stays active.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close and reopen the hedge on ${name} once a week with the same $${half} of margin.`;
  if (c.includes('prediction')) return `Place one more market position of $${half} on ${name} each week.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${half} more into a second ${name} vault on ${chain} to widen the footprint.`;
  if (c.includes('stable')) return `Hold the minted stable asset in ${name} for a full week before moving it, so the mint counts as held.`;
  if (c.includes('rwa')) return `Reinvest the yield ${name} pays into the same asset, so the balance grows each week.`;
  if (c.includes('insurance')) return `Renew the cover before it lapses and keep the policy live through the snapshot window.`;
  if (c.includes('basis')) return `Top the basis position up by $${half} once, so the vault sees a second deposit.`;
  if (c.includes('chain')) return `Repeat the same action on ${name} once a week from the same wallet.`;
  return `Make a second deposit of $${half} into ${name} on ${chain} a week after the first, so the wallet shows repeat activity.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Every step carries a concrete cost in dollars and a concrete time in minutes or days.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `about $${capital >= 150 ? 8 : 4} of gas`,
      time: '10 minutes a week',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
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

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const multiples = categoryMultiples(snapshot, model);
  const growthMedians = categoryGrowthMedians(snapshot);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: the strongest pre-token protocols the watchlist does not name, ranked by
  // implied value, capped. The watchlist is a floor, never a ceiling, so the early rows are not
  // floored either: a pre-token protocol above the floor that the watchlist rule leaves out (a
  // launch the house's rule did not keep, not a wrapped product) ranks here on its own figures.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model, multiples, growthMedians) }))
    .sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, multiples, growthMedians);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: round4(s.v.categoryMultiple),
      category_peers: s.v.categoryPeers,
      category_range_low: round4(s.v.categoryRangeLow),
      category_range_high: round4(s.v.categoryRangeHigh),
      growth_pct: round4(s.v.growthPct),
      category_growth_pct: s.v.categoryGrowthPct,
      growth_multiplier: round4(s.v.growthMult),
      tenure_multiplier: round4(s.v.tenureMult),
      chain_multiplier: round4(s.v.chainMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A board row's compact form for data.js, with the farm plan and the model breakdown. */
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
    category_multiple: row.model.category_multiple,
    category_peers: row.model.category_peers,
    category_range_low: row.model.category_range_low,
    category_range_high: row.model.category_range_high,
    growth_multiplier: row.model.growth_multiplier,
    tenure_multiplier: row.model.tenure_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const multiples = categoryMultiples(snapshot, model);
  const growthMedians = categoryGrowthMedians(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const categories = [...multiples.byCategory.values()].sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const peers: Record<string, PeerRow[]> = {};
  for (const [cat, list] of multiples.peers) peers[cat] = list;
  const growthBy: Record<string, number> = {};
  for (const [cat, v] of growthMedians.byCategory) growthBy[cat] = round4(v);
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
    global_multiple: round4(multiples.global),
    categories,
    peers,
    growth_medians: { global: round4(growthMedians.global), by: growthBy },
    watchlist: [...snapshot.watchlist],
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
