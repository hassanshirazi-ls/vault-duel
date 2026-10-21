# Simulator report: quick, 2026-10-20

- content: version 0.2.0, hash `dc8ab66e64dc4c9febcc4424ff0ef2a3`
- expertHash: `0eb20ec33121d2dffb41434b07cc1b45`
- globals hash: `7e315a80bc4c575346cb3a47d8989e3e`
- overrides (--set): none
- content overrides (--ring, --collector): none
- arguments: `{"games":20000,"seedDates":60,"from":"2026-10-20","bots":["expert"]}`
- the complete globals used are in the JSON file next to this report

## Balance targets

| Id | Metric | Bot | Value | Target | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| BT-1 | Win rate | expert | 46.3% | 45% to 55% | **pass** | noise-free expert vs the Collector |
| BT-3 | Median rounds per game | expert | 8.00 | 9 to 11 | **fail** | median of the round histogram, all finished games |
| BT-3b | Share ending in rounds 8 to 12 | expert | 50.0% | more than half (rounds 8 to 12) | **pass** | "most" read as a majority (D-230) |
| BT-4 | Share ending in round 12 | expert | 11.5% | 15% to 30% | **fail** | includes games ended by the sealed Vault |
| BT-5 | Grafts per winning game | expert | 4.30 | 1.5 to 3 | **fail** | track.grafts over wins |
| BT-6 | Appraisal success rate | expert | 56.8% | 30% to 60% | **pass** | successes over attempts (39565 attempts); an attempt with no target fails |
| BT-7 | Unpriced appearance rate | expert | 48.3% | 20% to 40% | **fail** | share of games in which the Collector summoned his ace (track.unpriced) |
| BT-2 | Win rate | novice | n/a | 20% to 30% | **not measured** | the novice bot was not run |
| BT-2n | Win rate | naive | n/a | 20% to 30% | **not measured** | the naive bot was not run |
| BT-8 | Seed rejection rate | expert-noisy | 66.7% | at most 15% | **fail** | 120 of 180 candidate seeds rejected over 60 dates; 0 fallbacks (D-004 target: never) |
| DUEL-MIN | Duel length in minutes | - | n/a | 3 to 5 | **not measured** | needs human playtests, not a simulation |
| LEARN-SEC | Seconds to learn the rules | - | n/a | at most 60 | **not measured** | needs human playtests, not a simulation |
| PERF | Duels per second per core | expert | 44.37 | at least 1000 | **fail** | duels over summed worker busy time, start-up excluded (§18.10); falls when workers share cores |

## Anomalies

- seed rejection 66.7% is above TARGET_SEED_REJECT_MAX (0.15)
- duels/sec/core 44 is below PERF_DUELS_PER_SEC_PER_CORE (1000)

## Win rate by bot

| Bot | Games | Finished | Wins | Win rate | Median rounds | Mean rounds | p90 | Actions/game |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 20000 | 20000 | 9250 | 46.3% | 8.0 | 7.69 | 12 | 71 |

## Round at which the duel ended

| Bot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 0.0% | 0.0% | 2.5% | 6.6% | 13.3% | 16.3% | 11.2% | 12.9% | 11.9% | 7.2% | 6.5% | 11.5% |

## Per-bot detail

| Bot | Grafts per win | Appraisal success | Appraisal attempts | Unpriced appears | Intent accuracy | Intent samples | Crashed | Stuck |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 4.30 | 56.8% | 39565 | 48.3% | 60.2% | 145689 | 0 | 0 |

## Damage, Unstable Chimeras, vault

| Bot | Vault sealed | Median winning round | Unstable per game | Games with Unstable | Damage per round | To Collector | To player | Direct share |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 7.0% | 8.0 | 2.10 | 93.0% | 6.02 | 4.06 | 1.96 | 47.5% |

## Bond usage (per finished game)

| Bot | Grafts | Splits | Symbioses | Symbiote emerged | Symbiote double loss | Bond-turn share |
| --- | --- | --- | --- | --- | --- | --- |
| expert | 4.10 | 0.00 | 0.00 | 0.00 | 0.00 | 53.6% |

- expert endings: collectorDefeated 9250, playerDefeated 9355, vaultSealed 1395

## Difficulty check

- dates: 60, candidate seeds played: 180, rejected: 120
- rejection rate: **66.7%** (target at most 15.0%)
- dates needing at least one reroll: 42 of 60; mean rerolls per date 2.00; fallbacks 0

