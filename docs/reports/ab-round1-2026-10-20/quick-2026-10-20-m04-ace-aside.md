# Simulator report: quick, 2026-10-20

- content: version 0.2.0, hash `dc8ab66e64dc4c9febcc4424ff0ef2a3`
- expertHash: `0eb20ec33121d2dffb41434b07cc1b45`
- globals hash: `7e70b8872eddd3c2b31a4e5b18616263`
- overrides (--set): `FLAGS.ACE_SET_ASIDE=true`
- content overrides (--ring, --collector): none
- arguments: `{"games":20000,"seedDates":60,"from":"2026-10-20","bots":["expert"]}`
- the complete globals used are in the JSON file next to this report

## Balance targets

| Id | Metric | Bot | Value | Target | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| BT-1 | Win rate | expert | 42.7% | 45% to 55% | **fail** | noise-free expert vs the Collector |
| BT-3 | Median rounds per game | expert | 8.00 | 9 to 11 | **fail** | median of the round histogram, all finished games |
| BT-3b | Share ending in rounds 8 to 12 | expert | 51.1% | more than half (rounds 8 to 12) | **pass** | "most" read as a majority (D-230) |
| BT-4 | Share ending in round 12 | expert | 12.1% | 15% to 30% | **fail** | includes games ended by the sealed Vault |
| BT-5 | Grafts per winning game | expert | 4.31 | 1.5 to 3 | **fail** | track.grafts over wins |
| BT-6 | Appraisal success rate | expert | 55.5% | 30% to 60% | **pass** | successes over attempts (40405 attempts); an attempt with no target fails |
| BT-7 | Unpriced appearance rate | expert | 78.1% | 20% to 40% | **fail** | share of games in which the Collector summoned his ace (track.unpriced) |
| BT-2 | Win rate | novice | n/a | 20% to 30% | **not measured** | the novice bot was not run |
| BT-2n | Win rate | naive | n/a | 20% to 30% | **not measured** | the naive bot was not run |
| BT-8 | Seed rejection rate | expert-noisy | 65.7% | at most 15% | **fail** | 115 of 175 candidate seeds rejected over 60 dates; 0 fallbacks (D-004 target: never) |
| DUEL-MIN | Duel length in minutes | - | n/a | 3 to 5 | **not measured** | needs human playtests, not a simulation |
| LEARN-SEC | Seconds to learn the rules | - | n/a | at most 60 | **not measured** | needs human playtests, not a simulation |
| PERF | Duels per second per core | expert | 44.45 | at least 1000 | **fail** | duels over summed worker busy time, start-up excluded (§18.10); falls when workers share cores |

## Anomalies

- seed rejection 65.7% is above TARGET_SEED_REJECT_MAX (0.15)
- duels/sec/core 44 is below PERF_DUELS_PER_SEC_PER_CORE (1000)

## Win rate by bot

| Bot | Games | Finished | Wins | Win rate | Median rounds | Mean rounds | p90 | Actions/game |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 20000 | 20000 | 8547 | 42.7% | 8.0 | 7.78 | 12 | 72 |

## Round at which the duel ended

| Bot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 0.0% | 0.0% | 2.5% | 5.6% | 12.2% | 16.7% | 11.9% | 12.7% | 12.2% | 7.6% | 6.5% | 12.1% |

## Per-bot detail

| Bot | Grafts per win | Appraisal success | Appraisal attempts | Unpriced appears | Intent accuracy | Intent samples | Crashed | Stuck |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 4.31 | 55.5% | 40405 | 78.1% | 60.4% | 148099 | 0 | 0 |

## Damage, Unstable Chimeras, vault

| Bot | Vault sealed | Median winning round | Unstable per game | Games with Unstable | Damage per round | To Collector | To player | Direct share |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 7.5% | 8.0 | 2.11 | 93.4% | 5.90 | 3.88 | 2.02 | 46.1% |

## Bond usage (per finished game)

| Bot | Grafts | Splits | Symbioses | Symbiote emerged | Symbiote double loss | Bond-turn share |
| --- | --- | --- | --- | --- | --- | --- |
| expert | 4.12 | 0.00 | 0.00 | 0.00 | 0.00 | 53.2% |

- expert endings: collectorDefeated 8547, playerDefeated 9956, vaultSealed 1497

## Difficulty check

