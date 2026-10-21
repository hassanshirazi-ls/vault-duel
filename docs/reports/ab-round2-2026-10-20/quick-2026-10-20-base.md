# Simulator report: quick, 2026-10-20

- content: version 0.2.0, hash `dc8ab66e64dc4c9febcc4424ff0ef2a3`
- expertHash: `0eb20ec33121d2dffb41434b07cc1b45`
- globals hash: `1cc21c02357af877578d078dd5268146`
- overrides (--set): none
- content overrides (--ring, --collector): none
- arguments: `{"games":20000,"seedDates":60,"from":"2026-10-20","bots":["expert"]}`
- the complete globals used are in the JSON file next to this report

## Balance targets

| Id | Metric | Bot | Value | Target | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| BT-1 | Win rate | expert | 46.6% | 45% to 55% | **pass** | noise-free expert vs the Monarch |
| BT-3 | Median rounds per game | expert | 8.00 | 9 to 11 | **fail** | median of the round histogram, all finished games |
| BT-3b | Share ending in rounds 8 to 12 | expert | 55.6% | more than half (rounds 8 to 12) | **pass** | "most" read as a majority (D-230) |
| BT-4 | Share ending in round 12 | expert | 15.1% | 15% to 30% | **pass** | includes games ended by the sealed Vault |
| BT-5 | Grafts per winning game | expert | 4.34 | 1.5 to 3 | **fail** | track.grafts over wins |
| BT-6 | Levy success rate | expert | 55.5% | 30% to 60% | **pass** | successes over attempts (41524 attempts); an attempt with no target fails |
| BT-7 | Hollow Heir appearance rate | expert | 49.8% | 20% to 40% | **fail** | share of games in which the Monarch summoned his ace, The Hollow Heir (track.unpriced) |
| BT-2 | Win rate | novice | n/a | 20% to 30% | **not measured** | the novice bot was not run |
| BT-2n | Win rate | naive | n/a | 20% to 30% | **not measured** | the naive bot was not run |
| BT-8 | Seed rejection rate | expert-noisy | 63.6% | at most 15% | **fail** | 105 of 165 candidate seeds rejected over 60 dates; 0 fallbacks (D-004 target: never) |
| DUEL-MIN | Duel length in minutes | - | n/a | 3 to 5 | **not measured** | needs human playtests, not a simulation |
| LEARN-SEC | Seconds to learn the rules | - | n/a | at most 60 | **not measured** | needs human playtests, not a simulation |
| PERF | Duels per second per core | expert | 42.59 | at least 1000 | **fail** | duels over summed worker busy time, start-up excluded (§18.10); falls when workers share cores |

## Anomalies

- seed rejection 63.6% is above TARGET_SEED_REJECT_MAX (0.15)
- duels/sec/core 43 is below PERF_DUELS_PER_SEC_PER_CORE (1000)

## Win rate by bot

| Bot | Games | Finished | Wins | Win rate | Median rounds | Mean rounds | p90 | Actions/game |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 20000 | 20000 | 9310 | 46.6% | 8.0 | 8.07 | 12 | 74 |

## Round at which the duel ended

| Bot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 0.0% | 0.0% | 1.8% | 4.6% | 11.8% | 15.0% | 11.1% | 12.8% | 12.6% | 7.9% | 7.3% | 15.1% |

## Per-bot detail

| Bot | Grafts per win | Levy success | Levy attempts | Hollow Heir appears | Intent accuracy | Intent samples | Crashed | Stuck |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 4.34 | 55.5% | 41524 | 49.8% | 60.4% | 153027 | 0 | 0 |

## Damage, Unstable Chimeras, vault

| Bot | Vault sealed | Median winning round | Unstable per game | Games with Unstable | Damage per round | To Monarch | To player | Direct share |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 9.5% | 8.0 | 2.15 | 93.5% | 6.05 | 3.91 | 2.14 | 47.8% |

## Bond usage (per finished game)

| Bot | Grafts | Splits | Symbioses | Symbiote emerged | Symbiote double loss | Bond-turn share |
| --- | --- | --- | --- | --- | --- | --- |
| expert | 4.23 | 0.00 | 0.00 | 0.00 | 0.00 | 52.7% |

- expert endings: collectorDefeated 9310, playerDefeated 8799, vaultSealed 1891

## Difficulty check

