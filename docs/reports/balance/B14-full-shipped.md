# Simulator report: full, 2026-10-16

- content: version 0.2.0, hash `d3e7143c19bccd4de728098a6cfac743`
- expertHash: `bc736183d560749358df649b5dccdbbf`
- globals hash: `e3dd3263828cb5aa4eaa9fa316697930`
- overrides (--set): none
- content overrides (--ring, --collector): none
- arguments: `{"games":50000,"seedDates":60,"from":"2026-10-16","bots":["expert","novice"]}`
- the complete globals used are in the JSON file next to this report

## Balance targets

| Id | Metric | Bot | Value | Target | Result | Note |
| --- | --- | --- | --- | --- | --- | --- |
| BT-1 | Win rate | expert | 51.4% | 45% to 55% | **pass** | noise-free expert vs the Collector |
| BT-3 | Median rounds per game | expert | 5.00 | 9 to 11 | **fail** | median of the round histogram, all finished games |
| BT-3b | Share ending in rounds 8 to 12 | expert | 15.9% | more than half (rounds 8 to 12) | **fail** | "most" read as a majority (D-230) |
| BT-4 | Share ending in round 12 | expert | 1.5% | 15% to 30% | **fail** | includes games ended by the sealed Vault |
| BT-5 | Grafts per winning game | expert | 2.00 | 1.5 to 3 | **pass** | track.grafts over wins |
| BT-6 | Appraisal success rate | expert | 49.7% | 30% to 60% | **pass** | successes over attempts (64736 attempts); an attempt with no target fails |
| BT-7 | Unpriced appearance rate | expert | 23.0% | 20% to 40% | **pass** | share of games in which the Collector summoned his ace (track.unpriced) |
| BT-2 | Win rate | novice | 0.3% | 20% to 30% | **fail** | uniform random legal action (D-117), 24.7 points from the 0.25 point |
| BT-8 | Seed rejection rate | expert-noisy | 73.7% | at most 15% | **fail** | 165 of 224 candidate seeds rejected over 60 dates; 1 fallbacks (D-004 target: never) |
| DUEL-MIN | Duel length in minutes | - | n/a | 3 to 5 | **not measured** | needs human playtests, not a simulation |
| LEARN-SEC | Seconds to learn the rules | - | n/a | at most 60 | **not measured** | needs human playtests, not a simulation |
| PERF | Duels per second per core | expert | 65.24 | at least 1000 | **fail** | duels over summed worker busy time, start-up excluded (§18.10); falls when workers share cores |

## Anomalies

- 1 dates reached the D-004 fallback (target: never)
- seed rejection 73.7% is above TARGET_SEED_REJECT_MAX (0.15)
- duels/sec/core 65 is below PERF_DUELS_PER_SEC_PER_CORE (1000)

## Win rate by bot

| Bot | Games | Finished | Wins | Win rate | Median rounds | Mean rounds | p90 | Actions/game |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 50000 | 50000 | 25706 | 51.4% | 5.0 | 5.54 | 8 | 40 |
| novice | 50000 | 50000 | 169 | 0.3% | 7.0 | 7.42 | 12 | 51 |

## Round at which the duel ended

| Bot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 0.0% | 0.9% | 16.3% | 15.5% | 23.2% | 17.8% | 10.4% | 6.9% | 4.2% | 2.0% | 1.2% | 1.5% |
| novice | 0.0% | 0.3% | 8.0% | 15.6% | 11.5% | 14.0% | 7.6% | 5.8% | 6.8% | 4.1% | 3.4% | 22.9% |

## Per-bot detail

| Bot | Grafts per win | Appraisal success | Appraisal attempts | Unpriced appears | Intent accuracy | Intent samples | Crashed | Stuck |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 2.00 | 49.7% | 64736 | 23.0% | 60.1% | 252771 | 0 | 0 |
| novice | 1.05 | 50.2% | 100276 | 29.7% | 61.5% | 369304 | 0 | 0 |

## Damage, Unstable Chimeras, vault

