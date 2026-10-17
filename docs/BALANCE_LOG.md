# Balance log

Every applied balance change, with the evidence. Experiment JSONs live in `docs/reports/balance/` (T01-T25: 123L without bond rules; B01-B15: this cycle). Marks follow the TARGET_* globals: expert win 45-55%, median rounds 9-11, rounds 8-12 over half, round 12 15-30%, grafts/win 1.5-3, Appraisal 30-60%, Unpriced 20-40%, novice 20-30%, seed rejection at most 15%. Quick noise: about plus or minus 2.2 points on a 2000-game win rate.

## 2026-10-16 · Collector tuning for the owner's package (123L + Split, Symbiosis, bond action)

Package (fixed by the owner): `SICKNESS_MODE=monstersOnly`, `FLAGS.LANES`, ring A, Collector reposition `laneAware`, `FLAGS.SPLIT`, `FLAGS.SYMBIOSIS`, `FLAGS.BOND_ACTION`. Start point: `BOND_GRAFT_MAX_HAND_MATERIALS=2` (h2).

Quick settings unless noted: `sim quick --games 2000 --seed-dates 10 --from 2026-10-16 --bots expert,greedy,novice --workers 10` with the package as `--set`/`--ring`/`--collector-reposition` overrides (the bond-matrix settings).

### Earlier runs (T01-T25, 123L without bond rules)

Collector life is the main strength lever (25 to 30 / 35 / 40: expert 65.9 to 55.8 / 46.8 / 39.1), and longer games raise Unpriced (19 / 24 / 27%) and rounds 8-12 (19 / 25 / 32%). Raising both lives (C40-50, P40-50) reaches median 8-10 and rounds 8-12 above half, but only by making games about twice as long. Player life, element bonus, Appraisal Power 6, Collector trades, mood thresholds and bot noise each move the expert by 3 points or less, or only together with life. Appraisal success sat at 30-44% in every T cell: without Split it was never the problem.

### Iteration 1: the Appraisal threshold

- Hypothesis: Appraisal fails (13%) because Split parts and Symbiosis hosts are base monsters, and base monsters are Power 2-7 (only 2 of 25 reach 7). A lower `APPRAISAL_MIN_POWER` makes them targets again and so lifts Unpriced, which needs a successful Appraisal. Moving the Appraisal rounds earlier could also catch more of the round-5 games.
- Runs (2000 per bot, dates 2026-10-16..25):

| Cell | Expert | Greedy | Novice | Median | 8-12 | Rd 12 | Appraisal | Unpriced | Grafts/win |
|---|---|---|---|---|---|---|---|---|---|
| h2 (start, bond matrix) | 54.4 | 31.9 | 0.4 | 5 | 16.9 | 1.6 | 13.4 | 7.8 | 1.64 |
| B01 AMP 6 | 45.5 | 25.2 | 0.2 | 5 | 17.2 | 1.9 | 35.0 | 19.4 | 1.75 |
| B02 AMP 5 | 40.1 | 22.8 | 0.2 | 5 | 17.0 | 1.7 | 51.9 | 26.4 | 1.84 |
| B03 rounds [2,4,6] | 48.7 | 21.8 | 0.7 | 6 | 21.4 | 2.5 | 10.8 | 9.6 | 1.67 |
| B04 rounds [3,5,7] | 48.1 | 29.7 | 0.7 | 5 | 16.0 | 1.4 | 12.5 | 9.2 | 1.58 |

- Result: the threshold is the lever (13 to 35 to 52%); the rounds are not. A lower threshold also costs the expert 9-14 points, so strength must come back from somewhere.

### Iteration 2: give the expert its strength back

