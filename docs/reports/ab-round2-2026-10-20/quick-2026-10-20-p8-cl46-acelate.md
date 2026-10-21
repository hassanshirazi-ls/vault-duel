# Simulator report: quick, 2026-10-20

- content: version 0.2.0, hash `234f360ea832add2649e38903a9fe533`
- expertHash: `0eb20ec33121d2dffb41434b07cc1b45`
- globals hash: `73ccac00ed58528e50b48faf6406d87e`
- overrides (--set): `APPRAISAL_MIN_POWER=8` `COLLECTOR_LIFE=46`
- content overrides (--ring, --collector): `collector.ai.play=["winThisTurn","summonBeater","setTrapWhenBehind","castHighValueSpell","summonAce","summonFallback","utility"]` `collector.ai.moods.agitated.play=["winThisTurn","castHighValueSpell","summonBeater","summonAce","setTrapWhenBehind","summonFallback","utility"]`
- arguments: `{"games":20000,"seedDates":60,"from":"2026-10-20","bots":["expert"]}`
- the complete globals used are in the JSON file next to this report

## Balance targets

| Id | Metric | Bot | Value | Target | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| BT-1 | Win rate | expert | 48.4% | 45% to 55% | **pass** | noise-free expert vs the Monarch |
| BT-3 | Median rounds per game | expert | 8.00 | 9 to 11 | **fail** | median of the round histogram, all finished games |
| BT-3b | Share ending in rounds 8 to 12 | expert | 59.7% | more than half (rounds 8 to 12) | **pass** | "most" read as a majority (D-230) |
| BT-4 | Share ending in round 12 | expert | 17.5% | 15% to 30% | **pass** | includes games ended by the sealed Vault |
| BT-5 | Grafts per winning game | expert | 4.40 | 1.5 to 3 | **fail** | track.grafts over wins |
| BT-6 | Levy success rate | expert | 36.7% | 30% to 60% | **pass** | successes over attempts (43074 attempts); an attempt with no target fails |
| BT-7 | Hollow Heir appearance rate | expert | 33.8% | 20% to 40% | **pass** | share of games in which the Monarch summoned his ace, The Hollow Heir (track.unpriced) |
| BT-2 | Win rate | novice | n/a | 20% to 30% | **not measured** | the novice bot was not run |
| BT-2n | Win rate | naive | n/a | 20% to 30% | **not measured** | the naive bot was not run |
| BT-8 | Seed rejection rate | expert-noisy | 64.5% | at most 15% | **fail** | 109 of 169 candidate seeds rejected over 60 dates; 0 fallbacks (D-004 target: never) |
| DUEL-MIN | Duel length in minutes | - | n/a | 3 to 5 | **not measured** | needs human playtests, not a simulation |
| LEARN-SEC | Seconds to learn the rules | - | n/a | at most 60 | **not measured** | needs human playtests, not a simulation |
| PERF | Duels per second per core | expert | 40.95 | at least 1000 | **fail** | duels over summed worker busy time, start-up excluded (§18.10); falls when workers share cores |

## Anomalies

- seed rejection 64.5% is above TARGET_SEED_REJECT_MAX (0.15)
- duels/sec/core 41 is below PERF_DUELS_PER_SEC_PER_CORE (1000)

## Win rate by bot

| Bot | Games | Finished | Wins | Win rate | Median rounds | Mean rounds | p90 | Actions/game |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 20000 | 20000 | 9690 | 48.4% | 8.0 | 8.33 | 12 | 77 |

## Round at which the duel ended

| Bot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 0.0% | 0.0% | 0.8% | 3.8% | 10.1% | 15.0% | 10.5% | 13.0% | 13.1% | 8.2% | 8.0% | 17.5% |

## Per-bot detail

| Bot | Grafts per win | Levy success | Levy attempts | Hollow Heir appears | Intent accuracy | Intent samples | Crashed | Stuck |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 4.40 | 36.7% | 43074 | 33.8% | 60.6% | 157758 | 0 | 0 |

## Damage, Unstable Chimeras, vault

| Bot | Vault sealed | Median winning round | Unstable per game | Games with Unstable | Damage per round | To Monarch | To player | Direct share |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 11.8% | 8.0 | 2.15 | 93.7% | 6.30 | 4.35 | 1.95 | 49.9% |

## Bond usage (per finished game)

| Bot | Grafts | Splits | Symbioses | Symbiote emerged | Symbiote double loss | Bond-turn share |
| --- | --- | --- | --- | --- | --- | --- |
| expert | 4.28 | 0.00 | 0.00 | 0.00 | 0.00 | 51.7% |