| Bot | Vault sealed | Median winning round | Unstable per game | Games with Unstable | Damage per round | To Collector | To player | Direct share |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert | 0.9% | 5.0 | 1.00 | 68.7% | 6.00 | 3.47 | 2.53 | 45.4% |
| novice | 19.9% | 10.0 | 0.51 | 41.6% | 2.98 | 0.24 | 2.74 | 50.2% |

## Bond usage (per finished game)

| Bot | Grafts | Splits | Symbioses | Symbiote emerged | Symbiote double loss | Bond-turn share |
| --- | --- | --- | --- | --- | --- | --- |
| expert | 1.77 | 0.38 | 1.41 | 1.03 | 0.14 | 64.4% |
| novice | 0.93 | 0.11 | 2.17 | 1.74 | 0.35 | 55.7% |

- expert endings: collectorDefeated 25706, playerDefeated 23864, vaultSealed 430
- novice endings: collectorDefeated 169, playerDefeated 39862, vaultSealed 9969

## Difficulty check

- dates: 60, candidate seeds played: 224, rejected: 165
- rejection rate: **73.7%** (target at most 15.0%)
- dates needing at least one reroll: 38 of 60; mean rerolls per date 2.75; fallbacks 1

Candidate win rates (tenths):

| 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 51 | 19 | 14 | 21 | 19 | 9 | 10 | 20 | 24 | 37 |

| Date | k | Win rate | Stars | Par | Check | Candidates |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-16 | 0 | 37.4% | 3 | 6 | accepted | 1 |
| 2026-10-17 | 0 | 36.8% | 3 | 8 | accepted | 1 |
| 2026-10-18 | 3 | 39.0% | 3 | 5 | accepted | 4 |
| 2026-10-19 | 12 | 30.6% | 3 | 5 | accepted | 13 |
| 2026-10-20 | 0 | 53.0% | 2 | 6 | accepted | 1 |
| 2026-10-21 | 6 | 44.6% | 2 | 7 | accepted | 7 |
| 2026-10-22 | 0 | 49.0% | 2 | 5 | accepted | 1 |
| 2026-10-23 | 2 | 61.2% | 1 | 6 | accepted | 3 |
| 2026-10-24 | 5 | 50.8% | 2 | 6 | accepted | 6 |
| 2026-10-25 | 1 | 52.6% | 2 | 5 | accepted | 2 |
| 2026-10-26 | 0 | 40.8% | 3 | 8 | accepted | 1 |
| 2026-10-27 | 1 | 31.6% | 3 | 7 | accepted | 2 |
| 2026-10-28 | 1 | 64.2% | 1 | 3 | accepted | 2 |
| 2026-10-29 | 3 | 33.6% | 3 | 6 | accepted | 4 |
| 2026-10-30 | 5 | 30.4% | 3 | 8 | accepted | 6 |
| 2026-10-31 | 0 | 42.2% | 3 | 5 | accepted | 1 |
| 2026-11-01 | 2 | 41.0% | 3 | 6 | accepted | 3 |
| 2026-11-02 | 11 | 46.8% | 2 | 8 | accepted | 12 |
| 2026-11-03 | 14 | 48.6% | 2 | 5 | accepted | 15 |
| 2026-11-04 | 0 | 40.0% | 3 | 5 | accepted | 1 |
| 2026-11-05 | 2 | 43.2% | 3 | 6 | accepted | 3 |
| 2026-11-06 | 1 | 38.8% | 3 | 8 | accepted | 2 |
| 2026-11-07 | 7 | 63.8% | 1 | 6 | accepted | 8 |
| 2026-11-08 | 0 | 69.6% | 1 | 6 | accepted | 1 |
| 2026-11-09 | 2 | 59.6% | 1 | 5 | accepted | 3 |
| 2026-11-10 | 0 | 32.0% | 3 | 8 | accepted | 1 |
| 2026-11-11 | 1 | 44.6% | 2 | 8 | accepted | 2 |
| 2026-11-12 | 2 | 39.6% | 3 | 9 | accepted | 3 |
| 2026-11-13 | 5 | 43.2% | 3 | 7 | accepted | 6 |
| 2026-11-14 | 1 | 60.8% | 1 | 3 | accepted | 2 |
| 2026-11-15 | 1 | 62.6% | 1 | 8 | accepted | 2 |
| 2026-11-16 | 0 | 44.0% | 2 | 6 | accepted | 1 |
| 2026-11-17 | 0 | 59.0% | 1 | 3 | accepted | 1 |
| 2026-11-18 | 1 | 40.4% | 3 | 6 | accepted | 2 |
| 2026-11-19 | 0 | 36.8% | 3 | 6 | accepted | 1 |
| 2026-11-20 | 0 | 30.2% | 3 | 9 | accepted | 1 |
| 2026-11-21 | 5 | 30.6% | 3 | 6 | accepted | 6 |
| 2026-11-22 | 0 | 67.4% | 1 | 5 | accepted | 1 |
| 2026-11-23 | 5 | 50.2% | 2 | 7 | accepted | 6 |
| 2026-11-24 | 4 | 65.8% | 1 | 5 | accepted | 5 |
| 2026-11-25 | 0 | 62.8% | 1 | 4 | accepted | 1 |
| 2026-11-26 | 0 | 47.0% | 2 | 5 | accepted | 1 |
| 2026-11-27 | 0 | 48.8% | 2 | 5 | accepted | 1 |
| 2026-11-28 | 4 | 54.8% | 2 | 8 | accepted | 5 |
| 2026-11-29 | 1 | 36.4% | 3 | 6 | accepted | 2 |
| 2026-11-30 | 0 | 47.6% | 2 | 9 | accepted | 1 |
| 2026-12-01 | 2 | 35.6% | 3 | 9 | accepted | 3 |
| 2026-12-02 | 7 | 49.0% | 2 | 5 | accepted | 8 |
| 2026-12-03 | 2 | 59.2% | 1 | 3 | accepted | 3 |
| 2026-12-04 | 0 | 56.8% | 1 | 5 | accepted | 1 |
| 2026-12-05 | 0 | 31.0% | 3 | 10 | accepted | 1 |
| 2026-12-06 | 2 | 41.8% | 3 | 4 | accepted | 3 |
| 2026-12-07 | 1 | 32.6% | 3 | 8 | accepted | 2 |
| 2026-12-08 | 3 | 35.4% | 3 | 8 | accepted | 4 |
| 2026-12-09 | 2 | 71.8% | 1 | 6 | fallback | 21 |
| 2026-12-10 | 3 | 49.4% | 2 | 9 | accepted | 4 |
| 2026-12-11 | 0 | 36.0% | 3 | 6 | accepted | 1 |
| 2026-12-12 | 0 | 34.0% | 3 | 5 | accepted | 1 |
| 2026-12-13 | 9 | 32.0% | 3 | 5 | accepted | 10 |
| 2026-12-14 | 7 | 68.8% | 1 | 7 | accepted | 8 |

