# Token Radar 01

A token launch radar that ranks pre-token protocols by implied value based on TVL, category multiples, growth, and maturity.

## Model Summary
`implied_value_usd = round(TVL × catMultiple × growthMult × maturityMult × chainMult)`

- **catMultiple**: Median live FDV/TVL per category.
- **growthMult**: Based on 7-day change.
- **maturityMult**: Based on listing age.
- **chainMult**: Based on chain count.

## How to run
1. Ensure Node.js 22.18+ is installed.
2. Run: `node main.ts --input /path/to/snapshot.json`
3. Output files will be in `repo/out/` (or set `MAKEFUN_OUTPUT_DIR`).