- expert endings: collectorDefeated 9690, playerDefeated 7958, vaultSealed 2352

## Difficulty check

- dates: 60, candidate seeds played: 169, rejected: 109
- rejection rate: **64.5%** (target at most 15.0%)
- dates needing at least one reroll: 41 of 60; mean rerolls per date 1.82; fallbacks 0

Candidate win rates (tenths):

| 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20 | 15 | 23 | 16 | 16 | 12 | 15 | 19 | 21 | 12 |

| Date | k | Win rate | Stars | Par | Check | Candidates |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-20 | 2 | 31.4% | 3 | 9 | accepted | 3 |
| 2026-10-21 | 2 | 45.8% | 2 | 8 | accepted | 3 |
| 2026-10-22 | 1 | 52.0% | 2 | 10 | accepted | 2 |
| 2026-10-23 | 0 | 46.0% | 2 | 7 | accepted | 1 |
| 2026-10-24 | 3 | 58.8% | 1 | 8 | accepted | 4 |
| 2026-10-25 | 2 | 45.8% | 2 | 6 | accepted | 3 |
| 2026-10-26 | 3 | 70.0% | 1 | 5 | accepted | 4 |
| 2026-10-27 | 2 | 43.4% | 2 | 6 | accepted | 3 |
| 2026-10-28 | 5 | 41.6% | 3 | 9 | accepted | 6 |
| 2026-10-29 | 0 | 54.6% | 2 | 10 | accepted | 1 |
| 2026-10-30 | 0 | 30.0% | 3 | 6 | accepted | 1 |
| 2026-10-31 | 10 | 61.8% | 1 | 8 | accepted | 11 |
| 2026-11-01 | 0 | 37.2% | 3 | 11 | accepted | 1 |
| 2026-11-02 | 3 | 50.8% | 2 | 9 | accepted | 4 |
| 2026-11-03 | 1 | 67.6% | 1 | 9 | accepted | 2 |
| 2026-11-04 | 4 | 41.0% | 3 | 10 | accepted | 5 |
| 2026-11-05 | 0 | 59.6% | 1 | 7 | accepted | 1 |
| 2026-11-06 | 0 | 44.4% | 2 | 11 | accepted | 1 |
| 2026-11-07 | 0 | 62.2% | 1 | 9 | accepted | 1 |
| 2026-11-08 | 1 | 36.4% | 3 | 9 | accepted | 2 |
| 2026-11-09 | 3 | 46.2% | 2 | 8 | accepted | 4 |
| 2026-11-10 | 1 | 31.2% | 3 | 12 | accepted | 2 |
| 2026-11-11 | 2 | 43.8% | 2 | 9 | accepted | 3 |
| 2026-11-12 | 0 | 33.0% | 3 | 10 | accepted | 1 |
| 2026-11-13 | 3 | 36.2% | 3 | 10 | accepted | 4 |
| 2026-11-14 | 2 | 60.0% | 1 | 6 | accepted | 3 |
| 2026-11-15 | 1 | 66.2% | 1 | 8 | accepted | 2 |
| 2026-11-16 | 0 | 49.6% | 2 | 9 | accepted | 1 |
| 2026-11-17 | 4 | 45.2% | 2 | 9 | accepted | 5 |
| 2026-11-18 | 3 | 52.4% | 2 | 7 | accepted | 4 |
| 2026-11-19 | 0 | 48.4% | 2 | 6 | accepted | 1 |
| 2026-11-20 | 0 | 56.0% | 2 | 10 | accepted | 1 |
| 2026-11-21 | 1 | 46.0% | 2 | 8 | accepted | 2 |
| 2026-11-22 | 1 | 48.6% | 2 | 10 | accepted | 2 |
| 2026-11-23 | 0 | 42.2% | 3 | 9 | accepted | 1 |
| 2026-11-24 | 0 | 68.4% | 1 | 8 | accepted | 1 |
| 2026-11-25 | 3 | 63.0% | 1 | 7 | accepted | 4 |
| 2026-11-26 | 2 | 64.6% | 1 | 9 | accepted | 3 |
| 2026-11-27 | 0 | 63.8% | 1 | 9 | accepted | 1 |
| 2026-11-28 | 2 | 39.6% | 3 | 9 | accepted | 3 |
| 2026-11-29 | 1 | 30.0% | 3 | 8 | accepted | 2 |
| 2026-11-30 | 0 | 66.2% | 1 | 9 | accepted | 1 |
| 2026-12-01 | 0 | 56.8% | 1 | 8 | accepted | 1 |
| 2026-12-02 | 1 | 33.0% | 3 | 10 | accepted | 2 |
| 2026-12-03 | 3 | 65.8% | 1 | 9 | accepted | 4 |
| 2026-12-04 | 1 | 62.6% | 1 | 11 | accepted | 2 |
| 2026-12-05 | 1 | 32.6% | 3 | 11 | accepted | 2 |
| 2026-12-06 | 0 | 55.0% | 2 | 5 | accepted | 1 |
| 2026-12-07 | 2 | 63.0% | 1 | 8 | accepted | 3 |
| 2026-12-08 | 2 | 63.2% | 1 | 7 | accepted | 3 |
| 2026-12-09 | 0 | 33.6% | 3 | 5 | accepted | 1 |
| 2026-12-10 | 0 | 46.2% | 2 | 11 | accepted | 1 |
| 2026-12-11 | 2 | 35.8% | 3 | 10 | accepted | 3 |
| 2026-12-12 | 17 | 33.0% | 3 | 8 | accepted | 18 |
| 2026-12-13 | 1 | 54.0% | 2 | 9 | accepted | 2 |
| 2026-12-14 | 5 | 51.8% | 2 | 9 | accepted | 6 |
| 2026-12-15 | 2 | 69.4% | 1 | 8 | accepted | 3 |
| 2026-12-16 | 1 | 33.4% | 3 | 10 | accepted | 2 |
| 2026-12-17 | 2 | 53.8% | 2 | 11 | accepted | 3 |
| 2026-12-18 | 1 | 33.6% | 3 | 11 | accepted | 2 |

