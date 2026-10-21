# Simulator report: quick, 2026-10-21

- content: version 0.2.0, hash `dc8ab66e64dc4c9febcc4424ff0ef2a3`
- expertHash: `0eb20ec33121d2dffb41434b07cc1b45`
- globals hash: `6956b13975151b4a116b3b5ce735ea68`
- overrides (--set): none
- content overrides (--ring, --collector, --card): none
- arguments: `{"games":20000,"seedDates":60,"from":"2026-10-21","bots":["expert"]}`
- the complete globals used are in the JSON file next to this report

## Balance targets

| Id | Metric | Bot | Value | Target | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| BT-1 | Win rate | expert | 47.7% | 45% to 55% | **pass** | noise-free expert vs the Monarch |
| BT-3 | Median rounds per game | expert | 8.00 | 9 to 11 | **fail** | median of the round histogram, all finished games |
| BT-3b | Share ending in rounds 8 to 12 | expert | 59.9% | more than half (rounds 8 to 12) | **pass** | "most" read as a majority (D-230) |
| BT-4 | Share ending in round 12 | expert | 17.6% | 15% to 30% | **pass** | includes games ended by the sealed Vault |
| BT-5 | Grafts per winning game | expert | 4.40 | 3.5 to 5 | **pass** | track.grafts over wins |
| BT-6 | Levy success rate | expert | 36.7% | 30% to 60% | **pass** | successes over attempts (43185 attempts); an attempt with no target fails |
| BT-7 | Hollow Heir appearance rate | expert | 38.5% | 20% to 40% | **pass** | share of games in which the Monarch summoned his ace, The Hollow Heir (track.unpriced) |
| BT-2 | Win rate | novice | n/a | 20% to 30% | **not measured** | the novice bot was not run |
| BT-2n | Win rate | naive | n/a | 20% to 30% | **not measured** | the naive bot was not run |
| BT-8 | Dates that fall back | expert-noisy | 0.00 | none (D-004) | **pass** | 0 of 60 dates used the D-004 fallback seed |
| BT-8r | Seed rejection rate | expert-noisy | 63.9% | at most 15% | **info** | informational, compute cost (D-370): 106 of 166 candidate seeds rejected over 60 dates |
| DUEL-MIN | Duel length in minutes | - | n/a | 3 to 5 | **not measured** | needs human playtests, not a simulation |
| LEARN-SEC | Seconds to learn the rules | - | n/a | at most 60 | **not measured** | needs human playtests, not a simulation |
| PERF | Duels per second per core | expert | 37.89 | at least 1000 | **fail** | duels over summed worker busy time, start-up excluded (§18.10); falls when workers share cores |

## Anomalies

- duels/sec/core 38 is below PERF_DUELS_PER_SEC_PER_CORE (1000)

## Win rate by bot

| Bot | Games | Finished | Wins | Win rate | Median rounds | Mean rounds | p90 | Actions/game |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 20000 | 20000 | 9547 | 47.7% | 8.0 | 8.34 | 12 | 77 |

## Round at which the duel ended

| Bot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 0.0% | 0.0% | 0.8% | 3.7% | 10.0% | 15.0% | 10.5% | 13.0% | 13.1% | 8.1% | 8.0% | 17.6% |

## Per-bot detail

| Bot | Grafts per win | Levy success | Levy attempts | Hollow Heir appears | Intent accuracy | Intent samples | Crashed | Stuck |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 4.40 | 36.7% | 43185 | 38.5% | 60.7% | 158188 | 0 | 0 |

## Damage, Unstable Chimeras, vault

| Bot | Vault sealed | Median winning round | Unstable per game | Games with Unstable | Damage per round | To Monarch | To player | Direct share |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 11.9% | 8.0 | 2.15 | 93.8% | 6.28 | 4.32 | 1.96 | 49.8% |

## Bond usage (per finished game)

| Bot | Grafts | Splits | Symbioses | Symbiote emerged | Symbiote double loss | Bond-turn share |
| --- | --- | --- | --- | --- | --- | --- |
| expert | 4.28 | 0.00 | 0.00 | 0.00 | 0.00 | 51.7% |

- expert endings: collectorDefeated 9547, playerDefeated 8079, vaultSealed 2374

## Difficulty check

- dates: 60, candidate seeds played: 166, rejected: 106
- rejection rate: **63.9%** (compute guide at most 15.0%, D-370)
- dates needing at least one reroll: 41 of 60; mean rerolls per date 1.77; fallbacks 0

