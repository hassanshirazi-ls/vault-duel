# Balance log

Every applied balance change, with the evidence. Experiment JSONs live in `docs/reports/balance/` (T01-T25: 123L without bond rules; B01-B15: this cycle). Marks follow the TARGET_* globals: expert win 45-55%, median rounds 9-11, rounds 8-12 over half, round 12 15-30%, grafts/win 3.5-5 (1.5-3 before D-370), Levy 30-60%, Hollow Heir 20-40%, novice 20-30%, no date on the fallback seed (BT-8, D-370; the seed rejection rate is informational). Quick noise: about plus or minus 2.2 points on a 2000-game win rate.

## Phase 3 A/B round 3 (2026-10-21)

Measurement only: **no default changed** (players are playtesting the live build). This round tests M-05 and M-11 with the new `--card` flag (D-374) and looks for the cheapest way to get the one failing length target, BT-3 median rounds 9-11, from 8 to 9. Start point: the live package at e774cfc (D-368 to D-370: `PLAYER_LIFE` 24, `MIRROR_SIGIL_PENALTY` 2, `APPRAISAL_MIN_POWER` 8, `COLLECTOR_LIFE` 46, `TARGET_GRAFTS_PER_WIN` [3.5, 5]). Constraints: expert near today's 47.7 (D-364 band 45-55), round 12 at most 30, Levy 30-60, Hollow Heir 20-40, grafts/win 3.5-5, BT-2 not chased.

- Screening: `sim quick --bots expert --games 10000 --seed-dates 30 --from 2026-10-21 --workers 10`, with the same dates and game seeds in every cell (paired). Noise is about plus or minus 1.0 point on a 10,000-game rate.
- Confirm: `--games 20000 --seed-dates 60 --from 2026-10-21 --seed-check`. Reports are in `docs/reports/ab-round3-2026-10-21/`. The confirm baseline gives 47.7, today's live figure.
- New columns. "Rds 8 or less" is the share of games over by the end of round 8: the median reads 9 once it drops under 50. "Actions" is engine actions per game, both sides, end turns included. It stands in for real time.
- M-05 is `--card 'the-unpriced.keywords=[]'`. M-11 is `--card bastion-warden.power=7 --card bastion-warden.guard=8`. "Ace later" is round 2's owner-only `collector.json › ai` rule order. `APPRAISAL_ROUNDS=[3,6]` drops the round-9 Levy.

Screening (10,000 games, 30 dates):