- dates: 60, candidate seeds played: 165, rejected: 105
- rejection rate: **63.6%** (target at most 15.0%)
- dates needing at least one reroll: 41 of 60; mean rerolls per date 1.75; fallbacks 0

Candidate win rates (tenths):

| 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 23 | 24 | 9 | 15 | 19 | 15 | 11 | 14 | 17 | 18 |

| Date | k | Win rate | Stars | Par | Check | Candidates |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-20 | 2 | 46.0% | 2 | 7 | accepted | 3 |
| 2026-10-21 | 2 | 58.4% | 1 | 9 | accepted | 3 |
| 2026-10-22 | 1 | 52.4% | 2 | 8 | accepted | 2 |
| 2026-10-23 | 2 | 49.6% | 2 | 7 | accepted | 3 |
| 2026-10-24 | 3 | 63.4% | 1 | 9 | accepted | 4 |
| 2026-10-25 | 2 | 47.8% | 2 | 5 | accepted | 3 |
| 2026-10-26 | 1 | 65.6% | 1 | 8 | accepted | 2 |
| 2026-10-27 | 2 | 58.6% | 1 | 6 | accepted | 3 |
| 2026-10-28 | 0 | 33.6% | 3 | 7 | accepted | 1 |
| 2026-10-29 | 0 | 33.8% | 3 | 9 | accepted | 1 |
| 2026-10-30 | 0 | 34.0% | 3 | 6 | accepted | 1 |
| 2026-10-31 | 3 | 30.0% | 3 | 11 | accepted | 4 |
| 2026-11-01 | 5 | 35.8% | 3 | 10 | accepted | 6 |
| 2026-11-02 | 3 | 45.8% | 2 | 10 | accepted | 4 |
| 2026-11-03 | 1 | 47.6% | 2 | 10 | accepted | 2 |
| 2026-11-04 | 4 | 32.8% | 3 | 9 | accepted | 5 |
| 2026-11-05 | 1 | 67.0% | 1 | 9 | accepted | 2 |
| 2026-11-06 | 0 | 57.0% | 1 | 10 | accepted | 1 |
| 2026-11-07 | 0 | 67.8% | 1 | 9 | accepted | 1 |
| 2026-11-08 | 1 | 36.4% | 3 | 8 | accepted | 2 |
| 2026-11-09 | 3 | 52.8% | 2 | 8 | accepted | 4 |
| 2026-11-10 | 1 | 44.4% | 2 | 11 | accepted | 2 |
| 2026-11-11 | 0 | 59.2% | 1 | 10 | accepted | 1 |
| 2026-11-12 | 0 | 43.4% | 2 | 9 | accepted | 1 |
| 2026-11-13 | 3 | 44.6% | 2 | 9 | accepted | 4 |
| 2026-11-14 | 2 | 57.2% | 1 | 6 | accepted | 3 |
| 2026-11-15 | 1 | 67.8% | 1 | 8 | accepted | 2 |
| 2026-11-16 | 2 | 57.2% | 1 | 5 | accepted | 3 |
| 2026-11-17 | 0 | 37.4% | 3 | 4 | accepted | 1 |
| 2026-11-18 | 3 | 68.8% | 1 | 7 | accepted | 4 |
| 2026-11-19 | 0 | 62.0% | 1 | 8 | accepted | 1 |
| 2026-11-20 | 0 | 59.4% | 1 | 11 | accepted | 1 |
| 2026-11-21 | 0 | 46.0% | 2 | 9 | accepted | 1 |
| 2026-11-22 | 0 | 32.4% | 3 | 10 | accepted | 1 |
| 2026-11-23 | 2 | 41.4% | 3 | 8 | accepted | 3 |
| 2026-11-24 | 4 | 59.2% | 1 | 9 | accepted | 5 |
| 2026-11-25 | 2 | 42.6% | 3 | 11 | accepted | 3 |
| 2026-11-26 | 1 | 30.0% | 3 | 9 | accepted | 2 |
| 2026-11-27 | 1 | 68.8% | 1 | 8 | accepted | 2 |
| 2026-11-28 | 1 | 44.4% | 2 | 9 | accepted | 2 |
| 2026-11-29 | 5 | 34.4% | 3 | 9 | accepted | 6 |
| 2026-11-30 | 0 | 41.4% | 3 | 10 | accepted | 1 |
| 2026-12-01 | 0 | 41.4% | 3 | 9 | accepted | 1 |
| 2026-12-02 | 1 | 36.8% | 3 | 9 | accepted | 2 |
| 2026-12-03 | 3 | 33.8% | 3 | 9 | accepted | 4 |
| 2026-12-04 | 2 | 46.6% | 2 | 6 | accepted | 3 |
| 2026-12-05 | 8 | 39.4% | 3 | 10 | accepted | 9 |
| 2026-12-06 | 0 | 62.8% | 1 | 4 | accepted | 1 |
| 2026-12-07 | 2 | 40.8% | 3 | 6 | accepted | 3 |
| 2026-12-08 | 2 | 64.4% | 1 | 5 | accepted | 3 |
| 2026-12-09 | 0 | 49.0% | 2 | 5 | accepted | 1 |
| 2026-12-10 | 0 | 56.8% | 1 | 10 | accepted | 1 |
| 2026-12-11 | 2 | 39.8% | 3 | 9 | accepted | 3 |
| 2026-12-12 | 3 | 47.6% | 2 | 9 | accepted | 4 |
| 2026-12-13 | 1 | 59.4% | 1 | 8 | accepted | 2 |
| 2026-12-14 | 0 | 44.8% | 2 | 10 | accepted | 1 |
| 2026-12-15 | 11 | 60.0% | 1 | 8 | accepted | 12 |
| 2026-12-16 | 4 | 58.4% | 1 | 9 | accepted | 5 |
| 2026-12-17 | 2 | 59.4% | 1 | 9 | accepted | 3 |
| 2026-12-18 | 0 | 59.0% | 1 | 6 | accepted | 1 |