## Per-card play and win (expert)

Delta = win rate when played minus win rate when in the deck and not played. It is a correlation, not an effect: a card that is played early in a won game, or only in a long one, shifts it. All cards, best first.

| Card | In deck | Played | Play rate | Win when played | Win when held | Delta |
| --- | --- | --- | --- | --- | --- | --- |
| scrying-bones | 31176 | 2688 | 8.6% | 94.8% | 45.5% | 49.3 pts |
| shroud | 31206 | 8737 | 28.0% | 63.9% | 49.7% | 14.2 pts |
| grave-recall | 31170 | 149 | 0.5% | 61.1% | 50.0% | 11.1 pts |
| unmake | 31160 | 4151 | 13.3% | 53.4% | 50.4% | 2.9 pts |
| siphon | 31195 | 16727 | 53.6% | 55.5% | 52.8% | 2.7 pts |
| bastion-warden | 0 | 103 | n/a | 67.0% | 67.0% | 0.0 pts |
| centaur-revenant | 0 | 48 | n/a | 58.3% | 58.3% | 0.0 pts |
| choir-of-ash | 0 | 1898 | n/a | 44.9% | 44.9% | 0.0 pts |
| clockwork-wyrm | 0 | 128 | n/a | 78.9% | 78.9% | 0.0 pts |
| colossus-of-seams | 0 | 64 | n/a | 54.7% | 54.7% | 0.0 pts |
| dragoon-abomination | 0 | 34 | n/a | 79.4% | 79.4% | 0.0 pts |
| feral-specter | 0 | 1464 | n/a | 52.1% | 52.1% | 0.0 pts |
| gorefang-drake | 0 | 31 | n/a | 87.1% | 87.1% | 0.0 pts |
| haunted-engine | 0 | 3037 | n/a | 55.1% | 55.1% | 0.0 pts |
| ironhide-chimera | 0 | 111 | n/a | 71.2% | 71.2% | 0.0 pts |
| packmaw | 0 | 4 | n/a | 50.0% | 50.0% | 0.0 pts |
| phantom-wyrm | 0 | 2602 | n/a | 76.2% | 76.2% | 0.0 pts |
| revenant-lord | 0 | 2713 | n/a | 67.3% | 67.3% | 0.0 pts |
| twin-throat-hydra | 0 | 16 | n/a | 75.0% | 75.0% | 0.0 pts |
| twinblade-paladin | 0 | 60 | n/a | 75.0% | 75.0% | 0.0 pts |
| kiln-whelp | 25652 | 11484 | 44.8% | 49.5% | 52.9% | -3.5 pts |
| nightglass-wyrm | 25684 | 11695 | 45.5% | 48.3% | 52.8% | -4.5 pts |
| gloam-stalker | 25859 | 6517 | 25.2% | 46.5% | 53.1% | -6.6 pts |
| bloodlust | 31368 | 6987 | 22.3% | 44.9% | 51.8% | -6.9 pts |
| undertow-wyrm | 25769 | 8555 | 33.2% | 45.7% | 54.6% | -8.8 pts |
| mourning-vassal | 22936 | 5030 | 21.9% | 44.5% | 53.8% | -9.3 pts |
| halo-stag | 22876 | 6201 | 27.1% | 43.8% | 53.8% | -10.0 pts |
| cinderjaw-hound | 25810 | 6305 | 24.4% | 42.9% | 53.6% | -10.7 pts |
| candle-templar | 22933 | 3238 | 14.1% | 42.8% | 53.9% | -11.1 pts |
| brine-lurker | 22829 | 3764 | 16.5% | 42.5% | 53.7% | -11.2 pts |
| gale-serpent | 25587 | 8170 | 31.9% | 43.3% | 54.6% | -11.3 pts |
| mirror-sigil | 35840 | 3622 | 10.1% | 41.4% | 52.7% | -11.3 pts |
| drowned-oathkeeper | 22653 | 3090 | 13.6% | 42.6% | 54.0% | -11.4 pts |
| gilded-wyrmling | 25859 | 4708 | 18.2% | 42.9% | 55.0% | -12.1 pts |
| grave-effigy | 22930 | 4503 | 19.6% | 39.5% | 53.0% | -13.5 pts |
| ashguard-squire | 23070 | 5689 | 24.7% | 39.6% | 53.8% | -14.2 pts |
| brazier-golem | 22967 | 4458 | 19.4% | 38.3% | 52.9% | -14.6 pts |
| stormcrow | 22957 | 3619 | 15.8% | 39.0% | 53.6% | -14.6 pts |
| veil-shade | 22845 | 2672 | 11.7% | 38.4% | 53.4% | -15.0 pts |
| pyre-wisp | 22880 | 2540 | 11.1% | 38.3% | 53.8% | -15.5 pts |
| reliquary-sentinel | 23107 | 4427 | 19.2% | 36.8% | 53.0% | -16.2 pts |
| snare | 36302 | 3648 | 10.0% | 36.0% | 53.1% | -17.2 pts |
| weathervane-sentry | 23006 | 4195 | 18.2% | 35.1% | 53.1% | -18.1 pts |
| windward-lancer | 22849 | 2592 | 11.3% | 34.1% | 53.3% | -19.2 pts |
| thornwall | 35955 | 3671 | 10.2% | 33.2% | 53.2% | -20.0 pts |
| coral-bastion | 22928 | 3626 | 15.8% | 31.9% | 52.4% | -20.5 pts |
| tidebound-wraith | 22924 | 3454 | 15.1% | 34.8% | 57.1% | -22.3 pts |
| last-rites | 36065 | 3614 | 10.0% | 30.9% | 53.6% | -22.7 pts |
| votive-spirit | 22963 | 2373 | 10.3% | 29.6% | 56.6% | -27.0 pts |
| whispering-draft | 23029 | 2305 | 10.0% | 27.9% | 55.6% | -27.6 pts |