| Cell | Expert | Median | Mean rds | Rds 8 or less | 8-12 | Rd 12 | Grafts/win | Levy | Hollow Heir | Actions | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline (live) | 48.2 | 8 | 8.33 | 53.1 | 59.7 | 17.6 | 4.39 | 37.0 | 38.4 | 76.8 | |
| M-05 The Hollow Heir loses Ward | 52.3 | 8 | 8.28 | 54.0 | 58.8 | 17.1 | 4.39 | 37.1 | 38.4 | 76.1 | +4.1 for the player, no target moves |
| M-11 Bastion Warden 7/8 | 49.4 | 8 | 8.31 | 53.8 | 59.2 | 17.1 | 4.38 | 37.2 | 38.4 | 76.7 | +1.2, noise edge, no target moves |
| `PLAYER_LIFE=26` | 49.2 | 8 | 8.49 | 50.8 | 62.0 | 19.5 | 4.40 | 36.7 | 39.1 | 78.2 | Per 2 points: +1.0 expert, -2.3 in rounds 8 or less |
| `PLAYER_LIFE=27` | 49.5 | 9 | 8.56 | 49.6 | 63.0 | 20.4 | 4.40 | 36.6 | 39.2 | 78.8 | Median 9 by 0.4. Too thin |
| `PLAYER_LIFE=28` | 50.1 | 9 | 8.63 | 48.6 | 63.9 | 21.1 | 4.41 | 36.6 | 39.6 | 79.3 | One edit; Hollow Heir near 40. Confirmed |
| `PLAYER_LIFE=30` | 50.6 | 9 | 8.76 | 46.5 | 65.8 | 23.0 | 4.42 | 36.2 | 39.9 | 80.4 | Hollow Heir at the edge |
| `COLLECTOR_LIFE=50` | 43.9 | 9 | 8.61 | 48.6 | 64.0 | 21.0 | 4.51 | 37.9 | 40.8 | 79.5 | Per 4 points: -4.3 expert, -4.5 in rounds 8 or less, +2.4 Hollow Heir |
| `PLAYER_LIFE=26`, `COLLECTOR_LIFE=48` | 47.0 | 9 | 8.65 | 48.3 | 64.4 | 21.5 | 4.46 | 37.0 | 40.3 | 79.7 | Hollow Heir over 40 |
| `PLAYER_LIFE=26`, `COLLECTOR_LIFE=50` | 44.6 | 9 | 8.78 | 46.2 | 66.3 | 23.2 | 4.52 | 37.6 | 41.5 | 80.9 | Expert under 45, Hollow Heir over 40 |
| `PLAYER_LIFE=28`, `COLLECTOR_LIFE=47` | 49.1 | 9 | 8.71 | 47.2 | 65.2 | 22.1 | 4.44 | 36.7 | 40.4 | 80.1 | Hollow Heir over 40 |
| `PLAYER_LIFE=28`, `COLLECTOR_LIFE=48` | 47.7 | 9 | 8.79 | 46.0 | 66.4 | 23.4 | 4.47 | 36.9 | 40.9 | 80.9 | Expert held, Hollow Heir over 40 |
| `PLAYER_LIFE=28`, `COLLECTOR_LIFE=50` | 45.4 | 9 | 8.94 | 43.7 | 68.4 | 25.4 | 4.53 | 37.3 | 41.9 | 82.2 | Hollow Heir over 40 |
| `PLAYER_LIFE=28`, `COLLECTOR_LIFE=52` | 43.0 | 9 | 9.07 | 41.5 | 70.4 | 27.3 | 4.58 | 37.7 | 43.1 | 83.5 | Expert under 45 |
| `PLAYER_LIFE=30`, `COLLECTOR_LIFE=50` | 45.9 | 9 | 9.06 | 41.6 | 70.2 | 27.2 | 4.53 | 37.1 | 42.4 | 83.3 | Hollow Heir over 40 |
| `ELEMENT_BONUS=1` | 45.0 | 9 | 8.57 | 49.7 | 62.6 | 22.1 | 4.44 | 38.5 | 41.4 | 79.0 | -3.2 expert, Hollow Heir over 40 |
| `ELEMENT_BONUS=1`, `PLAYER_LIFE=26` | 45.6 | 9 | 8.73 | 47.5 | 64.7 | 24.1 | 4.45 | 38.2 | 41.9 | 80.3 | Hollow Heir over 40 |
| `ELEMENT_BONUS=1`, `PLAYER_LIFE=28` | 46.2 | 9 | 8.87 | 45.0 | 66.8 | 26.0 | 4.46 | 37.9 | 42.4 | 81.5 | Hollow Heir over 40 |
| `AMBUSH_POWER=1` | 48.2 | 8 | 8.42 | 52.0 | 60.8 | 19.0 | 4.40 | 37.2 | 39.1 | 77.5 | Some length at no expert cost |
| `AMBUSH_POWER=0` | 48.0 | 8 | 8.50 | 50.6 | 61.8 | 20.4 | 4.40 | 37.5 | 39.8 | 78.1 | Length at no expert cost, but 0 removes the Ambush rule |
| `PLAYER_LIFE=26`, `AMBUSH_POWER=1` | 49.0 | 9 | 8.57 | 49.6 | 63.0 | 20.8 | 4.41 | 36.9 | 39.7 | 78.8 | Median 9 by 0.4. Too thin |
| `PLAYER_LIFE=26`, `AMBUSH_POWER=0` | 48.9 | 9 | 8.65 | 48.2 | 63.9 | 22.2 | 4.41 | 37.3 | 40.4 | 79.3 | Hollow Heir over 40 |
| `PLAYER_LIFE=28`, `AMBUSH_POWER=1` | 49.8 | 9 | 8.70 | 47.5 | 64.8 | 22.5 | 4.42 | 36.8 | 40.2 | 79.9 | Hollow Heir over 40 |
| `AMBUSH_POWER=0`, `COLLECTOR_LIFE=48` | 45.9 | 9 | 8.65 | 48.3 | 64.2 | 22.3 | 4.46 | 37.9 | 41.1 | 79.5 | Hollow Heir over 40 |
| `HAND_SIZE=6` | 52.1 | 8 | 8.12 | 56.7 | 56.3 | 15.0 | 4.42 | 40.4 | 44.0 | 76.9 | Shorter and easier. Reject |
| `OPENING_HAND=6`, `HAND_SIZE=6` | 51.6 | 8 | 8.17 | 55.6 | 57.3 | 15.4 | 4.45 | 39.7 | 43.9 | 77.4 | Same. Reject |
| `MOOD_AGITATED_AT=10`, `MOOD_DESPERATE_AT=4` | 47.2 | 8 | 8.40 | 52.1 | 60.9 | 18.8 | 4.41 | 37.2 | 39.0 | 77.5 | A calmer Monarch: -1.0 expert, a little length |
| `MOOD_AGITATED_AT=20`, `MOOD_DESPERATE_AT=10` | 49.2 | 8 | 8.26 | 54.5 | 58.7 | 16.7 | 4.36 | 36.7 | 37.7 | 76.1 | Shorter |
| moods 10/4, `PLAYER_LIFE=26` | 48.0 | 9 | 8.57 | 49.8 | 63.2 | 20.9 | 4.42 | 37.0 | 39.6 | 78.9 | Median 9 by 0.2. Too thin |
| moods 10/4, `PLAYER_LIFE=28` | 48.9 | 9 | 8.71 | 47.5 | 65.1 | 22.5 | 4.43 | 36.8 | 40.1 | 80.1 | Hollow Heir at 40.1 |
| M-03 `FLAGS.APPRAISED_ENTERS_GUARD` | 53.9 | 8 | 8.40 | 52.4 | 61.1 | 18.6 | 4.39 | 37.5 | 37.4 | 77.3 | +5.7 expert, little length |
| M-03, `COLLECTOR_LIFE=50` | 50.1 | 9 | 8.69 | 47.6 | 65.7 | 21.9 | 4.51 | 38.5 | 39.6 | 80.1 | Passes; Hollow Heir 0.4 from the edge, expert +1.9 |
| M-03, `COLLECTOR_LIFE=52` | 47.9 | 9 | 8.84 | 45.4 | 67.8 | 23.9 | 4.56 | 38.9 | 40.7 | 81.4 | Hollow Heir over 40 |
| M-03, `PLAYER_LIFE=26`, `COLLECTOR_LIFE=52` | 48.5 | 9 | 8.98 | 43.1 | 69.8 | 25.9 | 4.57 | 38.6 | 41.1 | 82.6 | Hollow Heir over 40 |
| M-05, `COLLECTOR_LIFE=50` | 48.0 | 9 | 8.56 | 49.5 | 63.2 | 20.5 | 4.51 | 38.0 | 40.8 | 78.7 | Median by 0.5, Hollow Heir over 40 |
| `CROWN_POWER=0` | 50.3 | 8 | 8.34 | 52.9 | 60.1 | 17.4 | 4.40 | 37.2 | 38.1 | 76.9 | +2.1 expert, no length |
| `CROWN_POWER=0`, `COLLECTOR_LIFE=50` | 45.9 | 9 | 8.63 | 48.2 | 64.4 | 21.0 | 4.51 | 38.1 | 40.5 | 79.6 | Hollow Heir over 40 |
| ace later (owner-only) | 48.9 | 8 | 8.32 | 53.4 | 59.7 | 17.4 | 4.38 | 37.0 | 33.6 | 76.7 | -4.8 Hollow Heir, no length |
| ace later, `PLAYER_LIFE=28` | 50.7 | 9 | 8.61 | 49.0 | 63.9 | 20.9 | 4.40 | 36.6 | 34.9 | 79.2 | Passes, median by 1.0 |
| ace later, `PLAYER_LIFE=26`, `COLLECTOR_LIFE=48` | 47.8 | 9 | 8.63 | 48.5 | 64.3 | 21.2 | 4.46 | 37.0 | 35.4 | 79.6 | Passes, median by 1.5 |
| ace later, `PLAYER_LIFE=28`, `COLLECTOR_LIFE=48` | 48.4 | 9 | 8.77 | 46.5 | 66.2 | 23.0 | 4.46 | 36.9 | 36.0 | 80.7 | Passes, but uses an owner-only rule order |
| `APPRAISAL_ROUNDS=[3,6]` | 55.6 | 8 | 8.28 | 53.1 | 59.7 | 14.9 | 4.51 | 36.8 | 32.3 | 76.2 | -6.1 Hollow Heir, +7.4 expert |
| `APPRAISAL_ROUNDS=[3,6]`, `COLLECTOR_LIFE=50` | 52.0 | 9 | 8.55 | 48.6 | 64.0 | 18.0 | 4.62 | 37.6 | 33.7 | 78.7 | Passes; expert +3.8 |
| `APPRAISAL_ROUNDS=[3,6]`, `COLLECTOR_LIFE=52` | 50.5 | 9 | 8.69 | 46.4 | 66.0 | 19.7 | 4.68 | 37.8 | 34.2 | 79.9 | Passes; expert +2.3 |
| **`APPRAISAL_ROUNDS=[3,6]`, `COLLECTOR_LIFE=54`** | **49.0** | **9** | 8.81 | **44.4** | 67.7 | 21.3 | 4.72 | 38.1 | **34.8** | 80.9 | Passes with margin everywhere. Confirmed |
| `APPRAISAL_ROUNDS=[3,6]`, `PLAYER_LIFE=26`, `COLLECTOR_LIFE=52` | 51.4 | 9 | 8.85 | 44.0 | 68.3 | 21.8 | 4.68 | 37.6 | 34.5 | 81.2 | Passes; expert +3.2 |
| `APPRAISAL_ROUNDS=[3,6]`, `PLAYER_LIFE=26`, `COLLECTOR_LIFE=54` | 50.0 | 9 | 8.98 | 41.8 | 70.0 | 23.5 | 4.73 | 37.8 | 35.0 | 82.3 | Passes; longest of the passing cells |
| `APPRAISAL_ROUNDS=[3,6,10]`, `PLAYER_LIFE=28` | 52.3 | 9 | 8.58 | 48.6 | 63.9 | 19.7 | 4.43 | 36.9 | 38.0 | 79.0 | Expert +4.1 |
| `APPRAISAL_ROUNDS=[3,6,10]`, `PLAYER_LIFE=28`, `COLLECTOR_LIFE=48` | 49.9 | 9 | 8.74 | 46.0 | 66.4 | 21.9 | 4.48 | 37.1 | 39.2 | 80.4 | Hollow Heir near 40 |

