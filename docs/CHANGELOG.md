# Changelog

The owner's log of changes to the content tooling and the content files. One dated section per phase or milestone.
Each item names the decision (D-number) that made the change, and a line that changed shows its old and new text.

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