Candidate win rates (tenths):

| 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 28 | 23 | 15 | 15 | 18 | 14 | 13 | 15 | 20 | 19 |

| Date | k | Win rate | Stars | Par | Check | Candidates |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-20 | 2 | 31.8% | 3 | 7 | accepted | 3 |
| 2026-10-21 | 2 | 58.0% | 1 | 9 | accepted | 3 |
| 2026-10-22 | 1 | 47.0% | 2 | 8 | accepted | 2 |
| 2026-10-23 | 2 | 49.6% | 2 | 7 | accepted | 3 |
| 2026-10-24 | 8 | 46.4% | 2 | 4 | accepted | 9 |
| 2026-10-25 | 2 | 47.4% | 2 | 5 | accepted | 3 |
| 2026-10-26 | 1 | 68.2% | 1 | 8 | accepted | 2 |
| 2026-10-27 | 2 | 57.4% | 1 | 6 | accepted | 3 |
| 2026-10-28 | 5 | 40.8% | 3 | 8 | accepted | 6 |
| 2026-10-29 | 0 | 31.4% | 3 | 9 | accepted | 1 |
| 2026-10-30 | 0 | 33.0% | 3 | 6 | accepted | 1 |
| 2026-10-31 | 3 | 30.2% | 3 | 11 | accepted | 4 |
| 2026-11-01 | 5 | 36.2% | 3 | 10 | accepted | 6 |
| 2026-11-02 | 3 | 42.6% | 3 | 10 | accepted | 4 |
| 2026-11-03 | 1 | 45.8% | 2 | 10 | accepted | 2 |
| 2026-11-04 | 4 | 43.2% | 3 | 10 | accepted | 5 |
| 2026-11-05 | 0 | 68.8% | 1 | 5 | accepted | 1 |
| 2026-11-06 | 0 | 63.6% | 1 | 10 | accepted | 1 |
| 2026-11-07 | 1 | 40.4% | 3 | 8 | accepted | 2 |
| 2026-11-08 | 1 | 35.6% | 3 | 8 | accepted | 2 |
| 2026-11-09 | 4 | 46.4% | 2 | 8 | accepted | 5 |
| 2026-11-10 | 1 | 39.4% | 3 | 10 | accepted | 2 |
| 2026-11-11 | 0 | 64.4% | 1 | 10 | accepted | 1 |
| 2026-11-12 | 0 | 41.4% | 3 | 9 | accepted | 1 |
| 2026-11-13 | 3 | 46.2% | 2 | 9 | accepted | 4 |
| 2026-11-14 | 2 | 55.2% | 2 | 6 | accepted | 3 |
| 2026-11-15 | 1 | 54.8% | 2 | 6 | accepted | 2 |
| 2026-11-16 | 2 | 55.2% | 2 | 5 | accepted | 3 |
| 2026-11-17 | 0 | 38.2% | 3 | 4 | accepted | 1 |
| 2026-11-18 | 3 | 66.2% | 1 | 7 | accepted | 4 |
| 2026-11-19 | 0 | 62.2% | 1 | 8 | accepted | 1 |
| 2026-11-20 | 0 | 58.4% | 1 | 11 | accepted | 1 |
| 2026-11-21 | 0 | 47.4% | 2 | 9 | accepted | 1 |
| 2026-11-22 | 1 | 53.6% | 2 | 10 | accepted | 2 |
| 2026-11-23 | 2 | 44.4% | 2 | 8 | accepted | 3 |
| 2026-11-24 | 4 | 55.6% | 2 | 9 | accepted | 5 |
| 2026-11-25 | 2 | 45.4% | 2 | 11 | accepted | 3 |
| 2026-11-26 | 2 | 50.6% | 2 | 8 | accepted | 3 |
| 2026-11-27 | 0 | 36.2% | 3 | 6 | accepted | 1 |
| 2026-11-28 | 2 | 62.0% | 1 | 8 | accepted | 3 |
| 2026-11-29 | 7 | 63.0% | 1 | 9 | accepted | 8 |
| 2026-11-30 | 0 | 37.2% | 3 | 10 | accepted | 1 |
| 2026-12-01 | 0 | 31.2% | 3 | 9 | accepted | 1 |
| 2026-12-02 | 1 | 36.0% | 3 | 9 | accepted | 2 |
| 2026-12-03 | 3 | 33.6% | 3 | 9 | accepted | 4 |
| 2026-12-04 | 2 | 48.6% | 2 | 6 | accepted | 3 |
| 2026-12-05 | 9 | 52.0% | 2 | 6 | accepted | 10 |
| 2026-12-06 | 0 | 60.0% | 1 | 3 | accepted | 1 |
| 2026-12-07 | 2 | 58.8% | 1 | 6 | accepted | 3 |
| 2026-12-08 | 2 | 66.8% | 1 | 5 | accepted | 3 |
| 2026-12-09 | 0 | 39.8% | 3 | 5 | accepted | 1 |
| 2026-12-10 | 0 | 58.0% | 1 | 9 | accepted | 1 |
| 2026-12-11 | 2 | 37.4% | 3 | 9 | accepted | 3 |
| 2026-12-12 | 3 | 45.0% | 2 | 9 | accepted | 4 |
| 2026-12-13 | 1 | 64.4% | 1 | 8 | accepted | 2 |
| 2026-12-14 | 0 | 44.6% | 2 | 10 | accepted | 1 |
| 2026-12-15 | 11 | 65.4% | 1 | 8 | accepted | 12 |
| 2026-12-16 | 4 | 59.6% | 1 | 9 | accepted | 5 |
| 2026-12-17 | 1 | 65.4% | 1 | 7 | accepted | 2 |
| 2026-12-18 | 0 | 58.4% | 1 | 6 | accepted | 1 |