Confirm (20,000 games, 60 dates, seed check on the same 60 dates):

| Cell | Expert | Median | Mean rds | Rds 8 or less | 8-12 | Rd 12 | Grafts/win | Levy | Hollow Heir | Actions | Seed reject |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline (live) | 47.7 pass | 8 fail | 8.34 | 53.1 | 59.9 pass | 17.6 pass | 4.40 pass | 36.7 pass | 38.5 pass | 76.9 | 63.9% (106/166) fail |
| `PLAYER_LIFE=28` | 49.6 pass | **9 pass** | 8.65 | 48.3 | 64.4 pass | 21.2 pass | 4.42 pass | 36.3 pass | 39.8 pass (edge) | 79.5 (+3.4%) | 62.5% (100/160) fail |
| **`APPRAISAL_ROUNDS=[3,6]`, `COLLECTOR_LIFE=54`** | **48.2 pass** | **9 pass** | 8.81 | 44.3 | 67.6 pass | 21.4 pass | 4.73 pass | 38.0 pass | **35.1 pass** | 80.9 (+5.2%) | 58.0% (83/143) fail |

BT-2 (10,000 games each, 30 dates): novice wins 0 of 10,000 in all three cells. Naive wins 1, 1 and 0 of 10,000 (baseline, `PLAYER_LIFE=28`, recommended).

Findings:
- M-05 (The Hollow Heir loses Ward) makes the game easier (+4.1 expert) and moves no target. It does not change how often The Hollow Heir appears (38.4 in both cells), only how hard he is to beat once he lands. Paired with `COLLECTOR_LIFE=50` to hold the win rate, the longer games push The Hollow Heir to 40.8. Not recommended.
- M-11 (Bastion Warden 7/8) is +1.2 at the noise edge and moves nothing. Its premise is gone: with `APPRAISAL_MIN_POWER` 8, a 7-Power Bastion Warden is still out of Levy reach. Drop.
- The median moves with anything that slows damage: either life (Monarch life costs expert, player life adds to it), `ELEMENT_BONUS` 1, a smaller Ambush and a calmer Monarch (moods 10/4). It needs about 3 points of games moved from round 8 or earlier to round 9 or later. Bigger hands and a fiercer Monarch shorten games.
- The binding constraint is BT-7, not the win rate. The Hollow Heir appears more often in longer games: about 0.4 to 0.9 points per 0.1 round of mean length, more when the length comes from Monarch life. Most cells that reach median 9 with the expert held at 47-49 put him at 40-42. Only three tested knobs lower him without shortening games: fewer Levy rounds (`APPRAISAL_ROUNDS=[3,6]`, -6.1), the owner-only ace-later order (-4.8) and M-03 (-1.0).
- `APPRAISAL_ROUNDS=[3,6]` gives +7.4 expert on its own, and Monarch life takes that back while adding the length: each Monarch life point is about -0.8 expert and -1.1 in rounds 8 or less. At 54 it lands at 48.2 with every non-seed target passing. Its grafts/win (4.73) sits 0.27 under the new top of 5, because fewer steals leave more monsters to graft. It also lowers seed rejection by 5.9 points, the only cell in three rounds that moved BT-8 at all (still far from 15).
- Real-time cost: today's 76.9 actions per game rise 3.4% with `PLAYER_LIFE=28` and 5.2% with the recommended cell. The cell with the most margin (`[3,6]` with both lives up) costs 7%.
- The 9-11 target is reachable inside every other band, so it does not need a review on feasibility. It does need one on pace. At median 8, rounds 8-12 (59.9) and round 12 (17.6) already pass. The target was written before lanes, turn slots and the bond rules, which put more actions into each round. Median 9 buys about 0.5 rounds and 4 actions per duel. If the owner's faster pace matters more, lowering `TARGET_MEDIAN_ROUNDS` to [8, 11] passes the live build as it is.

Recommendation to the owner (not applied, after the playtest): **`APPRAISAL_ROUNDS` [3, 6, 9] to [3, 6] and `COLLECTOR_LIFE` 46 to 54.** Expected: expert 48.2 (+0.5), median 9, rounds 8-12 67.6, round 12 21.4, grafts/win 4.73, Levy 38.0, Hollow Heir 35.1, seed rejection 58.0%, +5.2% actions. This is two edits plus a seeds regen, and both change DESIGN text: "rounds 3, 6 and 9" in the Levy rule is a rule change (one Levy fewer), not just a number, and the Monarch's 46 life changes too. The one-edit option is `PLAYER_LIFE` 24 to 28 (49.6, median 9, +3.4% actions). It leaves The Hollow Heir 0.2 under the ceiling, so it is fragile. A cheaper option still is to review the target and keep the live build.