## Per-card play and win (novice)

Delta = win rate when played minus win rate when in the deck and not played. It is a correlation, not an effect: a card that is played early in a won game, or only in a long one, shifts it. All cards, best first.

| Card | In deck | Played | Play rate | Win when played | Win when held | Delta |
| --- | --- | --- | --- | --- | --- | --- |
| mirror-sigil | 35840 | 8790 | 24.5% | 1.0% | 0.2% | 0.8 pts |
| coral-bastion | 22928 | 7812 | 34.1% | 0.8% | 0.3% | 0.6 pts |
| siphon | 31195 | 7672 | 24.6% | 0.8% | 0.2% | 0.6 pts |
| shroud | 31206 | 8446 | 27.1% | 0.7% | 0.2% | 0.5 pts |
| bloodlust | 31368 | 8444 | 26.9% | 0.6% | 0.2% | 0.4 pts |
| last-rites | 36065 | 8933 | 24.8% | 0.6% | 0.3% | 0.3 pts |
| scrying-bones | 31176 | 7750 | 24.9% | 0.6% | 0.3% | 0.3 pts |
| thornwall | 35955 | 8867 | 24.7% | 0.5% | 0.3% | 0.2 pts |
| pyre-wisp | 22880 | 7805 | 34.1% | 0.6% | 0.3% | 0.2 pts |
| grave-recall | 31170 | 12750 | 40.9% | 0.5% | 0.3% | 0.2 pts |
| reliquary-sentinel | 23107 | 7811 | 33.8% | 0.5% | 0.3% | 0.2 pts |
| mourning-vassal | 22936 | 7849 | 34.2% | 0.5% | 0.3% | 0.2 pts |
| veil-shade | 22845 | 7824 | 34.2% | 0.4% | 0.3% | 0.2 pts |
| weathervane-sentry | 23006 | 7675 | 33.4% | 0.5% | 0.3% | 0.1 pts |
| grave-effigy | 22930 | 7726 | 33.7% | 0.4% | 0.2% | 0.1 pts |
| snare | 36302 | 8941 | 24.6% | 0.4% | 0.3% | 0.1 pts |
| drowned-oathkeeper | 22653 | 7735 | 34.1% | 0.5% | 0.3% | 0.1 pts |
| windward-lancer | 22849 | 7767 | 34.0% | 0.4% | 0.3% | 0.1 pts |
| candle-templar | 22933 | 7798 | 34.0% | 0.4% | 0.3% | 0.1 pts |
| brine-lurker | 22829 | 7742 | 33.9% | 0.4% | 0.3% | 0.1 pts |
| cinderjaw-hound | 25810 | 8940 | 34.6% | 0.4% | 0.3% | 0.1 pts |
| ashguard-squire | 23070 | 7824 | 33.9% | 0.3% | 0.3% | 0.0 pts |
| undertow-wyrm | 25769 | 8936 | 34.7% | 0.3% | 0.3% | 0.0 pts |
| votive-spirit | 22963 | 8915 | 38.8% | 0.3% | 0.3% | 0.0 pts |
| gloam-stalker | 25859 | 8981 | 34.7% | 0.4% | 0.4% | 0.0 pts |
| nightglass-wyrm | 25684 | 8802 | 34.3% | 0.4% | 0.3% | 0.0 pts |
| bastion-warden | 0 | 55 | n/a | 0.0% | 0.0% | 0.0 pts |
| centaur-revenant | 0 | 76 | n/a | 0.0% | 0.0% | 0.0 pts |
| choir-of-ash | 0 | 734 | n/a | 0.1% | 0.1% | 0.0 pts |
| clockwork-wyrm | 0 | 123 | n/a | 0.0% | 0.0% | 0.0 pts |
| colossus-of-seams | 0 | 64 | n/a | 0.0% | 0.0% | 0.0 pts |
| dragoon-abomination | 0 | 105 | n/a | 1.0% | 1.0% | 0.0 pts |
| feral-specter | 0 | 925 | n/a | 0.5% | 0.5% | 0.0 pts |
| gorefang-drake | 0 | 133 | n/a | 0.0% | 0.0% | 0.0 pts |
| haunted-engine | 0 | 931 | n/a | 0.6% | 0.6% | 0.0 pts |
| ironhide-chimera | 0 | 80 | n/a | 0.0% | 0.0% | 0.0 pts |
| packmaw | 0 | 64 | n/a | 1.6% | 1.6% | 0.0 pts |
| phantom-wyrm | 0 | 979 | n/a | 0.7% | 0.7% | 0.0 pts |
| revenant-lord | 0 | 669 | n/a | 0.3% | 0.3% | 0.0 pts |
| twin-throat-hydra | 0 | 81 | n/a | 1.2% | 1.2% | 0.0 pts |
| twinblade-paladin | 0 | 36 | n/a | 0.0% | 0.0% | 0.0 pts |
| brazier-golem | 22967 | 7743 | 33.7% | 0.3% | 0.3% | -0.0 pts |
| halo-stag | 22876 | 7858 | 34.4% | 0.3% | 0.4% | -0.0 pts |
| whispering-draft | 23029 | 8943 | 38.8% | 0.3% | 0.4% | -0.0 pts |
| kiln-whelp | 25652 | 8753 | 34.1% | 0.3% | 0.4% | -0.0 pts |
| gale-serpent | 25587 | 8791 | 34.4% | 0.3% | 0.3% | -0.1 pts |
| unmake | 31160 | 3678 | 11.8% | 0.2% | 0.3% | -0.1 pts |
| gilded-wyrmling | 25859 | 8880 | 34.3% | 0.2% | 0.3% | -0.1 pts |
| tidebound-wraith | 22924 | 8895 | 38.8% | 0.3% | 0.3% | -0.1 pts |
| stormcrow | 22957 | 7785 | 33.9% | 0.2% | 0.4% | -0.1 pts |

