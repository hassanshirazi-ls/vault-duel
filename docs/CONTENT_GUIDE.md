# Vault Duel content guide

This guide is for the game's owner. It shows how to change cards, numbers, rules and the Monarch without writing code.
It covers sections 1 to 7, the element ring (10), the Monarch's lane settings (13) and balance checks (16). Sections
8, 9, 11, 12, 14 and 15 come later in Phase 1.

Every worked example in this guide is tested. `packages/content/test/guide.test.ts` copies the content to a temp
folder, makes the same change, runs the same checks as `pnpm content:check`, and asserts the exact output printed
here. Examples that run the simulator run it on a tiny setting and read the report it writes. When a number in an
example matters, the test sets it on its own copy, so an example stays true when you tune the game.

> **Two sets of names.** The code, the file names, the ids and the tools keep the engine's names (the table under
> "Words used here" lists them). Players see the royal-court names: the Monarch, Levy, Courtier and The Hollow Heir (D-350).
> This guide uses the player names in its own words. Where it names a file, an id, a global or a tool message, it uses
> the engine name, and it says what players see the first time in each section.

## Words used here

| Engine name (files, ids, globals, messages) | What players see |
| --- | --- |
| Collector (`collector.json`, `collector-spells.json`, `collector-traps.json`) | the Monarch |
| Appraisal, Appraised (`APPRAISAL_ROUNDS`, `APPRAISAL_MIN_POWER`, `appraised`) | Levy, levied |
| Relic (`relics.json`) | Courtier |
| The Unpriced (`the-unpriced`) | The Hollow Heir |

- **Monster**: a card you summon from your hand. It has Power, Guard, an element, a kind and keywords. At launch a
  base monster has at most one keyword (section 4).
- **Courtier**: a Monarch's monster. Every courtier has exactly one Flaw.
- **The Monarch**: your opponent. He has his own deck, his own spells and traps,
  an ace, dialogue and AI.
- **Levy**: on the Levy rounds (`APPRAISAL_ROUNDS`, the rounds with a crown on the
  round track), the Monarch tries to take one of your face-up monsters with enough Power (`APPRAISAL_MIN_POWER`). A try
  can fail. The monster he takes is **levied**.
- **Crowned**: a monster the Monarch has levied is crowned while it is on his board. It has +`CROWN_POWER` Power
  there (section 7, D-349). In your vault it is a card, so it has no crown.
- **Spell** and **trap**: cards with effects. A trap waits face down until its trigger happens.
- **Element**: one of the colors of the game. An element can beat other elements. The `beats` field in `elements.json` says which (section 10).
- **Kind**: the family of a monster, such as beast or knight.
- **Keyword**: an ability printed on a card. A base monster has at most one (`MAX_BASE_KEYWORDS`, section 4).
- **Flaw**: a drawback printed on a Courtier. Flaws are not keywords.
- **Lane**: one of the three columns of monster slots on each side. Lane 0 is the left-hand column. With lanes on, a
  monster can attack only the monster across from it (section 7).
- **Summon turn**: the turn a monster enters the board. What a monster may do on that turn is set by `SICKNESS_MODE` (section 7).
- **Sentinel reach**: how many lanes beside its own a face-up Sentinel guards (`SENTINEL_REACH`, section 7).
- **Bond action**: one of Graft, Split or Symbiosis. With `FLAGS.BOND_ACTION` on, a turn allows one card play and one bond action. With `FLAGS.TURN_SLOTS` on as well, a turn allows one monster summon, one spell or trap and one bond, in any order.
- **Split**: unbinds your face-up Chimera into the monsters it was grafted from.
- **Symbiosis**: attaches a base monster from your hand under one of your face-up monsters.
- **Global**: a number or switch in `packages/content/src/globals.ts`.
- **Placeholder**: a `{NAME}` in card text. It shows the current value of a global.
- **Chimera**: the monster made by grafting monsters together. Its name and stats come from `recipes.json`.

## What the tools do today

| Tool | Status |
| --- | --- |
| `pnpm content:check` | Built. Use it after every change. |
| `pnpm content:gen` | Built. Run it only after you add or delete a keyword file (section 11, later). |
| `pnpm sim:quick`, `pnpm sim:full` | Built. They print and save a balance report (section 16). |
| `pnpm seeds:check` | Built. It warns when the daily seed file was made for another build (section 16). |
| `pnpm dev` | Built. Saving a content file reloads the web app. A duel in progress restarts, with a notice. |
| `--set NAME=VALUE` in the simulator, `?set=NAME=VALUE` in `pnpm dev` | Built. The web form works in the dev build only; production ignores it. |
| `--ring` and `--collector` in the simulator | Built. Sections 10 and 13. |

Every command in this guide runs from the repository root.

---

## 1. Where things live

Values live in data. Rules live in the design document.

