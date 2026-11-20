# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Elies87/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Elies87/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads the sealed DefiLlama snapshot of 758 protocols, finds the ones that record no token and are not a wrapped, staked or bridged product of one that trades, and ranks them by what their launch would plausibly be worth. Its model (radar-2) prices each protocol with the market's own evidence — the median market-cap/TVL of the live-token protocols in the same category in the same snapshot, shrunk toward the global median — then applies growth and maturity factors. The dashboard it writes shows the ranked board, a detail view per protocol with the model's arithmetic and live peers, a concrete farm plan for every protocol, and the live-token set the multiples were calibrated from.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. In the grader the snapshot is mounted at `/input`, so plain `node main.ts` is enough there. Open `out/dashboard/index.html` (served next to `out/data.js`) to read the board.

---

<sub>Entered on [make.fun](https://make.fun/?ref=m1n9qjem&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
