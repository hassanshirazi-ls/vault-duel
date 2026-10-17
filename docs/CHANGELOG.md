# Changelog

The owner's log of changes to the content tooling and the content files. One dated section per phase or milestone.
Each item names the decision (D-number) that made the change, and a line that changed shows its old and new text.

## 2026-10-17 · Web: the round compass is back, and How to play covers the new rules

No content or rule changes; `CONTENT_VERSION` stays `0.2.0`.

- **Round compass** (D-334): picking a monster shows the element compass again, now at the left of the hint above your hand instead of the flat strip over the round track. It never covers a lane, and the board doesn't move when it appears.
- **How to play** (D-334) has three new pages: **Lanes** (attacks go straight across, "No hit", when his life is open, Sentinel reach, lane moves), **Play and bond** (one card play plus one bond action, the Play/Bond pips, the Bonds button and its Best hint) and **Keywords and Flaws** (every keyword and Flaw with its card text). Each has a Try it question.

## 2026-10-17 · v0.2.0: lanes, bond actions and a new ring

This release turns on the rules from the 2026-10-16 playtest round and adds three "chess piece" bond actions. `CONTENT_VERSION` is now `0.2.0`. **A duel saved before this update starts over** with the notice "The rules changed since this duel was saved; it starts over." (D-323).

### New rules, now on by default

- **Lanes** (`FLAGS.LANES`, D-281…D-284). Each side has three lanes, and a monster attacks only the monster across from it. An empty lane does not reach the Collector's life; a direct attack needs his whole board empty. You pick the lane when you summon or graft. Once per turn a monster may either move one lane (or trade places with your monster there) or switch between attack and guard (`FLAGS.LANE_SWAP`, `LANE_MOVE_RANGE`).
- **Summoning sickness, monsters only** (`SICKNESS_MODE = monstersOnly`, D-280). From round 2, a new monster can attack his monsters on the turn it arrives, but not his life. Swift now also lets it hit life that turn; Slow stops it attacking at all.
- **Sentinel guards three lanes** (`SENTINEL_REACH` 1, D-283): its own lane and the lanes beside it.
- **One element ring** (ring A, `elements.json` `beats`, D-285): Ember → Gale → Tide → Lumen → Umbra → Ember. Each element beats exactly one and loses to exactly one; Lumen and Umbra no longer beat each other.
- **Bond actions** (D-305…D-320). Each turn you play one card and make one bond action, in either order, before your first attack (`FLAGS.BOND_ACTION`):
  - **Graft**: as before, but it no longer uses up your card play.
  - **Split** (`FLAGS.SPLIT`): unbind one of your Chimeras back into the monsters it was made from. Good for dodging Appraisal or getting lanes back; you lose the Chimera's bonus stats.
  - **Symbiosis** (`FLAGS.SYMBIOSIS`): attach a monster from your hand under one of yours. The host gets +`SYMBIOSIS_GUARD_BONUS` (2) Guard and the attached monster's keyword; when the host is destroyed, the attached monster comes out in its lane. If the host is Appraised, the Collector takes both.

### Collector changes

- **Appraisal takes monsters with Power 5 or more** (`APPRAISAL_MIN_POWER` 7 → 5, D-332). Split and Symbiosis let players keep everything under 7, so Appraisal almost stopped working (13–15% success). At 5 it succeeds about half the time again. Evidence: `docs/BALANCE_LOG.md`.
- He places summons by lane and makes lane moves when they give him more kills (`collector.json` `ai.reposition = laneAware`, `ai.params.summonLane`; D-286).
- He never makes bond actions.
- Full sim of the shipped rules (50,000 duels per bot): expert player 51.4% (target 45–55%), Appraisal 49.7%, The Unpriced appears in 23.0% of duels. Games are short (median 5 rounds), which matches the faster pace you asked for; the round-length targets still fail (D-332).

### New texts