## Per-card play and win (expert)

Delta = win rate when played minus win rate when in the deck and not played. It is a correlation, not an effect: a card that is played early in a won game, or only in a long one, shifts it. All cards, best first.

| Card | In deck | Played | Play rate | Win when played | Win when held | Delta |
| --- | --- | --- | --- | --- | --- | --- |
| shroud | 12483 | 7013 | 56.2% | 59.5% | 37.6% | 21.9 pts |
| scrying-bones | 12462 | 7812 | 62.7% | 50.9% | 39.1% | 11.8 pts |
| unmake | 12484 | 3111 | 24.9% | 50.9% | 42.3% | 8.6 pts |
| mirror-sigil | 14338 | 10275 | 71.7% | 49.7% | 45.1% | 4.6 pts |
| bloodlust | 12574 | 7646 | 60.8% | 47.2% | 44.3% | 2.8 pts |
| bastion-warden | 0 | 83 | n/a | 61.4% | 61.4% | 0.0 pts |
| centaur-revenant | 0 | 10 | n/a | 60.0% | 60.0% | 0.0 pts |
| choir-of-ash | 0 | 1757 | n/a | 53.1% | 53.1% | 0.0 pts |
| clockwork-wyrm | 0 | 132 | n/a | 67.4% | 67.4% | 0.0 pts |
| colossus-of-seams | 0 | 24 | n/a | 29.2% | 29.2% | 0.0 pts |
| dragoon-abomination | 0 | 9 | n/a | 100.0% | 100.0% | 0.0 pts |
| feral-specter | 0 | 2130 | n/a | 56.2% | 56.2% | 0.0 pts |
| gorefang-drake | 0 | 11 | n/a | 72.7% | 72.7% | 0.0 pts |
| haunted-engine | 0 | 3130 | n/a | 54.2% | 54.2% | 0.0 pts |
| ironhide-chimera | 0 | 83 | n/a | 60.2% | 60.2% | 0.0 pts |
| packmaw | 0 | 3 | n/a | 66.7% | 66.7% | 0.0 pts |
| phantom-wyrm | 0 | 3968 | n/a | 69.8% | 69.8% | 0.0 pts |
| revenant-lord | 0 | 2844 | n/a | 64.1% | 64.1% | 0.0 pts |
| twin-throat-hydra | 0 | 6 | n/a | 66.7% | 66.7% | 0.0 pts |
| twinblade-paladin | 0 | 45 | n/a | 57.8% | 57.8% | 0.0 pts |
| nightglass-wyrm | 10199 | 3048 | 29.9% | 46.9% | 47.6% | -0.7 pts |
| kiln-whelp | 10347 | 3102 | 30.0% | 44.6% | 47.3% | -2.7 pts |
| siphon | 12418 | 9832 | 79.2% | 46.8% | 49.6% | -2.8 pts |
| gloam-stalker | 10261 | 2652 | 25.8% | 43.1% | 46.3% | -3.3 pts |
| candle-templar | 9137 | 1853 | 20.3% | 43.8% | 47.4% | -3.5 pts |
| mourning-vassal | 9284 | 2062 | 22.2% | 43.0% | 46.5% | -3.6 pts |
| cinderjaw-hound | 10292 | 2561 | 24.9% | 42.2% | 46.6% | -4.3 pts |
| thornwall | 14344 | 10051 | 70.1% | 44.1% | 49.1% | -5.0 pts |
| gilded-wyrmling | 10330 | 2275 | 22.0% | 45.2% | 50.5% | -5.3 pts |
| snare | 14498 | 10215 | 70.5% | 44.4% | 50.3% | -5.9 pts |
| undertow-wyrm | 10383 | 2490 | 24.0% | 41.4% | 47.6% | -6.2 pts |
| drowned-oathkeeper | 9042 | 1773 | 19.6% | 41.6% | 47.8% | -6.2 pts |
| stormcrow | 9257 | 1907 | 20.6% | 41.1% | 47.3% | -6.2 pts |
| pyre-wisp | 9212 | 1708 | 18.5% | 40.5% | 46.9% | -6.4 pts |
| halo-stag | 9157 | 2127 | 23.2% | 40.3% | 47.1% | -6.8 pts |
| gale-serpent | 10216 | 2473 | 24.2% | 40.9% | 48.7% | -7.8 pts |
| tidebound-wraith | 9180 | 1788 | 19.5% | 46.6% | 54.6% | -8.0 pts |
| grave-effigy | 9168 | 2355 | 25.7% | 36.6% | 44.8% | -8.1 pts |
| brine-lurker | 8993 | 1718 | 19.1% | 39.3% | 47.9% | -8.5 pts |
| weathervane-sentry | 9140 | 2182 | 23.9% | 35.6% | 45.0% | -9.4 pts |
| whispering-draft | 9217 | 1501 | 16.3% | 44.6% | 54.1% | -9.5 pts |
| coral-bastion | 9188 | 1911 | 20.8% | 35.1% | 44.7% | -9.6 pts |
| ashguard-squire | 9165 | 1953 | 21.3% | 37.4% | 47.1% | -9.6 pts |
| votive-spirit | 9217 | 1492 | 16.2% | 44.5% | 54.5% | -10.0 pts |
| windward-lancer | 9099 | 1596 | 17.5% | 36.9% | 47.0% | -10.1 pts |
| brazier-golem | 9175 | 2346 | 25.6% | 35.1% | 45.2% | -10.2 pts |
| last-rites | 14399 | 10272 | 71.3% | 42.1% | 52.5% | -10.4 pts |
| veil-shade | 9204 | 1794 | 19.5% | 37.6% | 48.2% | -10.6 pts |
| reliquary-sentinel | 9217 | 2207 | 23.9% | 34.1% | 45.8% | -11.6 pts |
| grave-recall | 12471 | 20 | 0.2% | 25.0% | 43.7% | -18.7 pts |