Not tested: `MAX_DRAW_PER_TURN` (round 2: 1 collapses the expert to 12; 2 is the live value, and 3 adds card flow, which `HAND_SIZE=6` shows shortens games). Riposte has no value knob (`FLAGS.RIPOSTE` only, a rule switch). `MAX_ROUNDS` is the 12-round rule. Sim time: about 40 minutes. Scripts and screening output: `/Users/hassanshirazi/.claude/jobs/390b6775/tmp/r3/`.

## Phase 3 A/B round 2 (2026-10-20)

Measurement only: **no default changed.** This round covers knobs outside the §M proposals, aimed at the three targets round 1 left alone: BT-5 grafts per winning game, BT-7 Hollow Heir appearance and BT-8 seed rejection. Start point: the live package at a0ac982 (D-368: `PLAYER_LIFE` 24, `MIRROR_SIGIL_PENALTY` 2). Constraints from the owner: expert stays near 46.6 (D-364 band 45-55), length targets no worse, Levy 30-60, BT-2 not chased.

- Screening: `sim quick --bots expert --games 10000 --seed-dates 30 --from 2026-10-20 --workers 10`, same dates and game seeds in every cell (paired). Noise about plus or minus 1.0 point on a 10,000-game rate. Seed-spread cells: `--games 1000 --seed-dates 30 --seed-check`, where the seed check (500 expert-noisy runs per candidate) is the measurement.
- Confirm: `--games 20000 --seed-dates 60 --from 2026-10-20 --seed-check`, reports in `docs/reports/ab-round2-2026-10-20/`. The confirm baseline reproduces round 1's M-14 + M-16 confirm exactly (46.6 / 8.07 / 55.6 / 15.1 / 4.34 / 55.5 / 49.8 / 105 of 165).
- "Ace later" (owner-only, `collector.json › ai` rule lists) moves `summonAce` below `castHighValueSpell` in `ai.play` and below `summonBeater` in `ai.moods.agitated.play`, so the Monarch summons The Hollow Heir only when no better play is on.
- `MIN_GRAFT_MATERIALS=3` can't be measured: the schema pins it at 2 ("must be 2 until the engine supports other values").

Screening (10,000 games, 30 dates):

| Cell | Expert | Median | Mean rds | 8-12 | Rd 12 | Grafts/win | Levy | Hollow Heir | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| baseline (live) | 47.1 | 8 | 8.05 | 55.5 | 14.6 | 4.33 | 55.7 | 49.4 | |
| `MAX_GRAFT_MATERIALS=2` | 41.3 | 8 | 8.09 | 55.3 | 16.2 | 4.85 | 63.7 | 53.8 | Grafts go up (smaller grafts more often); Levy over 60. Reject |
| `BOND_GRAFT_MAX_HAND_MATERIALS=2` (owner-only) | 43.4 | 8 | 8.07 | 55.2 | 16.2 | 4.85 | 63.1 | 53.1 | Same pattern. Reject |
| `BOND_GRAFT_MAX_HAND_MATERIALS=1` (owner-only) | 34.9 | 9 | 8.95 | 68.8 | 25.3 | 5.11 | 61.1 | 56.9 | Median 9, but expert -12 and grafts up. Reject |
| `UNSTABLE_BONUS=1` | 34.6 | 8 | 8.15 | 55.7 | 17.2 | 4.55 | 62.7 | 55.2 | Expert -12.5, grafts up. Reject |
| `ASCEND_POWER=0`, `ASCEND_GUARD=0` | 42.3 | 8 | 8.06 | 54.9 | 16.0 | 4.77 | 63.2 | 52.9 | Grafts up. Reject |
| `HAND_SIZE=4` | 41.5 | 8 | 8.03 | 54.7 | 15.9 | 4.07 | 53.7 | 43.4 | Grafts -0.26 for -5.6 expert |
| `OPENING_HAND=4` | 48.2 | 8 | 7.94 | 53.4 | 13.6 | 4.29 | 57.2 | 49.7 | No effect |
| `MAX_DRAW_PER_TURN=1` | 12.0 | 7 | 7.57 | 46.2 | 12.3 | 3.22 | 46.3 | 41.7 | The only cell near 3 grafts, by starving the player. Reject |
| `FLAGS.BOND_ACTION=false` (owner-only) | 48.5 | 8 | 7.99 | 54.6 | 13.6 | 4.07 | 51.1 | 47.0 | Making Graft cost the play barely moves grafts/win |
| `APPRAISAL_ROUNDS=[4,8]` | 59.3 | 7 | 7.69 | 48.9 | 12.8 | 4.13 | 60.8 | 39.6 | Hollow Heir passes, but expert +12 and games shorter |
| `APPRAISAL_ROUNDS=[6,9]` | 69.7 | 6 | 7.20 | 41.4 | 10.8 | 3.82 | 57.4 | 25.7 | Far too easy and short. Reject |
| `APPRAISAL_ROUNDS=[4,7,10]` | 53.6 | 7 | 7.75 | 48.7 | 13.2 | 4.08 | 58.3 | 44.7 | Shorter, Hollow Heir still over 40 |
| `APPRAISAL_ROUNDS=[3,6]` | 54.6 | 8 | 8.00 | 55.5 | 12.2 | 4.45 | 55.7 | 43.8 | Expert +7.5 |
| `APPRAISAL_MIN_POWER=6` | 47.9 | 8 | 7.99 | 54.4 | 14.2 | 4.28 | 51.2 | 46.9 | Small step |
| `APPRAISAL_MIN_POWER=7` | 50.6 | 8 | 7.95 | 53.7 | 14.0 | 4.22 | 43.9 | 41.7 | Hollow Heir -7.7 for +3.5 expert |
| `APPRAISAL_MIN_POWER=8` | 55.5 | 8 | 7.84 | 51.8 | 12.8 | 4.18 | 35.8 | 34.5 | Hollow Heir passes; needs an expert offset |
| `CROWN_POWER=0` | 50.0 | 8 | 8.05 | 55.8 | 14.4 | 4.33 | 55.8 | 48.9 | Crown is +2.9 for the Monarch, no Hollow Heir effect |
| ace later (owner-only) | 48.4 | 8 | 8.02 | 55.1 | 14.3 | 4.32 | 55.9 | 43.5 | Hollow Heir -5.9 for +1.3 expert |
| `COLLECTOR_LIFE=44` | 41.8 | 8 | 8.39 | 60.3 | 18.7 | 4.48 | 56.5 | 52.1 | The offset: about -1.3 expert and +0.08 mean rounds per Monarch life point |
| `APPRAISAL_MIN_POWER=7`, `COLLECTOR_LIFE=42` | 48.1 | 8 | 8.14 | 56.6 | 15.9 | 4.31 | 44.4 | 43.1 | Hollow Heir still over 40 |
| `APPRAISAL_MIN_POWER=7`, `COLLECTOR_LIFE=44` | 45.5 | 8 | 8.31 | 59.3 | 17.8 | 4.38 | 44.7 | 44.5 | Same |
| `APPRAISAL_MIN_POWER=7`, `COLLECTOR_LIFE=42`, ace later | 49.0 | 8 | 8.13 | 56.7 | 15.7 | 4.31 | 44.4 | 37.9 | Passes, but uses an owner-only rule order |
| `APPRAISAL_MIN_POWER=8`, `COLLECTOR_LIFE=44` | 50.5 | 8 | 8.19 | 57.4 | 16.3 | 4.32 | 36.6 | 37.1 | Passes; expert +3.4 |
| **`APPRAISAL_MIN_POWER=8`, `COLLECTOR_LIFE=46`** | **48.1** | 8 | 8.33 | 59.5 | 17.7 | 4.38 | 37.0 | **38.4** | Passes; expert +1.0; length better. Confirmed |
| `APPRAISAL_MIN_POWER=8`, `COLLECTOR_LIFE=48` | 45.9 | 8 | 8.48 | 61.9 | 19.4 | 4.44 | 37.5 | 39.8 | Longest; Hollow Heir at the edge (longer games give him more chances) |
| `APPRAISAL_MIN_POWER=8`, `COLLECTOR_LIFE=46`, ace later | 48.7 | 8 | 8.32 | 59.5 | 17.5 | 4.38 | 37.0 | 33.6 | Most Hollow Heir margin. Confirmed |
| `APPRAISAL_MIN_POWER=9`, `COLLECTOR_LIFE=46` | 58.3 | 8 | 8.19 | 57.1 | 15.9 | 4.34 | 25.4 | 27.2 | Levy under 30 (fails BT-6). Reject |
| `APPRAISAL_ROUNDS=[4,8]`, `COLLECTOR_LIFE=46` | 52.2 | 8 | 8.26 | 57.4 | 17.8 | 4.37 | 62.3 | 44.6 | Levy over 60. Reject |
| `APPRAISAL_ROUNDS=[4,8]`, `COLLECTOR_LIFE=48`, ace later | 51.1 | 8 | 8.38 | 59.1 | 18.8 | 4.42 | 62.9 | 38.8 | Levy over 60. Reject |
| `APPRAISAL_ROUNDS=[3,6]`, `COLLECTOR_LIFE=44`, ace later | 51.5 | 8 | 8.31 | 60.1 | 15.6 | 4.60 | 56.5 | 39.4 | Keeps the Levy at Power 5; Hollow Heir at the edge, expert +4.4. Screen only |

