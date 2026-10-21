# Changelog

The owner's log of changes to the content tooling and the content files. One dated section per phase or milestone.
Each item names the decision (D-number) that made the change, and a line that changed shows its old and new text.

## 2026-10-21 · A rarer Hollow Heir, a tougher Monarch, two targets updated

Two settings changed, which changes the settings hash: a duel in progress when this update arrives starts over, and the
seeds manifest is regenerated.

- **The Levy takes only Power 8 or more** (D-369): `APPRAISAL_MIN_POWER: 5,` is now `APPRAISAL_MIN_POWER: 8,`. The Monarch can only summon The Hollow Heir by sacrificing a monster he took with a Levy, so he now appears in 38.5% of games (was 49.8%; the target is 20–40%).
- **The Monarch has 46 life** (D-369): `COLLECTOR_LIFE: 40,` is now `COLLECTOR_LIFE: 46,`. This offsets the gentler Levy: the expert wins 47.7% (was 46.6%), and duels run a little longer.
- **Grafts per win target is now 3.5–5** (D-370): `TARGET_GRAFTS_PER_WIN: [1.5, 3],` is now `[3.5, 5],`. Graft is the core action, and no setting moved the count without wrecking the expert's win rate.
- **The seed target counts fallback days** (D-370): BT-8 now reports how many days had to use an unchecked fallback seed (target: none; 0 of 60 today). The rejection rate is still printed as BT-8r, for information.
- **DESIGN.md** now says 24 and 46 life, a Levy on Power 8 or more, and the new balance targets.
- **Ascend is easy to find** (D-371): in the Graft workbench, the monsters you can add now sit right under the slots. The empty third slot shows "+2 ⚔ +1 🛡" and makes them pulse when tapped. The button reads "Graft without Ascend". The rule itself always worked; on a phone it was hidden below the fold.

## 2026-10-20 · Longer duels: Player life 24, Mirror Sigil −2

Two settings changed, which changes the settings hash: a duel in progress when this update arrives starts over, and
the seeds manifest is regenerated (2026-10-20 to 2027-01-17).

- **You start with 24 life** (D-368, proposal M-14): `PLAYER_LIFE: 20,` is now `PLAYER_LIFE: 24,` in `globals.ts`. Duels last longer: 55.6% now end in rounds 8 to 12 (was 50.0%), and 15.1% go the full 12 rounds (was 11.5%).
- **Mirror Sigil takes 2** (D-368, proposal M-16): `MIRROR_SIGIL_PENALTY: 3` is now `MIRROR_SIGIL_PENALTY: 2` in `CONTENT_NUMBERS`. This offsets the extra life, so the expert's win rate stays at 46.6% (was 46.2%).
- **Evidence**: `docs/BALANCE_LOG.md`, "Phase 3 A/B round 1 (2026-10-20)", tested every proposal that runs today. The other proposals were not adopted.

## 2026-10-20 · Phase 3 start: baseline sim, a naive bot, the set-aside switch

No live rule, card or setting changed, so saved duels and the seeds manifest are unaffected.

- **Baseline report**: `docs/reports/full-2026-10-20.md` measures the live game before any Phase 3 test. The expert wins 46.1% (target 45–55%). Grafts per win (4.29) and how often The Hollow Heir appears (47.9%) are now above their targets, and duels are longer than on 16 October but still short of the length targets.
- **Naive bot** (D-367): the simulator now also plays a scripted "casual player" (proposal M-09) and reports it as BT-2n next to the random novice. It won 0% in the first run, like the novice. Which bot the 20–30% novice target applies to is your call.
- **`FLAGS.ACE_SET_ASIDE` works** (D-366): with it `true`, The Hollow Heir starts outside his deck and joins his hand on the first successful Levy (proposal M-04). It stays `false` until you adopt M-04, and `true` is no longer refused. The pinned-settings table in CONTENT_GUIDE section 7 lost its `FLAGS.ACE_SET_ASIDE` row.

## 2026-10-20 · Playtest fixes: the Monarch's turn, the share text, the guide

No rule or content changed.

