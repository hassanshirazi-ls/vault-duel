# Vault Duel content guide

This guide is for the game's owner. It shows how to change cards, numbers and the Collector without writing code.
It covers sections 1 to 7 now. Sections 8 to 16 come later in Phase 1.

Every worked example in this guide is tested. `packages/content/test/guide.test.ts` copies the content to a temp
folder, makes the same change, runs the same checks as `pnpm content:check`, and asserts the exact output printed
here. When a number in an example matters, the test sets it on its own copy. So an example stays true when you tune
the game, and the examples never depend on the live values.

## Words used here

- **Monster**: a card you summon from your hand. It has Power, Guard, an element, a kind and up to one keyword.
- **Relic**: a Collector monster. Every Relic has exactly one Flaw.
- **Spell** and **trap**: cards with effects. A trap waits face down until its trigger happens.
- **Element**: one of the colors of the game. An element can beat other elements. The `beats` field in `elements.json` says which.
- **Kind**: the family of a monster, such as beast or knight.
- **Keyword**: an ability printed on a card. A base monster has at most one.
- **Flaw**: a drawback printed on a Relic. Flaws are not keywords.
- **Global**: a number or switch in `packages/content/src/globals.ts`.
- **Placeholder**: a `{NAME}` in card text. It shows the current value of a global.
- **Chimera**: the monster made by grafting monsters together. Its name and stats come from `recipes.json`.

## What the tools do today

| Tool | Status |
| --- | --- |
| `pnpm content:check` | Built. Use it after every change. |
| `pnpm content:gen` | Built. Run it only after you add or delete a keyword file (section 11, later). |
| `pnpm sim:quick`, `pnpm sim:full` | Not built yet. The simulator is not in the repo yet. |
| `pnpm dev` | Not built yet. The web app is not in the repo yet. |
| `--set NAME=VALUE` in the simulator, `?set=NAME=VALUE` in the web build | Not built yet. The override rules exist in the content package (`withOverrides`). |

Every command in this guide runs from the repository root.

---

## 1. Where things live

Values live in data. Rules live in the design document.