- Hypothesis: the hand-material limit (h2) was there only to pull the expert down from 63%. With Appraisal now taking monsters, the limit can go (3 = no limit, today's default), or Player life can rise.

| Cell | Expert | Greedy | Novice | Median | 8-12 | Rd 12 | Appraisal | Unpriced | Grafts/win |
|---|---|---|---|---|---|---|---|---|---|
| B05 AMP 6, hand 3 | 55.4 | 30.5 | 0.3 | 5 | 16.2 | 1.8 | 34.7 | 18.3 | 1.99 |
| **B06 AMP 5, hand 3** | **50.6** | 27.3 | 0.4 | 5 | 16.2 | 1.6 | **50.3** | **25.4** | **2.01** |
| B07 AMP 6, h2, P22 | 47.6 | 25.9 | 0.2 | 6 | 20.7 | 2.1 | 34.3 | 19.6 | 1.79 |
| B08 AMP 6, h2, P24 | 49.1 | 27.3 | 0.2 | 6 | 24.6 | 2.9 | 33.8 | 20.5 | 1.82 |
| B09 AMP 5, h2, P24 | 43.9 | 24.8 | 0.2 | 6 | 24.8 | 3.0 | 49.4 | 27.6 | 1.90 |
| B10 AMP 6, h2, C23 | 48.6 | 30.6 | 0.3 | 5 | 14.8 | 1.0 | 35.2 | 18.6 | 1.66 |

- Result: B06 is centred on expert win, Appraisal and Unpriced with one value change (the hand limit stays at its default). B08 also passes, but needs three changes and leaves Unpriced on the edge.

### Iteration 3: confirm on new dates and a bigger sample

10,000 games per bot, 20 dates from 2026-11-01 (disjoint from the screening dates), `--seed-check` on those dates:

| Cell | Expert | Greedy | Novice | Median | 8-12 | Rd 12 | Appraisal | Unpriced | Grafts/win | Seed reject |
|---|---|---|---|---|---|---|---|---|---|---|
| B13 h2 (start) | 54.1 | 30.7 | 0.6 | 5 | 17.3 | 1.7 | 13.8 | 8.0 | 1.67 | not run |
| **B11 AMP 5, hand 3** | **50.6** | 27.7 | 0.3 | 5 | 16.4 | 1.7 | **50.7** | **23.7** | **2.00** | 81% |
| B12 AMP 6, h2, P24 | 48.9 | 27.5 | 0.5 | 6 | 24.8 | 2.7 | 32.7 | 20.1 | 1.78 | 79% |

Winner: B11/B06, applied below.

### Applied change and final evidence

Change: `APPRAISAL_MIN_POWER` 7 to 5, on top of the package. `BOND_GRAFT_MAX_HAND_MATERIALS` stays 3 (the h2 start point is not shipped).

Default equivalence: after the edit, a no-override quick on the B06 settings reproduces B06's results exactly when `CONTENT_VERSION=0.1.0` is set; the version bump to 0.2.0 only changes the seed strings.

Final full run on the new defaults, no overrides: `sim full --workers 10 --from 2026-10-16` (50,000 games per bot, 60 dates; expert and novice only), JSON `docs/reports/balance/B14-full-shipped.json`. Greedy is from the no-override verification quick (B15, 2000 games, dates 2026-10-16..25).

| Run | Expert | Greedy | Novice | Median | 8-12 | Rd 12 | Appraisal | Unpriced | Grafts/win | Seed reject | Fallback dates |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Old live defaults (full-2026-10-16) | 47.2 pass | 6.5 | 0.1 fail | 6 fail | 17.7 fail | 1.6 fail | 43.1 pass | 24.2 pass | 2.67 pass | 87.6% fail | 4 |
| Package + h2 (bond matrix full) | 53.4 pass | 31.9 (quick) | 0.6 fail | 5 fail | 17.5 fail | 1.7 fail | 13.2 fail | 7.5 fail | 1.65 pass | 80.2% fail | 1 |
| **Shipped (B14 full)** | **51.4 pass** | **28.3 (B15)** | 0.3 fail | 5 fail | 15.9 fail | 1.5 fail | **49.7 pass** | **23.0 pass** | **2.00 pass** | 73.7% fail | 1 |

Real-time length: expert games average 40.5 actions and 5.54 rounds, against 41.8 and 5.76 for package + h2, so games are not longer. Expert median win round 5; sealed Vault ends 0.9% of expert games.

Still failing:
- Median rounds, rounds 8-12 and round 12: R1 (sickness) shortens games, and no non-owner lever restores length without much longer games (T09-T25 show that only both lives at 40-50 reach the round targets). This conflicts with the owner's wish for a faster pace; not chased.
- Novice 0.3%: known unreachable with a uniform-random novice (D-117); no tuning lever moves it above 1%.
- Seed rejection 74%: below every earlier cell (80-93%) but far above 15%; the per-date spread of expert-noisy win rates is too wide for the 30-70% window. Not a value lever in this cycle.

### Shipped 2026-10-16 flip

Every changed default (packages/content):

| Where | Name | Old | New |
|---|---|---|---|
| globals.ts | `CONTENT_VERSION` | 0.1.0 | 0.2.0 |
| globals.ts | `SICKNESS_MODE` | classic | monstersOnly |
| globals.ts | `FLAGS.LANES` | false | true |
| globals.ts | `FLAGS.SPLIT` | false | true |
| globals.ts | `FLAGS.SYMBIOSIS` | false | true |
| globals.ts | `FLAGS.BOND_ACTION` | false | true |
| globals.ts | `APPRAISAL_MIN_POWER` | 7 | 5 |
| elements.json | `beats` (ring A) | ember>gale, gale>tide, tide>ember, lumen>umbra, umbra>lumen | ember>gale, gale>tide, tide>lumen, lumen>umbra, umbra>ember |
| collector.json | `ai.reposition` | toAttackIfUsable | laneAware |

Unchanged on purpose: `BOND_GRAFT_MAX_HAND_MATERIALS` 3 (no limit), `COLLECTOR_LIFE` 25, `PLAYER_LIFE` 20, `APPRAISAL_ROUNDS` [3,6,9], `SYMBIOSIS_GUARD_BONUS` 2, `SPLIT_PART_PERM_P` 0, and every owner-only lever.