- **His moves stand out** (D-365): the card he plays or attacks with, and its target, get a heavy ink ring and a label, and each move's highlight stays up a little longer.
- **The Levy is easy to see** (D-365): your monster is marked "Levied" in its slot, then lands crowned on his side, about 3 seconds in all, and the plaque names it ("Levy · takes Cinderjaw Hound"). Nothing waits for a tap.
- **New share text** (D-365): `Vault Duel #6 🏆 9/12`, the round row, `❤️ 12 life · par 8 · ★★☆`, then the link. A loss reads `💀 X/12`. Day #1 is 15 October 2026.
- **Link preview** (D-365): a shared link now shows a picture with the name and "One vault. One duel. Every day."
- **How to play** (D-365): every page reworded for grammar and clarity. The rules are unchanged. Two tips on getting around the lanes rule are gone ("move it, or summon across from his monster" in Common questions, "Move it a lane, or summon across from him." in the Lanes quiz).

## 2026-10-20 · Phase 1 tidy-up: every setting does something

No rule or card changed. One setting was removed, which changes the settings hash: a duel in progress when this update
arrives starts over, and the seeds manifest is regenerated (2026-10-20 to 2027-01-17).

- **`OBJECTIVE_STARS_MAX` removed** (D-362): it repeated `OBJECTIVES_PER_DAY`, since each objective is worth one star. The line `OBJECTIVE_STARS_MAX: 3,` is gone from `globals.ts`. Change `OBJECTIVES_PER_DAY` instead.
- **`FLAGS.BONUS_OBJECTIVES` works** (D-362): set it to `false` and the objectives and stars disappear from Home, Result, the share text, How to play and Stats. `true` (today's value) changes nothing.
- **`RESET_HOUR_LOCAL` works** (D-362): the daily duel and the "Next duel in" countdown now roll over at this local hour. `0` (today's value) is midnight, as before.
- **Nothing is planned** (D-362): every setting is now read by the game or pinned, so `content:check` no longer prints a `not yet read` line. CONTENT_GUIDE section 7 now shows how to add a planned setting.
- **Keyword checks in the browser** (D-363): a duplicate, badly named or empty keyword, or more than 32 of them, is now reported by the dev build too. The duplicate message was `duplicate id (also in keywords/<first>.ts)` and is now `duplicate id`, on `keywords/<id>.ts`.
- **Balance target** (D-364): the expert bot's target stays an average win rate of 45–55% across days.

## 2026-10-19 · Playtest fixes: Inspect and element badges

No rule or content changed, so saved duels and the seeds manifest are unaffected.

- **Inspect puts the rules first** (D-361): the card is drawn small (104px) beside its name instead of large above it, so the rules, matchups and element wheel are on the first screen.
- **Element badges in muted colour** (D-361): each badge is filled with a dusty version of its element's old colour (Ember rust, Gale sage, Tide slate blue, Lumen ochre, Umbra plum) with the icon on top. The ink-pattern ring is gone. Spell and trap badges are plain paper.
- **Bigger element badges on cards** (D-361): half as big again (about 16px on a hand card instead of 10px), with a bolder icon.

## 2026-10-19 · The card face: art first

No rule changed. The art briefs changed, and they are part of the content hash, so a duel saved before this update
starts over and the seeds manifest is regenerated (2026-10-19 to 2027-01-16).

- **The art fills the card** (D-360): the shade over the bottom of the art is gone. The name runs across the top, the element and keyword icons sit top right, Power and Guard bottom right, and turn marks top left. All of them are lettered straight onto the art in black with a white outline.
- **Whole names, one line** (D-360): a name is never cut off with "…". A long one shrinks a little and is squeezed sideways to fit its bar, like the name line on a Yu-Gi-Oh card.
- **No Attack/Guard badge** (D-360): the number in play is reversed instead, white with a black outline. Power in Attack, Guard in Guard.
- **Inspect shows the card large** (D-360): the card face itself, the full width of the sheet, above its rules text.
- **Art briefs in ink** (D-360): every line in `art-briefs.json` now ends in an ink treatment instead of a colour palette. `cinderjaw-hound` was "feral and hungry · lunging low over cracked stone · ember red, soot black, orange glow" and is now "feral and hungry · lunging low over cracked stone · solid black hide, cracked-stone hatching, white sparks". The format is "mood · pose · ink", and the `content:check` hint for a missing brief says so.
- **Art brief** (D-360): `docs/ART_BRIEF.md` sets the style, the 4:5 shape, the size, the quiet areas and the file names for the commissioned art. A file at `apps/web/public/art/<card-id>.webp` replaces that card's placeholder, with no code change.

## 2026-10-19 · A clearer How to play

No rule or content changed. Saved duels keep working.

- **How to play** (D-359): a new page, **Attack, guard or face-down**, explains the three positions, the summon buttons, and that a face-down monster flips only into Attack (the Ambush). **Your turn** now comes right after Playing cards. It and **Lanes** show their key rules up front: no attacks in round 1, any order, and that moving, swapping or switching is free and leaves the monster able to attack. A swap uses up both monsters' change for the turn. A new **Common questions** page answers what new players ask most. Every number still comes from the globals, and each answer drops out when its rule is switched off.
- **Duel hints** (D-359): picking a monster in your hand now says which buttons choose its position, and picking a monster that can move says moving uses no summon, spell or Graft.
- The Your turn picture no longer cuts off the Attacks pip on a phone, and it says Graft, like the duel.
- The guide opens once more for returning players (`HOWTO_VERSION` 5).

## 2026-10-18 · The Monarch's court: the crown, the levy and the Ink Spiral look

The crown changes the rules, so a duel saved before this update starts over. `CONTENT_VERSION` stays `0.2.0`. The file
names, card ids and globals keep their engine names, so saved seeds and the tools still work.

- **The Monarch** (D-350): the opponent, once "Collector", is now **the Monarch**. "Appraisal" is now **the Levy** (levy, levied), "Relic" is now a **Courtier**, and "The Unpriced" is now **The Hollow Heir**. Every word a player reads changed. The renamed cards: "Mourning Cartographer" is now **Mourning Herald**, "Abyssal Curator" is now **Abyssal Chamberlain**, "Provenance Ledger" is now **Royal Ledger**, "Gilt Frame" is now **Gilded Mantle**, "Forfeit" is now **Execution** (Restoration keeps its name), "Display Case" is now **Bend the Knee**, "Counterfeit" is now **Forbidden Union**, "Insurance Claim" is now **Blood Tithe**. Ids (`forfeit`, `display-case` and the rest) are unchanged. The screens say "Decree of <date>", "Today's champion", "Bestiary" and "Champions", a result is a royal edict sealed with a wax seal (DEFIED or BOUND), and the loading line reads "Summoning the court...". The Vault keeps its name.
- **The crown** (D-349): a monster the Monarch levies is crowned while it is on his board. It gets **+1 Power** there (`CROWN_POWER` 1). A crown badge shows on the monster, and the card inspect reads "Crowned +1 Power". The crown is on by default (`FLAGS.CROWNED` true). A levy does not graft the monster automatically, so the Monarch keeps the monsters he already has.
  - Sim, quick run, 800 games per bot, 60 dates. Expert win rate 47.5% → 44.1%. Greedy 29.5% → 24.1%. Novice 0% → 0%. Levy success 56.6%, unchanged. The Hollow Heir now shows up in 47.5% of games (was 46.4%).
  - The expert now sits just under the 45–55% target band (BT-1). That is on purpose: the owner asked for a tougher Monarch. The band is left for the owner to move.
  - Rejected from the same run, expert / greedy win rates: life 44 (42.6% / 24.4%), life 48 (37.6% / 19.5%), a Levy Power limit of 4 (46.6% / 29.0%), and Levy rounds 3, 5, 7, 9 (34.9% / 18.5%). `COLLECTOR_LIFE` stays 40.
  - To switch the crown off, set `FLAGS.CROWNED` to `false`. To make it stronger or weaker, change `CROWN_POWER`.
- **Ink Spiral look** (D-351): a paper-white ground with hard black ink on every screen. Card art sits in hatched panels, board cards drift slowly (off with reduced motion or Animations off), and a faint spiral turns behind the Monarch's header. Blackletter names, book-serif flavour and condensed rules text. The Monarch is a crowned ink face with spiral eyes. Levy rounds show filled crowns on the round track. Element badges are ink patterns with no color for now: Ember solid, Tide horizontal lines, Gale diagonal lines, Lumen ring, Umbra concentric rings.
- **Levy lines** (D-352): `collector.json` › `dialogue` has an optional `levy` list, spoken when a levy takes one of your monsters. A failed levy and mood changes still use the mood lists, and a missing `levy` list falls back to them. Every mood line was rewritten in the Monarch's voice.
- **Tagline** (D-353): "Defy the Monarch, a few minutes a day." sits under the title on Home, and it is the web app's description.
- **Content guide**: `docs/CONTENT_GUIDE.md` uses the new names, explains the crown switch and the `levy` list, and says where the engine names still appear. Each example is pinned by `packages/content/test/guide.test.ts`.

## 2026-10-17 · Simple mode: Graft only, Riposte, Ambush and a quieter table

The rules changed, so a duel saved before this update starts over. `CONTENT_VERSION` stays `0.2.0`.

- **Graft is the only bond** (D-336): `FLAGS.SPLIT` and `FLAGS.SYMBIOSIS` are now `false`. Their rules stay in the game, switched off, for future daily modes. The **Graft** button beside End turn is back and opens the workbench directly. Shroud's text drops "if you split it, this ends".
- **Riposte** (`FLAGS.RIPOSTE`, D-337): attacking a guard (or face-down) monster with less Power than its Guard now destroys the attacker, and its owner still takes the difference. Guard holds a lane, and a face-down monster is a gamble to attack.
- **Ambush** (`FLAGS.AMBUSH`, `AMBUSH_POWER` 2, D-338): flipping your face-down monster to attack gives it +2 Power until the end of the turn, and it can attack right away.
- **The Monarch** counts Riposte, never peeks at a face-down Guard, flips to Ambush when it wins a fight, and sets his guard summons face-down when Composed (`collector.json` `allowFaceDown` true, D-343…D-345). Monarch life stays 40: the expert bot wins 50.6% (target 45–55%), greedy 28.3%, median 8 rounds.
- **Quiet table** (D-339, D-346): the Monarch's header is one row (his mood is the portrait ring's color); the round track is a thin strip with an "⚒ in k" Levy chip; lane labels are gone; the hint shows only while you hold a card; slot dots and your trap icons sit beside your life; the element wheel lives in Inspect.
- **Fixed: Grave Recall did nothing** (D-347). Its targets are in your discard pile, which the board couldn't show. A **Choose** button now opens your discard pile.
- **Fixed: a second row of slots over your traps** (D-339). Three overlapping layers (floating Attack/Face-up toggles, a ring inside each lit slot, full-height lane rails) are gone.
- **Riposte and Ambush cues** (D-348): targets show "Riposte" or "?" (face-down), your face-down monster's flip button reads "+2", and both play a short effect.
- **How to play** drops Split and Symbiosis, adds Riposte and Ambush, and shows once more for everyone.

## 2026-10-17 · Turn slots: one monster, one spell or trap, one bond, any order

The rules changed, so a duel saved before this update starts over. `CONTENT_VERSION` stays `0.2.0`.

- **Your turn** (`FLAGS.TURN_SLOTS`, D-335): summon one monster, play one spell or trap, make one bond (Graft, Split or Symbiosis) and attack once with each monster, **in any order**. Attacking no longer closes your card play or your bond. A monster that has attacked can't switch position or move lanes that turn.
- **The Monarch** plays by the same rules, so he can also summon and play a spell or trap in one turn.
- **Monarch life 25 → 40** (`COLLECTOR_LIFE`, D-335). The extra slot helps a skilled player much more than him: at 25 the expert bot won 73.5%; at 40 it wins 50.0% (target 45–55%), and games last longer (median 7 rounds, was 5).
- **Clearer screen**: the pips above your hand read Monster · Spell/Trap · Bond · Attacks (with the number of monsters that can still attack). One **Bond** button beside End turn replaces the separate Graft and Bonds buttons; picking Graft materials by hand is at the top of its sheet. A monster that has attacked shows a tick. A Sentinel's cover badge points at the Sentinel, the only thing that pulls an attack to the side. The attack hint says when a direct hit is possible (his board empty) and why a monster can't attack.
- **How to play**: "Play and bond" is now **Your turn**, and it shows once more for everyone.

## 2026-10-17 · Web: the round compass is back, and How to play covers the new rules

No content or rule changes; `CONTENT_VERSION` stays `0.2.0`.

- **Round compass** (D-334): picking a monster shows the element compass again, now at the left of the hint above your hand instead of the flat strip over the round track. It never covers a lane, and the board doesn't move when it appears.
- **How to play** (D-334) has three new pages: **Lanes** (attacks go straight across, "No hit", when his life is open, Sentinel reach, lane moves), **Play and bond** (one card play plus one bond action, the Play/Bond pips, the Bonds button and its Best hint) and **Keywords and Flaws** (every keyword and Flaw with its card text). Each has a Try it question.

## 2026-10-17 · v0.2.0: lanes, bond actions and a new ring

This release turns on the rules from the 2026-10-16 playtest round and adds three "chess piece" bond actions. `CONTENT_VERSION` is now `0.2.0`. **A duel saved before this update starts over** with the notice "The rules changed since this duel was saved; it starts over." (D-323).

### New rules, now on by default

- **Lanes** (`FLAGS.LANES`, D-281…D-284). Each side has three lanes, and a monster attacks only the monster across from it. An empty lane does not reach the Monarch's life; a direct attack needs his whole board empty. You pick the lane when you summon or graft. Once per turn a monster may either move one lane (or trade places with your monster there) or switch between attack and guard (`FLAGS.LANE_SWAP`, `LANE_MOVE_RANGE`).
- **Summoning sickness, monsters only** (`SICKNESS_MODE = monstersOnly`, D-280). From round 2, a new monster can attack his monsters on the turn it arrives, but not his life. Swift now also lets it hit life that turn; Slow stops it attacking at all.
- **Sentinel guards three lanes** (`SENTINEL_REACH` 1, D-283): its own lane and the lanes beside it.
- **One element ring** (ring A, `elements.json` `beats`, D-285): Ember → Gale → Tide → Lumen → Umbra → Ember. Each element beats exactly one and loses to exactly one; Lumen and Umbra no longer beat each other.
- **Bond actions** (D-305…D-320). Each turn you play one card and make one bond action, in either order, before your first attack (`FLAGS.BOND_ACTION`):
  - **Graft**: as before, but it no longer uses up your card play.
  - **Split** (`FLAGS.SPLIT`): unbind one of your Chimeras back into the monsters it was made from. Good for dodging Levy or getting lanes back; you lose the Chimera's bonus stats.
  - **Symbiosis** (`FLAGS.SYMBIOSIS`): attach a monster from your hand under one of yours. The host gets +`SYMBIOSIS_GUARD_BONUS` (2) Guard and the attached monster's keyword; when the host is destroyed, the attached monster comes out in its lane. If the host is Levied, the Monarch takes both.

### Monarch changes

- **Levy takes monsters with Power 5 or more** (`APPRAISAL_MIN_POWER` 7 → 5, D-332). Split and Symbiosis let players keep everything under 7, so Levy almost stopped working (13–15% success). At 5 it succeeds about half the time again. Evidence: `docs/BALANCE_LOG.md`.
- He places summons by lane and makes lane moves when they give him more kills (`collector.json` `ai.reposition = laneAware`, `ai.params.summonLane`; D-286).
- He never makes bond actions.
- Full sim of the shipped rules (50,000 duels per bot): expert player 51.4% (target 45–55%), Levy 49.7%, The Hollow Heir appears in 23.0% of duels. Games are short (median 5 rounds), which matches the faster pace you asked for; the round-length targets still fail (D-332).

### New texts

- Swift: "Can also attack life directly the turn it is summoned."
- Sentinel: "Enemy attacks in its lane and in the lanes within {SENTINEL_REACH|lane|lanes} of it must target it."
- Shroud: "One of your monsters cannot be Levied until your next turn; if you split it, this ends."
- How to play now has 8 pages, adding Split and Symbiosis and lines for lanes and sickness. Each line appears only while its rule is on.

### In the app

- Lanes on the board, lane picking when you summon or graft, lit "Move"/"Swap" slots for lane moves, a "No hit" note for an empty lane across, and a sickness badge (D-322).
- The in-duel element compass is now a strip above your board: "Beats … +2" and "Weak to …". The full wheel stays in How to play (D-321).
- "Play" and "Bond" pips show what you have left this turn. A Split button sits on Chimeras, and an Attach button on hand monsters. An attached monster shows as a tab under its host (D-327).
- **Bond options**: a button beside Undo lists every Graft, Split and Symbiosis you can make this turn, with the result and whether it is safe from the next Levy, and marks the best one (D-328).

### New levers in the content guide

- `SICKNESS_MODE`, `FLAGS.LANES`, `FLAGS.LANE_SWAP`, `LANE_MOVE_RANGE`, `SENTINEL_REACH`, `FLAGS.SPLIT`, `FLAGS.SYMBIOSIS`, `FLAGS.BOND_ACTION`, `SYMBIOSIS_GUARD_BONUS`, `BOND_GRAFT_MAX_HAND_MATERIALS`, `SPLIT_PART_PERM_P`. Each rule turns off with one edit in `globals.ts`.
- Editing the element ring in `elements.json`, and the Monarch's `summonLane` / `reposition` in `collector.json`.
- Sim overrides for trying a change without editing: `--set`, `--ring`, `--collector`, `--collector-reposition`.
- New `content:check` messages for a bad `beats` id, a removed element, a bad reposition mode or lane rule, a bad sickness mode, a lanes flag in words, a negative Sentinel reach, and a mistyped Sentinel placeholder. Each is quoted in the guide and tested.

## 2026-10-16

### Changed

- The web app drew the owner's picked visuals: cracked-frame Flaws, an element wheel and in-duel compass read from `elements.json`, the auction-catalogue Home, the duel menu sheet and a How to play with demos and "Try it" questions. No content file changed (D-271 to D-276).

## 2026-10-14

### Added

- `content:check` prints one information line after a clean run: `not yet read: 28 globals wait for ai, engine, sim, web › see packages/content/src/planned-globals.ts`. It counts the globals that are listed in `planned-globals.ts` because their readers are not built yet. It is information only and never fails the run (D-205).
- `RELIC_FLAWS` is pinned to 1. Any other value is refused with `globals.ts › RELIC_FLAWS › must be 1 until the engine supports other values › keep 1`, because a Courtier has exactly one Flaw (D-202).
- `castHighValueSpell` in `collector.json` is keyed by Monarch spell id. Each entry has exactly one of `{ "pick": "highestPower" }` or `{ "when": "contestedAttack" }`. You can add or remove entries with their card, with no code change (D-204).
- An entry with both keys or neither is refused: `collector.json › ai › params.castHighValueSpell.<id>: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"` (D-204).
- A `contestedAttack` entry on a spell that gives no Power to `chosen` is refused: `collector.json › ai › params.castHighValueSpell.<id>: "contestedAttack" needs a spell that gives Power to "chosen" › use "pick": "highestPower" instead` (D-204).
- The Monarch's ace must be a Courtier: `collector.json › ace › "<id>" is not a Relic › use a Relic id from cards/relics.json` (D-203).
- The Monarch's ace must be in his deck list: `collector.json › ace › "<id>" is not in the deck › add it to the deck list in collector.json` (D-203).
- A Monarch spell in his deck with no AI entry gets a warning: `warning: collector.json › deck[n] › Collector spell "<id>" has no AI rule that casts it › add "<id>" to ai.params.castHighValueSpell with a pick, or make it draw-only`. A draw-only spell gets no warning (D-177).
- A Monarch trap in his deck that `trapPreference` does not name gets a warning: `warning: collector.json › deck[n] › Collector trap "<id>" is not in ai.trapPreference › add it, or AI rule 4 never sets it` (D-177).
- A card number that nothing uses gets a warning: `warning: globals.ts › CONTENT_NUMBERS › <NAME>: not used by any card, objective, AI param or keyword › delete the line, or use $<NAME> in an effect`. It is left behind when the card that used it is deleted (D-205).
- A missing field now says what to add, for every field: `cards/player-monsters.json › <id> › power: missing › add "power"` (D-207).
- A Courtier without its Flaw: `cards/relics.json › <id> › flaw: missing, a Relic needs exactly 1 Flaw › add "flaw": "<flaw id>"` (D-202, D-207).
- The global `AI_SEARCH_NODE_BUDGET` is a safety cap on the Monarch's win search. The `not yet read` count rises by 1, because the global is listed in `planned-globals.ts` until `ai` reads it (D-211).

### Changed

- The keyword limit now comes from `MAX_BASE_KEYWORDS`, which the check reads. Old: `cards/player-monsters.json › <id> › keywords: ["swift","sentinel"] is above the maximum 1 › use 1 or less`. New: `cards/player-monsters.json › <id> › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword`. A Courtier gets the same line in `cards/relics.json`. Raising `MAX_BASE_KEYWORDS` now accepts more keywords, where before it did nothing (D-201).
- A Flaw on a base monster. Old: `cards/player-monsters.json › <id> › (entry): unknown key(s) flaw › remove flaw`. New: `cards/player-monsters.json › <id> › Flaws appear only on Relics › remove "flaw"` (D-207).
- The Monarch's AI spell path now names `params`. Old: `collector.json › ai › castHighValueSpell.<id>: …`. New: `collector.json › ai › params.castHighValueSpell.<id>: …` (D-204).
- An unknown key in `castHighValueSpell` is accepted now, because the map takes any Monarch spell id. Old: `collector.json › ai › params.castHighValueSpell: unknown key(s) <id> › remove <id>`. The spell is then checked the same way as the others: it needs to be in his deck, and it gets the D-177 warning when it has no entry (D-204).
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

- Web app, no content change: a bug fix for extra summoning zones, a main menu, a duel menu with the log, Undo to the start of your turn, tap-again to take a Graft material out, slower animations with a telegraph before each Monarch move, and a steadier layout (D-265 to D-270).