- The **values** (card stats, card text, effects, the Collector's deck, numbers, switches) are in the content files
  and in `globals.ts`. These files are the source of truth (D-166).
- The **rules** (what a keyword does, how a turn works, how Appraisal works) are in `docs/DESIGN.md`. The tables in
  that file are the launch values, kept as a record. They are not updated when you change a value.

| What you change | Where | Who may change it |
| --- | --- | --- |
| Base monsters: stats, keyword, element, kind, text | `packages/content/cards/player-monsters.json` | Owner |
| Relics: stats, element, kind, the one Flaw, text | `packages/content/cards/relics.json` | Owner |
| Player spells and traps | `packages/content/cards/player-spells.json`, `packages/content/cards/player-traps.json` | Owner |
| Collector spells and traps | `packages/content/cards/collector-spells.json`, `packages/content/cards/collector-traps.json` | Owner |
| The Collector's deck list, his ace, his dialogue | `packages/content/collector.json` (`deck`, `ace`, `dialogue`) | Owner |
| The Collector's AI rule lists, mood overrides and string parameters | `packages/content/collector.json` (`ai`) | Owner only, with a decision entry first (D-166) |
| Numbers and switches | `packages/content/src/globals.ts` | Owner |
| Balance targets (`TARGET_*`) | `packages/content/src/globals.ts` | Owner only, with a decision entry first (D-166) |
| Proposal switches (`FLAGS.APPRAISED_ENTERS_GUARD`, `FLAGS.ACE_SET_ASIDE`, `FLAGS.CHIMERA_TO_HAND`, `UNSTABLE_EXPIRY`, `SLOW_TURNS`) | `packages/content/src/globals.ts` | Owner only, with a decision entry first (D-166) |
| Elements, kinds, Chimera families | `packages/content/elements.json`, `kinds.json`, `recipes.json` | Owner |
| Objectives and weekly twists | `packages/content/objectives.json`, `twists.json` | Owner |
| Art briefs (one line per card) | `packages/content/art-briefs.json` | Owner and artist |
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

The Collector's deck list and `COLLECTOR_DECK_SIZE` must agree. If you remove one id from his deck, the check says
so. The test removes one unnamed id from its copy's deck and sets `COLLECTOR_DECK_SIZE` to the old count. Your deck
gives different numbers, so the guide shows an example:

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
3. Run `pnpm sim:quick` when the change may affect balance (available once the simulator lands).
4. Play it in `pnpm dev` (available once the web app lands). The web build is planned to reload when you save a JSON
   file or `globals.ts`. A duel in progress is planned to restart, with a notice.
5. Commit the change with a short message that names it, for example "Tune: Example Beast budget".

### CONTENT_VERSION

`CONTENT_VERSION` in `globals.ts` names a playtest build. Leave it alone while you tune. Change it only when you
publish a new playtest build (D-179). Saves are protected without it, because the game checks the content and the
globals when it loads a save (D-108).

### Commands

```bash
pnpm content:check
pnpm content:gen        # only after you add or delete a keyword file (section 11, later)
pnpm sim:quick          # available once the simulator lands
pnpm dev                # available once the web app lands
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
"example-beast": "feral · lunging · ember red",
```

The check prints one warning and exits with code 0. The last line, the success line, shows the number of files, which
is written as `<N>` here:

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
- `<entry>` is the id of the card, collector entry, or global that has the problem.
- `field:` is the path inside the entry, for example `power:`. It is missing when the whole entry is the problem.
  Some whole-entry problems print `(entry):` before the text.
- `problem` says what is wrong. `fix` says what to do.

Here is a real line for a number written in quotes:

```text
cards/player-monsters.json › example-beast › power: expected number, got "7" › write numbers without quotes
```

### Three kinds of line

- **Error**: no prefix. The check fails. The last line says how many errors there were, and the exit code is 1.
- **Warning**: starts with `warning:`. The check still passes. A warning tells you about a card that may be wrong
  but is allowed. Stat budget, missing art briefs and unused placeholders are warnings.
- **Success**: `content:check OK: N files parsed`, a list of counts, and `deckgen: feasible on every test date`.

A line that starts with `not yet checked` means a rule is listed but not implemented. There are none today.

Warnings print first. Errors follow. Errors stop the run before the deck-generation test.

### Worked example: a warning and an error in one run

Here the budget is 11 (a warning) and the spell list is too short for its deck (an error). The test sets the budget
and the deck rules explicitly. It also removes the briefs of the spells it deletes, so the output is exactly these
lines, and the exit code is 1:

```text
warning: cards/player-monsters.json › example-beast › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended
cards/player-spells.json › pool › 2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts
content:check FAILED: 1 error(s) in 1 file(s)
```

### The common messages

Each message in the table is produced by the tooling, and each one is asserted by a test. Where a message ends in a
list of valid ids, the list is shown as `…`, because the ids can change. The check prints the current list.

| Message, as printed | What it means and what to do |
| --- | --- |
| `cards/player-monsters.json › example-beast › power: expected number, got "7" › write numbers without quotes` | A number is written in quotes. Remove the quotes. |
| `cards/player-monsters.json › example-beast › keywords: ["swift","sentinel"] is above the maximum 1 › use 1 or less` | A base monster has two keywords. Keep one (section 4). |
| `cards/relics.json › example-relic › flaw: expected string, got undefined › write a string value` | A Relic has no Flaw. Add `"flaw": "<flaw id>"` (section 4). |
| `cards/player-monsters.json › example-beast › (entry): unknown key(s) flaw › remove flaw` | A Flaw is on a base monster. Flaws belong only on Relics. Remove `flaw`. |
| `objectives.json › win-without-grafting › metric: got "rounds" › use one of: …` | An objective uses a metric that does not exist. Use one of the listed metrics. |
| `cards/player-monsters.json › example-beast › unknown element "wind" › use one of: …, or add it to elements.json` | The element is not in `elements.json`. Use a listed id (section 4). |
| `cards/player-monsters.json › example-beast › unknown kind "dragon" › use one of: …, or add it to kinds.json` | The kind is not in `kinds.json`. Use a listed id (section 4). |
| `cards/player-monsters.json › example-beast › keyword "hant" is not registered › use one of: …, or add packages/content/keywords/hant.ts` | The keyword id is not known. Fix the spelling. Adding a keyword is section 11. |
| `cards/player-monsters.json › example-beast › "slow" is a Flaw, not a keyword › use one of: …` | A Flaw is in a monster's keyword list. Move it to a Relic's `flaw` field. |
| `cards/relics.json › example-relic › Flaw "frail" is not registered › use one of: …, or add packages/content/keywords/frail.ts` | The Flaw id is not known. Fix the spelling. Adding a Flaw is section 11. |
| `warning: cards/player-monsters.json › example-beast › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended` | The stat budget is out of range. A warning only. Adjust Power or Guard, or leave it if you meant it (section 4). |
| `warning: art-briefs.json › example-beast › missing art brief › add a one-line "mood · pose · palette"` | A card has no art brief. A warning only. Add one line (section 5). |
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
| `cards/relics.json › example-relic › Covetous is ace-only › change flaw or set collector.json ace` | The Covetous Flaw is on a Relic that is not the Collector's ace. Change the Flaw, or change the ace. |
| `recipes.json › (beast, beast) › no Chimera recipe for this kind pair › add {"kinds":["beast","beast"], …}` | A kind pair has no Chimera recipe. Add the recipe (section 9, later). |
| `recipes.json › example-chimera › pair (beast, beast) already defined by packmaw › delete one` | Two recipes cover the same kind pair. Delete one. |
| `collector.json › deck › has 19 cards, needs COLLECTOR_DECK_SIZE=20 › add 1 card id` | The Collector's deck size differs from the global. Make the list and the global agree (section 5). |
| `collector.json › deck[n] › "<id>" is a player card › use a card from relics.json or collector-*.json` | A player card is in the Collector's deck. Use a Collector card. |
| `collector.json › deck[n] › "<id>" no longer exists › remove the reference` | The deck names a card that was deleted. Remove the id from the deck list. |
| `collector.json › ai › castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck` | The AI names a spell that is not in his deck. Put it back, or change the AI rule (owner only). |
| `cards/player-spells.json › pool › 2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts` | There are too few spells for the deck. Add the listed number, or change the globals (section 5). |
| `cards/player-monsters.json › pool › deck constraints unsatisfiable on 1000 of 1000 test dates › relax DECK_MIN_ELEMENTS, DECK_MIN_KINDS or the CURVE_* globals, or add monsters` | The deck generator cannot build a deck on the test dates. Relax the deck rules in `globals.ts`, or add monsters. |
| `globals.ts › PLAYER_LIFE › must be 0 or more › use 0 or more` | A global is negative. Use 0 or more. |
| `globals.ts › APPRAISAL_ROUNDS › round 13 > MAX_ROUNDS=12 › remove it` | An Appraisal round is after the last round. Remove the round, or raise `MAX_ROUNDS`. |
| `globals.ts › WARD_CHARGES › must be 1 until the engine supports other values › keep 1` | A pinned global is set to another value. Keep the one value (section 7). |
| `keywords/index.gen.ts › (file) › stale, does not match keywords/*.ts › run pnpm content:gen` | A keyword file changed, and the generated list was not rebuilt. Run `pnpm content:gen`. |
| `keywords/example-ward.ts › example-ward › id "example-other" ≠ file name › rename the file or the id` | A keyword file's id does not match its file name. Make them match. |
| `warning: keywords/example-ward.ts › example-ward › no examples › add one board-DSL example with declared cards (D-169)` | A keyword has no example test. A warning only. Add one (section 11, later). |
| `globals.ts › CONTENT_NUMBERS › PLAYER_LIFE: PLAYER_LIFE is already a core key of Globals › rename it, or change the core PLAYER_LIFE instead` | A card number has the same name as a core global. Rename the card number. |

**"not yet checked" lines:** none today. If one appears, that rule is listed but not checked, so a clean run does not
cover it.

---

## 4. Change a monster or Relic

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
- `element` and `kind` must be ids from `elements.json` and `kinds.json`.
- `power` and `guard` are whole numbers from 0 to 20. Write them without quotes.
- `keywords` is a list with at most one keyword id, such as `["swift"]`. For no keyword, use `[]`.
- `text` is optional. If you write it, follow section 6.

### Template: a Relic

Put this in `packages/content/cards/relics.json`. A Relic is a monster with one extra field, `flaw`.

```json
{
  "id": "example-relic",
  "type": "monster",
  "name": "Example Relic",
  "element": "lumen",
  "kind": "knight",
  "power": 6,
  "guard": 5,
  "keywords": [],
  "flaw": "slow"
}
```

A Relic has exactly one Flaw, in the `flaw` field. It never goes in `keywords`.

### The stat budget

A base monster's Power plus Guard plus one for each keyword should fall inside the stat budget. The budget range
is set by `STAT_BUDGET_MIN` and `STAT_BUDGET_MAX` in `globals.ts`. The keyword cost is `KEYWORD_COST`. A card outside
the range gets a **warning**, not an error (D-167). Relics and Chimeras are not checked against the budget.

### Worked example: raise Power and watch the budget

Start with Power 6, Guard 3 and the swift keyword. That is 10, the top of the range, so there is no warning. Raise
Power to 7 and the total is 11. The check then warns, and says to lower Power or Guard by 1.

The test sets the range to 8 to 10 on its copy, and then reads the warning:

```text
warning: cards/player-monsters.json › example-beast › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended
```

### Worked example: a second keyword is refused

A base monster may carry at most one keyword. Put two keywords on one card and the card format refuses it:

```text
cards/player-monsters.json › example-beast › keywords: ["swift","sentinel"] is above the maximum 1 › use 1 or less
```

`MAX_BASE_KEYWORDS` in `globals.ts` is meant to set this limit. Today the limit is written into the card format, and
the validator does not read `MAX_BASE_KEYWORDS`. So changing that number does nothing yet. The test raises it to 2 and
still gets the same refusal.

### Worked example: a Relic needs its Flaw

Remove the `flaw` field from a Relic and the check says so:

```text
cards/relics.json › example-relic › flaw: expected string, got undefined › write a string value
```

A Flaw id that is not known gets the message from section 3. The test checks both sides: a Relic with `"flaw": "slow"`
passes, and a Relic with `"flaw": "frail"` is refused.

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

Adding a card takes two or three edits. Put the card in its file. Add one line to `art-briefs.json`. For a Collector
card, also put its id in his deck list.

### Template: an art brief

One line in `packages/content/art-briefs.json`, inside the object. The text is "mood · pose · palette".

```text
"example-beast": "feral · lunging · ember red",
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

### Template: a Collector spell

Put this in `packages/content/cards/collector-spells.json`. Its id must also go in the Collector's deck list.

```json
{
  "id": "example-collector-purge",
  "type": "spell",
  "name": "Example Collector Purge",
  "text": "Destroy one enemy monster.",
  "target": { "side": "enemy", "zone": "board" },
  "effects": [{ "op": "destroy", "target": "chosen" }]
}
```

### Template: the Collector's deck list

The deck list is in `packages/content/collector.json`, under `deck`. Each entry is one card id. The list must have as
many entries as `COLLECTOR_DECK_SIZE` in `globals.ts`. A card must come from a Collector file (Relics, Collector
spells or Collector traps). A player card is refused. Put an id in the list like this:

```text
"example-collector-purge",
```

### The Collector's AI

`collector.json` also holds his AI: the order of his plays and attacks, the mood overrides, and the parameters. The
rule lists, the mood overrides and the string parameters are owner-only (D-166). The AI names the cards it plays. A
spell is named under `ai › params › castHighValueSpell`, unless it only draws cards. A trap is named under
`ai › trapPreference`. A card that nothing names is never played. The check does not warn about this yet (D-177 is
not built).

The spell list in `castHighValueSpell` is closed. It accepts only the spell ids that the AI rules already name. A new
spell that the AI should cast needs a change to the card format, so it is an engineering task (section 12, later).
A new trap needs no code change, because `trapPreference` takes any Collector trap id.

The check also does not confirm that the `ace` id is a Relic. An unknown `ace` passes silently today. Keep the ace id
correct by hand.

### Worked example: add a monster with its brief

Add the monster template from section 4 to `cards/player-monsters.json`, and its brief to `art-briefs.json`. The check
is clean: no errors and no warnings. Without the brief, the same card gets one warning:

```text
warning: art-briefs.json › example-beast › missing art brief › add a one-line "mood · pose · palette"
```

### Worked example: add a spell, a trap and a Relic

Add the spell, trap and Relic templates above, each with its brief. The check is clean. A Relic that is not in the
Collector's deck list is still valid. The Collector only plays a card that his deck lists.

### Worked example: a Collector spell swapped into his deck

Add the Collector spell template to `cards/collector-spells.json`, with its brief. Then put its id into the deck list
in place of one card that the AI does not name. The deck size stays the same, so the check is clean.

```text
"example-collector-purge",
```

### Worked example: one card too many in the deck

If you add the id and keep the size, the deck has one card too many:

```text
collector.json › deck › has 21 cards, needs COLLECTOR_DECK_SIZE=20 › remove 1 card id
```

The numbers depend on the deck, so the guide shows an example. Remove one id, or change `COLLECTOR_DECK_SIZE` in
`globals.ts`. Change both together.

### Worked example: delete a card the deck still lists

Delete a Collector spell from its file and leave its id in the deck. The check reports the broken reference, and it
reports the brief that no longer has a card. The index `[0]` depends on your deck:

```text
collector.json › deck[0] › "example-collector-purge" no longer exists › remove the reference
warning: art-briefs.json › example-collector-purge › orphan brief, no card or Chimera family has this id › delete the entry
```

To delete a card cleanly, remove it from its file, from the deck list, and from `art-briefs.json`.

### Worked example: too few spells for the deck

The player's deck needs a number of distinct spells, given by `DECK_SPELLS` and `MAX_COPIES`. If you delete spells
until there are fewer than that, the check says how many to add. The test sets `DECK_SPELLS` to 5 and `MAX_COPIES`
to 2 on its copy, and keeps two spells:

```text
cards/player-spells.json › pool › 2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts
```

A deck of five spells, with at most two copies of each, needs three different spells. Add one spell, or change the globals.

### Ids are permanent. A rename changes the name only

An id is made once and never changes. It is the key for the deck list, the AI, the art briefs and the saved
collection. To rename a card, change its `name` (and `text`, if it mentions the name). The id stays as it is.

### Worked example: a rename

Change `"name": "Cinderjaw Hound"` to `"name": "Example Hound"` and leave the id. The check is clean.

### Worked example: change an id on purpose

If an id must change, change it in the card's file and then fix every line the check reports. The test renames the
Collector spell that the AI names. The check reports two errors. The deck still lists the old id, and the AI still
names it. Two warnings follow, because the new id has no brief yet and the old brief has no card:

```text
collector.json › deck[16] › "forfeit" no longer exists › remove the reference
collector.json › ai › castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck
warning: art-briefs.json › forfeit-2 › missing art brief › add a one-line "mood · pose · palette"
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
- **Overrides show too.** A temporary `--set` or `?set=` value shows in the card text as well (D-172), once those tools are built.

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

### Commands

```bash
pnpm content:check
```

A preview of the rendered text in the web app is not built yet (available once the web app lands).

---

## 7. Tune a global

Globals are the numbers and switches in `packages/content/src/globals.ts`. There are three ways to change one.

1. **Permanently.** Edit the value in `globals.ts`. Then run `pnpm content:check`.
2. **Temporarily.** Use `--set NAME=VALUE` in the simulator, or `?set=NAME=VALUE` in the web build. Neither is built
   yet. The rules that check an override already exist, so the errors are the same ones shown below.
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

`--set` changes a value for one run. The example sets `PLAYER_LIFE=18` and `DRAW_CARDS=1`. The game then reads 18 for
life, and the card text reads "Draw 1 card." The value in `globals.ts` does not change, because an override is never
written to the file. With no `--set`, the value is the one in the file.

```text
--set PLAYER_LIFE=18 --set DRAW_CARDS=1        (planned; the simulator is not built yet)
?set=PLAYER_LIFE=18&set=DRAW_CARDS=1           (planned; the web build is not built yet)
```

A typo is refused, and the message lists what to do:

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

A card number is a global that only a card uses. For example, a spell that makes the Collector lose 2 life needs a number
named `QUILL_TOLL`. Put the spell in `cards/player-spells.json`. The card uses `$QUILL_TOLL` in its effect and
`{QUILL_TOLL}` in its text:

```json
{
  "id": "example-quill",
  "type": "spell",
  "name": "Example Quill",
  "text": "The Collector loses {QUILL_TOLL} life.",
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

The proposal switches (`APPRAISED_ENTERS_GUARD`, `ACE_SET_ASIDE`, `CHIMERA_TO_HAND`, `UNSTABLE_EXPIRY`, `SLOW_TURNS`)
hold the DESIGN rules as written. They change only with a decision entry (D-166).

### Settings that are locked to one value

Some settings are pinned. The engine does not support any other value yet, so the check refuses it. Each one accepts
only the value shown.

| Setting | Only value | Message when refused |
| --- | --- | --- |
| `PLAYS_PER_TURN` | 1 | `globals.ts › PLAYS_PER_TURN › must be 1 until the engine supports other values › keep 1` |
| `REPOSITIONS_PER_TURN` | 1 | `globals.ts › REPOSITIONS_PER_TURN › must be 1 until the engine supports other values › keep 1` |
| `ATTACKS_PER_TURN` | 1 | `globals.ts › ATTACKS_PER_TURN › must be 1 until the engine supports other values › keep 1` |
| `MIN_GRAFT_MATERIALS` | 2 | `globals.ts › MIN_GRAFT_MATERIALS › must be 2 until the engine supports other values › keep 2` |
| `WARD_CHARGES` | 1 | `globals.ts › WARD_CHARGES › must be 1 until the engine supports other values › keep 1` |
| `FLAGS.ACE_SET_ASIDE` | false | `globals.ts › FLAGS › ACE_SET_ASIDE: must be false until the engine supports other values › keep false` |

Two more limits apply:

- `BOARD_SLOTS` is 16 at most. The engine packs board positions into 16 slots per side.
  `globals.ts › BOARD_SLOTS › must be 16 or less, the engine's LOC_STRIDE › use 16 or less`
- `MAX_GRAFT_MATERIALS` is 2 or 3. `globals.ts › MAX_GRAFT_MATERIALS › must be from 2 to 3 › use 2 or 3`

### Settings that nothing reads yet

Some settings are accepted but no code reads them yet. Setting one does nothing, and the check does not say so.
`RELIC_FLAWS` is one: every Relic has exactly one Flaw because the card format says so. `MAX_BASE_KEYWORDS` is
another: section 4 explains why. Do not expect a change to these to show up in play.

### Sanity rules

The check also refuses values that break a rule, such as a negative number, an Appraisal round after the last round,
star cuts that are not in descending order, or a rate outside 0 to 1. The messages look the same as the ones above.

### Commands

```bash
pnpm content:check
pnpm sim:quick --set NAME=VALUE    # planned; the simulator is not built yet
```

Balance checks (`pnpm sim:quick`, `pnpm sim:full`) read `TARGET_*` in `globals.ts`. They are available once the
simulator lands. Section 16, later, explains the reports.
