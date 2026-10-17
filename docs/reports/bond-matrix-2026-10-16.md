# Bond-rules A/B matrix (D-314), 2026-10-16

Engine ff3d71d, AI 73098e6, branch phase-1 plus uncommitted sim plumbing. No default, global or content value was changed; every cell is a command-line override. Per-cell JSON: `docs/reports/bond/<cell>.json` (finals: `full-<cell>.json`); combined summary: `docs/reports/bond-matrix-2026-10-16.json`.

## How the cells were run

- Quick cells: `sim quick --games 2000 --seed-dates 10 --from 2026-10-16 --bots expert,greedy,novice --workers 10 --seed-check`, identical for every cell (same 10 dates as the D-300 matrix; cell 0 and 123L reproduce that report's numbers exactly).
- B = `--set FLAGS.BOND_ACTION=true`, S = `FLAGS.SPLIT`, Y = `FLAGS.SYMBIOSIS`. 123L = `--set SICKNESS_MODE=monstersOnly --set FLAGS.LANES=true --ring A --collector-reposition laneAware`. Variants add `--set BOND_GRAFT_MAX_HAND_MATERIALS=1|2` (h1, h2), `SPLIT_PART_PERM_P=-1` (p-1), `SYMBIOSIS_GUARD_BONUS=1` (g1).
- Finals: `sim full --workers 10 --from 2026-10-16` (50,000 per bot, 60 dates; full runs expert and novice only, so no greedy column) for 123L-BSY and both hand-material variants (h1 and h2 are the two candidates; h1 is nearest on win rate and rounds, h2 keeps grafts per win in band).
- Noise: 95% interval about plus or minus 2.2 points on a quick win rate; differences under 3 points are not reliable. The quick seed-reject figure uses 10 dates and is noisy.
- Marks follow the run's own TARGET_* globals (expert win 45-55%, median 9-11, rounds 8-12 over half, round 12 15-30%, grafts/win 1.5-3, Appraisal 30-60%, Unpriced 20-40%, novice 20-30%, seed rejection at most 15%). Greedy has no target.
- "Bond-turn share" = own turns with a Split, Symbiosis, or (BOND_ACTION only) a Graft start, over own turns. Grafts/splits/symbioses are per finished game for the expert.

## 1. Quick matrix (2000 games per bot)

| Cell | Expert win | Greedy win | Novice win | Median rds | Rds 8-12 | Rd 12 | Appraisal | Unpriced | Grafts/win | Expert grafts / splits / symb per game | Symb. emerged | Bond-turn share | Greedy splits / symb | Seed reject | Duels/s/core |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 46.6% pass | 6.1% | 0.0% fail | 6.0 fail | 16.9% fail | 2.0% fail | 41.5% pass | 24.9% pass | 2.67 pass | 2.49 / 0.00 / 0.00 | 0.00 | 0.0% | 0.00 / 0.00 | 89.3% | 87 |
| B | 50.5% pass | 21.2% | 0.3% fail | 6.0 fail | 15.3% fail | 1.5% fail | 40.1% pass | 22.1% pass | 2.69 pass | 2.47 / 0.00 / 0.00 | 0.00 | 42.5% | 0.00 / 0.00 | 73.7% | 78 |
| S | 49.5% pass | 15.4% | 0.0% fail | 6.0 fail | 17.1% fail | 1.6% fail | 24.2% fail | 15.2% fail | 2.71 pass | 2.53 / 0.58 / 0.00 | 0.00 | 10.2% | 1.10 / 0.00 | 81.1% | 56 |
| Y | 46.4% pass | 11.8% | 0.1% fail | 6.0 fail | 16.7% fail | 1.9% fail | 41.6% pass | 24.9% pass | 2.60 pass | 2.43 / 0.00 / 0.05 | 0.01 | 0.5% | 0.00 / 0.00 | 87.5% | 65 |
| BS | 58.7% fail | 37.5% | 0.1% fail | 5.0 fail | 16.7% fail | 0.8% fail | 22.6% fail | 13.1% fail | 2.72 pass | 2.58 / 0.82 / 0.00 | 0.00 | 59.8% | 1.02 / 0.00 | 71.4% | 82 |
| BY | 52.3% pass | 31.6% | 0.9% fail | 5.0 fail | 15.6% fail | 1.1% fail | 28.5% fail | 15.9% fail | 1.36 fail | 1.14 / 0.00 / 2.20 | 1.27 | 58.0% | 0.00 / 0.73 | 85.9% | 78 |
| SY | 48.9% pass | 14.3% | 0.1% fail | 6.0 fail | 16.7% fail | 1.4% fail | 24.3% fail | 15.2% fail | 2.61 pass | 2.45 / 0.57 / 0.11 | 0.05 | 11.4% | 1.07 / 0.16 | 83.3% | 59 |
| BSY | 55.6% fail | 40.3% | 0.8% fail | 5.0 fail | 16.4% fail | 1.3% fail | 20.2% fail | 11.5% fail | 1.48 fail | 1.26 / 0.34 / 2.23 | 1.28 | 66.5% | 0.94 / 0.80 | 77.8% | 71 |
| 123L | 65.9% fail | 28.7% | 0.0% fail | 5.0 fail | 11.6% fail | 1.8% fail | 33.0% pass | 12.9% fail | 2.47 pass | 2.31 / 0.00 / 0.00 | 0.00 | 0.0% | 0.00 / 0.00 | 93.3% | 67 |
| 123L-BSY | 62.9% fail | 39.0% | 0.4% fail | 5.0 fail | 17.0% fail | 1.6% fail | 14.9% fail | 7.8% fail | 1.97 pass | 1.79 / 0.47 / 1.46 | 1.06 | 66.5% | 1.26 / 0.67 | 70.6% | 37 |
| 123L-BSY-h1 | 49.6% pass | 9.0% | 0.4% fail | 6.0 fail | 19.4% fail | 2.1% fail | 11.2% fail | 7.8% fail | 1.24 fail | 1.15 / 0.37 / 2.62 | 2.00 | 68.8% | 0.63 / 1.93 | 75.0% | 48 |
| 123L-BSY-h2 | 54.4% pass | 31.9% | 0.4% fail | 5.0 fail | 16.9% fail | 1.6% fail | 13.4% fail | 7.8% fail | 1.64 pass | 1.45 / 0.35 / 2.12 | 1.63 | 68.1% | 1.00 / 0.58 | 67.7% | 41 |
| 123L-BSY-p-1 | 62.4% fail | 36.9% | 0.4% fail | 5.0 fail | 15.7% fail | 1.7% fail | 15.0% fail | 7.7% fail | 1.94 pass | 1.76 / 0.39 / 1.44 | 1.04 | 64.7% | 1.07 / 0.64 | 72.2% | 48 |
| 123L-BSY-g1 | 66.5% fail | 38.6% | 0.1% fail | 5.0 fail | 16.6% fail | 1.6% fail | 15.7% fail | 8.0% fail | 2.16 pass | 2.02 / 0.51 / 1.10 | 0.75 | 66.1% | 1.27 / 0.64 | 71.4% | 36 |

Every cell fails median rounds, rounds 8-12, round 12, novice win and seed rejection (the 70-93% quick figures all exceed 15%). Novice never exceeds 0.9%.

## 2. Finals (50,000 per bot, 60 dates)

| Cell | Expert win | Greedy win | Novice win | Median rds | Rds 8-12 | Rd 12 | Appraisal | Unpriced | Grafts/win | Expert grafts / splits / symb per game | Symb. emerged | Bond-turn share | Greedy splits / symb | Seed reject | Duels/s/core |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| full-123L-BSY | 62.8% fail | n/a | 0.6% fail | 5.0 fail | 16.8% fail | 1.7% fail | 14.9% fail | 7.6% fail | 1.93 pass | 1.78 / 0.48 / 1.46 | 1.05 | 66.7% | n/a / n/a | 74.2% | 52 |
| full-123L-BSY-h1 | 49.2% pass | n/a | 0.6% fail | 6.0 fail | 20.7% fail | 2.2% fail | 11.2% fail | 7.1% fail | 1.25 fail | 1.14 / 0.37 / 2.62 | 2.01 | 68.5% | n/a / n/a | 79.5% | 55 |
| full-123L-BSY-h2 | 53.4% pass | n/a | 0.6% fail | 5.0 fail | 17.5% fail | 1.7% fail | 13.2% fail | 7.5% fail | 1.65 pass | 1.44 / 0.34 / 2.16 | 1.67 | 68.6% | n/a / n/a | 80.2% | 57 |

Finals: no crashes, no stuck games, no games past MAX_ROUNDS. D-004 fallback dates: 0 of 60 for 123L-BSY and h1, 1 of 60 for h2. Seed rejection 74-80% (baseline 87.6%, 123L 93% quick). Expert median win round 5-6; vault sealed ends 1% of expert games (21% of novice games).

## 3. For balance-analyst: what moves what

- **BOND_ACTION (B)** alone: expert +4 points (46.6 to 50.5), greedy 6 to 21%, 43% of expert turns use a bond action (all Grafts). Appraisal and Unpriced slip slightly (40%, 22%), round shape unchanged. Seed rejection drops to 74% (noisy).
- **SPLIT (S)** is the Appraisal killer: Appraisal success 41.5 to 24.2% and Unpriced 24.9 to 15.2% (both leave their bands) with expert win +3. The expert splits 0.58 per game (0.82 with B). It does not touch round length.
- **SYMBIOSIS (Y)** alone is almost unused by the expert (0.05 per game) and moves nothing. With B it becomes the main bond (2.2 per game in BY, 1.3 symbiote emerges per game) and crowds out Grafts: grafts per game 2.5 to 1.1, grafts per win 1.36 (fail). Greedy uses Y too (0.7-0.8 per game).
- **BSY** on the old rules: expert 55.6 (out of band), greedy 40, Appraisal 20, Unpriced 11.5, grafts/win 1.48: four extra fails against baseline.
- **123L + BSY** against 123L: expert 65.9 to 62.9, rounds 8-12 11.6 to 17.0, Appraisal 33 to 15, Unpriced 13 to 7.8, grafts/win 2.47 to 1.97. Round 12 and median do not move (1.6%, 5). The bond rules do not fix game length; R1 still shortens it. Speed: 67 to 37 duels/s/core (the biggest slowdown in the matrix).
- **BOND_GRAFT_MAX_HAND_MATERIALS** is the strongest lever on strength: 3 -> 2 -> 1 gives expert 62.9 -> 54.4 -> 49.6 (full run 62.8 / 53.4 / 49.2) and greedy 39 -> 32 -> 9. Fewer hand materials pushes the expert to Symbiosis (1.5 -> 2.1 -> 2.6 per game) and grafts per game fall (1.79 -> 1.45 -> 1.15), so grafts/win fails at 1 (1.25) and passes at 2 (1.65). Rounds 8-12 improves slightly (17.0 -> 16.9 -> 19.4 quick; 17.5 / 20.7 full). Appraisal (11-15%) and Unpriced (7-8%) stay far below band in all three.
- **SPLIT_PART_PERM_P=-1**: expert 62.4 against 62.9, no visible effect at this sample size.
- **SYMBIOSIS_GUARD_BONUS=1**: expert win unchanged (66.5), but symbioses per game drop 1.46 to 1.10 and grafts/win rise to 2.16. Not a strength lever at this sample.
- Open question for the Collector tuning: Appraisal success and Unpriced are the two targets that bond rules break (Split dodges the Appraisal target; Symbiosis shrinks Grafts). Round-length targets stay unreachable by any of these cells.
- Bond mix (expert): Graft is 100% of bond actions in B and 76% in BS (above the 70% note line); Symbiosis is 66% in BY, 58% in BSY, 63% in 123L-BSY-h1, and Graft 48% in 123L-BSY. No combined cell has a single kind above 70%.

## 4. Anomalies

- Performance: bond cells are 1.2-1.8 times slower than the same cell without bond rules (S 56, BS 82 vs 87 baseline; 123L 67 to 37 with BSY; 36-57 across variants) against PERF 1000. Part of this is event collection, now enabled only when SPLIT or SYMBIOSIS is on.
- No crashes, stuck games, impossible values or round-0 endings in any cell. Damage per round 5.4-5.9 for the expert in finals.
- Novice 0.0-0.9%: below the band in every cell.
- Seed rejection 70-93% in every cell; fallback dates 0-1 in finals.

## 5. Plumbing (packages/sim)

- `duel.ts`: counts `split` and `symbiose` actions of the player, bond turns (own turns with a split, symbiose, or graftBegin under BOND_ACTION), and from events `SymbioteEmerged` (side 0) and `Appraised.sym` (symbiote double loss). Events are collected only when FLAGS.SPLIT or FLAGS.SYMBIOSIS is on, so flags-off runs do the same work as before.
- `report.ts`: new bot fields `graftsPerGame`, `splitsPerGame`, `symbiosesPerGame`, `symbioteEmergedPerGame`, `symbioteDoubleLossPerGame`, `bondUseShare` and a "Bond usage" markdown table. Not built (D-314 items skipped): `splitAppraisalDodge`, `splitUnstableEscape`, `handMaterialGrafts`.
- Default-equivalence gate: `sim quick --games 400 --seed-dates 4 --from 2026-11-01 --bots expert,greedy,novice` `results` equals `simG/quick-2026-10-16.json` `results` once the six new bot keys above are removed; every pre-existing field is identical.
- Checks: `npx vitest run` 1455 passed, `npx tsc -b` and `npx eslint packages` clean.

## 6. Draft D-entries (unnumbered)

- **D-xxx · Sim metrics for the bond rules.** Added the six bond metrics above (information only). Events are collected only with SPLIT or SYMBIOSIS on. Skipped: dodge, escape, hand-material graft counts (need per-action state; add on request).
- **D-xxx · Bond matrix result (2026-10-16).** On 123L, BSY keeps every round-length target failing, drops Appraisal to 15% and Unpriced to 8%, and puts the expert at 62.9% (out of band). BOND_GRAFT_MAX_HAND_MATERIALS is the lever that restores the expert band (2: 53-54%, 1: 49-50%); h2 also keeps grafts/win in band. Appraisal and Unpriced remain failing; the Collector tuning (balance-analyst) owns them. No value changed by the sim.