Seed-spread screening (1,000 games, seed check on 30 dates; rejection = rejected candidates / candidates tried):

| Cell | Expert-noisy candidate histogram (10 bins, 0-100%) | Seed reject |
|---|---|---|
| baseline | [12,9,4,8,8,8,6,7,7,9] | 61.5% (48/78) |
| `BOT_NOISE_EPSILON=0.3` | [12,17,6,5,9,7,9,4,5,2] | 60.5% (46/76) |
| `BOT_NOISE_EPSILON=0.5` | [26,12,12,9,11,6,4,3,3,0] | 65.1% (56/86) |
| `OPENING_MIN_MONSTERS=3` | [10,7,11,9,9,5,7,8,12,8] | 65.1% (56/86) |
| `APPRAISAL_MIN_POWER=8`, `COLLECTOR_LIFE=46` | [15,4,15,6,10,7,6,8,7,8] | 65.1% (56/86) |

More noise only slides the spread toward 0; it does not narrow it.

Confirm (20,000 games, 60 dates, seed check on the same 60 dates):

| Cell | Expert | Median | Mean rds | 8-12 | Rd 12 | Grafts/win | Levy | Hollow Heir | Seed reject |
|---|---|---|---|---|---|---|---|---|---|
| baseline (live) | 46.6 pass | 8 fail | 8.07 | 55.6 pass | 15.1 pass | 4.34 fail | 55.5 pass | 49.8 fail | 63.6% (105/165) fail |
| **`APPRAISAL_MIN_POWER=8`, `COLLECTOR_LIFE=46`** | **47.8 pass** | 8 fail | 8.34 | **59.9 pass** | **17.6 pass** | 4.40 fail | **36.7 pass** | **38.5 pass** | 63.9% (106/166) fail |
| same + ace later (owner-only) | 48.4 pass | 8 fail | 8.33 | 59.7 pass | 17.5 pass | 4.40 fail | 36.7 pass | 33.8 pass | 64.5% (109/169) fail |

Seed-spread diagnostic (scratch script, not repo code): 90 candidates (30 dates from 2026-10-20, k 0-2, 40 expert-noisy runs each) give the histogram [16,8,11,5,8,8,10,2,8,14], mean 0.46. No deal feature explains a candidate's win rate. Correlations: the Monarch's monsters in his first 10 cards 0.18, the player's Power 7+ monsters 0.17, the Monarch's first-10 Power 0.15, The Hollow Heir's depth in his deck -0.07, the player's first-10 Power 0.01. Only 8 of the 90 candidates sit at 0% or 100%, so noise does change single games, but the per-deal win chance is spread evenly across the range.

For information only (it changes the yardstick, not the game): with that histogram the accept window [0.3, 0.7] gives about 66% rejection, [0.2, 0.8] about 51%, and [0.1, 0.9] about 33%. The check never falls back (0 of 60 dates); it spends a mean of 1.75 rerolls per day.