Candidate win rates (tenths):

| 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 22 | 14 | 25 | 16 | 14 | 12 | 17 | 16 | 21 | 9 |

| Date | k | Win rate | Stars | Par | Check | Candidates |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-21 | 2 | 45.0% | 2 | 8 | accepted | 3 |
| 2026-10-22 | 1 | 51.8% | 2 | 10 | accepted | 2 |
| 2026-10-23 | 0 | 63.4% | 1 | 5 | accepted | 1 |
| 2026-10-24 | 3 | 57.6% | 1 | 9 | accepted | 4 |
| 2026-10-25 | 2 | 45.2% | 2 | 6 | accepted | 3 |
| 2026-10-26 | 3 | 70.0% | 1 | 5 | accepted | 4 |
| 2026-10-27 | 2 | 43.4% | 2 | 6 | accepted | 3 |
| 2026-10-28 | 5 | 41.4% | 3 | 9 | accepted | 6 |
| 2026-10-29 | 0 | 54.6% | 2 | 10 | accepted | 1 |
| 2026-10-30 | 3 | 43.8% | 2 | 8 | accepted | 4 |
| 2026-10-31 | 10 | 60.4% | 1 | 8 | accepted | 11 |
| 2026-11-01 | 0 | 31.2% | 3 | 11 | accepted | 1 |
| 2026-11-02 | 3 | 50.2% | 2 | 9 | accepted | 4 |
| 2026-11-03 | 1 | 67.6% | 1 | 9 | accepted | 2 |
| 2026-11-04 | 4 | 41.0% | 3 | 10 | accepted | 5 |
| 2026-11-05 | 0 | 58.2% | 1 | 7 | accepted | 1 |
| 2026-11-06 | 0 | 44.0% | 2 | 11 | accepted | 1 |
| 2026-11-07 | 0 | 58.0% | 1 | 9 | accepted | 1 |
| 2026-11-08 | 1 | 36.4% | 3 | 9 | accepted | 2 |
| 2026-11-09 | 3 | 46.2% | 2 | 9 | accepted | 4 |
| 2026-11-10 | 1 | 33.6% | 3 | 12 | accepted | 2 |
| 2026-11-11 | 0 | 47.8% | 2 | 9 | accepted | 1 |
| 2026-11-12 | 0 | 32.6% | 3 | 10 | accepted | 1 |
| 2026-11-13 | 3 | 35.8% | 3 | 10 | accepted | 4 |
| 2026-11-14 | 2 | 65.2% | 1 | 6 | accepted | 3 |
| 2026-11-15 | 1 | 65.6% | 1 | 8 | accepted | 2 |
| 2026-11-16 | 0 | 45.4% | 2 | 9 | accepted | 1 |
| 2026-11-17 | 1 | 67.8% | 1 | 8 | accepted | 2 |
| 2026-11-18 | 3 | 52.4% | 2 | 7 | accepted | 4 |
| 2026-11-19 | 0 | 47.4% | 2 | 7 | accepted | 1 |
| 2026-11-20 | 0 | 52.0% | 2 | 11 | accepted | 1 |
| 2026-11-21 | 1 | 44.2% | 2 | 8 | accepted | 2 |
| 2026-11-22 | 1 | 48.6% | 2 | 10 | accepted | 2 |
| 2026-11-23 | 0 | 32.2% | 3 | 10 | accepted | 1 |
| 2026-11-24 | 0 | 68.4% | 1 | 8 | accepted | 1 |
| 2026-11-25 | 3 | 63.0% | 1 | 7 | accepted | 4 |
| 2026-11-26 | 2 | 60.2% | 1 | 9 | accepted | 3 |
| 2026-11-27 | 0 | 62.2% | 1 | 9 | accepted | 1 |
| 2026-11-28 | 2 | 39.4% | 3 | 9 | accepted | 3 |
| 2026-11-29 | 2 | 35.4% | 3 | 6 | accepted | 3 |
| 2026-11-30 | 0 | 62.8% | 1 | 9 | accepted | 1 |
| 2026-12-01 | 0 | 56.6% | 2 | 8 | accepted | 1 |
| 2026-12-02 | 1 | 33.0% | 3 | 10 | accepted | 2 |
| 2026-12-03 | 3 | 64.0% | 1 | 9 | accepted | 4 |
| 2026-12-04 | 1 | 63.8% | 1 | 11 | accepted | 2 |
| 2026-12-05 | 1 | 32.6% | 3 | 11 | accepted | 2 |
| 2026-12-06 | 0 | 55.0% | 2 | 5 | accepted | 1 |
| 2026-12-07 | 2 | 62.2% | 1 | 8 | accepted | 3 |
| 2026-12-08 | 2 | 62.8% | 1 | 7 | accepted | 3 |
| 2026-12-09 | 0 | 33.6% | 3 | 5 | accepted | 1 |
| 2026-12-10 | 0 | 46.4% | 2 | 11 | accepted | 1 |
| 2026-12-11 | 2 | 32.4% | 3 | 10 | accepted | 3 |
| 2026-12-12 | 17 | 32.8% | 3 | 8 | accepted | 18 |
| 2026-12-13 | 1 | 52.8% | 2 | 9 | accepted | 2 |
| 2026-12-14 | 3 | 67.0% | 1 | 10 | accepted | 4 |
| 2026-12-15 | 2 | 69.2% | 1 | 8 | accepted | 3 |
| 2026-12-16 | 1 | 31.0% | 3 | 10 | accepted | 2 |
| 2026-12-17 | 2 | 51.2% | 2 | 11 | accepted | 3 |
| 2026-12-18 | 1 | 33.6% | 3 | 11 | accepted | 2 |
| 2026-12-19 | 2 | 32.0% | 3 | 8 | accepted | 3 |