- Swift: "Can also attack life directly the turn it is summoned."
- Sentinel: "Enemy attacks in its lane and in the lanes within {SENTINEL_REACH|lane|lanes} of it must target it."
- Shroud: "One of your monsters cannot be Appraised until your next turn; if you split it, this ends."
- How to play now has 8 pages, adding Split and Symbiosis and lines for lanes and sickness. Each line appears only while its rule is on.

### In the app

- Lanes on the board, lane picking when you summon or graft, lit "Move"/"Swap" slots for lane moves, a "No hit" note for an empty lane across, and a sickness badge (D-322).
- The in-duel element compass is now a strip above your board: "Beats … +2" and "Weak to …". The full wheel stays in How to play (D-321).
- "Play" and "Bond" pips show what you have left this turn. A Split button sits on Chimeras, and an Attach button on hand monsters. An attached monster shows as a tab under its host (D-327).
- **Bond options**: a button beside Undo lists every Graft, Split and Symbiosis you can make this turn, with the result and whether it is safe from the next Appraisal, and marks the best one (D-328).

### New levers in the content guide

- `SICKNESS_MODE`, `FLAGS.LANES`, `FLAGS.LANE_SWAP`, `LANE_MOVE_RANGE`, `SENTINEL_REACH`, `FLAGS.SPLIT`, `FLAGS.SYMBIOSIS`, `FLAGS.BOND_ACTION`, `SYMBIOSIS_GUARD_BONUS`, `BOND_GRAFT_MAX_HAND_MATERIALS`, `SPLIT_PART_PERM_P`. Each rule turns off with one edit in `globals.ts`.
- Editing the element ring in `elements.json`, and the Collector's `summonLane` / `reposition` in `collector.json`.
- Sim overrides for trying a change without editing: `--set`, `--ring`, `--collector`, `--collector-reposition`.
- New `content:check` messages for a bad `beats` id, a removed element, a bad reposition mode or lane rule, a bad sickness mode, a lanes flag in words, a negative Sentinel reach, and a mistyped Sentinel placeholder. Each is quoted in the guide and tested.

## 2026-10-16

### Changed

- The web app drew the owner's picked visuals: cracked-frame Flaws, an element wheel and in-duel compass read from `elements.json`, the auction-catalogue Home, the duel menu sheet and a How to play with demos and "Try it" questions. No content file changed (D-271 to D-276).

## 2026-10-14

### Added

- `content:check` prints one information line after a clean run: `not yet read: 28 globals wait for ai, engine, sim, web › see packages/content/src/planned-globals.ts`. It counts the globals that are listed in `planned-globals.ts` because their readers are not built yet. It is information only and never fails the run (D-205).
- `RELIC_FLAWS` is pinned to 1. Any other value is refused with `globals.ts › RELIC_FLAWS › must be 1 until the engine supports other values › keep 1`, because a Relic has exactly one Flaw (D-202).
- `castHighValueSpell` in `collector.json` is keyed by Collector spell id. Each entry has exactly one of `{ "pick": "highestPower" }` or `{ "when": "contestedAttack" }`. You can add or remove entries with their card, with no code change (D-204).
- An entry with both keys or neither is refused: `collector.json › ai › params.castHighValueSpell.<id>: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"` (D-204).
- A `contestedAttack` entry on a spell that gives no Power to `chosen` is refused: `collector.json › ai › params.castHighValueSpell.<id>: "contestedAttack" needs a spell that gives Power to "chosen" › use "pick": "highestPower" instead` (D-204).
- The Collector's ace must be a Relic: `collector.json › ace › "<id>" is not a Relic › use a Relic id from cards/relics.json` (D-203).
- The Collector's ace must be in his deck list: `collector.json › ace › "<id>" is not in the deck › add it to the deck list in collector.json` (D-203).
- A Collector spell in his deck with no AI entry gets a warning: `warning: collector.json › deck[n] › Collector spell "<id>" has no AI rule that casts it › add "<id>" to ai.params.castHighValueSpell with a pick, or make it draw-only`. A draw-only spell gets no warning (D-177).
- A Collector trap in his deck that `trapPreference` does not name gets a warning: `warning: collector.json › deck[n] › Collector trap "<id>" is not in ai.trapPreference › add it, or AI rule 4 never sets it` (D-177).
- A card number that nothing uses gets a warning: `warning: globals.ts › CONTENT_NUMBERS › <NAME>: not used by any card, objective, AI param or keyword › delete the line, or use $<NAME> in an effect`. It is left behind when the card that used it is deleted (D-205).
- A missing field now says what to add, for every field: `cards/player-monsters.json › <id> › power: missing › add "power"` (D-207).
- A Relic without its Flaw: `cards/relics.json › <id> › flaw: missing, a Relic needs exactly 1 Flaw › add "flaw": "<flaw id>"` (D-202, D-207).
- The global `AI_SEARCH_NODE_BUDGET` is a safety cap on the Collector's win search. The `not yet read` count rises by 1, because the global is listed in `planned-globals.ts` until `ai` reads it (D-211).