- dates: 60, candidate seeds played: 175, rejected: 115
- rejection rate: **65.7%** (target at most 15.0%)
- dates needing at least one reroll: 39 of 60; mean rerolls per date 1.92; fallbacks 0

Candidate win rates (tenths):

| 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 31 | 22 | 25 | 11 | 14 | 16 | 19 | 14 | 14 | 9 |

| Date | k | Win rate | Stars | Par | Check | Candidates |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-20 | 2 | 65.2% | 1 | 3 | accepted | 3 |
| 2026-10-21 | 2 | 45.4% | 2 | 3 | accepted | 3 |
| 2026-10-22 | 1 | 67.2% | 1 | 9 | accepted | 2 |
| 2026-10-23 | 5 | 38.6% | 3 | 10 | accepted | 6 |
| 2026-10-24 | 3 | 50.0% | 2 | 9 | accepted | 4 |
| 2026-10-25 | 2 | 63.6% | 1 | 6 | accepted | 3 |
| 2026-10-26 | 3 | 69.8% | 1 | 5 | accepted | 4 |
| 2026-10-27 | 0 | 35.2% | 3 | 11 | accepted | 1 |
| 2026-10-28 | 3 | 33.8% | 3 | 8 | accepted | 4 |
| 2026-10-29 | 0 | 55.0% | 2 | 8 | accepted | 1 |
| 2026-10-30 | 3 | 41.4% | 3 | 6 | accepted | 4 |
| 2026-10-31 | 1 | 66.4% | 1 | 8 | accepted | 2 |
| 2026-11-01 | 2 | 62.8% | 1 | 7 | accepted | 3 |
| 2026-11-02 | 3 | 45.8% | 2 | 9 | accepted | 4 |
| 2026-11-03 | 1 | 43.0% | 3 | 9 | accepted | 2 |
| 2026-11-04 | 0 | 45.6% | 2 | 11 | accepted | 1 |
| 2026-11-05 | 0 | 62.0% | 1 | 6 | accepted | 1 |
| 2026-11-06 | 0 | 55.6% | 2 | 11 | accepted | 1 |
| 2026-11-07 | 0 | 47.8% | 2 | 9 | accepted | 1 |
| 2026-11-08 | 2 | 43.6% | 2 | 10 | accepted | 3 |
| 2026-11-09 | 6 | 54.0% | 2 | 10 | accepted | 7 |
| 2026-11-10 | 2 | 54.4% | 2 | 11 | accepted | 3 |
| 2026-11-11 | 0 | 68.6% | 1 | 9 | accepted | 1 |
| 2026-11-12 | 1 | 59.2% | 1 | 9 | accepted | 2 |
| 2026-11-13 | 0 | 49.6% | 2 | 10 | accepted | 1 |
| 2026-11-14 | 6 | 42.8% | 3 | 9 | accepted | 7 |
| 2026-11-15 | 1 | 32.4% | 3 | 10 | accepted | 2 |
| 2026-11-16 | 0 | 61.8% | 1 | 9 | accepted | 1 |
| 2026-11-17 | 0 | 41.8% | 3 | 6 | accepted | 1 |
| 2026-11-18 | 3 | 34.0% | 3 | 7 | accepted | 4 |
| 2026-11-19 | 1 | 45.0% | 2 | 9 | accepted | 2 |
| 2026-11-20 | 0 | 38.0% | 3 | 10 | accepted | 1 |
| 2026-11-21 | 0 | 34.4% | 3 | 10 | accepted | 1 |
| 2026-11-22 | 0 | 49.6% | 2 | 10 | accepted | 1 |
| 2026-11-23 | 1 | 65.2% | 1 | 9 | accepted | 2 |
| 2026-11-24 | 4 | 64.0% | 1 | 9 | accepted | 5 |
| 2026-11-25 | 3 | 65.4% | 1 | 7 | accepted | 4 |
| 2026-11-26 | 1 | 53.6% | 2 | 9 | accepted | 2 |
| 2026-11-27 | 0 | 34.0% | 3 | 8 | accepted | 1 |
| 2026-11-28 | 1 | 58.0% | 1 | 8 | accepted | 2 |
| 2026-11-29 | 9 | 62.6% | 1 | 6 | accepted | 10 |
| 2026-11-30 | 0 | 53.0% | 2 | 9 | accepted | 1 |
| 2026-12-01 | 1 | 57.6% | 1 | 5 | accepted | 2 |
| 2026-12-02 | 5 | 63.2% | 1 | 9 | accepted | 6 |
| 2026-12-03 | 9 | 35.0% | 3 | 8 | accepted | 10 |
| 2026-12-04 | 0 | 65.6% | 1 | 10 | accepted | 1 |
| 2026-12-05 | 8 | 64.4% | 1 | 6 | accepted | 9 |
| 2026-12-06 | 0 | 60.6% | 1 | 3 | accepted | 1 |
| 2026-12-07 | 3 | 30.6% | 3 | 9 | accepted | 4 |
| 2026-12-08 | 0 | 46.8% | 2 | 8 | accepted | 1 |
| 2026-12-09 | 3 | 54.0% | 2 | 8 | accepted | 4 |
| 2026-12-10 | 0 | 69.0% | 1 | 7 | accepted | 1 |
| 2026-12-11 | 4 | 55.8% | 2 | 7 | accepted | 5 |
| 2026-12-12 | 4 | 44.8% | 2 | 10 | accepted | 5 |
| 2026-12-13 | 0 | 58.2% | 1 | 8 | accepted | 1 |
| 2026-12-14 | 0 | 57.4% | 1 | 6 | accepted | 1 |
| 2026-12-15 | 2 | 53.6% | 2 | 7 | accepted | 3 |
| 2026-12-16 | 2 | 36.0% | 3 | 9 | accepted | 3 |
| 2026-12-17 | 1 | 57.8% | 1 | 8 | accepted | 2 |
| 2026-12-18 | 1 | 64.2% | 1 | 10 | accepted | 2 |

