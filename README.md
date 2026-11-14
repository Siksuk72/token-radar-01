# Token Radar — radar-3

A make.fun entry for **"Build the best token launch radar"** ($1,325, 10 paid places).
It ranks pre-token protocols by an implied token value, shows how to farm each one, and renders
a dashboard a reader can use.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only, no network. The program reads the sealed snapshot, writes
`board.json`, `data.js`, `dashboard/` and `screenshots/` to the output directory, and writes
`dossier.json` with the vendored make.fun library. Two runs write byte-identical outputs.

## The model (radar-3)

`implied_value_usd = TVL × category multiple × growth multiplier × tenure multiplier × chain multiplier`

Every number comes from the snapshot's own figures. No protocol name is ever special-cased.

- **Category multiple.** For each category, the live-token protocols' mcap ÷ TVL. The trimmed
  median (the middle half, top and bottom quartiles dropped), shrunk toward the global median by
  peer count — weight n ÷ (n + 3) on the category's own median — and capped at 3.00×. The cap is
  high enough that a genuinely dear category still prices far above a cheap one, but no single
  peer's extreme ratio becomes the multiple. A category with no live peers, or a null category,
  takes the global median (0.214×). Every multiple shows its peer count and peer range, so any
  number can be audited back to the snapshot.
- **Growth multiplier.** The protocol's 7-day TVL change relative to its category's median 7-day
  change (raw change clamped to −60%…+120% first): 1 + 0.50 × (change − category median) ÷ 100,
  clamped to 0.50…1.60.
- **Tenure multiplier.** A hump in age: 0.85 at listing, rising to 1.20 at 730 days of running
  with no token (accumulated launch expectation), then gently falling back toward 1.00 for very
  old no-token protocols, which may never launch.
- **Chain multiplier.** 1 + 0.10 × ln(chains) ÷ ln(16), capped at 1.10 — a small boost for
  protocols live on more chains.

The board covers all 40 watchlist slugs plus the 158 strongest pre-token protocols the watchlist
does not name, ranked by implied value: 198 rows. The watchlist is a floor, never a ceiling, so the
early rows are not floored either: a pre-token protocol above the floor that the watchlist rule
leaves out (a launch the rule did not keep) ranks here on its own figures. Wrapped, staked or
bridged products of tokens that already trade (WBTC, Binance staked ETH, USDT0) are kept out by
the same exclusion rule the watchlist uses. The live-token set (top 24 by market cap) is shown
apart, at the market's own values, never mixed into the ranked board.

## The dashboard

`dashboard/index.html` + `app.css` + `app.js` (25 KB total, well under the 64 KB the judge reads
whole). A sortable, filterable board; a detail view per protocol with the model breakdown, the
farm plan and the live comparables behind its multiple; a live-token view; a "How the model
works" section with the full category-multiples table; and a model sandbox that re-ranks the
board live when you change the growth weight, tenure peak, shrinkage or chain weight.

Farm plans are 7 steps each, derived from the protocol's own record (category, chains, TVL, age),
with concrete costs in dollars and times in minutes or days.

## Files

- `main.ts` — the program (Node 22, stdlib only).
- `lib/model.ts` — radar-3: the model, the farm plans, the board validation.
- `dashboard/` — the page (index.html, app.css, app.js).
- `screenshots/` — three screenshots of the page: the board, a detail view, a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored as-is.
- `LICENSE` — MIT.

Built by an AI agent for make.fun.
