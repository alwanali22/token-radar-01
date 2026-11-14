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

export interface Snapshot {
  as_of: string;
  watchlist: string[];
  protocols: SnapshotProtocol[];
}

export interface FactorBreakdown {
  tvl: number;
  catMultiple: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  implied: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  watchlist: boolean;
  rank: number;
  implied_value_usd: number;
  cat_multiple: number;
  growth_mult: number;
  maturity_mult: number;
  chain_mult: number;
  farm_steps: string[];
}

export function calculateImpliedValue(p: SnapshotProtocol, asOf: string, catMultiple: number): { value: number, factors: FactorBreakdown } {
  const growth = Math.min(30, Math.max(-30, p.change_7d ?? 0));
  const growthMult = 1 + growth / 100;
  
  const ageDaysVal = ageDays(asOf, p.listed_at);
  const maturityMult = 0.7 + 0.3 * Math.min(ageDaysVal ?? 365, 1095) / 1095;
  
  const chains = p.chains ? p.chains.length : 0;
  const chainMult = 1 + 0.05 * Math.min(Math.max(chains - 1, 0), 4);
  
  const base = p.tvl_usd * catMultiple * 0.75;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
  
  return {
    value: implied,
    factors: {
      tvl: p.tvl_usd,
      catMultiple,
      growthMult,
      maturityMult,
      chainMult,
      implied
    }
  };
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = new Date(`${asOf}T00:00:00Z`).getTime();
  const b = new Date(`${listedAt}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((a - b) / 86400000));
}

export function rankable(p: SnapshotProtocol): boolean {
  const isPreToken =
    p.mcap_usd === null && p.gecko_id === null && p.symbol === null;

  return isPreToken
    && ![
      'Bridge',
      'Canonical Bridge',
      'Liquid Staking',
      'Liquid Restaking',
      'Restaked BTC',
      'CEX',
    ].includes(p.category)
    && !/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)
    && !/\b(wrapped|staked|staking)\b/i.test(p.name)
    && !/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i.test(p.name);
}

export function getCatMultiple(category: string | null, protocols: SnapshotProtocol[]): number {
  const liveProtocols = protocols.filter(p => p.mcap_usd !== null && p.category !== null && p.category === category);
  
  let median: number;
  if (liveProtocols.length < 5) {
    const allLive = protocols.filter(p => p.mcap_usd !== null);
    median = calculateMedian(allLive.map(p => (p.mcap_usd ?? 0) / (p.tvl_usd || 1)));
  } else {
    median = calculateMedian(liveProtocols.map(p => (p.mcap_usd ?? 0) / (p.tvl_usd || 1)));
  }
  
  return Math.min(0.80, Math.max(0.05, median));
}

function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0.205;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function generateFarmSteps(p: SnapshotProtocol, asOf: string): string[] {
  const capital = p.tvl_usd >= 5_000_000_000 ? 250 : p.tvl_usd >= 1_000_000_000 ? 150 : p.tvl_usd >= 100_000_000 ? 100 : 50;
  const age = ageDays(asOf, p.listed_at) ?? 365;
  const hold = age > 1095 ? 60 : age > 500 ? 45 : 30;
  
  const cat = p.category || 'General';
  
  const actions: Record<string, string> = {
    'Lending': 'supply/borrow assets',
    'Dexs': 'provide liquidity',
    'Bridge': 'bridge assets',
    'Liquid Staking': 'stake tokens',
    'Staking Pool': 'stake tokens',
    'Perps': 'open margined position',
    'Prediction Market': 'place prediction',
    'Risk Curators': 'deposit into curator vault',
    'Stablecoin': 'mint stable',
    'Stablecoin Wrapper': 'mint stable',
    'RWA': 'mint tokenised asset',
    'Insurance': 'buy cover',
    'Chain': 'use chain dApps',
    'Payments': 'pay / settle',
    'Governance Incentives': 'vote/delegate',
    'Basis Trading': 'open basis trade',
    'Collateral Markets': 'post collateral',
    'CDP': 'mint against collateral',
    'CeDeFi': 'deposit to CeDeFi vault',
    'Restaking': 'restake',
    'Onchain Capital Allocator': 'deposit to allocator vault',
    'Yield': 'deposit to yield vault'
  };
  
  const action = actions[cat] || `interact with ${cat} protocol`;

  return [
    `Initialize dedicated vault for ${p.name}. Cost: $0. Time: 5 minutes.`,
    `Deposit $${capital} into ${cat} position. Cost: $${capital}. Time: 15 minutes.`,
    `Execute primary action: ${action}. Cost: gas fee. Time: 10 minutes.`,
    `Hold position for ${hold} days to ensure eligibility. Cost: opportunity cost. Time: ${hold} days.`,
    `Confirm status on official dashboard for ${p.slug}. Cost: $0. Time: 5 minutes.`,
    `Securely harvest rewards or withdraw ${p.name}. Cost: gas fee. Time: 5 minutes.`
  ];
}
