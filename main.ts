import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateImpliedValue, getCatMultiple, generateFarmSteps, ageDays, rankable } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function run() {
  const inputArg = arg('input', '/input');
  const inputPath = inputArg.endsWith('snapshot.json') ? inputArg : join(inputArg, 'snapshot.json');
  
  const outputBase = arg('output', process.env.MAKEFUN_OUTPUT_DIR || '/output');
  
  if (!existsSync(inputPath)) {
      process.stderr.write(`Error: input not found: ${inputPath}\n`);
      process.exit(2);
  }
  
  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
  const { protocols, watchlist, as_of } = snapshot;
  
  const watchlistProtocols = protocols.filter((p: any) => watchlist.includes(p.slug) && rankable(p));
  const otherRankable = protocols.filter((p: any) => !watchlist.includes(p.slug) && rankable(p));
  const excluded = protocols.filter((p: any) =>
    p.mcap_usd === null && p.gecko_id === null && p.symbol === null && !rankable(p)
  ).length;
  
  const allRows = [...watchlistProtocols, ...otherRankable].map(p => {
    const catMultiple = getCatMultiple(p.category, protocols);
    const { value, factors } = calculateImpliedValue(p, as_of, catMultiple);
    
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(as_of, p.listed_at), 
      watchlist: watchlist.includes(p.slug),
      rank: 0, 
      implied_value_usd: value,
      cat_multiple: catMultiple,
      growth_mult: factors.growthMult,
      maturity_mult: factors.maturityMult,
      chain_mult: factors.chainMult,
      farm_steps: generateFarmSteps(p, as_of),
    };
  })
  .sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug))
  .map((r, i) => ({ ...r, rank: i + 1 }));
    
  // Self-check gates
  if (allRows.length < 100) { process.stderr.write(`Too few rows: ${allRows.length}\n`); process.exit(1); }
  const watchlistSlugs = allRows.filter(r => r.watchlist).map(r => r.slug);
  if (watchlist.length !== 40 || !watchlist.every(s => watchlistSlugs.includes(s))) {
      process.stderr.write(`Missing watchlist items\n`); process.exit(1);
  }
  const ranks = allRows.map(r => r.rank);
  if (ranks.some((r, i) => r !== i + 1)) { process.stderr.write(`Invalid ranks\n`); process.exit(1); }
  for(let i = 0; i < allRows.length - 1; i++) {
      if (allRows[i].implied_value_usd < allRows[i+1].implied_value_usd) {
          process.stderr.write(`Implied value not monotonic\n`); process.exit(1);
      }
  }
  if (allRows.some(r => r.farm_steps.length !== 6 || r.farm_steps.some(s => s.length < 20 || s.length > 600))) {
      process.stderr.write(`Invalid farm steps\n`); process.exit(1);
  }
  const liveProtocols = protocols.filter((p: any) => p.mcap_usd !== null);
  const liveForData = liveProtocols.sort((a, b) => (b.mcap_usd || 0) - (a.mcap_usd || 0)).slice(0, 24);
  if (liveForData.length !== 24) { process.stderr.write(`Live list not 24: ${liveForData.length}\n`); process.exit(1); }
  const slugs = new Set(allRows.map(r => r.slug));
  if (slugs.size !== allRows.length) { process.stderr.write(`Duplicate slugs\n`); process.exit(1); }

  mkdirSync(outputBase, { recursive: true });
  writeFileSync(join(outputBase, 'board.json'), JSON.stringify({ rows: allRows.slice(0, 250) }, null, 2));

  // Write data.js
  writeFileSync(join(outputBase, 'data.js'), `window.RADAR = ${JSON.stringify({ 
    rows: allRows.slice(0, 250), 
    live: liveForData,
    model: { as_of, formula: "TVL * catMultiple * growthMult * maturityMult * chainMult" },
    counts: { total: protocols.length, watchlist: watchlist.length, board: allRows.length, early: otherRankable.length, live: liveForData.length, excluded }
  }, null, 2)};`);

  // Copy dashboard and screenshots
  ['dashboard', 'screenshots'].forEach(dir => {
    const fromDir = join(here, dir);
    const toDir = join(outputBase, dir);
    mkdirSync(toDir, { recursive: true });
    if (existsSync(fromDir)) {
        readdirSync(fromDir).forEach(file => {
            if (file.startsWith('.')) return;
            const filePath = join(fromDir, file);
            if (statSync(filePath).isFile()) {
                copyFileSync(filePath, join(toDir, file));
            }
        });
    }
  });

  // Generate dossier
  writeFileSync(join(outputBase, 'dossier.json'), buildDossier(outputBase, { text_max_bytes: 65536 }));
}

run();