Findings:
- BT-7 (Hollow Heir) moves with the Levy, because The Hollow Heir needs a monster taken by a Levy. `APPRAISAL_MIN_POWER` is the cleanest knob: 8 gives Hollow Heir about 35-38 and Levy 36-37, at +8 expert, which `COLLECTOR_LIFE` 46 takes back while it also lengthens games. 9 drops the Levy under 30. Fewer Levy rounds also lower The Hollow Heir, but they raise the expert by 7-22 points and push the Levy over 60 once life offsets them. The owner-only ace-later order gives about 5 more points of margin.
- BT-5 (grafts/win) doesn't respond to any game knob. Weakening Graft (fewer materials, fewer hand materials, less Unstable or Ascend) makes the expert graft *more* often with smaller grafts, and it loses more. Making Graft cost the play (`FLAGS.BOND_ACTION=false`) gives 4.07. Only cutting card flow (`MAX_DRAW_PER_TURN=1`: 3.22 at 12% expert) gets near 3. The expert grafts whenever it has two spare monsters, so the count follows card flow, not Graft's power. This needs a target review or a rule change (owner).
- BT-8 doesn't respond to any knob (noise, opening constraint, the Levy package). The spread comes from the whole deal, not from any one feature a deckgen constraint could control.
- Length: the recommended package improves BT-3b (59.9) and BT-4 (17.6) and moves mean rounds 8.07 to 8.34. The median stays 8.

Recommendation to the owner (not applied): **`APPRAISAL_MIN_POWER` 5 to 8 and `COLLECTOR_LIFE` 40 to 46** (both tuning under ARCHITECTURE §11, but see the DESIGN note). Expected: expert 47.8 (+1.2), Levy 36.7, Hollow Heir 38.5 (passes, 1.5 points inside the edge), rounds 8-12 59.9, round 12 17.6, grafts/win 4.40 (+0.06), seed rejection unchanged. For more margin, add the owner-only ace-later rule order (Hollow Heir 33.8, expert 48.4). DESIGN note: DESIGN.md says "Every Chimera reaches 5+ Power, which makes it a Levy target" and "Power 5 or more" in the Levy rule, and its 40 Monarch life would also change, so the owner has to approve the text. `APPRAISAL_MIN_POWER` 5 was set in D-332 because Split and Symbiosis kept monsters small. D-336 has since turned both off.

Sim time: about 40 minutes. Scripts and screening output: `/Users/hassanshirazi/.claude/jobs/390b6775/tmp/`.

## Phase 3 A/B round 1 (2026-10-20)

Measurement only: **no default changed.** Every lever below is owner-only (DECISIONS §M), so this section recommends and the owner decides. Start point: the live package at 9ac1aab (baseline `docs/reports/full-2026-10-20.md`: expert 46.1%, median 7, rounds 8-12 49.6%, round 12 11.5%, grafts/win 4.29, Levy 56.8%, Hollow Heir 47.9%, seed rejection 66.7%).

- Screening: `sim quick --bots expert --games 10000 --seed-dates 30 --from 2026-10-20 --workers 10`, one lever per cell. Every cell uses the same dates and game seeds, so the differences are paired. Noise is about plus or minus 1.0 point on a 10,000-game win rate, and differences under about 1.5 points are not meaningful.
- Confirm: `--games 20000 --seed-dates 60 --from 2026-10-20 --seed-check` (the 60 dates of the baseline full run). Reports are in `docs/reports/ab-round1-2026-10-20/`. The seed check is deterministic: the confirm baseline reproduces the full run's 120/180 exactly.
- Not testable with today's CLI: **M-05** (The Hollow Heir loses Ward) and **M-11** (Bastion Warden 7/8). `--set` takes only globals and `CONTENT_NUMBERS` (`card.the-unpriced.keywords=[]` fails with "unknown key"), and `--collector` reaches only `collector.json › ai`. Out of scope: M-01 (withdrawn, D-280), M-06/M-17 (not built), M-09 (done), M-15 (UI).
- Readings: M-08 moves `setTrapWhenBehind` below `summonFallback` in `ai.play` and `ai.moods.agitated.play`. Rule order is the only part of M-08 a CLI override can express, and "no summonable monster" is what rule order gives. M-13 sets `ai.moods` to `{composed: {}, agitated: killWithoutLoss.allowTrades, desperate: faceDownIfStrong.minPower 0 + allowTrades}`, so Desperate keeps the base attack list and reposition.

Screening (10,000 games, 30 dates):