## Per-card play and win (expert)

Delta = win rate when played minus win rate when in the deck and not played. It is a correlation, not an effect: a card that is played early in a won game, or only in a long one, shifts it. All cards, best first.

| Card | In deck | Played | Play rate | Win when played | Win when held | Delta |
| --- | --- | --- | --- | --- | --- | --- |
| shroud | 12483 | 7095 | 56.8% | 55.9% | 34.5% | 21.3 pts |
| scrying-bones | 12462 | 7904 | 63.4% | 46.7% | 36.0% | 10.7 pts |
| unmake | 12484 | 2910 | 23.3% | 47.3% | 39.6% | 7.7 pts |
| bloodlust | 12574 | 7585 | 60.3% | 43.9% | 39.8% | 4.1 pts |
| mirror-sigil | 14338 | 10374 | 72.4% | 46.0% | 42.1% | 3.9 pts |
| bastion-warden | 0 | 68 | n/a | 61.8% | 61.8% | 0.0 pts |
| centaur-revenant | 0 | 15 | n/a | 60.0% | 60.0% | 0.0 pts |
| choir-of-ash | 0 | 1713 | n/a | 49.7% | 49.7% | 0.0 pts |
| clockwork-wyrm | 0 | 114 | n/a | 69.3% | 69.3% | 0.0 pts |
| colossus-of-seams | 0 | 27 | n/a | 48.1% | 48.1% | 0.0 pts |
| dragoon-abomination | 0 | 16 | n/a | 62.5% | 62.5% | 0.0 pts |
| feral-specter | 0 | 2052 | n/a | 51.7% | 51.7% | 0.0 pts |
| gorefang-drake | 0 | 12 | n/a | 83.3% | 83.3% | 0.0 pts |
| haunted-engine | 0 | 3030 | n/a | 49.7% | 49.7% | 0.0 pts |
| ironhide-chimera | 0 | 85 | n/a | 55.3% | 55.3% | 0.0 pts |
| packmaw | 0 | 3 | n/a | 66.7% | 66.7% | 0.0 pts |
| phantom-wyrm | 0 | 3811 | n/a | 66.0% | 66.0% | 0.0 pts |
| revenant-lord | 0 | 2729 | n/a | 60.0% | 60.0% | 0.0 pts |
| twin-throat-hydra | 0 | 5 | n/a | 80.0% | 80.0% | 0.0 pts |
| twinblade-paladin | 0 | 39 | n/a | 71.8% | 71.8% | 0.0 pts |
| nightglass-wyrm | 10199 | 3111 | 30.5% | 41.9% | 43.9% | -1.9 pts |
| siphon | 12418 | 9957 | 80.2% | 43.4% | 45.6% | -2.2 pts |
| kiln-whelp | 10347 | 3121 | 30.2% | 40.4% | 43.8% | -3.4 pts |
| gloam-stalker | 10261 | 2718 | 26.5% | 39.6% | 43.8% | -4.2 pts |
| drowned-oathkeeper | 9042 | 1809 | 20.0% | 38.9% | 43.8% | -4.9 pts |
| mourning-vassal | 9284 | 2176 | 23.4% | 37.8% | 43.2% | -5.4 pts |
| brine-lurker | 8993 | 1830 | 20.3% | 38.2% | 43.6% | -5.4 pts |
| gilded-wyrmling | 10330 | 2367 | 22.9% | 40.9% | 46.3% | -5.4 pts |
| thornwall | 14344 | 10238 | 71.4% | 40.5% | 46.3% | -5.8 pts |
| gale-serpent | 10216 | 2524 | 24.7% | 38.0% | 44.8% | -6.8 pts |
| pyre-wisp | 9212 | 1732 | 18.8% | 36.1% | 43.1% | -7.0 pts |
| cinderjaw-hound | 10292 | 2692 | 26.2% | 36.3% | 43.4% | -7.1 pts |
| coral-bastion | 9188 | 2014 | 21.9% | 33.3% | 40.7% | -7.4 pts |
| undertow-wyrm | 10383 | 2543 | 24.5% | 37.1% | 44.7% | -7.6 pts |
| snare | 14498 | 10322 | 71.2% | 40.1% | 47.7% | -7.6 pts |
| stormcrow | 9257 | 1936 | 20.9% | 35.5% | 43.2% | -7.7 pts |
| candle-templar | 9137 | 1817 | 19.9% | 37.0% | 44.8% | -7.8 pts |
| votive-spirit | 9217 | 1566 | 17.0% | 43.3% | 51.1% | -7.8 pts |
| weathervane-sentry | 9140 | 2236 | 24.5% | 33.0% | 41.0% | -8.0 pts |
| halo-stag | 9157 | 2229 | 24.3% | 36.7% | 44.9% | -8.2 pts |
| grave-effigy | 9168 | 2381 | 26.0% | 33.1% | 41.4% | -8.3 pts |
| tidebound-wraith | 9180 | 1845 | 20.1% | 41.7% | 50.1% | -8.4 pts |
| ashguard-squire | 9165 | 1988 | 21.7% | 35.0% | 43.8% | -8.9 pts |
| whispering-draft | 9217 | 1557 | 16.9% | 41.0% | 49.9% | -9.0 pts |
| windward-lancer | 9099 | 1685 | 18.5% | 34.7% | 44.6% | -9.9 pts |
| brazier-golem | 9175 | 2422 | 26.4% | 30.9% | 41.6% | -10.6 pts |
| reliquary-sentinel | 9217 | 2323 | 25.2% | 31.5% | 42.3% | -10.8 pts |
| last-rites | 14399 | 10363 | 72.0% | 38.2% | 49.7% | -11.4 pts |
| veil-shade | 9204 | 1813 | 19.7% | 33.0% | 45.4% | -12.5 pts |
| grave-recall | 12471 | 13 | 0.1% | 23.1% | 39.8% | -16.7 pts |