## Keyword exposure (expert)

Summons of a monster carrying the keyword. Trigger counts are not measured (see below).

| Keyword | Games | Summons | Win rate of those games |
| --- | --- | --- | --- |
| echo | 12684 | 30441 | 55.9% |
| haunt | 6800 | 9515 | 47.9% |
| pierce | 6753 | 9290 | 48.4% |
| sentinel | 11186 | 19915 | 42.3% |
| swift | 7605 | 10576 | 46.1% |
| ward | 3965 | 4569 | 45.1% |

## Performance

- workers: 10; duels: 20000; wall 45.5 s; 439 duels/s; **44 duels/s/core** (target at least 1000)
- expert: 20000 duels, 450.8 s of worker time, 44 duels/s/core
- difficulty check: 90000 duels, wall 221.0 s, 43 duels/s/core

## Not measured

- Per-keyword trigger counts: the engine run for the sim has events off, and no event names a keyword trigger. The report gives keyword exposure instead (summons of a monster carrying the keyword, and the win rate of those games).
- Per-card play counts cover Summon, Summon (Covetous), Cast and Set Trap. A Graft Chimera appears as its family, not as a played card.
- TARGET_DUEL_MINUTES and TARGET_RULES_LEARN_SECONDS: human-playtest figures, no simulation can measure them.