## Keyword exposure (expert)

Summons of a monster carrying the keyword. Trigger counts are not measured (see below).

| Keyword | Games | Summons | Win rate of those games |
| --- | --- | --- | --- |
| echo | 17390 | 29086 | 50.1% |
| haunt | 12111 | 14749 | 47.0% |
| pierce | 11242 | 13588 | 45.7% |
| sentinel | 20987 | 28863 | 41.6% |
| swift | 15667 | 19104 | 45.3% |
| ward | 6318 | 6935 | 43.1% |

## Keyword exposure (novice)

Summons of a monster carrying the keyword. Trigger counts are not measured (see below).

| Keyword | Games | Summons | Win rate of those games |
| --- | --- | --- | --- |
| echo | 24151 | 47728 | 0.3% |
| haunt | 20386 | 26655 | 0.5% |
| pierce | 21121 | 27925 | 0.4% |
| sentinel | 29371 | 44291 | 0.5% |
| swift | 22129 | 29289 | 0.3% |
| ward | 14408 | 17334 | 0.4% |

## Performance

- workers: 10; duels: 100000; wall 87.0 s; 1150 duels/s; **116 duels/s/core** (target at least 1000)
- expert: 50000 duels, 766.4 s of worker time, 65 duels/s/core
- novice: 50000 duels, 94.7 s of worker time, 528 duels/s/core
- difficulty check: 112000 duels, wall 196.4 s, 61 duels/s/core

## Not measured

- Per-keyword trigger counts: the engine run for the sim has events off, and no event names a keyword trigger. The report gives keyword exposure instead (summons of a monster carrying the keyword, and the win rate of those games).
- Per-card play counts cover Summon, Summon (Covetous), Cast and Set Trap. A Graft Chimera appears as its family, not as a played card.
- TARGET_DUEL_MINUTES and TARGET_RULES_LEARN_SECONDS: human-playtest figures, no simulation can measure them.