## Per-card play and win (expert)

Delta = win rate when played minus win rate when in the deck and not played. It is a correlation, not an effect: a card that is played early in a won game, or only in a long one, shifts it. All cards, best first.

| Card | In deck | Played | Play rate | Win when played | Win when held | Delta |
| --- | --- | --- | --- | --- | --- | --- |
| shroud | 12483 | 6686 | 53.6% | 64.3% | 39.1% | 25.2 pts |
| scrying-bones | 12462 | 8667 | 69.5% | 52.2% | 42.0% | 10.2 pts |
| unmake | 12484 | 3593 | 28.8% | 53.4% | 44.2% | 9.2 pts |
| nightglass-wyrm | 10199 | 3332 | 32.7% | 52.0% | 48.4% | 3.5 pts |
| bloodlust | 12574 | 8458 | 67.3% | 48.5% | 48.2% | 0.3 pts |
| bastion-warden | 0 | 78 | n/a | 66.7% | 66.7% | 0.0 pts |
| centaur-revenant | 0 | 24 | n/a | 62.5% | 62.5% | 0.0 pts |
| choir-of-ash | 0 | 2077 | n/a | 55.2% | 55.2% | 0.0 pts |
| clockwork-wyrm | 0 | 126 | n/a | 70.6% | 70.6% | 0.0 pts |
| colossus-of-seams | 0 | 32 | n/a | 56.3% | 56.3% | 0.0 pts |
| dragoon-abomination | 0 | 13 | n/a | 69.2% | 69.2% | 0.0 pts |
| feral-specter | 0 | 2262 | n/a | 53.5% | 53.5% | 0.0 pts |
| gorefang-drake | 0 | 10 | n/a | 60.0% | 60.0% | 0.0 pts |
| haunted-engine | 0 | 3489 | n/a | 55.4% | 55.4% | 0.0 pts |
| ironhide-chimera | 0 | 84 | n/a | 58.3% | 58.3% | 0.0 pts |
| packmaw | 0 | 3 | n/a | 66.7% | 66.7% | 0.0 pts |
| phantom-wyrm | 0 | 4208 | n/a | 67.2% | 67.2% | 0.0 pts |
| revenant-lord | 0 | 3111 | n/a | 59.9% | 59.9% | 0.0 pts |
| twin-throat-hydra | 0 | 5 | n/a | 80.0% | 80.0% | 0.0 pts |
| twinblade-paladin | 0 | 47 | n/a | 78.7% | 78.7% | 0.0 pts |
| cinderjaw-hound | 10292 | 2736 | 26.6% | 47.1% | 48.0% | -0.9 pts |
| kiln-whelp | 10347 | 3429 | 33.1% | 47.4% | 49.2% | -1.8 pts |
| mirror-sigil | 14338 | 10895 | 76.0% | 49.2% | 51.1% | -1.9 pts |
| gloam-stalker | 10261 | 2817 | 27.5% | 45.8% | 48.3% | -2.5 pts |
| mourning-vassal | 9284 | 2190 | 23.6% | 45.3% | 49.1% | -3.8 pts |
| undertow-wyrm | 10383 | 2737 | 26.4% | 44.5% | 48.9% | -4.4 pts |
| stormcrow | 9257 | 2008 | 21.7% | 43.5% | 48.6% | -5.1 pts |
| snare | 14498 | 10820 | 74.6% | 47.3% | 52.4% | -5.1 pts |
| gilded-wyrmling | 10330 | 2573 | 24.9% | 46.1% | 52.3% | -6.2 pts |
| siphon | 12418 | 10246 | 82.5% | 48.1% | 54.8% | -6.7 pts |
| brine-lurker | 8993 | 1858 | 20.7% | 42.2% | 49.8% | -7.5 pts |
| thornwall | 14344 | 10792 | 75.2% | 45.9% | 53.5% | -7.6 pts |
| candle-templar | 9137 | 1835 | 20.1% | 41.2% | 49.5% | -8.3 pts |
| drowned-oathkeeper | 9042 | 1784 | 19.7% | 41.3% | 49.7% | -8.4 pts |
| coral-bastion | 9188 | 1905 | 20.7% | 38.6% | 47.2% | -8.5 pts |
| grave-effigy | 9168 | 2339 | 25.5% | 39.6% | 48.2% | -8.6 pts |
| halo-stag | 9157 | 2271 | 24.8% | 40.8% | 49.6% | -8.8 pts |
| tidebound-wraith | 9180 | 1781 | 19.4% | 48.2% | 57.3% | -9.0 pts |
| gale-serpent | 10216 | 2703 | 26.5% | 41.4% | 50.5% | -9.1 pts |
| brazier-golem | 9175 | 2344 | 25.5% | 39.0% | 48.4% | -9.4 pts |
| reliquary-sentinel | 9217 | 2151 | 23.3% | 38.1% | 48.1% | -10.0 pts |
| pyre-wisp | 9212 | 1690 | 18.3% | 39.6% | 49.7% | -10.1 pts |
| weathervane-sentry | 9140 | 2163 | 23.7% | 37.9% | 48.0% | -10.1 pts |
| last-rites | 14399 | 10897 | 75.7% | 45.0% | 56.0% | -11.1 pts |
| ashguard-squire | 9165 | 2074 | 22.6% | 38.1% | 49.6% | -11.5 pts |
| whispering-draft | 9217 | 1609 | 17.5% | 44.4% | 56.0% | -11.6 pts |
| windward-lancer | 9099 | 1682 | 18.5% | 36.9% | 50.2% | -13.3 pts |
| votive-spirit | 9217 | 1527 | 16.6% | 43.4% | 56.7% | -13.3 pts |
| veil-shade | 9204 | 1806 | 19.6% | 38.2% | 51.6% | -13.5 pts |
| grave-recall | 12471 | 26 | 0.2% | 26.9% | 45.7% | -18.8 pts |