## Per-card play and win (expert)

Delta = win rate when played minus win rate when in the deck and not played. It is a correlation, not an effect: a card that is played early in a won game, or only in a long one, shifts it. All cards, best first.

| Card | In deck | Played | Play rate | Win when played | Win when held | Delta |
| --- | --- | --- | --- | --- | --- | --- |
| shroud | 12483 | 7242 | 58.0% | 59.0% | 38.4% | 20.6 pts |
| scrying-bones | 12462 | 8240 | 66.1% | 49.5% | 41.3% | 8.2 pts |
| unmake | 12484 | 3284 | 26.3% | 49.3% | 42.8% | 6.4 pts |
| bloodlust | 12574 | 8003 | 63.6% | 46.7% | 46.2% | 0.4 pts |
| bastion-warden | 0 | 95 | n/a | 51.6% | 51.6% | 0.0 pts |
| centaur-revenant | 0 | 11 | n/a | 54.5% | 54.5% | 0.0 pts |
| choir-of-ash | 0 | 1882 | n/a | 51.6% | 51.6% | 0.0 pts |
| clockwork-wyrm | 0 | 131 | n/a | 71.0% | 71.0% | 0.0 pts |
| colossus-of-seams | 0 | 24 | n/a | 37.5% | 37.5% | 0.0 pts |
| dragoon-abomination | 0 | 9 | n/a | 100.0% | 100.0% | 0.0 pts |
| feral-specter | 0 | 2288 | n/a | 55.9% | 55.9% | 0.0 pts |
| gorefang-drake | 0 | 10 | n/a | 60.0% | 60.0% | 0.0 pts |
| haunted-engine | 0 | 3271 | n/a | 53.0% | 53.0% | 0.0 pts |
| ironhide-chimera | 0 | 90 | n/a | 62.2% | 62.2% | 0.0 pts |
| packmaw | 0 | 4 | n/a | 50.0% | 50.0% | 0.0 pts |
| phantom-wyrm | 0 | 4131 | n/a | 69.0% | 69.0% | 0.0 pts |
| revenant-lord | 0 | 3004 | n/a | 63.2% | 63.2% | 0.0 pts |
| twin-throat-hydra | 0 | 6 | n/a | 66.7% | 66.7% | 0.0 pts |
| twinblade-paladin | 0 | 48 | n/a | 62.5% | 62.5% | 0.0 pts |
| nightglass-wyrm | 10199 | 3164 | 31.0% | 45.5% | 48.4% | -2.9 pts |
| mirror-sigil | 14338 | 10655 | 74.3% | 46.4% | 51.2% | -4.7 pts |
| gloam-stalker | 10261 | 2761 | 26.9% | 41.7% | 47.1% | -5.4 pts |
| kiln-whelp | 10347 | 3244 | 31.4% | 43.0% | 48.6% | -5.6 pts |
| mourning-vassal | 9284 | 2168 | 23.4% | 41.6% | 47.2% | -5.6 pts |
| candle-templar | 9137 | 1940 | 21.2% | 41.9% | 48.2% | -6.3 pts |
| stormcrow | 9257 | 1965 | 21.2% | 41.3% | 47.9% | -6.7 pts |
| cinderjaw-hound | 10292 | 2656 | 25.8% | 40.7% | 47.5% | -6.8 pts |
| thornwall | 14344 | 10429 | 72.7% | 44.1% | 51.7% | -7.5 pts |
| gilded-wyrmling | 10330 | 2359 | 22.8% | 43.6% | 51.2% | -7.6 pts |
| drowned-oathkeeper | 9042 | 1837 | 20.3% | 39.9% | 48.2% | -8.3 pts |
| siphon | 12418 | 10144 | 81.7% | 46.2% | 54.7% | -8.5 pts |
| brine-lurker | 8993 | 1795 | 20.0% | 39.7% | 48.4% | -8.7 pts |
| snare | 14498 | 10561 | 72.8% | 44.2% | 53.0% | -8.7 pts |
| pyre-wisp | 9212 | 1803 | 19.6% | 38.5% | 47.6% | -9.1 pts |
| halo-stag | 9157 | 2214 | 24.2% | 38.5% | 47.9% | -9.4 pts |
| undertow-wyrm | 10383 | 2570 | 24.8% | 39.6% | 49.0% | -9.4 pts |
| gale-serpent | 10216 | 2598 | 25.4% | 40.1% | 49.6% | -9.5 pts |
| grave-effigy | 9168 | 2435 | 26.6% | 35.3% | 45.3% | -10.0 pts |
| coral-bastion | 9188 | 1996 | 21.7% | 34.9% | 45.2% | -10.2 pts |
| weathervane-sentry | 9140 | 2275 | 24.9% | 35.2% | 45.5% | -10.3 pts |
| tidebound-wraith | 9180 | 1864 | 20.3% | 45.4% | 55.7% | -10.3 pts |
| brazier-golem | 9175 | 2449 | 26.7% | 35.3% | 45.8% | -10.6 pts |
| whispering-draft | 9217 | 1591 | 17.3% | 44.1% | 55.0% | -10.8 pts |
| ashguard-squire | 9165 | 2037 | 22.2% | 36.3% | 47.6% | -11.4 pts |
| reliquary-sentinel | 9217 | 2281 | 24.7% | 34.5% | 46.3% | -11.8 pts |
| windward-lancer | 9099 | 1674 | 18.4% | 35.9% | 47.9% | -11.9 pts |
| votive-spirit | 9217 | 1589 | 17.2% | 43.0% | 55.5% | -12.5 pts |
| veil-shade | 9204 | 1878 | 20.4% | 36.4% | 49.4% | -13.0 pts |
| last-rites | 14399 | 10647 | 73.9% | 42.3% | 55.7% | -13.4 pts |
| grave-recall | 12471 | 24 | 0.2% | 16.7% | 43.9% | -27.2 pts |