## Per-card play and win (expert)

Delta = win rate when played minus win rate when in the deck and not played. It is a correlation, not an effect: a card that is played early in a won game, or only in a long one, shifts it. All cards, best first.

| Card | In deck | Played | Play rate | Win when played | Win when held | Delta |
| --- | --- | --- | --- | --- | --- | --- |
| shroud | 12475 | 6706 | 53.8% | 63.6% | 38.3% | 25.4 pts |
| scrying-bones | 12451 | 8669 | 69.6% | 51.3% | 41.2% | 10.1 pts |
| unmake | 12498 | 3544 | 28.4% | 52.8% | 43.3% | 9.5 pts |
| nightglass-wyrm | 10207 | 3336 | 32.7% | 50.9% | 47.6% | 3.3 pts |
| bloodlust | 12582 | 8447 | 67.1% | 48.0% | 47.1% | 0.8 pts |
| bastion-warden | 0 | 75 | n/a | 65.3% | 65.3% | 0.0 pts |
| centaur-revenant | 0 | 19 | n/a | 63.2% | 63.2% | 0.0 pts |
| choir-of-ash | 0 | 2067 | n/a | 54.6% | 54.6% | 0.0 pts |
| clockwork-wyrm | 0 | 122 | n/a | 70.5% | 70.5% | 0.0 pts |
| colossus-of-seams | 0 | 31 | n/a | 54.8% | 54.8% | 0.0 pts |
| dragoon-abomination | 0 | 13 | n/a | 69.2% | 69.2% | 0.0 pts |
| feral-specter | 0 | 2235 | n/a | 53.0% | 53.0% | 0.0 pts |
| gorefang-drake | 0 | 10 | n/a | 60.0% | 60.0% | 0.0 pts |
| haunted-engine | 0 | 3506 | n/a | 54.8% | 54.8% | 0.0 pts |
| ironhide-chimera | 0 | 81 | n/a | 60.5% | 60.5% | 0.0 pts |
| packmaw | 0 | 4 | n/a | 50.0% | 50.0% | 0.0 pts |
| phantom-wyrm | 0 | 4166 | n/a | 66.5% | 66.5% | 0.0 pts |
| revenant-lord | 0 | 3048 | n/a | 59.5% | 59.5% | 0.0 pts |
| twin-throat-hydra | 0 | 6 | n/a | 83.3% | 83.3% | 0.0 pts |
| twinblade-paladin | 0 | 46 | n/a | 78.3% | 78.3% | 0.0 pts |
| cinderjaw-hound | 10300 | 2757 | 26.8% | 46.2% | 47.0% | -0.8 pts |
| mirror-sigil | 14335 | 10901 | 76.0% | 48.6% | 50.1% | -1.5 pts |
| kiln-whelp | 10340 | 3431 | 33.2% | 46.2% | 48.7% | -2.6 pts |
| gloam-stalker | 10250 | 2796 | 27.3% | 44.5% | 47.9% | -3.4 pts |
| mourning-vassal | 9287 | 2189 | 23.6% | 45.0% | 48.5% | -3.6 pts |
| undertow-wyrm | 10366 | 2767 | 26.7% | 43.9% | 48.4% | -4.5 pts |
| stormcrow | 9260 | 1995 | 21.5% | 42.8% | 47.8% | -5.0 pts |
| gilded-wyrmling | 10317 | 2577 | 25.0% | 45.8% | 51.3% | -5.5 pts |
| snare | 14502 | 10828 | 74.7% | 46.4% | 52.0% | -5.7 pts |
| siphon | 12402 | 10262 | 82.7% | 47.7% | 54.1% | -6.4 pts |
| thornwall | 14345 | 10819 | 75.4% | 45.1% | 53.0% | -7.9 pts |
| brine-lurker | 8984 | 1854 | 20.6% | 41.0% | 49.3% | -8.3 pts |
| grave-effigy | 9176 | 2346 | 25.6% | 39.1% | 47.5% | -8.4 pts |
| drowned-oathkeeper | 9064 | 1802 | 19.9% | 40.4% | 48.8% | -8.4 pts |
| candle-templar | 9144 | 1854 | 20.3% | 40.3% | 48.9% | -8.6 pts |
| halo-stag | 9163 | 2275 | 24.8% | 40.0% | 48.8% | -8.8 pts |
| tidebound-wraith | 9161 | 1819 | 19.9% | 47.6% | 56.5% | -8.9 pts |
| coral-bastion | 9202 | 1936 | 21.0% | 37.6% | 46.6% | -9.0 pts |
| gale-serpent | 10222 | 2703 | 26.4% | 40.8% | 49.9% | -9.2 pts |
| pyre-wisp | 9230 | 1717 | 18.6% | 39.3% | 49.0% | -9.7 pts |
| reliquary-sentinel | 9217 | 2158 | 23.4% | 37.7% | 47.5% | -9.8 pts |
| weathervane-sentry | 9147 | 2180 | 23.8% | 37.3% | 47.2% | -9.8 pts |
| brazier-golem | 9157 | 2342 | 25.6% | 38.0% | 48.1% | -10.1 pts |
| ashguard-squire | 9161 | 2076 | 22.7% | 37.7% | 48.6% | -10.9 pts |
| last-rites | 14383 | 10908 | 75.8% | 44.1% | 55.5% | -11.4 pts |
| whispering-draft | 9204 | 1607 | 17.5% | 43.7% | 55.3% | -11.6 pts |
| votive-spirit | 9206 | 1542 | 16.7% | 43.1% | 56.3% | -13.2 pts |
| windward-lancer | 9081 | 1664 | 18.3% | 35.7% | 49.3% | -13.6 pts |
| veil-shade | 9203 | 1796 | 19.5% | 37.0% | 50.9% | -13.9 pts |
| grave-recall | 12468 | 28 | 0.2% | 28.6% | 44.9% | -16.4 pts |