### Changed

- The keyword limit now comes from `MAX_BASE_KEYWORDS`, which the check reads. Old: `cards/player-monsters.json › <id> › keywords: ["swift","sentinel"] is above the maximum 1 › use 1 or less`. New: `cards/player-monsters.json › <id> › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword`. A Relic gets the same line in `cards/relics.json`. Raising `MAX_BASE_KEYWORDS` now accepts more keywords, where before it did nothing (D-201).
- A Flaw on a base monster. Old: `cards/player-monsters.json › <id> › (entry): unknown key(s) flaw › remove flaw`. New: `cards/player-monsters.json › <id> › Flaws appear only on Relics › remove "flaw"` (D-207).
- The Collector AI spell path now names `params`. Old: `collector.json › ai › castHighValueSpell.<id>: …`. New: `collector.json › ai › params.castHighValueSpell.<id>: …` (D-204).
- An unknown key in `castHighValueSpell` is accepted now, because the map takes any Collector spell id. Old: `collector.json › ai › params.castHighValueSpell: unknown key(s) <id> › remove <id>`. The spell is then checked the same way as the others: it needs to be in his deck, and it gets the D-177 warning when it has no entry (D-204).
- A whole-entry problem no longer prints `(entry):`. Its line has no field part, so `(entry)` is gone from every message. A problem that belongs to a whole file keeps `(file)` in the entry place (D-206).
- The unused card-number warning runs only in `pnpm content:check`, because it reads the keyword sources. The browser build does not run it (D-205).
- Owner ruling: the `castHighValueSpell` entries and the `trapPreference` ids are card lists. You edit them with the card, the way you edit `deck`. The rule lists, mood lists, `reposition` and the other AI settings stay owner-only (D-204).
- A global whose reader is not built yet is listed in `packages/content/src/planned-globals.ts`. A planned global accepts any sane value and is not pinned, so there is nothing to unpin later. The list replaces the old exemption for whole groups of names (D-205).
- The `contestedAttack` line (`collector.json › ai › params.castHighValueSpell.<id>`) now also appears when the spell's Power resolves to 0 or less. The text is unchanged (D-219).

## 2026-10-15

### Added

- The simulator runs: `pnpm sim quick`, `pnpm sim full` and `pnpm sim seed <date>`. The game and date counts come from `SIM_QUICK_GAMES`, `SIM_FULL_GAMES` and `SIM_SEED_CHECK_DATES`, and `--set NAME=value` overrides any global. Each run writes `docs/reports/<command>-<date>.md` and `.json` with every balance metric against its `TARGET_*` global. The globals `SIM_*`, `TARGET_*` and `PERF_DUELS_PER_SEC_PER_CORE` are now read, so the `not yet read` line drops from 21 globals to 5 (D-205).

## 2026-10-16

### Changed

- Web app, no content change: a bug fix for extra summoning zones, a main menu, a duel menu with the log, Undo to the start of your turn, tap-again to take a Graft material out, slower animations with a telegraph before each Collector move, and a steadier layout (D-265 to D-270).