## Keyword exposure (expert)

Summons of a monster carrying the keyword. Trigger counts are not measured (see below).

| Keyword | Games | Summons | Win rate of those games |
| --- | --- | --- | --- |
| echo | 13395 | 34711 | 56.2% |
| haunt | 7083 | 10249 | 48.9% |
| pierce | 7181 | 10226 | 48.8% |
| sentinel | 11389 | 21667 | 45.1% |
| swift | 7967 | 11268 | 48.5% |
| ward | 4034 | 4758 | 43.6% |

## Performance

- workers: 10; duels: 20000; wall 49.4 s; 405 duels/s; **41 duels/s/core** (target at least 1000)
- expert: 20000 duels, 488.3 s of worker time, 41 duels/s/core
- difficulty check: 84500 duels, wall 228.3 s, 39 duels/s/core

## Not measured

- Per-keyword trigger counts: the engine run for the sim has events off, and no event names a keyword trigger. The report gives keyword exposure instead (summons of a monster carrying the keyword, and the win rate of those games).
- Per-card play counts cover Summon, Summon (Covetous), Cast and Set Trap. A Graft Chimera appears as its family, not as a played card.
- TARGET_DUEL_MINUTES and TARGET_RULES_LEARN_SECONDS: human-playtest figures, no simulation can measure them.