- The **values** (card stats, card text, effects, the Monarch's deck, numbers, switches) are in the content files
  and in `globals.ts`. These files are the source of truth (D-166).
- The **rules** (what a keyword does, how a turn works, how a Levy works) are in `docs/DESIGN.md`. The tables in
  that file are the launch values, kept as a record. They are not updated when you change a value.

| What you change | Where | Who may change it |
| --- | --- | --- |
| Base monsters: stats, keyword, element, kind, text | `packages/content/cards/player-monsters.json` | Owner |
| Courtiers: stats, element, kind, the one Flaw, text | `packages/content/cards/relics.json` | Owner |
| Player spells and traps | `packages/content/cards/player-spells.json`, `packages/content/cards/player-traps.json` | Owner |
| The Monarch's spells and traps | `packages/content/cards/collector-spells.json`, `packages/content/cards/collector-traps.json` | Owner |
| The Monarch's deck list, his ace, his dialogue (including the optional `levy` list, D-352) | `packages/content/collector.json` (`deck`, `ace`, `dialogue`) | Owner |
| The Monarch's AI card lists: the entries in `ai › params › castHighValueSpell` and the ids in `ai › trapPreference` | `packages/content/collector.json` (`ai`) | Owner, edited with the card, like `deck` (D-204) |
| The Monarch's other AI settings: rule lists (including `summonLane`), mood overrides, `reposition`, string parameters | `packages/content/collector.json` (`ai`) | Owner only, with a decision entry first (D-166) |
| The element ring: each element's `beats` | `packages/content/elements.json` | Owner only, with a decision entry first (D-285) |
| Other elements' details (name, color, icon, identity), kinds, Chimera families | `packages/content/elements.json`, `kinds.json`, `recipes.json` | Owner |
| Numbers | `packages/content/src/globals.ts` | Owner |
| Rule switches and rule numbers: the lane, sickness and bond settings, `APPRAISAL_MIN_POWER` (the Levy's Power limit), the crown (`FLAGS.CROWNED`, `CROWN_POWER`) (section 7) | `packages/content/src/globals.ts` | Owner only, with a decision entry first (D-166) |
| Balance targets (`TARGET_*`) | `packages/content/src/globals.ts` | Owner only, with a decision entry first (D-166) |
| Proposal switches (`FLAGS.APPRAISED_ENTERS_GUARD`, `FLAGS.ACE_SET_ASIDE`, `FLAGS.CHIMERA_TO_HAND`, `UNSTABLE_EXPIRY`, `SLOW_TURNS`) | `packages/content/src/globals.ts` | Owner only, with a decision entry first (D-166) |
| Objectives and weekly twists | `packages/content/objectives.json`, `twists.json` | Owner |
| Art briefs (one line per card; the style, shape and file rules are in `docs/ART_BRIEF.md`) | `packages/content/art-briefs.json` | Owner and artist |
| Keyword and Flaw rules | `packages/content/keywords/<id>.ts` (code) | Engineering (section 11, later) |
| Rules and mechanics | `docs/DESIGN.md` | Owner |

"Owner only" means the change alters a rule or a balance goal. Write the reason in `docs/DECISIONS.md` before you
change the value. The validator cannot tell who made a change, so the decision entry is the record.

### Template: where a number lives

A card's Power and Guard are in its own entry. A card's text can refer to a global by a placeholder such as
`{DRAW_CARDS}`. A card number such as `DRAW_CARDS` is one line in the `CONTENT_NUMBERS` block of `globals.ts`. A
tuning number such as the player's life is in the main part of `globals.ts`:

```text
  PLAYER_LIFE: 20,            <- a core global (one line, one number)
    DRAW_CARDS: 2,            <- a card number, inside CONTENT_NUMBERS
```

### Worked example: one value that lives in two places

The Monarch's deck list and `COLLECTOR_DECK_SIZE` (the number of cards in his deck) must agree. If you remove one id from
his deck, the check says so. The test removes one unnamed id from its copy's deck and sets `COLLECTOR_DECK_SIZE` to
the old count. Your deck gives different numbers, so the guide shows an example:

```text
collector.json › deck › has 19 cards, needs COLLECTOR_DECK_SIZE=20 › add 1 card id
```

### Commands

```bash
pnpm content:check
```

See section 3 for how to read the output.

---

## 2. The edit loop

Make one change at a time. Then check it, play it, and commit it.

1. Edit the file. Keep the JSON valid: quotes around text, commas between entries, no comma after the last one.
2. Run `pnpm content:check`. Fix every error line. Warning lines do not stop you, but read them.
3. Run `pnpm sim:quick` when the change may affect balance. Section 16 explains the report and a quick smoke run.
4. Play it in `pnpm dev`. Saving a JSON file or `globals.ts` reloads the web app. A duel in progress restarts, with a
   notice, because the rules it was playing under changed (D-176, D-197).
5. Commit the change with a short message that names it, for example "Tune: Example Beast budget".

### CONTENT_VERSION

`CONTENT_VERSION` in `globals.ts` names a playtest build. Leave it alone while you tune. Change it only when you
publish a new playtest build (D-179). The CHANGELOG records each build. Saves are protected without it, because the
game checks the content and the globals when it loads a save (D-108). A duel saved under other rules starts over with
a notice (D-323).

### Commands

```bash
pnpm content:check
pnpm content:gen        # only after you add or delete a keyword file (section 11, later)
pnpm sim:quick          # the balance report; takes much longer than content:check (section 16)
pnpm dev                # the web app, reloads when you save content
```

### Worked example: a warning does not stop the loop

A monster whose budget is outside the range gets a warning. The check still passes. This example adds a monster with
Power 7, Guard 3 and the swift keyword. The budget is 11, one above the top of the range. Its art brief is in place,
so the warning is the only line. Lowering Power to 6 clears it. The test sets the budget range to 8 to 10 on its own
copy.

Add this to `cards/player-monsters.json`:

```json
{
  "id": "example-beast",
  "type": "monster",
  "name": "Example Beast",
  "element": "ember",
  "kind": "beast",
  "power": 7,
  "guard": 3,
  "keywords": ["swift"]
}
```

Add this line to `art-briefs.json`, inside the object:

```text
"example-beast": "feral · lunging · solid black shadow",
```

The check prints one warning to the error stream, then the success line `content:check OK: <N> files parsed`, and
exits with code 0. The block shows those two lines. `<N>` is the number of files. The counts follow them (and the `not yet read`
line, when a setting is planned; section 3):

```text
warning: cards/player-monsters.json › example-beast › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended
content:check OK: <N> files parsed
```

Lowering Power to 6 removes the warning.

---

## 3. Reading content:check output

### The line format

Every problem is one line:

```text
<file> › <entry> › [field:] problem › fix
```

- `<file>` is the file that holds the problem, for example `cards/player-monsters.json`.
- `<entry>` is the id of the card, collector entry, or global that has the problem. A problem that belongs to a whole
  file uses `(file)` here, as in `keywords/index.gen.ts › (file) › stale, does not match keywords/*.ts`.
- `field:` is the path inside the entry, for example `power:`. It is missing when the whole entry is the problem,
  as in the Flaw line in the table below.
- `problem` says what is wrong. `fix` says what to do.

Here is a real line for a number written in quotes:

```text
cards/player-monsters.json › example-beast › power: expected number, got "7" › write numbers without quotes
```

### Three kinds of line

- **Error**: no prefix. The check fails. The last line says how many errors there were, and the exit code is 1.
- **Warning**: starts with `warning:`. The check still passes. A warning tells you about a card that may be wrong
  but is allowed. Stat budget, missing art briefs, unused placeholders, card numbers that nothing uses any more, and
  Monarch cards that the AI never plays are warnings.
- **Success**: `content:check OK: N files parsed`, a list of counts, and `deckgen: feasible on every test date`.

Warnings print first. Errors follow. Errors stop the run before the deck-generation test.

A line that starts with `not yet checked` means a rule is listed but not implemented. There are none today.

**"not yet read" lines:** when a setting is planned (section 7), a clean run also prints one information line, after the
counts and the deck-generation line. None is planned today, so the line does not appear:

```text
not yet read: <N> globals wait for <readers> › see packages/content/src/planned-globals.ts
```

It says that `<N>` globals are listed in `planned-globals.ts` because the code that reads them is not built yet.
`<readers>` names the parts of the game that will read them, such as `ai, engine, sim, web`. The count and the
readers come from that file, so they change as the game is built. It is not a problem, it never fails the run, and section 7 explains it.
If a rule is still listed as not yet checked, that line prints after the `not yet read` line.

### Worked example: a warning and an error in one run

Here the budget is 11 (a warning) and the spell list is too short for its deck (an error). The test sets the budget
and the deck rules explicitly. It also removes the briefs of the spells it deletes, and the card numbers that only
those spells used (section 5 shows what a number left behind looks like). So the output is exactly these lines, and
the exit code is 1:

```text
warning: cards/player-monsters.json › example-beast › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended
cards/player-spells.json › pool › 2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts
content:check FAILED: 1 error(s) in 1 file(s)
```

### The common messages

Each message in the table is produced by the tooling, and each one is asserted by a test. Where a message ends in a
list of valid ids, the list is shown as `…`, because the ids can change. The check prints the current list. The
messages keep the engine's names (the table under "Words used here" lists them), because that is what the tool prints.

| Message, as printed | What it means and what to do |
| --- | --- |
| `cards/player-monsters.json › example-beast › power: missing › add "power"` | A field is missing. The fix names the field to add. |
| `cards/player-monsters.json › example-beast › power: expected number, got "7" › write numbers without quotes` | A number is written in quotes. Remove the quotes. |
| `cards/player-monsters.json › example-beast › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword` | A base monster has more keywords than the limit. Keep one (section 4). |
| `cards/relics.json › example-relic › flaw: missing, a Relic needs exactly 1 Flaw › add "flaw": "<flaw id>"` | A Courtier has no Flaw. Add `"flaw": "<flaw id>"` (section 4). |
| `cards/player-monsters.json › example-beast › Flaws appear only on Relics › remove "flaw"` | A Flaw is on a base monster. Flaws belong only on Courtiers. Remove `flaw`. |
| `objectives.json › win-without-grafting › metric: got "rounds" › use one of: …` | An objective uses a metric that does not exist. Use one of the listed metrics. |
| `cards/player-monsters.json › example-beast › unknown element "wind" › use one of: …, or add it to elements.json` | The element is not in `elements.json`. Use a listed id (section 4). |
| `cards/player-monsters.json › example-beast › unknown kind "dragon" › use one of: …, or add it to kinds.json` | The kind is not in `kinds.json`. Use a listed id (section 4). |
| `cards/player-monsters.json › example-beast › keyword "hant" is not registered › use one of: …, or add packages/content/keywords/hant.ts` | The keyword id is not known. Fix the spelling. Adding a keyword is section 11. |
| `cards/player-monsters.json › example-beast › "slow" is a Flaw, not a keyword › use one of: …` | A Flaw is in a monster's keyword list. Move it to a Courtier's `flaw` field. |
| `cards/relics.json › example-relic › Flaw "frail" is not registered › use one of: …, or add packages/content/keywords/frail.ts` | The Flaw id is not known. Fix the spelling. Adding a Flaw is section 11. |
| `warning: cards/player-monsters.json › example-beast › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended` | The stat budget is out of range. A warning only. Adjust Power or Guard, or leave it if you meant it (section 4). |
| `warning: art-briefs.json › example-beast › missing art brief › add a one-line "mood · pose · ink"` | A card has no art brief. A warning only. Add one line (section 5). |
| `warning: art-briefs.json › example-purge › orphan brief, no card or Chimera family has this id › delete the entry` | A brief has no card left. A warning only. Delete the line. |
| `cards/player-spells.json › example-draw › text: bare number "2" while the card uses $DRAW_CARDS › write {DRAW_CARDS} instead of 2` | The card text has a typed number where a global is used. Write the placeholder (section 6). |
| `cards/player-spells.json › example-draw › text has 2 sentences › shorten to one sentence` | Card text has two sentences. Shorten it (section 6). |
| `cards/player-spells.json › example-draw › text: malformed placeholder "{draw}" › write {NAME} or {NAME\|word\|words} with a global name in capitals` | A placeholder is not in the right form. Use capitals, as in `{DRAW_CARDS}`. |
| `cards/player-spells.json › example-draw › text: unknown placeholder {DRAW_CARDZ} › did you mean {DRAW_CARDS}?` | The placeholder names no global. Fix the name. |
| `cards/player-spells.json › example-draw › text: {CONTENT_VERSION} is not a number in globals.ts › use a numeric global` | The placeholder names a global that is not a number. Use a numeric global. |
| `warning: cards/player-spells.json › example-draw › text: {DRAW_CARDS} is not used by this card's effects or conditions › check the name` | The text shows a global the card does not use. A warning only. Check the name. |
| `cards/player-spells.json › example-draw › "$DRAW_CARDZ" not in globals.ts › did you mean $DRAW_CARDS?` | An effect names a global that does not exist. Fix the name, or add the number (section 7). |
| `cards/player-traps.json › example-snare › ref "grafted" is not available for trigger "enemyAttack" › use attacker or defender` | A trap uses a reference its trigger does not provide. Use one of the listed references. |
| `cards/player-spells.json › example-purge › "cancelAttack" only works in a trap with trigger enemyAttack or enemyDirectAttack › remove it or change the trigger` | Cancel is used outside an attack trap. Move it to an attack trap, or remove it. |
| `cards/player-traps.json › example-last › condition "powerGte" can't be checked on a destroyed monster › use type, relic, chimera, element, kind or graftedThisTurn` | A trap checks a monster that has already left the board. Use one of the listed conditions. |
| `cards/relics.json › example-relic › Covetous is ace-only › change flaw or set collector.json ace` | The Covetous Flaw is on a Courtier that is not the Monarch's ace. Change the Flaw, or change the ace. |
| `collector.json › ace › "no-such-relic" is not a Relic › use a Relic id from cards/relics.json` | The ace is not a Courtier: the id is unknown, or it is a player card, a Monarch spell or a trap. Use a Courtier id (section 5). |
| `collector.json › ace › "the-unpriced" is not in the deck › add it to the deck list in collector.json` | The ace is a Courtier but not in the Monarch's deck list. Add it (section 5). |
| `collector.json › dialogue › unknown key(s) levys › remove levys` | A line list in `dialogue` has a name nothing reads. The lists are `composed`, `agitated`, `desperate` and `levy`. Fix the name (section 5). |
| `recipes.json › (beast, beast) › no Chimera recipe for this kind pair › add {"kinds":["beast","beast"], …}` | A kind pair has no Chimera recipe. Add the recipe (section 9, later). |
| `recipes.json › example-chimera › pair (beast, beast) already defined by packmaw › delete one` | Two recipes cover the same kind pair. Delete one. |
| `collector.json › deck › has 19 cards, needs COLLECTOR_DECK_SIZE=20 › add 1 card id` | The Monarch's deck size differs from the global. Make the list and the global agree (section 5). |
| `collector.json › deck[n] › "<id>" is a player card › use a card from relics.json or collector-*.json` | A player card is in the Monarch's deck. Use a card from one of his files. |
| `collector.json › deck[n] › "<id>" no longer exists › remove the reference` | The deck names a card that was deleted. Remove the id from the deck list. |
| `collector.json › ai › params.castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck` | The AI names a spell that is not in his deck. Put it back, or remove its AI entry (section 5). |
| `collector.json › ai › params.castHighValueSpell.forfeit: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"` | An AI entry has both keys or neither. Keep exactly one (section 5). |
| `collector.json › ai › params.castHighValueSpell.example-collector-purge: "contestedAttack" needs a spell that gives Power to "chosen" › use "pick": "highestPower" instead` | A `contestedAttack` entry is on a spell that gives no Power to `chosen`. Use `"pick"` (section 5). |
| `warning: collector.json › deck[0] › Collector spell "example-collector-purge" has no AI rule that casts it › add "example-collector-purge" to ai.params.castHighValueSpell with a pick, or make it draw-only` | A Monarch's spell is in his deck and no AI entry casts it. Add the entry, or make the spell draw-only (section 5). The index is the card's place in the deck. |
| `warning: collector.json › deck[17] › Collector trap "display-case" is not in ai.trapPreference › add it, or AI rule 4 never sets it` | A Monarch's trap is in his deck and his trap list does not name it. Add its id to `trapPreference` (section 5). |
| `cards/player-spells.json › pool › 2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts` | There are too few spells for the deck. Add the listed number, or change the globals (section 5). |
| `cards/player-monsters.json › pool › deck constraints unsatisfiable on 1000 of 1000 test dates › relax DECK_MIN_ELEMENTS, DECK_MIN_KINDS or the CURVE_* globals, or add monsters` | The deck generator cannot build a deck on the test dates. Relax the deck rules in `globals.ts`, or add monsters. |
| `elements.json › ember › beats unknown element "wind" › use an id from elements.json` | An element's `beats` names an element that does not exist. Use an id from `elements.json` (section 10). |
| `collector.json › ai › reposition: got "sometimes" › use one of: toAttackIfUsable, allAttack, laneAware` | The Monarch's reposition mode is not one of the three. Use one of them (section 13). |
| `collector.json › ai › params.summonLane.[0]: got "nowhere" › use one of: sentinelCenter, facingBeatable, facingEmpty, leftmostFree` | A summon-lane rule name is wrong. Use one of the four, in the list (section 13). |
| `globals.ts › PLAYER_LIFE › must be 0 or more › use 0 or more` | A global is negative. Use 0 or more. |
| `globals.ts › SENTINEL_REACH › must be 0 or more › use 0 or more` | A rule number is negative. Use 0 or more (section 7). |
| `globals.ts › SICKNESS_MODE › Invalid option: expected one of "classic"\|"monstersOnly" › fix the value in globals.ts` | The sickness mode is misspelled. Use `classic` or `monstersOnly` (section 7). |
| `globals.ts › FLAGS › LANES: Invalid input: expected boolean, received string › fix the value in globals.ts` | A switch is written in words. Write `true` or `false`, without quotes (section 7). |
| `globals.ts › BONDS_PER_TURN › must be 1 until the engine supports other values › keep 1` | A pinned bond setting was changed. Keep 1 (section 7). |
| `globals.ts › SYMBIOTES_PER_HOST › must be 1 until the engine supports other values › keep 1` | The same, for symbiotes. Keep 1 (section 7). |
| `globals.ts › APPRAISAL_ROUNDS › round 13 > MAX_ROUNDS=12 › remove it` | A Levy round is after the last round (`APPRAISAL_ROUNDS` is the list of Levy rounds). Remove the round, or raise `MAX_ROUNDS`. |
| `globals.ts › WARD_CHARGES › must be 1 until the engine supports other values › keep 1` | A pinned global is set to another value. Keep the one value (section 7). |
| `globals.ts › RELIC_FLAWS › must be 1 until the engine supports other values › keep 1` | `RELIC_FLAWS` is pinned to 1, because a Courtier has exactly one Flaw. Keep 1 (section 7). |
| `warning: globals.ts › CONTENT_NUMBERS › SIPHON_DRAIN: not used by any card, objective, AI param or keyword › delete the line, or use $SIPHON_DRAIN in an effect` | A card number is left behind after the card that used it was deleted. Delete the line, or use the name in a card (section 5). |
| `keywords/index.gen.ts › (file) › stale, does not match keywords/*.ts › run pnpm content:gen` | A keyword file changed, and the generated list was not rebuilt. Run `pnpm content:gen`. |
| `keywords/example-ward.ts › example-ward › id "example-other" ≠ file name › rename the file or the id` | A keyword file's id does not match its file name. Make them match. |
| `warning: keywords/example-ward.ts › example-ward › no examples › add one board-DSL example with declared cards (D-169)` | A keyword has no example test. A warning only. Add one (section 11, later). |
| `keywords/sentinel.ts › sentinel › text: unknown placeholder {SENTINEL_REACHX} › did you mean {SENTINEL_REACH}?` | A keyword's text names a global that does not exist. Fix the name (section 6). |
| `globals.ts › CONTENT_NUMBERS › PLAYER_LIFE: PLAYER_LIFE is already a core key of Globals › rename it, or change the core PLAYER_LIFE instead` | A card number has the same name as a core global. Rename the card number. |

**"not yet checked" lines:** none today. If one appears, that rule is listed but not checked, so a clean run does not
cover it. The `not yet read` line in the success part of a run is a different thing: it counts the globals that are
waiting for a reader. Section 3 above shows it, and section 7 explains it.

---

## 4. Change a monster or a Courtier

### Template: a base monster

Put this in `packages/content/cards/player-monsters.json`, inside the list. Keep the commas right.

```json
{
  "id": "example-beast",
  "type": "monster",
  "name": "Example Beast",
  "element": "ember",
  "kind": "beast",
  "power": 6,
  "guard": 3,
  "keywords": []
}
```

Field rules:

- `id` is permanent (section 5). Give it once, in lower case, with hyphens.
- `name` is the name players see. You can change it at any time.
- `element` and `kind` must be ids from `elements.json` and `kinds.json`. The element ring that decides fights is in
  section 10.
- `power` and `guard` are whole numbers from 0 to 20. Write them without quotes.
- `keywords` is a list of keyword ids, such as `["swift"]`. For no keyword, use `[]`. A base monster may have at most
  `MAX_BASE_KEYWORDS` of them, which is 1 at launch (see below).
- `text` is optional. If you write it, follow section 6.

### Template: a Courtier

Put this in `packages/content/cards/relics.json`, the file of the Courtiers. A Courtier is a monster with one extra
field, `flaw`.

```json
{
  "id": "example-relic",
  "type": "monster",
  "name": "Example Courtier",
  "element": "lumen",
  "kind": "knight",
  "power": 6,
  "guard": 5,
  "keywords": [],
  "flaw": "slow"
}
```

A Courtier has exactly one Flaw, in the `flaw` field. It never goes in `keywords`. The id stays `example-relic` in the
file, because the engine keeps its name. Only the `name` is the player's word (D-350).

### The stat budget

A base monster's Power plus Guard plus one for each keyword should fall inside the stat budget. The budget range
is set by `STAT_BUDGET_MIN` and `STAT_BUDGET_MAX` in `globals.ts`. The keyword cost is `KEYWORD_COST`. A card outside
the range gets a **warning**, not an error (D-167). Courtiers and Chimeras are not checked against the budget.

### Worked example: raise Power and watch the budget

Start with Power 6, Guard 3 and the swift keyword. That is 10, the top of the range, so there is no warning. Raise
Power to 7 and the total is 11. The check then warns, and says to lower Power or Guard by 1.

The test sets the range to 8 to 10 on its copy, and then reads the warning:

```text
warning: cards/player-monsters.json › example-beast › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended
```

### Worked example: a second keyword is refused

A base monster may carry at most `MAX_BASE_KEYWORDS` keywords, which is 1 at launch. Put two keywords on one card and
the check refuses it:

```text
cards/player-monsters.json › example-beast › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword
```

Remove one. A Courtier's `keywords` list follows the same limit, and the check refuses a Courtier with two keywords in the
same way:

```text
cards/relics.json › example-relic › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword
```

### Worked example: raising the keyword limit

`MAX_BASE_KEYWORDS` in `globals.ts` sets the limit for every base monster and every Courtier. It is read by the check, so
raising it changes what is accepted. The test sets it to 2 on its copy, and the card with two keywords (swift and
sentinel) passes. The test also widens the stat budget to 11, so the card's budget is in range and only the keyword
limit is in view:

```text
  MAX_BASE_KEYWORDS: 2,
```

Chimeras have their own limit, `MAX_INHERITED_KEYWORDS`, which this check does not read.

### Worked example: a Courtier needs its Flaw

Remove the `flaw` field from a Courtier and the check says what to add:

```text
cards/relics.json › example-relic › flaw: missing, a Relic needs exactly 1 Flaw › add "flaw": "<flaw id>"
```

The message uses the engine's name, because the tool keeps it. A Flaw id that is not known gets the message from
section 3. The test checks both sides: a Courtier with `"flaw": "slow"` passes, and a Courtier with `"flaw": "frail"` is
refused.

### Worked example: a wrong element

Write `"element": "wind"` and the check prints the element list:

```text
cards/player-monsters.json › example-beast › unknown element "wind" › use one of: …, or add it to elements.json
```

Use one of the listed element ids. Kinds work the same way, with `kinds.json`.

### Commands

```bash
pnpm content:check
```

---

## 5. Add or remove a card

Adding a card takes two or three edits. Put the card in its file. Add one line to `art-briefs.json`. For a Monarch's
card (a Courtier, a Monarch spell or a Monarch trap), also put its id in his deck list. For a Monarch spell that the AI
casts, add one entry to his AI (below).

### Template: an art brief

One line in `packages/content/art-briefs.json`, inside the object. The text is "mood · pose · ink": the ink part says how the black and white fall (D-360; the shared style rules are in `docs/ART_BRIEF.md`).

```text
"example-beast": "feral · lunging · solid black shadow",
```

The brief is a warning if it is missing. Missing it never blocks a change (D-174).

### Template: a player spell

Put this in `packages/content/cards/player-spells.json`. The target says what the caster picks.

```json
{
  "id": "example-purge",
  "type": "spell",
  "name": "Example Purge",
  "text": "Destroy one enemy monster.",
  "target": { "side": "enemy", "zone": "board" },
  "effects": [{ "op": "destroy", "target": "chosen" }]
}
```

### Template: a player trap

Put this in `packages/content/cards/player-traps.json`. The trigger says when it fires.

```json
{
  "id": "example-snare",
  "type": "trap",
  "name": "Example Snare",
  "text": "When an enemy monster attacks, cancel that attack.",
  "trigger": "enemyAttack",
  "effects": [{ "op": "cancelAttack" }]
}
```

### Template: a Monarch's spell

Put this in `packages/content/cards/collector-spells.json`, the file of the Monarch's spells. Its id must also go in the
Monarch's deck list.

```json
{
  "id": "example-collector-purge",
  "type": "spell",
  "name": "Example Monarch Purge",
  "text": "Destroy one enemy monster.",
  "target": { "side": "enemy", "zone": "board" },
  "effects": [{ "op": "destroy", "target": "chosen" }]
}
```

### Template: the Monarch's deck list

The deck list is in `packages/content/collector.json`, under `deck`. Each entry is one card id. The list must have as
many entries as `COLLECTOR_DECK_SIZE` in `globals.ts`. A card must come from one of his files (the Courtiers, the
Monarch's spells or the Monarch's traps). A player card is refused. Put an id in the list like this:

```text
"example-collector-purge",
```

### The Monarch's AI

`collector.json` also holds his AI: the order of his plays and attacks, the mood overrides and the parameters. Section 1
says who may edit what. In short:

- The **card lists** are yours to edit with the card: the entries under `ai › params › castHighValueSpell`, and the ids
  under `ai › trapPreference`. Adding or removing a Monarch card that the AI plays is a data edit (D-204).
- Everything else in the AI is owner-only, with a decision entry first (D-166). That includes the lane settings of
  section 13.

#### castHighValueSpell

This block has one entry for each Monarch spell the AI casts. The key is the spell's id. Each entry has exactly one
of two forms:

```text
"forfeit": { "pick": "highestPower" },
"gilt-frame": { "when": "contestedAttack" },
```

- `{ "pick": "highestPower" }` casts the spell on the target with the highest Power the AI can see. `forfeit` (Execution) is one.
- `{ "when": "contestedAttack" }` casts the spell when the Power it gives its target would win a contested attack.
  `gilt-frame` (Gilded Mantle) is one. The check refuses it on a spell with no Power effect on `chosen`.

The entries can be added and removed freely. A new Monarch spell that the AI casts takes three edits: the card in
its file, its line in the deck list, and its entry here. A draw-only spell (every effect draws a card for its caster)
needs no entry. Without an entry, the check warns (see the example below). There is no code change.

#### trapPreference

A Monarch trap in his deck is set only when its id is in `ai › trapPreference`. A deck trap that is missing from
that list gets a warning, and the example below shows it. `display-case` is Bend the Knee.

### The Monarch's ace

`collector.json › ace` is the id of his ace, which players see as **The Hollow Heir** (`the-unpriced`). The ace must be a
Courtier in `cards/relics.json`, and it must be in his deck list. Covetous is the ace's Flaw: only the ace may carry it,
and the check says so when a Covetous Courtier is not the ace.

### The Monarch's lines

`collector.json › dialogue` holds the lines the Monarch speaks. It has four lists of text:

- `composed`, `agitated` and `desperate` are the mood lines. He speaks from the list of the mood he is in.
- `levy` is optional (D-352). He speaks from it when a Levy takes one of your monsters. A failed Levy, and a change of
  mood, keep using the mood lists. If `levy` is missing, the mood lists are used for a Levy too.

Each line is one string in quotes, inside the list. Add the `levy` list inside `dialogue`, with a comma after the list
before it:

```text
"levy": ["Rise, soldier. You serve a greater house."],
```

### Worked example: add a monster with its brief

Add the monster template from section 4 to `cards/player-monsters.json`, and its brief to `art-briefs.json`. The check
is clean: no errors and no warnings. Without the brief, the same card gets one warning:

```text
warning: art-briefs.json › example-beast › missing art brief › add a one-line "mood · pose · ink"
```

### Worked example: add a spell, a trap and a Courtier

Add the spell, trap and Courtier templates above, each with its brief. The check is clean. A Courtier that is not in the
Monarch's deck list is still valid. Only the ace must be in his deck.

### Worked example: a Monarch's spell swapped into his deck

Add the Monarch's spell template to `cards/collector-spells.json`, with its brief. Then put its id into the deck list
in place of `gilded-penitent`, a Courtier the AI never names. Give the spell one entry in `castHighValueSpell`:

```text
"example-collector-purge": { "pick": "highestPower" },
```

The deck size stays the same, and the check is clean.

Without that entry line, the check warns. The spell is in his deck, but no AI entry casts it. The index is the card's
place in his deck list:

```text
warning: collector.json › deck[0] › Collector spell "example-collector-purge" has no AI rule that casts it › add "example-collector-purge" to ai.params.castHighValueSpell with a pick, or make it draw-only
```

### Worked example: a bad entry in castHighValueSpell

An entry has exactly one of `"pick"` or `"when"`. With neither, or with both, the check refuses it. The first line
below is for the example spell, which has both keys. The second is for Execution's entry (`forfeit`), and it has neither:

```text
collector.json › ai › params.castHighValueSpell.example-collector-purge: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"
collector.json › ai › params.castHighValueSpell.forfeit: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"
```

`"contestedAttack"` needs a spell that gives Power to `chosen`. The example spell gives none, so this entry is refused:

```text
collector.json › ai › params.castHighValueSpell.example-collector-purge: "contestedAttack" needs a spell that gives Power to "chosen" › use "pick": "highestPower" instead
```

### Worked example: a trap missing from his trap list

Take `display-case` (Bend the Knee) out of `ai › trapPreference` and it is still in his deck. The check warns:

```text
warning: collector.json › deck[17] › Collector trap "display-case" is not in ai.trapPreference › add it, or AI rule 4 never sets it
```

### Worked example: the ace must be in the deck list

The ace is `the-unpriced`, The Hollow Heir. Take it out of his deck list, and put another Courtier in its place so the
deck size stays the same. The test adds a copy of the example Courtier to `relics.json` for this. The check says the
ace is not in the deck:

```text
collector.json › ace › "the-unpriced" is not in the deck › add it to the deck list in collector.json
```

### Worked example: the ace must be a Courtier

Set the ace to an id that is not a Courtier, and the check refuses it. The message is the same for an unknown id, a
player card, a Monarch spell or a trap. Changing the ace also moves Covetous, so the Courtier that carried it is named
too:

```text
collector.json › ace › "no-such-relic" is not a Relic › use a Relic id from cards/relics.json
cards/relics.json › the-unpriced › Covetous is ace-only › change flaw or set collector.json ace
```

### Worked example: a line list with a misspelled name

The lines in `dialogue` are read by name. A list called `levys` is not read, and the check refuses it. The fix is to
rename it to `levy`:

```text
collector.json › dialogue › unknown key(s) levys › remove levys
```

### Worked example: no levy list falls back to the mood lines

Remove the `levy` list and the check is clean, with no warning. The mood lists speak for the Levy instead. The test
removes `levy` from its copy and reads the check again. The line below is the one you would delete:

```text
"levy": ["Rise, soldier. You serve a greater house."],
```

### Worked example: one card too many in the deck

If you add the id and keep the size, the deck has one card too many:

```text
collector.json › deck › has 21 cards, needs COLLECTOR_DECK_SIZE=20 › remove 1 card id
```

The numbers depend on the deck, so the guide shows an example. Remove one id, or change `COLLECTOR_DECK_SIZE` in
`globals.ts`. Change both together.

### Worked example: delete a card the deck still lists

Delete a Monarch's spell from its file and leave its id in the deck. The check reports the broken reference, and it
reports the brief that no longer has a card. The index `[0]` depends on your deck:

```text
collector.json › deck[0] › "example-collector-purge" no longer exists › remove the reference
warning: art-briefs.json › example-collector-purge › orphan brief, no card or Chimera family has this id › delete the entry
```

To delete a card cleanly, remove it from its file, from the deck list, from `art-briefs.json`, and from any AI entry or
trap list that names it. Then remove any card number only that card used (next example).

### Worked example: delete a card and leave its number behind

A card number is a line in the `CONTENT_NUMBERS` block of `globals.ts`. When the card that used it is deleted, the line
stays, and nothing uses it. The check warns about each one. The test deletes the `siphon` spell (Siphon, whose text says
"The Monarch loses") and its brief, and leaves its two numbers:

```text
warning: globals.ts › CONTENT_NUMBERS › SIPHON_DRAIN: not used by any card, objective, AI param or keyword › delete the line, or use $SIPHON_DRAIN in an effect
warning: globals.ts › CONTENT_NUMBERS › SIPHON_GAIN: not used by any card, objective, AI param or keyword › delete the line, or use $SIPHON_GAIN in an effect
```

Delete the two lines in `globals.ts`, and the warnings go away. A number that a keyword source uses also counts as used.

### Worked example: too few spells for the deck

The player's deck needs a number of distinct spells, given by `DECK_SPELLS` and `MAX_COPIES`. If you delete spells
until there are fewer than that, the check says how many to add. The test sets `DECK_SPELLS` to 5 and `MAX_COPIES`
to 2 on its copy, and keeps two spells. It also removes the card numbers that only the deleted spells used, so only
the pool line shows:

```text
cards/player-spells.json › pool › 2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts
```

A deck of five spells, with at most two copies of each, needs three different spells. Add one spell, or change the globals.

### Ids are permanent. A rename changes the name only

An id is made once and never changes. It is the key for the deck list, the AI, the art briefs and the saved
collection. To rename a card, change its `name` (and `text`, if it mentions the name). The id stays as it is. In D-350
the royal-court names were given this way: the ids and file names of the Monarch, the Courtiers and The Hollow Heir did
not change.

### Worked example: a rename

Change `"name": "Cinderjaw Hound"` to `"name": "Example Hound"` and leave the id. The check is clean.

### Worked example: change an id on purpose

If an id must change, change it in the card's file and then fix every line the check reports. The test renames the
Monarch's spell (Execution, `forfeit`) that the AI names. The check reports two errors. The deck still lists the old id,
and the AI still names it. Two warnings follow, because the new id has no brief yet and the old brief has no card:

```text
collector.json › deck[16] › "forfeit" no longer exists › remove the reference
collector.json › ai › params.castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck
warning: art-briefs.json › forfeit-2 › missing art brief › add a one-line "mood · pose · ink"
warning: art-briefs.json › forfeit › orphan brief, no card or Chimera family has this id › delete the entry
```

The index and the ids depend on your content, so the guide shows an example.

### Commands

```bash
pnpm content:check
```

---

## 6. Write card text

Card text is one sentence. It is shown on the card, so it must say what the card does with the numbers it really
uses.

### The rules

- **One sentence.** The check counts sentences in the text that players see (the rendered text).
- **Numbers come from globals.** A number that a card's effects use is written as a placeholder, `{NAME}`. The name
  is in capitals and is a global in `globals.ts`.
- **Count words.** `{NAME|card|cards}` shows the number and then the singular word when the number is 1, and the
  plural word otherwise.
- **The bare-number rule.** If the card uses a global, its text must not also have a typed number for it. A card with
  no global may keep its digits.
- **Signs go outside.** Write `−{TETHERED_PENALTY} Power`, not a negative number inside the placeholder.
- **Where placeholders work.** Card text, objective text, twist text and keyword text. Not names, dialogue or art
  briefs.
- **Text follows the value.** The placeholder shows the current number. If you tune the number, the text follows.
- **Overrides show too.** A `--set` in the simulator, or `?set=` in the dev build, changes the number in the text as
  well (D-172).

### Template: a card with a placeholder

This needs a global named `DRAW_CARDS`. Add it to `globals.ts` in the `CONTENT_NUMBERS` block (section 7). The
template is a spell, and it goes in `cards/player-spells.json`.

```json
{
  "id": "example-draw",
  "type": "spell",
  "name": "Example Draw",
  "text": "Draw {DRAW_CARDS|card|cards}.",
  "effects": [{ "op": "draw", "who": "self", "n": "$DRAW_CARDS" }]
}
```

The number goes into `globals.ts`, one line in `CONTENT_NUMBERS`:

```text
    DRAW_CARDS: 2,
```

### Worked example: the placeholder shows the number

With `DRAW_CARDS` set to 1, the text reads "Draw 1 card." With 3, it reads "Draw 3 cards." The test renders the same
text with each value, using the copy's globals and the override rules:

```text
Draw {DRAW_CARDS|card|cards}.   with DRAW_CARDS=1  →  Draw 1 card.
Draw {DRAW_CARDS|card|cards}.   with DRAW_CARDS=3  →  Draw 3 cards.
```

### Worked example: a typed number is refused

Write `Draw 2 cards.` on a card whose effect uses `$DRAW_CARDS`, and the check refuses it:

```text
cards/player-spells.json › example-draw › text: bare number "2" while the card uses $DRAW_CARDS › write {DRAW_CARDS} instead of 2
```

### Worked example: a sign goes outside the placeholder

`−{TETHERED_PENALTY} Power` renders as a minus sign, the current number, and " Power". The minus sign is part of the
text, not of the global. So the globals stay positive.

### Worked example: two sentences are refused

```text
cards/player-spells.json › example-draw › text has 2 sentences › shorten to one sentence
```

### Worked example: an unused placeholder is a warning

If the text shows `{DRAW_CARDS}` but no effect or condition uses `$DRAW_CARDS`, the check warns:

```text
warning: cards/player-spells.json › example-draw › text: {DRAW_CARDS} is not used by this card's effects or conditions › check the name
```

### Worked example: keyword text uses the same placeholders

The Sentinel keyword's text names its reach as a placeholder. `{SENTINEL_REACH|lane|lanes}` reads "lane" when the
number is 1 and "lanes" otherwise. Written out in full, the sentence is:

```text
Enemy attacks in its lane and in the lanes within {SENTINEL_REACH|lane|lanes} of it must target it.
```

With `SENTINEL_REACH` set to 1, it reads "…within 1 lane of it…". With 2, it reads "…within 2 lanes of it…". The test
sets 2 on its copy and the check is clean. A misspelled name is refused, and the check suggests the right one:

```text
keywords/sentinel.ts › sentinel › text: unknown placeholder {SENTINEL_REACHX} › did you mean {SENTINEL_REACH}?
```

### Commands

```bash
pnpm content:check
```

`pnpm dev` shows each card's text through the same function, so a changed number shows there too.

---

## 7. Tune a global

Globals are the numbers and switches in `packages/content/src/globals.ts`. There are three ways to change one.

1. **Permanently.** Edit the value in `globals.ts`. Then run `pnpm content:check`.
2. **Temporarily.** Use `--set NAME=VALUE` on a simulator run, or `?set=NAME=VALUE` in the address of `pnpm dev`. The
   value is never written to a file.
3. **As a card number.** Add one line to the `CONTENT_NUMBERS` block for a number that only one card uses (D-171).

### Template: a core global

```text
  PLAYER_LIFE: 20,
```

Change only the number. Keep the comma.

### Worked example: change PLAYER_LIFE

Change `PLAYER_LIFE` to 18 in `globals.ts`, then run the check. The test writes the same change to its copy and reads
the new value. The check is clean:

```text
  PLAYER_LIFE: 18,
```

### Worked example: widen the stat budget

The budget warning from section 4 goes away when the top of the range is raised to 11. The test raises
`STAT_BUDGET_MAX` on its copy and reads the warning list again, which is now empty:

```text
  STAT_BUDGET_MAX: 11,
```

### Worked example: a temporary --set

`--set` changes a value for one simulator run. The example sets `PLAYER_LIFE` to 18 for a smoke run. The report
records the override in its header. The value in `globals.ts` does not change, because an override is never written to
the file. With no `--set`, the value is the one in the file.

```bash
pnpm sim:quick --games 2 --seed-dates 1 --bots expert --workers 1 --set PLAYER_LIFE=18 --out /tmp/vd-guide-set
```

The web build takes the same form in the address bar, in the dev build only: `?set=PLAYER_LIFE=18`. Repeat `set=` for
more values, as in `?set=PLAYER_LIFE=18&set=FLAGS.SPLIT=false`.

A typo is refused, and the message lists what to do. The simulator prints `sim: bad --set` and then the line:

```text
globals.ts › PLAYER_LEFE › unknown key › use a key from globals.ts or a name already in CONTENT_NUMBERS
```

A whole object cannot be set at once. Set one entry at a time:

```text
globals.ts › FLAGS › set one entry at a time › write FLAGS.<NAME>=<value>
globals.ts › CONTENT_NUMBERS › set one entry at a time › write CONTENT_NUMBERS.<NAME>=<value>
```

A value that breaks a rule is refused:

```text
globals.ts › PLAYER_LIFE › must be 0 or more › use 0 or more
```

### Worked example: a new card number needs one line

A card number is a global that only a card uses. For example, a spell that makes the Monarch lose 2 life needs a number
named `QUILL_TOLL`. Put the spell in `cards/player-spells.json`. The card uses `$QUILL_TOLL` in its effect and
`{QUILL_TOLL}` in its text:

```json
{
  "id": "example-quill",
  "type": "spell",
  "name": "Example Quill",
  "text": "The Monarch loses {QUILL_TOLL} life.",
  "effects": [{ "op": "damage", "who": "opponent", "n": "$QUILL_TOLL" }]
}
```

The number is one line in `CONTENT_NUMBERS`:

```text
    QUILL_TOLL: 2,
```

Without that line, the check refuses the card in two places. The text and the effect each name a global that does not
exist:

```text
cards/player-spells.json › example-quill › text: unknown placeholder {QUILL_TOLL} › use a numeric name from globals.ts
cards/player-spells.json › example-quill › "$QUILL_TOLL" not in globals.ts › use a name from globals.ts or CONTENT_NUMBERS
```

A `--set` cannot add a new name. Only the line in `globals.ts` can. A card number may not have the same name as a core
global:

```text
globals.ts › CONTENT_NUMBERS › PLAYER_LIFE: PLAYER_LIFE is already a core key of Globals › rename it, or change the core PLAYER_LIFE instead
```

### Flags

`globals.ts` has a `FLAGS` block of on-or-off switches. Set one flag at a time, for example `FLAGS.WEEKLY_TWIST=true`.
An unknown flag is refused and the check lists the valid ones.

The proposal switches (`APPRAISED_ENTERS_GUARD`, `ACE_SET_ASIDE`, `CHIMERA_TO_HAND`, `UNSTABLE_EXPIRY`) hold the DESIGN
rules as written. They change only with a decision entry (D-166). `SLOW_TURNS` stays 1. The proposal to set it to 2 was
withdrawn, because Slow now restricts a monster on its summon turn (D-280).

### Rule switches and rule numbers

These settings change how the game plays. The first rows are the 2026-10-16 rules, which ship on in v0.2.0 (D-280 to
D-287 and D-305 to D-310). The crown rows (`FLAGS.CROWNED`, `CROWN_POWER`) are from 2026-10-18 (D-349). Each row is one
edit in `globals.ts`. Changing one is an owner decision: write the reason in `docs/DECISIONS.md` first, and keep the
simulator evidence (`docs/BALANCE_LOG.md`).

| Setting | Shipped value | What it does | Values you may write |
| --- | --- | --- | --- |
| `SICKNESS_MODE` | `'monstersOnly'` | On its summon turn, a monster may attack monsters but not life. `'classic'` is the old rule: no attack at all on that turn. | `'classic'` or `'monstersOnly'` |
| `FLAGS.LANES` | `true` | Each monster attacks only the monster across from it. When that side has no monster, the attack goes straight at life. `false` is free targeting. | `true` or `false` |
| `FLAGS.LANE_SWAP` | `true` | A lane move may trade places with your own monster in the lane it enters. Read only with `LANES`. | `true` or `false` |
| `LANE_MOVE_RANGE` | `1` | How many lanes one lane move may cross. Read only with `LANES`. | a whole number, 0 or more |
| `SENTINEL_REACH` | `1` | A face-up Sentinel guards its own lane and this many lanes on each side. `0` means its own lane only. Read only with `LANES`. | a whole number, 0 or more |
| `FLAGS.BOND_ACTION` | `true` | Each turn allows one card play and one bond action, in either order. `false` makes Graft your one play again. | `true` or `false` |
| `FLAGS.TURN_SLOTS` | `true` | The card play splits in two: one monster summon and one spell or trap a turn, beside the bond, in any order. An attack closes nothing, and a monster that has attacked cannot switch or move. `false` is one card play, and the first attack closes the play and the bond. | `true` or `false` |
| `FLAGS.SPLIT` | `false` | Your face-up Chimera can unbind into the monsters it was grafted from. Off since D-336 (kept for daily modes). | `true` or `false` |
| `FLAGS.SYMBIOSIS` | `false` | You can attach a base monster from your hand under one of your face-up monsters. Off since D-336 (kept for daily modes). | `true` or `false` |
| `FLAGS.RIPOSTE` | `true` | An attacker whose Power is below a guard (or face-down) defender's Guard is destroyed; its owner still takes the difference (D-337). `false` is the old rule: the attacker survives. | `true` or `false` |
| `FLAGS.AMBUSH` | `true` | Flipping your own face-down monster to attack gives it `AMBUSH_POWER` until the end of the turn (D-338). | `true` or `false` |
| `AMBUSH_POWER` | `2` | The Power an Ambush flip adds until the end of that turn. Read only with `AMBUSH`. | a whole number, 0 or more |
| `FLAGS.CROWNED` | `true` | A monster the Monarch levied is crowned: it gets `CROWN_POWER` Power while it is on his board (D-349). `false` makes a levied monster a plain monster on his board. | `true` or `false` |
| `CROWN_POWER` | `1` | The Power a crowned monster gets on the Monarch's board. Read only with `CROWNED`. | a whole number, 0 or more |
| `BOND_GRAFT_MAX_HAND_MATERIALS` | `3` | The most hand cards one Graft may use. `3` is no limit, the same as `MAX_GRAFT_MATERIALS`. Read only with `BOND_ACTION`. | a whole number, 0 or more |
| `SYMBIOSIS_GUARD_BONUS` | `2` | The Guard a host gains from its symbiote. Read only with `SYMBIOSIS`. | a whole number, 0 or more |
| `SPLIT_PART_PERM_P` | `0` | The permanent Power change each part gets when a Chimera splits. A negative number makes the parts weaker. Read only with `SPLIT`. | a whole number, any sign |
| `APPRAISAL_MIN_POWER` | `5` | The Levy (Appraisal in the code) takes only a face-up monster with at least this Power. It was 7 before v0.2.0, because Split parts and Symbiosis hosts are base monsters with Power 2 to 7. | a whole number, 0 or more |

The sim tested `APPRAISAL_MIN_POWER` at 5, 6 and 7, and `BOND_GRAFT_MAX_HAND_MATERIALS` at 2 and 3 (`docs/BALANCE_LOG.md`).
The other rule numbers are shipped at their starting values and have not been swept. Change one by one step, then run
`pnpm sim:quick`.

### The crown (D-349)

The crown is the Monarch's answer to the Levy. A monster he levies is crowned while it sits on his board, and it gets
`CROWN_POWER` (1) more Power there. The screen marks it with a crown badge. The crown is on by default (`FLAGS.CROWNED`).
The Levy itself does not change: it still tries to take one of your monsters, and only the Monarch's board gets the crown. In
your vault a levied monster is a card, so it has no crown.

The owner chose the crown over an automatic graft after a Levy (D-349). The sim, quick run with 800 games per bot, read:
the expert bot won 47.5% with the crown off and 44.1% with it on, and the greedy bot 29.5% and 24.1%. The novice won 0%
both times. The expert target is 45 to 55%, so 44.1% sits just under the band. D-349 leaves that band for the owner to
move.

### Turn a rule off or on

Each rule switch is one line. Find it in `globals.ts`, change `true` to `false` (or the reverse), and run the check:

```text
  LANES: false,
```

Worked example: put the old summon-turn rule back. In `globals.ts`, change `SICKNESS_MODE` to `'classic'`. The check is
clean, and the game reads the old rule. The test writes the same change to its copy:

```text
  SICKNESS_MODE: 'classic',
```

Worked example: turn lanes off. The check is clean with `FLAGS.LANES` set to `false`. Its settings then do nothing in
play: `FLAGS.LANE_SWAP`, `SENTINEL_REACH`, `LANE_MOVE_RANGE` and the Monarch's `summonLane` list are read only with
lanes on. The element ring still applies.

```text
  LANES: false,
```

Worked example: turn Split back on (for a daily mode). `FLAGS.SPLIT` set to `true` is clean. With `FLAGS.BOND_ACTION` on,
Graft and Split are then both bond actions, and the Graft button becomes a Bond button. Turning `FLAGS.BOND_ACTION` off makes Graft your one play again, and Split and Symbiosis, if they
are on, become plays too (D-305, D-306).

```text
  SPLIT: true,
```

A rule change also changes the duel's saved rules. A duel saved under the old rules restarts with a notice (D-323).
Every rule switch is listed in the table above.

### Worked example: switch the crown off in one edit

To remove the crown, change one line in the `FLAGS` block of `globals.ts`: `CROWNED` from `true` to `false`. The check
is clean, and a levied monster is a plain monster on his board. `CROWN_POWER` then does nothing. The test writes the
same change to its copy and reads the flag back:

```text
  CROWNED: false,
```

### Worked example: a stronger crown

`CROWN_POWER` is a whole number, 0 or more. Set it to 2 and each crowned monster has +2 Power on his board. The check
is clean. A negative crown is refused, because the crown only adds Power:

```text
  CROWN_POWER: 2,
```

```text
globals.ts › CROWN_POWER › must be 0 or more › use 0 or more
```

### Worked example: try the crown off for one simulator run

`--set` switches the crown off for one run, and the file is not changed. Compare the two reports. The header of the
second one lists `FLAGS.CROWNED=false`:

```bash
pnpm sim:quick --games 2 --seed-dates 1 --bots expert --workers 1 --set FLAGS.CROWNED=false --out /tmp/vd-guide-crown
```

### Settings locked to one value

Some settings are pinned. The engine does not support any other value yet, so the check refuses it. Each one accepts
only the value shown.

| Setting | Only value | Message when refused |
| --- | --- | --- |
| `PLAYS_PER_TURN` | 1 | `globals.ts › PLAYS_PER_TURN › must be 1 until the engine supports other values › keep 1` |
| `REPOSITIONS_PER_TURN` | 1 | `globals.ts › REPOSITIONS_PER_TURN › must be 1 until the engine supports other values › keep 1` |
| `ATTACKS_PER_TURN` | 1 | `globals.ts › ATTACKS_PER_TURN › must be 1 until the engine supports other values › keep 1` |
| `MIN_GRAFT_MATERIALS` | 2 | `globals.ts › MIN_GRAFT_MATERIALS › must be 2 until the engine supports other values › keep 2` |
| `WARD_CHARGES` | 1 | `globals.ts › WARD_CHARGES › must be 1 until the engine supports other values › keep 1` |
| `RELIC_FLAWS` | 1 | `globals.ts › RELIC_FLAWS › must be 1 until the engine supports other values › keep 1` |
| `BONDS_PER_TURN` | 1 | `globals.ts › BONDS_PER_TURN › must be 1 until the engine supports other values › keep 1` |
| `SYMBIOTES_PER_HOST` | 1 | `globals.ts › SYMBIOTES_PER_HOST › must be 1 until the engine supports other values › keep 1` |

`RELIC_FLAWS` stays a global so the number is written down, but a Courtier has exactly one Flaw because its `flaw` field
is a single id. Changing it to 2 is refused, and only a decision entry can lift the pin (D-202). `BONDS_PER_TURN` is
one bond action a turn, and `SYMBIOTES_PER_HOST` is one symbiote on each host (D-306, D-308).

Two more limits apply:

- `BOARD_SLOTS` is 16 at most. The engine packs board positions into 16 slots per side.
  `globals.ts › BOARD_SLOTS › must be 16 or less, the engine's LOC_STRIDE › use 16 or less`
- `MAX_GRAFT_MATERIALS` is 2 or 3. `globals.ts › MAX_GRAFT_MATERIALS › must be from 2 to 3 › use 2 or 3`

### Settings in three states

Every core setting and every flag is in one of three states:

- **Read.** The game or the check reads it, so a change shows up in play or in the checks. Most settings are here.
- **Pinned.** The engine supports one value. The table above lists that value, and the check refuses any other.
- **Planned.** The code that reads it is not built yet. A planned setting is accepted, and it takes effect when its
  reader lands. Setting one today changes nothing in play. Nothing needs to be unpinned later, because a planned
  setting is never pinned.

A setting becomes planned when it is added before the code that reads it exists. The change that builds that reader
takes it out of the planned list. None is planned today, so every setting has a reader or a pin.

The planned settings are listed in `packages/content/src/planned-globals.ts`, with the code that will read each one.
That list is empty today. Do not copy the list from there into this guide. When the list has entries, the check prints
the count and the readers after a clean run (the `not yet read` line in section 3).

### Worked example: adding a planned setting

Say the owner adds a new setting, `EXAMPLE_LIMIT`, before the code that reads it is built. It takes three edits:

1. In `packages/content/src/globals.ts`, add the setting with its value, in the group it belongs to:
   `EXAMPLE_LIMIT: 3,`
2. In `packages/content/src/schemas/globals.ts`, add the same name with its type:
   `EXAMPLE_LIMIT: Int,`
3. In `packages/content/src/planned-globals.ts`, add this line to the list:

```text
  EXAMPLE_LIMIT: { reader: 'engine', where: 'engine <file> (<decision>)' },
```

Then set the value to 5 in `globals.ts` (`EXAMPLE_LIMIT: 5,`). The check accepts it and stays clean. Nothing in play
changes, because the reader is not built yet.

When the reader lands, the change that wires it also deletes its line from `planned-globals.ts`, and a test enforces
that. You do not need to do anything. A planned setting you set today keeps its value.

### Sanity rules

The check also refuses values that break a rule, such as a negative number, a Levy round after the last round (`APPRAISAL_ROUNDS`
is the list of the rounds where the Levy takes a monster), star cuts that are not in descending order, or a rate outside
0 to 1. Every number is 0 or more, with one exception:
`SPLIT_PART_PERM_P` may be negative, because it is the one lever for weaker parts. The messages look the same as the ones above.

`SPLIT_PART_PERM_P` set to -1 is accepted. `SENTINEL_REACH` set to -1 is refused:

```text
  SPLIT_PART_PERM_P: -1,
```

```text
globals.ts › SENTINEL_REACH › must be 0 or more › use 0 or more
```

### Commands

```bash
pnpm content:check
pnpm sim:quick --set NAME=VALUE    # the balance report is explained in section 16
```

Balance checks (`pnpm sim:quick`, `pnpm sim:full`) read `TARGET_*` in `globals.ts`. Section 16 explains the reports.

---

## 10. The element ring

Elements are the colors of the game. `packages/content/elements.json` holds one entry per element. Its `beats` field
names the element it beats. When an attacker's element beats the defender's, the attacker gets +`ELEMENT_BONUS` Power
(2 at launch). Only the attacker gets the bonus.

### The launch ring

The launch ring is one five-step ring, decided by the owner (D-285):

```text
Ember → Gale → Tide → Lumen → Umbra → Ember
```

Each element beats exactly one element and loses to exactly one. Ember beats Gale, Gale beats Tide, Tide beats Lumen,
Lumen beats Umbra, and Umbra beats Ember. The check does not enforce the one-beat rule (see the worked example below),
so keep to it by hand.

### Template: one element

Each element is one line in `packages/content/elements.json`, inside the list. This is the Ember line:

```json
{ "id": "ember", "name": "Ember", "color": "#C8452C", "icon": "flame", "beats": ["gale"], "identity": "Aggressive, high Power" }
```

Field rules:

- `id` is permanent (section 5). Give it once, in lower case.
- `name` is the name players see.
- `color` is written as `#` and six hexadecimal digits, such as `#C8452C`.
- `beats` is a list of element ids. Keep one id in it, for the one-ring rule.
- `identity` is a short phrase about how the element plays. It is text, not a rule.

### Worked example: change the ring to ring B

The simulator has three named rings for testing (A is the launch ring, B and C are alternates). Ring B is:

```text
Ember → Gale → Tide → Umbra → Lumen → Ember
```

Ring B is three edits in `elements.json`: Tide, Umbra and Lumen change their `beats`. The test changes those three on
its copy and the check is clean:

```text
"beats": ["umbra"]     <- tide
"beats": ["lumen"]     <- umbra
"beats": ["ember"]     <- lumen
```

### Worked example: a beats entry that is not an element is refused

Write `"beats": ["wind"]` and the check names the element and the fix:

```text
elements.json › ember › beats unknown element "wind" › use an id from elements.json
```

### Worked example: the check does not enforce one ring

The check accepts an element that beats two others, because it checks only that each id exists. Ember beating both
Gale and Tide passes:

```text
"beats": ["gale", "tide"]
```

That is not the ring the owner chose (D-285). Keep one beat per element.

### Worked example: add an element

Add a line with its own id, name, color, icon, identity and `beats`. This example adds Void, which beats Ember. The
check is clean:

```json
{ "id": "void", "name": "Void", "color": "#2A2A2A", "icon": "moon", "beats": ["ember"], "identity": "Example only" }
```

Adding an element is untested in the web app, whose element strip was drawn for five elements. Ask before you add one,
and try it in `pnpm dev` before you rely on it.

### Worked example: remove an element

Removing an element is not one edit. Delete its line, and the check names the `beats` line that points at it and each
card that uses it. Here `umbra` is removed. The first line is the `beats` line, and one line follows for each card
with the element:

```text
elements.json › lumen › beats unknown element "umbra" › use an id from elements.json
cards/player-monsters.json › <card id> › unknown element "umbra" › use one of: …, or add it to elements.json
```

The `<card id>` line repeats for each card and each Courtier that uses the element. Names depend on your cards, so the
guide shows the shape.

Fix every line: change the `beats`, and move or delete each card. The check is clean when nothing names the element.

### Worked example: a ring in the simulator

`--ring` runs the simulator on a different ring, without changing `elements.json`. `B` is ring B. The report header
lists the override:

```bash
pnpm sim:quick --games 2 --seed-dates 1 --bots expert --workers 1 --ring B --out /tmp/vd-guide-ring
```

The three names are `A` (the launch ring), `B` and `C`. You can also list the five ids in beat order, such as
`--ring ember,gale,tide,umbra,lumen`, which is ring B. A list that is missing an element is refused:

```text
sim: --ring needs every element exactly once (ember, gale, tide, lumen, umbra), got "ember,gale"
```

### Commands

```bash
pnpm content:check
```

---

## 13. The Monarch's lanes and reposition

Section 5 covers his deck and ace. The settings here decide how he places and moves his monsters once lanes are on.
They are AI rules, so they are owner-only, with a decision entry first (D-166). The file is `collector.json`, the
Monarch's file.

### Where: collector.json

- `ai › reposition` is how he sets his monsters before he plays. It takes one of three values:
  - `toAttackIfUsable` (the mode before v0.2.0) turns a guard monster to attack only when that gives it an attack he
    would use.
  - `allAttack` (used when he is desperate) turns every guard monster to attack.
  - `laneAware` (shipped) does what `toAttackIfUsable` does, and also makes lane moves: a monster moves to another
    lane, or swaps with one of his own, when that wins at least one more kill, or when it moves a Sentinel toward the
    middle lane without losing an attack. A monster moves at most once a turn (D-286). It has no effect with
    `FLAGS.LANES` off, because there are no lane moves then.
- `ai › params › summonLane` is an ordered list of rules that choose the lane for a new summon. The rules run in
  order. A rule that finds a free lane narrows the choice to those lanes, and a rule that finds none is skipped. The
  leftmost of the lanes left at the end wins. The list is read only with `FLAGS.LANES`:
  - `sentinelCenter`: a Sentinel takes the middle lane when that lane is free.
  - `facingBeatable`: a free lane that faces a face-up player monster this card would beat in battle. The strongest
    such monster counts first.
  - `facingEmpty`: a free lane across from an empty player lane, so this card cannot be attacked from that lane.
  - `leftmostFree`: the leftmost free lane.

Lane 0 is the left column and lane 2 the right. The middle lane is 1.

### Template: the summon-lane list

The list goes inside `params` in `collector.json`. The shipped list is:

```text
"summonLane": ["sentinelCenter", "facingBeatable", "facingEmpty", "leftmostFree"]
```

### Worked example: a shorter lane list

A list with only `leftmostFree` is accepted. He then summons into the leftmost free lane, and the other three rules are
not used. The check is clean on a copy with this list:

```text
"summonLane": ["leftmostFree"]
```

### Worked example: a rule name that does not exist

Write `"nowhere"` in the list and the check names the rule and lists the four:

```text
collector.json › ai › params.summonLane.[0]: got "nowhere" › use one of: sentinelCenter, facingBeatable, facingEmpty, leftmostFree
```

### Worked example: a reposition mode that does not exist

Write `"sometimes"` for `reposition` and the check names the three modes:

```text
collector.json › ai › reposition: got "sometimes" › use one of: toAttackIfUsable, allAttack, laneAware
```

### Commands

The simulator can try another reposition mode or lane list without changing the file. `--collector-reposition` sets
`ai › reposition`. `--collector` takes `ai.<path>=<json>` and can be repeated. A path always starts with `ai.`. Quote the
value so the shell passes it as one piece:

```bash
pnpm sim:quick --games 2 --seed-dates 1 --bots expert --workers 1 --collector-reposition toAttackIfUsable --out /tmp/vd-guide-collector
pnpm sim:quick --games 2 --seed-dates 1 --bots expert --workers 1 --collector 'ai.params.summonLane=["leftmostFree"]' --out /tmp/vd-guide-collector
```

The report header lists each one:

```text
- content overrides (--ring, --collector): `collector.ai.reposition="toAttackIfUsable"`
```

---

## 16. Checking balance

The simulator plays the game with bots and reports whether the numbers sit inside the targets in `globals.ts`. The
Target column of each report row is the range from there.

### The commands

| Command | What it runs |
| --- | --- |
| `pnpm sim:quick` | `SIM_QUICK_GAMES` games per bot (2000 at launch) for the expert and novice bots, over `SIM_SEED_CHECK_DATES` dates (60) from today. It takes much longer than `content:check`. |
| `pnpm sim:full` | `SIM_FULL_GAMES` games per bot (50,000 at launch), the same dates, and the seed difficulty check (`SIM_RUNS_PER_SEED` duels per candidate). It takes longer still. |
| `pnpm seeds:check` | Reads the saved daily-seed file and says whether it was made for this build. It warns and always exits 0. |

`sim quick` takes `--set`, `--ring`, `--collector` and `--collector-reposition` (sections 7, 10 and 13). `sim full`
takes `--set`. A smoke run uses small numbers, so it finishes in seconds. It shows that the command works, not whether
the balance is right:

```bash
pnpm sim:quick --games 2 --seed-dates 1 --bots expert --workers 1 --set SICKNESS_MODE=classic --out /tmp/vd-guide-smoke
pnpm sim:full --games 2 --seed-dates 1 --bots expert --workers 1 --out /tmp/vd-guide-smoke
```

The seed file is checked with:

```bash
pnpm seeds:check
```

If its first line reads `WARNING: the manifest was made for a different build`, the app rates each day on the device.
The warning gives the command that rebuilds the file.

### Reading the report

Each run prints a summary and writes two files into `docs/reports/`, named for the command and the date: a `.md` file
you can read and a `.json` file with every global the run used. The `.md` file has these parts:

- **The header.** Content version, the globals hash, and the overrides the run used. A run with `--set` shows the
  overrides, so you can tell the two runs apart:

  ```text
  - overrides (--set): `SICKNESS_MODE=classic`
  ```

- **Balance targets.** One row per metric. The Result column says `pass`, `fail`, `not measured` or `info`:

  ```text
  | BT-1 | Win rate | expert |
  ```

  The metrics are: BT-1 the expert's win rate against the Monarch; BT-3 the median round a game ends; BT-3b the
  share of games ending in rounds 8 to 12 (it needs to be more than half); BT-4 the share ending in round 12; BT-5 the
  grafts per win; BT-6 the Levy success rate; BT-7 how often The Hollow Heir (the Monarch's
  ace, `the-unpriced`) appears; BT-2 the novice's win rate; BT-8 the seed rejection rate (sim full and sim seed only); DUEL-MIN and LEARN-SEC (minutes to
  play and seconds to learn), which need people to play, so they are never measured by the simulator. The report
  uses these names for its rows, such as "Levy success rate".
- **Anomalies.** A line under `ANOMALY` is a warning about the run itself. The speed line (PERF) is one: it reports
  duels per second per core against `PERF_DUELS_PER_SEC_PER_CORE`, and a tiny run is always slow.
- **The rest.** Win rate by bot, the round each game ended, a per-bot detail table, damage and the sealed Vault,
  bond usage per game (`## Bond usage (per finished game)`: grafts, splits, symbioses), per-card play and win, keyword
  exposure, and performance.

A smoke run is only a check that the command works. Its numbers are noise. Read a real run, and compare two runs
that differ by one setting, not one run against a target.

### What to do with a result

1. Change one value, in `globals.ts` or with `--set`.
2. Run `pnpm sim:quick` with the same settings and with the change (`--set NAME=VALUE`), and compare the Result column
   of the two reports.
3. If a change is kept, write the reason in `docs/DECISIONS.md` and the evidence in `docs/BALANCE_LOG.md`.

The targets (`TARGET_*`) are owner-only. Change one only with a decision entry first (D-166).