## Keyword exposure (expert)

Summons of a monster carrying the keyword. Trigger counts are not measured (see below).

| Keyword | Games | Summons | Win rate of those games |
| --- | --- | --- | --- |
| echo | 13144 | 33302 | 55.2% |
| haunt | 7111 | 10136 | 47.1% |
| pierce | 7021 | 9886 | 47.6% |
| sentinel | 11442 | 21260 | 42.1% |
| swift | 7841 | 11169 | 45.5% |
| ward | 4134 | 4836 | 43.9% |

## Performance

- workers: 10; duels: 20000; wall 48.4 s; 413 duels/s; **43 duels/s/core** (target at least 1000)
- expert: 20000 duels, 469.5 s of worker time, 43 duels/s/core
- difficulty check: 82500 duels, wall 211.8 s, 41 duels/s/core

## Not measured

- Per-keyword trigger counts: the engine run for the sim has events off, and no event names a keyword trigger. The report gives keyword exposure instead (summons of a monster carrying the keyword, and the win rate of those games).
- Per-card play counts cover Summon, Summon (Covetous), Cast and Set Trap. A Graft Chimera appears as its family, not as a played card.
- TARGET_DUEL_MINUTES and TARGET_RULES_LEARN_SECONDS: human-playtest figures, no simulation can measure them.