## Keyword exposure (expert)

Summons of a monster carrying the keyword. Trigger counts are not measured (see below).

| Keyword | Games | Summons | Win rate of those games |
| --- | --- | --- | --- |
| echo | 12504 | 30287 | 51.7% |
| haunt | 7008 | 9786 | 43.9% |
| pierce | 6822 | 9357 | 44.1% |
| sentinel | 11358 | 20276 | 39.0% |
| swift | 7744 | 10657 | 41.6% |
| ward | 3870 | 4459 | 39.8% |

## Performance

- workers: 10; duels: 20000; wall 45.6 s; 439 duels/s; **44 duels/s/core** (target at least 1000)
- expert: 20000 duels, 449.9 s of worker time, 44 duels/s/core
- difficulty check: 87500 duels, wall 216.8 s, 43 duels/s/core

## Not measured

- Per-keyword trigger counts: the engine run for the sim has events off, and no event names a keyword trigger. The report gives keyword exposure instead (summons of a monster carrying the keyword, and the win rate of those games).
- Per-card play counts cover Summon, Summon (Covetous), Cast and Set Trap. A Graft Chimera appears as its family, not as a played card.
- TARGET_DUEL_MINUTES and TARGET_RULES_LEARN_SECONDS: human-playtest figures, no simulation can measure them.