## Keyword exposure (expert)

Summons of a monster carrying the keyword. Trigger counts are not measured (see below).

| Keyword | Games | Summons | Win rate of those games |
| --- | --- | --- | --- |
| echo | 13368 | 34647 | 55.3% |
| haunt | 7102 | 10220 | 48.4% |
| pierce | 7144 | 10200 | 48.2% |
| sentinel | 11413 | 21767 | 44.4% |
| swift | 7947 | 11226 | 47.7% |
| ward | 4046 | 4759 | 42.8% |

## Performance

- workers: 10; duels: 20000; wall 53.4 s; 375 duels/s; **38 duels/s/core** (target at least 1000)
- expert: 20000 duels, 527.8 s of worker time, 38 duels/s/core
- difficulty check: 83000 duels, wall 232.5 s, 38 duels/s/core

## Not measured

- Per-keyword trigger counts: the engine run for the sim has events off, and no event names a keyword trigger. The report gives keyword exposure instead (summons of a monster carrying the keyword, and the win rate of those games).
- Per-card play counts cover Summon, Summon (Covetous), Cast and Set Trap. A Graft Chimera appears as its family, not as a played card.
- TARGET_DUEL_MINUTES and TARGET_RULES_LEARN_SECONDS: human-playtest figures, no simulation can measure them.