| Cell | Expert | Median | Mean rds | 8-12 | Rd 12 | Grafts/win | Levy | Hollow Heir | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 46.5 | 7 | 7.67 | 49.6 | 11.2 | 4.27 | 57.2 | 48.0 | |
| M-02 `UNSTABLE_EXPIRY=startOfOwnTurnAfterNext` | 50.3 | 7 | 7.69 | 49.6 | 12.0 | 4.25 | **61.3** | 49.6 | +3.8 for the player; Levy goes over 60 (fails BT-6); length, grafts and Hollow Heir unchanged. Not recommended |
| M-03 `FLAGS.APPRAISED_ENTERS_GUARD` | 53.2 | 8 | 7.85 | 52.9 | 13.1 | 4.29 | 57.7 | 47.5 | +6.7 for the player and some length. Too strong on its own |
| M-04 `FLAGS.ACE_SET_ASIDE` | 43.0 | 8 | 7.81 | 51.4 | 12.1 | 4.32 | 55.9 | **78.4** | Hollow Heir 48 to 78 (BT-7 much worse); expert -3.5. Reject |
| M-07 `UNMAKE_MAX_POWER=6` | 47.7 | 7 | 7.68 | 49.9 | 11.4 | 4.28 | 57.0 | 47.9 | +1.2, at the noise edge; moves no target. Neutral |
| M-08 trap rule below fallback | 46.8 | 7 | 7.67 | 49.7 | 11.0 | 4.27 | 56.9 | 48.0 | No effect: under `TURN_SLOTS` a trap and a summon use different slots, so the order no longer matters. Drop |
| M-10 `skipBrittleCountered` | 46.6 | 7 | 7.68 | 49.7 | 11.4 | 4.27 | 57.2 | 47.9 | No effect. Harmless, optional |
| M-12 `FLAGS.CHIMERA_TO_HAND=false` | **24.8** | 7 | 7.49 | 46.1 | 9.5 | 4.21 | 49.2 | 44.6 | Expert -21.7: Chimera return (Echo, Grave Recall) carries the expert, but grafts/win barely moves. Reject alone |
| M-13 paper-sim moods | 47.6 | 7 | 7.06 | 39.0 | 6.0 | 3.97 | 54.0 | 42.4 | The only lever that lowers Hollow Heir and grafts/win, and it does so by shortening games (8-12 39%, rd 12 6%). Reject |
| M-14 `PLAYER_LIFE=24` | 49.3 | 8 | 8.03 | **55.3** | 14.5 | 4.32 | 56.5 | 49.6 | Best length lever: BT-3b passes, rd 12 near 15; +2.8 for the player |
| M-16 `MIRROR_SIGIL_PENALTY=2` | 44.2 | 7 | 7.67 | 49.4 | 11.3 | 4.29 | 56.5 | 47.8 | -2.3 for the player (Mirror Sigil is the player's trap), nothing else. A clean win-rate offset |
| M-03 + M-14 | 55.5 | 8 | 8.16 | 57.8 | 16.3 | 4.32 | 57.1 | 48.9 | Length best; expert just over 55 |
| M-03 + M-14 + M-16 | 53.7 | 8 | 8.17 | 57.9 | 16.4 | 4.33 | 56.4 | 48.5 | Length best, expert back in band |
| M-14 + M-16 | 47.1 | 8 | 8.05 | 55.5 | 14.6 | 4.33 | 55.7 | 49.4 | Length gain at nearly the baseline expert rate |

Confirm (20,000 games, 60 dates, seed check on the same 60 dates):

| Cell | Expert | Median | Mean rds | 8-12 | Rd 12 | Grafts/win | Levy | Hollow Heir | Seed reject |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 46.2 pass | 8* fail | 7.69 | 50.0 fail | 11.5 fail | 4.30 fail | 56.8 pass | 48.3 fail | 66.7% (120/180) fail |
| M-14 | 49.0 pass | 8 fail | 8.06 | 55.6 pass | 14.8 fail | 4.33 fail | 56.1 pass | 50.0 fail | 64.9% (111/171) fail |
| **M-14 + M-16** | **46.6 pass** | 8 fail | 8.07 | **55.6 pass** | **15.1 pass** | 4.34 fail | 55.5 pass | 49.8 fail | 63.6% (105/165) fail |
| M-03 + M-14 + M-16 | 53.2 pass | 8 fail | 8.18 | 57.7 pass | 16.7 pass | 4.35 fail | 56.2 pass | 48.8 fail | 66.7% (120/180) fail |
| M-04 (seed-variance check) | 42.7 fail | 8 fail | 7.78 | 51.1 pass | 12.1 fail | 4.31 fail | 55.5 pass | 78.1 fail | 65.7% (115/175) fail |

\* The baseline median sits on the 7/8 edge: 50.0% of games end in round 8 or later, so it reads 8 here and 7 in the 50,000-game full run. Mean rounds is the steadier length measure.

Seed spread: no cell narrows it. The expert-noisy candidate histograms (10 bins, 0-100%) stay flat, for example baseline [28,23,15,15,18,14,13,15,20,19] and M-14 + M-16 [23,24,9,15,19,15,11,14,17,18]. The paper-sim's claim that M-04 lowers seed variance is not borne out ([31,22,25,11,14,16,19,14,14,9]). Each accepted day still averages 0.49 to 0.51, with an SD of about 0.11.

Findings:
- Length (BT-3, BT-3b, BT-4) moves only with M-14, and with M-03 to a lesser degree. No in-scope lever gets the median to 9.
- BT-5 (grafts/win 4.2-4.35) and BT-7 (Hollow Heir 47-50%) do not respond to any lever in scope except M-13, which shortens games, and M-12, which breaks the expert. They need non-proposal knobs (for example the Graft slot or the Monarch's ace access) or a target review, which are owner calls.
- BT-8 does not respond to any lever. The spread looks seed-driven (the deal), not rule-driven.

Recommendation to the owner (not applied): **M-14 (`PLAYER_LIFE` 24) + M-16 (`MIRROR_SIGIL_PENALTY` 2)**. Expected: expert 46.6 (+0.4), BT-3b 55.6 pass, BT-4 15.1 pass (at the edge), median 8, everything else unchanged. Adopting it is two edits and a seeds regen. M-14 alone is the one-edit option (49.0, round 12 14.8). Adding M-03 gives the most length (round 12 16.7) at 53.2, near the top of the band.

## 2026-10-18 · Crowned levy (D-349)

Change: `FLAGS.CROWNED` on, `CROWN_POWER` 1 (a monster taken by Levy has +1 Power on the Monarch's board). The owner asked for a slightly tougher Monarch and picked this over a life change. Quick runs: `sim quick --games 800 --bots expert,greedy,novice`, 60 dates from 2026-10-18, one `--set` per cell.

| Cell | Expert | Greedy | Novice | Levy success | Hollow Heir |
|---|---|---|---|---|---|
| before (life 40, no crown) | 47.5 | 29.5 | 0.0 | 56.6 | 46.4 |
| **crown +1 (shipped)** | **44.1** | **24.1** | 0.0 | 56.6 | 47.5 |
| life 44 | 42.6 | 24.4 | 0.0 | 57.4 | 50.1 |
| life 48 | 37.6 | 19.5 | 0.0 | 58.0 | 52.6 |
| `APPRAISAL_MIN_POWER` 4 | 46.6 | 29.0 | 0.0 | 60.6 | 48.4 |
| `APPRAISAL_ROUNDS` [3,5,7,9] | 34.9 | 18.5 | 0.0 | 53.2 | 54.1 |

Unchanged: `COLLECTOR_LIFE` 40, `APPRAISAL_MIN_POWER` 5, `APPRAISAL_ROUNDS` [3,6,9]. Expert 44.1% is 0.9 points under BT-1 (45-55%) by the owner's request; the band is the owner's to move.

## 2026-10-17 · Monarch life for the turn slots (D-335)

Change: `FLAGS.TURN_SLOTS` on (one monster, one spell or trap, one bond, any order; attacks close nothing). The expert bot now plans again after each play, so it uses both slots. Quick runs: `sim quick --games 1000 --bots expert,greedy,novice` (10 dates from 2026-10-17), live package otherwise.

| Cell | Expert | Greedy | Novice | Median rounds | Rounds 8-12 | Round 12 |
|---|---|---|---|---|---|---|
| old turn (`TURN_SLOTS=false`), life 25 | 51.8 | 26.4 | 0.2 | 5 | 18.4 | 1.2 |
| slots, life 25, expert without replanning | 31.0 | 32.6 | 0.5 | 5 | 15.7 | 1.3 |
| slots, life 25 | 73.5 | 32.6 | 0.5 | 6 | n/a | n/a |
| slots, life 30 | 64.2 | 24.3 | 0.1 | 6 | 31.2 | 1.9 |
| slots, life 35 | 56.3 | 19.6 | 0.1 | 7 | 38.6 | 3.7 |
| **slots, life 40 (shipped)** | **50.0** | 14.6 | 0.0 | 7 | 45.6 | 6.7 |

- Applied: `COLLECTOR_LIFE` 25 → 40. Expert passes; round length moves toward its target (still under 9–11). Greedy falls to 15% and novice stays near 0 (both already failing; the owner's playtest decides whether the Monarch should get fewer slots instead).

## 2026-10-16 · Monarch tuning for the owner's package (123L + Split, Symbiosis, bond action)

Package (fixed by the owner): `SICKNESS_MODE=monstersOnly`, `FLAGS.LANES`, ring A, Monarch reposition `laneAware`, `FLAGS.SPLIT`, `FLAGS.SYMBIOSIS`, `FLAGS.BOND_ACTION`. Start point: `BOND_GRAFT_MAX_HAND_MATERIALS=2` (h2).

Quick settings unless noted: `sim quick --games 2000 --seed-dates 10 --from 2026-10-16 --bots expert,greedy,novice --workers 10` with the package as `--set`/`--ring`/`--collector-reposition` overrides (the bond-matrix settings).

### Earlier runs (T01-T25, 123L without bond rules)

Monarch life is the main strength lever (25 to 30 / 35 / 40: expert 65.9 to 55.8 / 46.8 / 39.1), and longer games raise Hollow Heir (19 / 24 / 27%) and rounds 8-12 (19 / 25 / 32%). Raising both lives (C40-50, P40-50) reaches median 8-10 and rounds 8-12 above half, but only by making games about twice as long. Player life, element bonus, Levy Power 6, Monarch trades, mood thresholds and bot noise each move the expert by 3 points or less, or only together with life. Levy success sat at 30-44% in every T cell: without Split it was never the problem.

### Iteration 1: the Levy threshold

- Hypothesis: Levy fails (13%) because Split parts and Symbiosis hosts are base monsters, and base monsters are Power 2-7 (only 2 of 25 reach 7). A lower `APPRAISAL_MIN_POWER` makes them targets again and so lifts Hollow Heir, which needs a successful Appraisal. Moving the Levy rounds earlier could also catch more of the round-5 games.
- Runs (2000 per bot, dates 2026-10-16..25):

| Cell | Expert | Greedy | Novice | Median | 8-12 | Rd 12 | Levy | Hollow Heir | Grafts/win |
|---|---|---|---|---|---|---|---|---|---|
| h2 (start, bond matrix) | 54.4 | 31.9 | 0.4 | 5 | 16.9 | 1.6 | 13.4 | 7.8 | 1.64 |
| B01 AMP 6 | 45.5 | 25.2 | 0.2 | 5 | 17.2 | 1.9 | 35.0 | 19.4 | 1.75 |
| B02 AMP 5 | 40.1 | 22.8 | 0.2 | 5 | 17.0 | 1.7 | 51.9 | 26.4 | 1.84 |
| B03 rounds [2,4,6] | 48.7 | 21.8 | 0.7 | 6 | 21.4 | 2.5 | 10.8 | 9.6 | 1.67 |
| B04 rounds [3,5,7] | 48.1 | 29.7 | 0.7 | 5 | 16.0 | 1.4 | 12.5 | 9.2 | 1.58 |

- Result: the threshold is the lever (13 to 35 to 52%); the rounds are not. A lower threshold also costs the expert 9-14 points, so strength must come back from somewhere.

### Iteration 2: give the expert its strength back

- Hypothesis: the hand-material limit (h2) was there only to pull the expert down from 63%. With Levy now taking monsters, the limit can go (3 = no limit, today's default), or Player life can rise.

| Cell | Expert | Greedy | Novice | Median | 8-12 | Rd 12 | Levy | Hollow Heir | Grafts/win |
|---|---|---|---|---|---|---|---|---|---|
| B05 AMP 6, hand 3 | 55.4 | 30.5 | 0.3 | 5 | 16.2 | 1.8 | 34.7 | 18.3 | 1.99 |
| **B06 AMP 5, hand 3** | **50.6** | 27.3 | 0.4 | 5 | 16.2 | 1.6 | **50.3** | **25.4** | **2.01** |
| B07 AMP 6, h2, P22 | 47.6 | 25.9 | 0.2 | 6 | 20.7 | 2.1 | 34.3 | 19.6 | 1.79 |
| B08 AMP 6, h2, P24 | 49.1 | 27.3 | 0.2 | 6 | 24.6 | 2.9 | 33.8 | 20.5 | 1.82 |
| B09 AMP 5, h2, P24 | 43.9 | 24.8 | 0.2 | 6 | 24.8 | 3.0 | 49.4 | 27.6 | 1.90 |
| B10 AMP 6, h2, C23 | 48.6 | 30.6 | 0.3 | 5 | 14.8 | 1.0 | 35.2 | 18.6 | 1.66 |

- Result: B06 is centred on expert win, Levy and Hollow Heir with one value change (the hand limit stays at its default). B08 also passes, but needs three changes and leaves Hollow Heir on the edge.

### Iteration 3: confirm on new dates and a bigger sample

10,000 games per bot, 20 dates from 2026-11-01 (disjoint from the screening dates), `--seed-check` on those dates:

| Cell | Expert | Greedy | Novice | Median | 8-12 | Rd 12 | Levy | Hollow Heir | Grafts/win | Seed reject |
|---|---|---|---|---|---|---|---|---|---|---|
| B13 h2 (start) | 54.1 | 30.7 | 0.6 | 5 | 17.3 | 1.7 | 13.8 | 8.0 | 1.67 | not run |
| **B11 AMP 5, hand 3** | **50.6** | 27.7 | 0.3 | 5 | 16.4 | 1.7 | **50.7** | **23.7** | **2.00** | 81% |
| B12 AMP 6, h2, P24 | 48.9 | 27.5 | 0.5 | 6 | 24.8 | 2.7 | 32.7 | 20.1 | 1.78 | 79% |

Winner: B11/B06, applied below.

### Applied change and final evidence

Change: `APPRAISAL_MIN_POWER` 7 to 5, on top of the package. `BOND_GRAFT_MAX_HAND_MATERIALS` stays 3 (the h2 start point is not shipped).

Default equivalence: after the edit, a no-override quick on the B06 settings reproduces B06's results exactly when `CONTENT_VERSION=0.1.0` is set; the version bump to 0.2.0 only changes the seed strings.

Final full run on the new defaults, no overrides: `sim full --workers 10 --from 2026-10-16` (50,000 games per bot, 60 dates; expert and novice only), JSON `docs/reports/balance/B14-full-shipped.json`. Greedy is from the no-override verification quick (B15, 2000 games, dates 2026-10-16..25).

| Run | Expert | Greedy | Novice | Median | 8-12 | Rd 12 | Levy | Hollow Heir | Grafts/win | Seed reject | Fallback dates |
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
