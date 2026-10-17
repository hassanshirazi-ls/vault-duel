# Vault Duel — Decisions Log

Owner: game-architect. Source of truth for rules is `docs/DESIGN.md` (v0.1, Oct 13 2026). Source of truth for content values (stats, keywords on cards, card list, effects, text, recipes, globals) is the content JSON and `globals.ts` from the D-166 switch onward; DESIGN.md's value tables are then launch values. This file records every place where DESIGN.md is ambiguous, silent, or internally inconsistent, and the interpretation the engine implements. Rule of thumb: **pick the simplest interpretation that keeps the written rule true**. Nothing here changes a DESIGN.md rule; where a rule looks wrong, the entry is marked **PROPOSAL — needs owner review** and the design rule is still implemented as written.

Entry format: `D-NNN · title` — Date · Question · Decision · Reason. Entries that extend DESIGN.md beyond pure interpretation are tagged **[EXTENDS]**; entries the owner should look at are tagged **[REVIEW]**.

Terminology used below: *turn index* `t` counts turns from 0 (round 1 player = 0, round 1 Collector = 1, …, round 12 Collector = 23). *Owner* = the side whose deck a card started in (never changes). *Controller* = the side whose board/hand/zone currently holds it.

---

## A. Seeding, setup and deck generation

**D-001 · Seed string format**
- Date: 2026-10-14
- Question: DESIGN says `seed = hash("vault-duel" + YYYY-MM-DD + content version)`. Plain concatenation is ambiguous (`"vault-duel2026-10-140.1.0"`) and could collide across versions.
- Decision: `seedString = "vault-duel:" + YYYY-MM-DD + ":" + CONTENT_VERSION`, hashed with cyrb128 → 4×uint32 → sfc32. `CONTENT_VERSION` is a semver string in `packages/content/src/globals.ts`, bumped manually when content that affects generation changes.
- Reason: same ingredients in the same order; separators remove collisions; a manual version keeps seeds stable across cosmetic content edits (art briefs, dialogue).

**D-002 · Independent RNG sub-streams**
- Date: 2026-10-14
- Question: One seed must produce the deck, both shuffles, the signature card, the objectives and (later) the twist. Should these share one stream?
- Decision: Each purpose has its own stream seeded by `cyrb128(seedString + "#" + reroll + "/" + purpose)` with purposes `deck`, `shuffle-player`, `shuffle-collector`, `signature`, `objectives`, `twist`, `engine` (reserved for future in-duel randomness; unused by v0.1 cards).
- Reason: changing how one thing is generated (e.g. adding an objective) does not reshuffle everyone's deck; easier to test.

**D-003 · "Re-rolls with seed+1"**
- Date: 2026-10-14
- Question: The seed is a hash of a string; what does "seed+1" mean?
- Decision: Reroll *k* (k = 0, 1, 2, …) uses the stream key `seedString + "#" + k`. k = 0 is the unmodified daily seed. Everything (deck, shuffles, signature, objectives) is regenerated for each k.
- Reason: deterministic, string-level, and every client computes the same k.

**D-004 · Reroll limit and fallback** [EXTENDS]
- Date: 2026-10-14
- Question: DESIGN does not bound rerolls. What if no seed passes?
- Decision: `SEED_MAX_REROLLS = 20`. If rerolls 0..20 all fail, keep the candidate whose win rate is closest to 0.50 (ties: lowest k) and mark the day `difficultyCheck: "fallback"` in reports.
- Reason: the client must always produce a duel; the sim report surfaces how often this happens (target: never).

**D-005 · Deck-generation algorithm and retries**
- Date: 2026-10-14
- Question: How are 15 monsters / 5 spells / 4 traps drawn, and what happens when the element/kind/curve constraints fail?
- Decision: From the `deck` stream: pick each monster uniformly from pool entries with fewer than `MAX_COPIES` copies already picked (15 picks); same for spells (5) and traps (4). Check constraints (≥ `DECK_MIN_ELEMENTS` elements, ≥ `DECK_MIN_KINDS` kinds, ≥ `CURVE_LOW_MIN_COUNT` monsters with Power ≤ `CURVE_LOW_MAX_POWER`, ≥ `CURVE_HIGH_MIN_COUNT` with Power ≥ `CURVE_HIGH_MIN_POWER`). On failure, discard the whole attempt and retry, continuing the same stream, up to `DECKGEN_MAX_ATTEMPTS = 1000`. Exhaustion throws a `ContentError`; `content:check` proves feasibility (by running the generator on 1,000 test dates) so this never ships.
- Reason: rejection sampling is the simplest correct algorithm and is deterministic when the stream continues.
- Amended by D-192 and D-200: the engine throws `EngineError` (it has no `ContentError`), and `content:check` turns it into a §10.3 record. D-197 sorts the pools by card id.

**D-006 · Deck list order and card instance ids**
- Date: 2026-10-14
- Question: The player "sees their full 24-card list"; instance ids must be small integers.
- Decision: The deck list is shown sorted by (type, element, kind, id). Player cards get instance ids 0–23 in that sorted order; Collector cards get 24–43 in `collector.json` order; Chimeras are appended from 44 upward. Hidden-information safety for the AI is handled by the redacted view (D-086), not by obscuring ids.
- Reason: stable, small, easy to debug; the player can inspect their own client anyway.

**D-007 · Opening-hand monster guarantee**
- Date: 2026-10-14
- Question: "The seed guarantees at least 2 monsters in both opening hands" (and the redraw, per Deck generation constraints). How?
- Decision: Shuffle with Fisher–Yates from the side's shuffle stream. Player deck: accept only if positions 0–4 (opening hand) and 5–9 (redraw hand, for each of `REDRAWS`) each contain ≥ `OPENING_MIN_MONSTERS` monsters. Collector deck: positions 0–4 only. Otherwise reshuffle (continuing the stream) up to `SHUFFLE_MAX_ATTEMPTS = 1000`; if exhausted, deterministically repair by swapping the leftmost non-monster in the deficient window with the first monster after the last window.
- Reason: simplest deterministic guarantee; repair path is practically unreachable (15/24 monsters) but makes generation total.
- Paper-sim: A10 — see D-118 (whether The Unpriced counts as a monster for the Collector's guarantee).

**D-008 · Redraw mechanics**
- Date: 2026-10-14
- Question: Order of cards going to the bottom; when can the redraw happen; does the Collector redraw?
- Decision: Redraw is only available in the setup `mulligan` step, before round 1. The hand goes to the bottom of the deck in hand order (first-drawn ends up highest of the bottom block); then the next 5 cards are drawn. The Collector never redraws. With `FLAGS.REDRAW = false` the mulligan step is skipped.
- Reason: "the next 5 seeded cards" means deck positions 5–9, which D-007 already guarantees.

**D-009 · Collector's hand and draws**
- Date: 2026-10-14
- Question: Does the Collector have a hand, draw, and obey the same limits?
- Decision: Yes. The Collector has a hidden hand (count is public), draws an opening 5, and uses the same draw rule (D-011) on his turns. His spells/effects that draw ignore the cap like the player's.
- Reason: "Each side draws 5" and "A round = the player's turn, then the Collector's turn" with identical steps; symmetric rules are simplest.
- Paper-sim: A2 — agrees (same draw rules for the Collector).

**D-010 · Signature card** [EXTENDS]
- Date: 2026-10-14
- Question: "The seed produces … the day's signature card" — which card?
- Decision: Uniform pick (from the `signature` stream) among the distinct monster card ids in the player's generated deck.
- Reason: the Binder collects it; it should be a card you actually played with today. Monsters have the most identity.

---

## B. Turn structure and drawing

**D-011 · Draw step: "up to 5 cards, at most 2 per turn"**
- Date: 2026-10-14
- Question: Is 5 a hand target or a draw count? Is there a maximum hand size?
- Decision: At the draw step the active side draws `min(MAX_DRAW_PER_TURN, max(0, HAND_SIZE − handCount), deckCount)` cards. There is no maximum hand size otherwise: effect draws (Scrying Bones, Provenance Ledger, Last Rites), Echo, Grave Recall and Restoration may take a hand above 5, and nothing is discarded.
- Reason: literal reading of "draw up to 5 … at most 2"; "spell effects ignore the cap" is read as ignoring both the 2-card cap and the 5-card target.
- Paper-sim: A2 — agrees.

**D-012 · Round 1 draws**
- Date: 2026-10-14
- Question: Do sides draw on their round-1 turns?
- Decision: The draw step runs normally; both sides hold 5 after setup, so they draw 0 in round 1 unless something changed hand size.
- Reason: falls out of D-011 with no special case.

**D-013 · Empty deck**
- Date: 2026-10-14
- Question: Partial draws when the deck runs out.
- Decision: Draw as many as possible; remaining draws are skipped with a `DrawSkipped{reason:"deckEmpty"}` event. Never a loss.
- Reason: "If you cannot draw, you skip the draw (no deck-out loss)."

**D-014 · Strict step order within a turn**
- Date: 2026-10-14
- Question: Can you reposition after playing a card, or play a card after attacking?
- Decision: Steps are strictly ordered: Draw (automatic) → Reposition → Play → Attack → End. Repositioning is legal only before the play and before the first attack. Playing a card (including committing a Graft) or declaring an attack closes the Reposition step; declaring the first attack also forfeits an unused play. Playing is optional.
- Reason: the numbered list in "A round" is an order; strict order is the simplest model and gives Bloodlust/Gilt Frame a clear window (play, then attack).

**D-015 · "The player always goes first and cannot attack on round 1"**
- Date: 2026-10-14
- Question: Does the round-1 attack ban also apply to the Collector's round-1 turn?
- Decision: Only the player's turn in round 1 is restricted (`FIRST_ATTACK_ROUND_PLAYER = 2`). The Collector's round-1 turn follows normal rules; since everything he controls was summoned that turn, only a Swift monster (Ashen Duchess) could attack, and only monsters.
- Reason: the sentence is about the player; it compensates for going first.

**D-016 · Turn-start order**
- Date: 2026-10-14
- Question: Order of start-of-turn events (expiries, Appraisal, draw, intent).
- Decision: (1) `TurnStarted` → expire "until your next turn" effects of the active side (Shroud) → `onTurnStart` hooks (hook order per ARCHITECTURE §8.3). (2) Collector turn only, Appraisal rounds only: Appraisal (D-075). (3) Draw step. (4) Player turn only: compute and freeze the Collector's intent (D-095). (5) Reposition step begins.
- Reason: "at the start of his turns" puts Appraisal before anything he does; drawing after Appraisal means the countdown reaches zero before any new card enters.

**D-017 · Turn-end order and the 12-round seal**
- Date: 2026-10-14
- Question: Order of end-of-turn effects; when exactly is the game lost on time?
- Decision: `onTurnEnd` content hooks → Unstable destructions due this turn (slot order, D-062) → timed modifiers whose expiry is this turn stop applying (lazy, D-031) → `TurnEnded`. After the Collector's turn in round 12 ends (t = 23) and nobody has won, `GameOver{reason:"vaultSealed"}`: the player loses.
- Reason: "you lose … when the vault seals at the end of round 12".

**D-018 · Win/loss checks are immediate**
- Date: 2026-10-14
- Question: When are life totals checked; what if both reach 0?
- Decision: After every life change the engine checks: Collector ≤ 0 → player wins; else player ≤ 0 → player loses. The game ends immediately, even mid-attack or mid-turn; remaining hooks are dropped. Simultaneous zero is impossible with v0.1 content; if it ever happens the Collector check runs first (player wins).
- Reason: simplest; matches "you win when the Collector hits 0".

**D-019 · Life cap** (revised after paper-sim)
- Date: 2026-10-14
- Question: Can healing (Siphon, Insurance Claim) exceed starting life?
- Decision: Yes. There is **no life cap**: healing may take life above `PLAYER_LIFE` / `COLLECTOR_LIFE`. Mood uses thresholds only (D-080), so a Collector above 25 is simply Composed.
- Reason: DESIGN states no cap, and "no extra rule" is simpler than inventing one. The first draft read a cap into the mood table's "16–25" range, but that table describes moods, not a maximum.
- Paper-sim: A21 — recommends no cap (D3 reached 23 life). **Changed to match** (the first draft capped life).

**D-020 · No concede in v0.1**
- Date: 2026-10-14
- Question: Can the player abandon the daily duel?
- Decision: No concede action in the engine. The game always terminates by round 12. Refresh resumes (D-108).
- Reason: "one attempt" per day; a concede would just be a loss with no gameplay value.

---

## C. Board, summoning and positions

**D-021 · Slot choice**
- Date: 2026-10-14
- Question: Does the player choose which board/trap slot a card enters?
- Decision: No. Monsters (summons, Chimeras, Appraised monsters) enter the leftmost empty monster slot; traps the leftmost empty trap slot.
- Reason: halves the action space; "leftmost" already matters for Appraisal ties and AI tie-breaks, and players can still control order through play order.

**D-022 · Universal summoning sickness**
- Date: 2026-10-14
- Question: Can any monster attack the turn it entered the board?
- Decision: No monster can attack or reposition on the turn it entered its controller's board (summon, Graft, Covetous summon, or Appraisal transfer) unless a keyword grants it (Swift). Implemented as `monster.enteredTurn === state.turn`.
- Reason: Graft rule 6 ("follows normal summoning rules (cannot attack this turn unless Swift)") and the Swift keyword both presuppose it.
- Paper-sim: A1 — agrees (reading (a)).

**D-023 · Reposition of face-down monsters**
- Date: 2026-10-14
- Question: Can a face-down monster be repositioned to face-up guard?
- Decision: No. A face-down guard monster's only reposition is to face-up attack ("A face-down monster flipped to attack is revealed"). Face-up monsters toggle attack ↔ guard. Each monster repositions at most once per turn.
- Reason: reposition is defined as switching between attack and guard; face-down guard → face-up guard is not a switch.

**D-024 · Effect-driven position changes are not repositions**
- Date: 2026-10-14
- Question: Does Thornwall/Display Case switching an attacker to guard use up its reposition, or block one later?
- Decision: No. `changePosition` effects never touch the reposition flag. The monster may reposition normally on its controller's next turn.
- Reason: reposition is a player step, not a state.

**D-025 · Face-down summons by the Collector**
- Date: 2026-10-14
- Question: Can the Collector summon face-down?
- Decision: The engine allows it (rules are symmetric), but the Collector AI never chooses it (`collector.json › ai.allowFaceDown = false`).
- Reason: his priority list never mentions face-down; keeping it off keeps his play readable and his intents honest.
- Amended by D-214: `allowFaceDown: true` now has a defined meaning (his guard summons go face-down). The default stays `false`.

**D-026 · The Collector never grafts**
- Date: 2026-10-14
- Question: Rule or AI policy?
- Decision: Rule: `getLegalActions` never offers Graft actions to a side whose `collector.json › canGraft` (Collector) is false.
- Reason: "he never grafts" is stated as a fact about the boss, not a choice.

---

## D. Combat

**D-027 · Direct attacks only on an empty board**
- Date: 2026-10-14
- Question: When may a monster attack life directly?
- Decision: Only when the defending side has no monsters on its board (face-down monsters count as monsters). Swift on its summon turn may never attack directly (D-041).
- Reason: combat table: "Empty board: Direct attack".

**D-028 · "Owner" in the combat table means controller**
- Date: 2026-10-14
- Question: "the loser's owner takes the difference" — for an Appraised monster, who takes damage?
- Decision: The controller at the moment of resolution (the Collector, for a stolen monster).
- Reason: damage follows whose side of the board fought.

**D-029 · Element advantage details**
- Date: 2026-10-14
- Question: Does a direct attack get the element bonus? Does a defender ever get it? Is advantage checked before or after a face-down reveal?
- Decision: The +`ELEMENT_BONUS` applies only to the attacker, only when attacking a monster whose element its element beats (Lumen↔Umbra both ways). Direct attacks have no defender element, so no bonus. Face-down defenders are revealed first; advantage is computed after the reveal.
- Reason: "Element advantage adds +2 Power when attacking only"; a face-down card has no visible element until revealed.

**D-030 · Stats never go below 0**
- Date: 2026-10-14
- Question: Haunt, Mirror Sigil, Tethered and Counterfeit can push Power negative.
- Decision: Effective Power and Guard are floored at 0 when read. A 0-Power monster may still attack (and may be destroyed by a 0-Power tie). Stored modifiers are not clamped (so a later +3 counts fully).
- Reason: simplest; no "dies at 0 Power" rule exists.

**D-031 · Effective stats are computed, not stored**
- Date: 2026-10-14
- Question: How do permanent, timed and static modifiers combine?
- Decision: `effectivePower = max(0, base (+Ascend) + permanentMods + Σ timed mods still active + Unstable bonus + static hooks (Tethered) + weekly twist)`; element bonus is added only inside combat. Timed mods carry an absolute expiry turn index and simply stop applying after it (no cleanup pass).
- Reason: one formula used by UI, AI, Appraisal and combat; zero per-turn bookkeeping.

**D-032 · Combat resolution order: "Keywords and traps resolve before damage"**
- Date: 2026-10-14
- Question: Order of trap triggers, keyword effects, destruction and damage. Matters for lethal edge cases (e.g. Insurance Claim when the Collector is low).
- Decision: Attack pipeline: declare → `onAttackDeclared` (traps; may cancel) → reveal face-down defender → `beforeCombat` (Pierce/Brittle flags; stats snapshotted including element bonus) → compute outcome (destroyed set + damage amounts) from that snapshot → destroy (Ward replacement, then `onDestroyed` hooks: Haunt, Echo, Last Rites, Insurance Claim) → apply damage → win check.
- Reason: literal reading of "Keywords and traps resolve before damage". Damage amounts are fixed by the snapshot, so hooks cannot change them, only life totals around them.
- Paper-sim: A19 — agrees (Insurance Claim can lift him out of lethal; mattered in D3 R7).

**D-033 · A cancelled attack still uses the attack**
- Date: 2026-10-14
- Question: After Snare/Display Case/Thornwall cancels an attack, can that monster attack again?
- Decision: No. The monster is marked as having attacked at declaration.
- Reason: "Attack with each attack-position monster once"; a declared attack is the attack.

**D-034 · Ties with Ward**
- Date: 2026-10-14
- Question: Attack-position tie where one monster has Ward.
- Decision: Both are marked destroyed; Ward prevents its holder's destruction (Ward is lost); the other is destroyed. No damage (tie).
- Reason: Ward is a generic destruction replacement.

**D-035 · Ward prevents destruction, not damage**
- Date: 2026-10-14
- Question: If a Ward monster in attack position loses a fight, does its controller still take the difference? Does Pierce still go through?
- Decision: Yes to both. Damage is computed from the stat comparison (D-032), independently of whether destruction was prevented.
- Reason: Ward's text only mentions destruction.
- Paper-sim: A14 — agrees.

**D-036 · Mirror Sigil and an attack that continues**
- Date: 2026-10-14
- Question: After Mirror Sigil, does the attack continue? Does it trigger on direct attacks?
- Decision: The attack continues with the reduced Power (possibly 0). Mirror Sigil triggers on any enemy attack, including direct attacks.
- Reason: Mirror Sigil does not say "cancel"; "when an enemy monster attacks" covers all attacks.

---

## E. Keywords and Flaws

**D-037 · Keywords on face-down monsters are inactive**
- Date: 2026-10-14
- Question: Does a face-down Sentinel force targeting? Does a face-down Ward/Haunt/Echo work?
- Decision: Keywords of a face-down monster are inactive while it is face-down. A face-down Sentinel does not constrain attacks. Since attacking reveals it before combat (D-032), Ward, Haunt and Echo work normally in that combat.
- Reason: hidden information must not leak through legality; revealing before combat keeps the defensive keywords meaningful.
- Paper-sim: A16 — agrees (a face-down Sentinel does not taunt).

**D-038 · Sentinel with several Sentinels**
- Date: 2026-10-14
- Question: Which Sentinel must be attacked first?
- Decision: If the defending side has ≥ 1 face-up Sentinel, every attack must target one of its face-up Sentinels (any of them). Direct attacks are impossible anyway (board not empty).
- Reason: Taunt semantics.
- Paper-sim: A16 — agrees. Also confirmed: the AI's attack rules only consider legal targets (D-086 choices come from `getLegalActions`). So when a Sentinel is the only legal target and he cannot beat it, rules 2–4 return nothing and he holds; only Vain monsters attack into it (D-052). The wall exploit this creates is in proposals M-06 and M-11.

**D-039 · Pierce applies only against guard position** [REVIEW]
- Date: 2026-10-14
- Question: "Power beyond the defender's Guard is dealt to its owner's life" — against an attack-position defender, does Pierce compare against Guard instead of Power?
- Decision: Pierce only changes guard-position (and revealed face-down) combat: when attacker Power > defender Guard, the defender's controller takes `attackerPower − defenderGuard`. Against attack-position defenders, the normal rule applies (loser's controller takes the Power difference).
- Reason: Overwhelm analog; Pierce exists to fix "Power > Guard … no damage". Applying Guard to attack-position fights would make Pierce attackers deal different damage in a fight that already deals damage, which is a second rule to learn.
- Paper-sim: A22 — agrees ("Pierce only matters against guard and face-down defenders").

**D-040 · Pierce and Ward/Brittle**
- Date: 2026-10-14
- Question: Does Pierce damage happen if Ward saves the defender, or if Brittle destroyed it?
- Decision: Yes in both cases, computed from the snapshot (attacker Power incl. element bonus − defender Guard).
- Reason: D-035.

**D-041 · Swift: "but not life directly" applies only on the summon turn**
- Date: 2026-10-14
- Question: Is a Swift monster forever unable to attack life directly?
- Decision: The direct-attack restriction applies only on the turn it entered the board. From the next turn on, a Swift monster attacks like any other.
- Reason: Rush semantics (the cited inspiration); otherwise Swift would be a net drawback on two Collector relics and several player cards.

**D-042 · Swift and the round-1 ban**
- Date: 2026-10-14
- Question: Can a Swift monster summoned in round 1 by the player attack?
- Decision: No; the round-1 player ban (D-015) overrides Swift.
- Reason: the ban is absolute.

**D-043 · Ward resets when the monster leaves the board**
- Date: 2026-10-14
- Question: An Echo monster that used its Ward returns to hand. Is Ward back when re-summoned?
- Decision: Yes. Leaving the board (to hand, discard, vault) resets all board state: Ward unused, modifiers cleared, Unstable cleared, flags cleared. Moving board-to-board (Appraisal) keeps everything.
- Reason: standard zone-change rule; one place to implement it.

**D-044 · Ward against every destruction**
- Date: 2026-10-14
- Question: Does Ward prevent destruction by spells (Unmake, Forfeit), Brittle, and Unstable expiry?
- Decision: Yes — Ward prevents the first destruction of any kind. Sacrifice (Graft materials, Covetous) and Appraisal are not destruction and ignore Ward.
- Reason: "The first time it would be destroyed" is cause-agnostic.
- Paper-sim: A14 — agrees (destroy effects consume Ward).

**D-045 · Haunt: who is "the monster that destroyed it"**
- Date: 2026-10-14
- Question: Defines the destroyer; what if the destroyer also dies (tie) or the destruction came from a spell/Unstable?
- Decision: Destroyer = the opposing monster in the combat that destroyed it (attacker or defender, including a Brittle-forced destruction). Haunt applies `−HAUNT_PENALTY` permanent Power to the destroyer only if the destroyer is still on the board after the whole destruction batch resolved (survived, or saved by Ward). In a mutual tie destruction, Haunt fizzles unless the other side had Ward. Destruction by spells, traps or Unstable expiry has no destroyer: Haunt fizzles. If the destroyer leaves the board later, the penalty is gone (D-043).
- Reason: simplest rule that never targets a card that is no longer on the board.

**D-046 · Echo returns to the owner's hand**
- Date: 2026-10-14
- Question: Echo on an Appraised monster: whose hand? Does Echo work against spell destruction and Unstable expiry?
- Decision: The card goes to its **owner's** hand (original deck side), so a stolen player Echo monster returns to the player. Echo triggers on any destruction (combat, spells, Unstable). It is still "destroyed" for other triggers (Last Rites, Insurance Claim) — those look at the controller at destruction time.
- Reason: "owner" is the card-game standard term; tracking an immutable owner is simplest.
- Paper-sim: A8 — agrees (Echo returns a stolen monster to its original owner). A13 differs for Chimeras: the paper-sim would send a Chimera to the discard instead of the hand. **Kept as decided**, because that exception would contradict Echo's written text ("return it to its owner's hand"). It is also not a loop: the returned Chimera has lost Unstable (D-043) and costs a full play to re-summon. The paper-sim's version is logged as proposal M-12.

**D-047 · Ownership vs control for zones**
- Date: 2026-10-14
- Question: Where do destroyed or sacrificed Appraised monsters go?
- Decision: Any card leaving play goes to its **owner's** discard (or hand via Echo). So a stolen player monster destroyed on the Collector's board lands in the player's discard and can be Grave Recalled; it can never be Restored by the Collector.
- Reason: consistent with D-046; one rule for all zone moves.

**D-048 · Last Rites / Insurance Claim "your monster"**
- Date: 2026-10-14
- Question: Is a stolen monster "his monster" or "your monster" when destroyed?
- Decision: "Your/his monster" = controlled by that side at destruction time. Insurance Claim triggers on a stolen monster he controls; Last Rites does not.
- Reason: same as combat (D-028).

**D-049 · Brittle: what exactly happens** [REVIEW]
- Date: 2026-10-14
- Question: "Destroyed by any attack with element advantage, regardless of Power" — does it trigger when the Brittle monster attacks? Does the Brittle side's attacker/defender comparison still matter? What damage is dealt?
- Decision: Brittle applies only when the Brittle monster is the **defender** and the attacker has element advantage over it. Then: the defender is destroyed (Ward could still prevent it, D-050); the attacker is never destroyed and its controller takes no damage in that combat; the defender's controller takes the damage the normal rule would give if positive (attack position: attacker Power − defender Power; guard: 0, or Pierce excess).
- Reason: "an attack with element advantage" belongs to the attacker; the simplest model is "the attacker automatically wins this fight", with normal damage math.
- Paper-sim: A15 — agrees (damage only if the attacker's Power is higher, attacker survives).

**D-050 · Brittle vs Ward**
- Date: 2026-10-14
- Question: If a Brittle monster had Ward (none in v0.1; possible via future cards), which wins?
- Decision: Ward prevents the Brittle destruction like any other (D-044).
- Reason: Brittle defines *when* it is destroyed; Ward replaces *any* destruction.

**D-051 · Tethered counts board monsters only**
- Date: 2026-10-14
- Question: "while it is his only monster" — do stolen monsters and vault monsters count?
- Decision: Count monsters on his board (including Appraised ones, face-up or face-down). Vault monsters do not count. Computed continuously (static hook).
- Reason: the vault is not in play.

**D-052 · Vain: engine forces the attack, AI picks the target**
- Date: 2026-10-14
- Question: Who enforces "must attack if able, choosing the best legal target"? Does Vain force a reposition to attack?
- Decision: Engine: while a Vain monster in attack position has at least one legal attack and has not attacked, `endTurn` is not a legal action (other attacks may be made first, in any order). Target selection uses the Collector AI's `bestTarget` function (D-091). Vain does not force a guard monster to reposition to attack, and the AI may keep a Vain monster in guard.
- Reason: legality belongs to the engine, "best" is a judgment call that belongs to the AI; Vain is only on Relics, which only the Collector controls.

**D-053 · Slow is identical to universal summoning sickness** — PROPOSAL — needs owner review [REVIEW]
- Date: 2026-10-14
- Question: Under D-022 no monster can attack the turn it is summoned; "Slow: cannot attack the turn it is summoned" therefore does nothing (no Relic has Swift + Slow, and Relics only enter play by summon).
- Decision: Implement Slow exactly as written (a legality hook that forbids attacks on the entered turn and overrides Swift-like grants). AI priority 6 still avoids Slow monsters as written. **Proposal for the owner:** make Slow meaningful, e.g. "cannot attack until his second turn after it is summoned" or "cannot attack the turn it is summoned or the next". Either is a one-line change in `keywords/slow.ts` plus a global `SLOW_TURNS`.
- Reason: the architect must not change rules; the sim will show four Relics (Gilded Penitent, Saint of Brass, Abyssal Curator, Weeping Automaton) carrying a Flaw with no effect.
- Paper-sim: A1 — agrees that Slow is a no-op. Its proposal P1 (the "second turn" wording) is logged as M-01.

**D-054 · Covetous: what counts as sacrificing an acquired monster**
- Date: 2026-10-14
- Question: The Collector never grafts; how does he sacrifice? Does the acquired monster have to be on the board, or can it be in the vault?
- Decision: The Unpriced is summoned with a dedicated action `summonCovetous{card, sacrifice}`, legal when `sacrifice` is a monster he acquired through Appraisal that is on his board **or in his vault**, and a monster slot is free after the sacrifice. Sacrifice is not destruction (no Ward, Echo, Haunt, Last Rites, Insurance Claim); the sacrificed card goes to its owner's (the player's) discard. It is his one play.
- Reason: "his ace can only arrive if Appraisal succeeded" — counting the vault means any success enables the ace, which supports the 20–40% appearance target.
- Paper-sim: A9, A20 — agrees (a vaulted monster is a legal sacrifice; sacrifice is not destruction).
- Amended by D-213: when several sacrifices are legal, the AI sacrifices a vault monster before a board monster.

**D-055 · Covetous with Appraisal disabled**
- Date: 2026-10-14
- Question: With `FLAGS.APPRAISAL = false`, can The Unpriced ever be summoned?
- Decision: No; it is a dead card in his hand. The sim reports this configuration as such.
- Reason: flags turn mechanics off without rewriting cards.

---

## F. Graft

**D-056 · Chimeras cannot be Graft materials (except the Ascend base)**
- Date: 2026-10-14
- Question: Chimeras have a family, not a kind. Can a Chimera on the board or in hand (e.g. after Echo) be grafted later?
- Decision: No. Only base monsters are Graft materials. The single exception is Ascend: the Chimera created in the same Graft action is the base of the second step.
- Reason: "Max 3 materials total" and "Ascend … same turn" only make sense if Chimeras are not re-grafted later; avoids defining a Chimera's kind.
- Paper-sim: A11 / P12 — agrees.

**D-057 · Graft legality**
- Date: 2026-10-14
- Question: Exactly when is Graft available?
- Decision: Legal when the side may graft (D-026), has not played this turn, owns ≥ `MIN_GRAFT_MATERIALS` eligible monsters across hand + own board, and a monster slot would be free after removing the chosen board materials. Face-down board monsters are eligible (they are revealed by the `Grafted` event). Appraised monsters on the opponent's board are not yours.
- Reason: direct reading of rules 1–2.

**D-058 · Graft materials are sacrificed, not destroyed**
- Date: 2026-10-14
- Question: Do Echo/Haunt/Last Rites trigger on materials?
- Decision: No. All materials (from hand or board) go to the owner's discard via `Sacrificed` events; nothing triggers.
- Reason: rule 1 says "sacrificed"; otherwise Echo materials would return and be reused every turn.
- Paper-sim: A20 — agrees.

**D-059 · Keyword inheritance choice**
- Date: 2026-10-14
- Question: "up to 2 … (player picks if more than 2 are available)". Can the player pick fewer? When is the pick made relative to Ascend?
- Decision: Available = distinct union of all materials' active keywords (including Ascend material). If the union has ≤ `MAX_INHERITED_KEYWORDS`, all are inherited automatically. Otherwise the player picks exactly 2. The pick is made after the Ascend decision, so "may take that material's keyword" is satisfied by including it in the pick. All six launch keywords are pure upsides, so "fewer" is never offered.
- Reason: smallest action space; one pick step instead of two.
- See D-181 (Flaws are never inherited) and D-182 (open owner question: what a face-down or Ward-used board material contributes).

**D-060 · Ascend keeps family and element**
- Date: 2026-10-14
- Question: Ascend "same family" — and element? Can an older Chimera Ascend on a later turn?
- Decision: Family and element stay those of the step-1 Chimera; stats = family base + `ASCEND_POWER`/`ASCEND_GUARD`, applied once. Ascend is only available inside the same Graft action (D-056). Gated by `FLAGS.ASCEND`.
- Reason: rule 4 says "second step, same turn".

**D-061 · Unstable: which elements must oppose, and how often the bonus applies**
- Date: 2026-10-14
- Question: With 3 materials, which pairs are checked? Can the bonus apply twice?
- Decision: The Chimera is Unstable if **any pair** of its materials' elements oppose (a beats b or b beats a, from `elements.json`). The +`UNSTABLE_BONUS` Power applies once. Gated by `FLAGS.UNSTABLE`.
- Reason: "if the materials' elements oppose each other" reads as a property of the material set.

**D-062 · Unstable "destroyed at the end of your next turn"**
- Date: 2026-10-14
- Question: Which turn exactly? What if it changes controller or leaves and returns?
- Decision: Grafted on turn index t → destroyed at the end of turn t+2 (the grafter's next turn), stored as an absolute turn index on the board monster, regardless of later controller (an Appraised Unstable Chimera still dies at the end of the player's turn t+2). The destruction is a real destruction (Ward, Echo, Last Rites, Insurance Claim apply; Haunt fizzles). If the Chimera leaves the board earlier, Unstable and its bonus are gone (D-043).
- Reason: "your next turn" from the grafter's perspective; absolute indices need no per-turn updates.
- Paper-sim: A8, A23 — agrees (the timer stays with the grafter). Its proposal P3 (die at the start of the grafter's turn after next) is logged as M-02.

**D-063 · Chimera entry position and face-down**
- Date: 2026-10-14
- Question: Can a Chimera enter face-down?
- Decision: No; face-up attack or face-up guard only.
- Reason: rule 6 offers "attack or guard"; the preview already showed it.
- Paper-sim: A12 / P12 — agrees (otherwise every Chimera would be Appraisal-proof).
- This entry covers the Graft's entry. A Chimera card summoned later from the hand is D-189 (open owner question).

**D-064 · Graft is a multi-step choice that can be cancelled**
- Date: 2026-10-14
- Question: How do material order, Ascend, keyword pick and position fit "getLegalActions is the single source of legality"?
- Decision: `graftBegin` opens a pending choice; then `graftPick` (material 1, material 2), `graftPick`/`graftSkipAscend`, `graftKeywords` (only if needed), `graftPosition` (commits). `graftCancel` is legal at every pending stage and restores the pre-Graft state exactly (nothing is applied before the commit).
- Reason: rule 7 "The UI always shows a preview of the result before confirming"; bots and the UI share one model.

**D-065 · Counterfeit timing**
- Date: 2026-10-14
- Question: When does Counterfeit trigger if the player Ascends? Is the −3 permanent?
- Decision: `onGraft` fires once after the final Chimera enters the board (after Ascend and position). Counterfeit applies −`COUNTERFEIT_PENALTY` Power, permanent (while on the board).
- Reason: one Graft action = one event; "loses 3 Power" with no duration matches Mirror Sigil's permanent loss, whereas Bloodlust/Gilt Frame name their durations.

**D-066 · Binder discovery key**
- Date: 2026-10-14
- Question: Is a "first-time result" per family or per family+element?
- Decision: Per family (15 entries). The Binder shows the element of the first discovery.
- Reason: "launch needs 15 Chimera paintings, not 75".

---

## G. Spells and traps

**D-067 · Spell legality and targets**
- Date: 2026-10-14
- Question: Can a targeted spell be cast without a legal target? Which monsters can be targeted?
- Decision: A spell with a target is legal only if at least one legal target exists; one action is generated per target. Untargeted spells are always legal (draws may fizzle on an empty deck). Targets with a Power condition (Unmake ≤5, Forfeit ≤4, Gilt Frame "his monster") must be face-up. Bloodlust and Shroud may target any of your own monsters, face-down included.
- Reason: no hidden-information leaks; no wasted plays by accident.

**D-068 · Grave Recall and Restoration pools**
- Date: 2026-10-14
- Question: Grave Recall's "your discard pile" and Restoration's "a destroyed Relic" — which cards qualify?
- Decision: Grave Recall: any monster card (base or Chimera) in your discard (cards you own). Restoration: any monster card the Collector owns (a Relic) in his discard. Stolen player monsters go to the player's discard (D-047), so Restoration can never return them. "Relic" means Collector monster card.
- Reason: ownership model; DESIGN uses "Relic" for his monsters ("every Relic has one Flaw").
- Paper-sim: A13 differs: it would bar Grave Recall from targeting Chimeras. **Kept**: a Chimera is a monster, and Grave Recall's text says "a monster". Excluding Chimeras would be a card change, so it is logged as proposal M-12.

**D-069 · Durations of Bloodlust, Gilt Frame and Shroud**
- Date: 2026-10-14
- Question: Exact expiries.
- Decision: Bloodlust: until the end of the current turn t. Gilt Frame: until the end of his next turn (t+2). Shroud: until the start of the caster's next turn (t+2), so it covers the Collector's turn including any Appraisal.
- Reason: literal; absolute turn indices.

**D-070 · Siphon is damage**
- Date: 2026-10-14
- Question: "The Collector loses 3 life" — damage or life loss (they differ in many games)?
- Decision: Modeled as the `damage` primitive (no v0.1 effect distinguishes the two).
- Reason: fewer primitives; Thornwall only prevents attack damage by cancelling the attack.

**D-071 · Trap order with two traps**
- Date: 2026-10-14
- Question: Two traps can react to the same event (e.g. Snare + Mirror Sigil).
- Decision: Traps resolve in slot order (left first). Each trap re-checks its trigger condition when its turn comes. If an earlier trap cancelled the attack, later `onAttackDeclared` traps no longer see an attacking monster and stay set. A trap triggers at most once, then goes to its owner's discard immediately; two identical traps → only the leftmost is used.
- Reason: deterministic, intuitive ("leftmost first"), avoids wasting the second trap.

**D-072 · Traps trigger on any turn, including the turn they are set**
- Date: 2026-10-14
- Question: Can a trap set this turn trigger this turn? Can traps trigger on their owner's turn?
- Decision: Yes to both (e.g. Last Rites when your attacker dies on your turn; Insurance Claim when his monster dies to Unstable or his own attack).
- Reason: no arming delay is written.

**D-073 · Trap triggers**
- Date: 2026-10-14
- Question: Display Case has no stated trigger; Thornwall vs Swift.
- Decision: Snare, Mirror Sigil, Display Case: "an enemy monster declares an attack" (any target, including direct). Thornwall: "an enemy monster declares a direct attack on you" → cancel + switch attacker to guard. A Swift monster on its summon turn cannot attack directly (D-041), so it can never trigger Thornwall that turn; afterwards it can.
- Reason: Display Case mirrors Snare's wording "cancel an attack".

**D-074 · Trap/spell numbers live in globals**
- Date: 2026-10-14
- Question: "Every number in this doc is a global" vs "spell effects are data".
- Decision: Launch spell/trap JSON uses global references (`"$UNMAKE_MAX_POWER"`) in effect parameters; new content may use literals (validator warns). Monster and Chimera stats stay in card/recipe JSON (they are content) and are overridable in the sim with `--set card.<id>.power=N`.
- Reason: satisfies both rules; every DESIGN number is tunable without engine changes.

---

## H. Appraisal and the vault

**D-075 · Appraisal timing**
- Date: 2026-10-14
- Question: "at the start of his turns in rounds 3, 6 and 9" — before or after his draw and turn-start hooks?
- Decision: After turn-start expiries/hooks, before his draw (D-016). Skipped when `FLAGS.APPRAISAL = false`.
- Reason: "start of his turn" is the earliest point.

**D-076 · Appraisal target rule**
- Date: 2026-10-14
- Question: Which Power is compared? Do guard-position monsters count?
- Decision: Effective Power (D-031, excluding element bonus) ≥ `APPRAISAL_MIN_POWER`; face-up monsters in attack **or** guard position; not Shrouded. Highest Power wins; tie → leftmost slot. No eligible monster → `AppraisalFailed`.
- Reason: "highest-Power face-up monster"; Unstable Chimeras (+3) are deliberately tempting targets.

**D-077 · State of the Appraised monster**
- Date: 2026-10-14
- Question: Position, face, modifiers, Ward, summoning sickness of the stolen monster.
- Decision: Moves board-to-board unchanged (position, modifiers, Ward state, Unstable timer, keywords), marked `appraised = true`, `enteredTurn = current turn` → it cannot attack or reposition that turn (Swift may attack monsters). It does not fire `onSummon`. Control changes; ownership does not (D-047).
- Reason: consistency with D-022 ("enters the board → sick") and fairness: a stolen 9-Power Chimera cannot hit you the same turn it is taken.
- Paper-sim: A8 / P2. The paper-sim *played* with "keeps position, can attack" (which killed the novice on R3), but it *recommends* P2, which matches this entry on summoning sickness, timers staying with the original owner (D-062), and Echo going to the original owner (D-046). One difference: P2 also forces the stolen monster into **guard**. **Not adopted**: keeping the current position is the simpler reading of "goes to an open slot", and summoning sickness already prevents the same-turn hit. Forcing guard is logged as M-03 for A/B testing.

**D-078 · The vault**
- Date: 2026-10-14
- Question: What is the vault and what can be done with vault monsters?
- Decision: A per-Collector zone, unlimited, public, not in play: not targetable, no keywords, not counted for Tethered or board size. Only Covetous may consume a vault monster (D-054). Vault monsters stay there until the duel ends. They count as "monster lost" / "appraised" for the share grid and objectives.
- Reason: "or to his vault if his board is full" — simplest meaning is a trophy shelf.
- Paper-sim: A9 — agrees (out of play, a legal Covetous sacrifice, never returns).

**D-079 · Appraisal success metric**
- Date: 2026-10-14
- Question: "Appraisals that succeed 30–60%" — denominator?
- Decision: Denominator = Appraisal steps actually reached in the duel (rounds 3/6/9 Collector turns with the flag on); numerator = steps that took a monster.
- Reason: a game that ended in round 5 had one attempt, not three.

---

## I. Collector AI, moods and intents

**D-080 · Mood thresholds are inclusive**
- Date: 2026-10-14
- Question: Boundaries of 16–25 / 8–15 / 1–7.
- Decision: `life > MOOD_AGITATED_AT (15)` → Composed; `life > MOOD_DESPERATE_AT (7)` → Agitated; else Desperate. Mood is recomputed after every life change (`MoodChanged` event), so healing can raise it again. `FLAGS.MOODS = false` pins Composed.
- Reason: matches the table exactly with the two globals.

**D-081 · What moods change in the AI** [EXTENDS] [REVIEW]
- Date: 2026-10-14
- Question: The mood table describes behavior in prose only.
- Decision (data in `collector.json › ai.moods`):
  - Composed — "patient: favors guard and traps": priority 4 sets a trap when he has **fewer or equal** monsters (instead of fewer); priority 6 summons in guard unless the monster's Power exceeds your strongest face-up monster's Power; attack phase uses only rules 1, 2, 4.
  - Agitated — "trades aggressively; prioritizes removing your monsters": priority 5 (removal spells) moves above priority 3; attack rule 2 also accepts even trades (both destroyed) against a target with Power ≥ his attacker's.
  - Desperate — "attacks anything, including face-down monsters": every able attack-position monster attacks (best target per D-091), face-down threshold (rule 3) drops to 0, reposition puts all monsters in attack.
- Reason: smallest set of switches that make each prose line true; all are data so designers can retune.
- Paper-sim: A4 differs. The paper-sim used: Composed = the list exactly as written; Agitated = attack rule 2 also takes ties; Desperate = attacks face-down monsters with any Power and takes trades. **Kept as decided**, because the paper-sim's Composed ignores DESIGN's written "favors guard and traps", Agitated drops "prioritizes removing your monsters", and Desperate is weaker than "attacks anything". Each switch is one data field in `collector.json`, so the paper-sim variant can be A/B-tested in the Phase 3 sim at no code cost (logged as M-13).
- Amended by D-216 (Composed's guard rule with no face-up monster to compare: attack) and D-218 (Agitated's trades rank after clean kills and before Ward strips; the trade test uses Power without the element bonus).

**D-082 · AI "can win this turn" uses public information only**
- Date: 2026-10-14
- Question: Can the lethal check account for the player's set traps or face-down monsters' stats?
- Decision: No. Lethal is computed from his own known cards and the public board; unknown traps are ignored; face-down monsters are treated as blockers of unknown Guard (assumed to survive). If the attempt is foiled by a trap, so be it.
- Reason: "The Collector never cheats … sees only public information".
- Amended by D-211 (the search's node budget is the global `AI_SEARCH_NODE_BUDGET`) and D-220 (the search runs on a redacted copy, and every legal play is tried as the play that enables the win).

**D-083 · Priority 3 "beats your strongest face-up monster"** (revised after paper-sim)
- Date: 2026-10-14
- Question: Definition of "beats", which stats are used, and what if you have no face-up monster.
- Decision: "Your strongest face-up monster" = your face-up monster with the highest effective Power (tie: leftmost). His candidate "beats" it if `previewAttack` says it would win an attack on it: his Power **as it would be after the summon** (including Tethered and the twist) **plus the element bonus** if he has advantage, compared with that monster's Power (attack position) or Guard (guard position), and greater. If you have no face-up monster the rule is skipped. If several qualify, he plays the highest Power (tie: card id, then instance id), in attack position. Brittle is not considered (see M-10).
- Reason: "beats" is a combat word, and the engine's `previewAttack` already computes exactly this, so it is the simplest *consistent* definition (one comparison function shared by rule 3, rule 2 and intents).
- Paper-sim: A5, A24 — **changed to match** the element bonus and post-summon Tethered (the first draft ignored the element). One difference kept: the paper-sim compares against Power only, while this entry compares against Guard when the target is in guard, because that is what "beats" means in the combat table.

**D-084 · Priority 6 with only Slow monsters**
- Date: 2026-10-14
- Question: "if all are Slow, summon in guard" — which Slow monster?
- Decision: The Slow monster with the highest Guard (tie: card id), face-up guard.
- Reason: a guard-position summon is about defense.
- Paper-sim: A3 — agrees on the guard position (it doesn't specify which Slow monster).
- Amended by D-212: "Slow" means an active keyword restricts the monster's attack permission to `none` on its entry turn, found by hook rather than by Flaw id.

**D-085 · Provenance Ledger and other "no target" spells are never cast by the written priorities** [EXTENDS] [REVIEW] (revised after paper-sim)
- Date: 2026-10-14
- Question: Priorities 1–6 only cast spells with "a legal high-value target"; Provenance Ledger has no target, so as written he never casts it. What does he do when no rule applies?
- Decision: Add an implicit final play step 7: "otherwise cast a draw spell (Provenance Ledger) if held; otherwise set a trap if he holds one and a trap slot is free; otherwise pass". Defined in `collector.json` so it can be removed.
- Reason: a deck card that is never played is a dead draw, which skews the balance sim. Owner should confirm.
- Paper-sim: A7 — **changed to match**. The first draft only cast Ledger with a hand of ≤ 2 cards; the paper-sim's unconditional order is simpler (no extra threshold number).
- Amended by D-215: step 7 sets the first held trap in `trapPreference`, and otherwise any other held trap in card-id order.

**D-086 · Redacted view references enemy cards by slot**
- Date: 2026-10-14
- Question: Instance ids could leak face-down identities (D-006).
- Decision: The Collector view refers to the player's monsters by slot index and shows face-down monsters only as `{ faceDown: true, slot }`. Its legal choices are the engine's legal actions translated 1:1 into view form; the AI returns a choice index.
- Reason: makes cheating structurally impossible, not just a convention.

**D-087 · High-value spell targets (priority 5)**
- Date: 2026-10-14
- Question: What is a "legal high-value target"?
- Decision (data): Forfeit — any face-up enemy monster with Power ≤ 4 (pick highest Power). Restoration — any Relic in his discard (pick highest Power). Gilt Frame "on a contested attack" — one of his attack-position monsters that can attack this turn, whose best attack would not destroy a target without +2 Power but would with it (pick the one enabling the highest-Power kill).
- Reason: literal reading with deterministic picks.
- Paper-sim: A18 — agrees on all three definitions.
- Amended by D-219: the contested-attack test is per target, and the spell's effect is found by applying the cast to a redacted copy instead of reading a literal +2.

**D-088 · Trap choice (priority 4)**
- Date: 2026-10-14
- Question: Which trap is set when he holds several?
- Decision: `collector.json › ai.trapPreference = ["display-case", "insurance-claim", "counterfeit"]`, first one held.
- Reason: deterministic and data-driven.
- Amended by D-215: rule 4 sets only traps in the list. Step 7 (D-085) also sets an unlisted trap.

**D-089 · Collector repositioning** [EXTENDS] (revised after paper-sim)
- Date: 2026-10-14
- Question: His priority list has no reposition step and gives no summon position except rule 6's all-Slow case.
- Decision: Before playing, a guard monster switches to attack only if that gives it an attack under rule 1, 2 or 4 this turn. He never switches attack → guard. Desperate: all monsters switch to attack. Summon positions: attack, except rule 6's all-Slow case and Composed's guard preference (D-081).
- Reason: without it, guard summons would stay in guard forever; one direction only is the simplest policy.
- Paper-sim: A3 — **changed to match**. The first draft also had a defensive attack → guard switch; it was dropped as extra complexity. Composed's "favors guard" is still expressed through its summon position (D-081).
- Amended by D-217: the "gives it an attack" test runs the mood's rules on a redacted copy. A face-down monster counts as a guard monster.

**D-090 · AI tie-breaks**
- Date: 2026-10-14
- Question: "ties broken by leftmost slot, then card id" — for hand cards, which have no slot?
- Decision: Board: leftmost slot, then card id. Hand: card id (string order), then instance id. Attackers act in descending effective Power, tie leftmost.
- Reason: total order; deterministic.
- Paper-sim: A6 — agrees on card id for hand ties. Small difference: the paper-sim used DESIGN table order (M1…M13), whereas this entry uses lexical order of the kebab-case id. **Kept**: ids are the only stable key in content, and no extra "order" field is needed. (Both orders give the same result in every tie seen in the paper duels.)
- See D-218: the strongest attacker takes attack rule 2's kill (owner ruling, 2026-10-15). The weakest-sufficient alternative is Phase 3 proposal M-17.

**D-091 · "Best legal target" (Vain, Desperate)**
- Date: 2026-10-14
- Question: Definition.
- Decision: Ordered: (1) a lethal direct attack; (2) a target it destroys without losing the attacker, highest target Power; (3) a target it trades with, highest target Power; (4) direct attack if legal; (5) a target that strips Ward; (6) the attack that costs him the least life; (7) then the attack that costs him the least board (does not lose the attacker). Face-down targets have unknown outcomes and rank after known ones in (6)–(7). Vain and Desperate ignore the rule-3 face-down Power limit. Ties per D-090.
- Reason: reuses the attack-phase rules in order.
- Paper-sim: A17 / P9 — agrees in substance (destroy first, then direct, then least life, then least board; Vain ignores the face-down limit). Steps (7) and the face-down-limit sentence were added from the paper-sim. This entry also splits "destroy" into no-loss kills before trades, a refinement that does not contradict P9.

**D-092 · Attack rule 2 and Ward targets**
- Date: 2026-10-14
- Question: Does stripping a Ward count as "destroy your highest-Power monster he can beat"?
- Decision: Candidates are attacks his preview says he wins without losing the attacker; actual destructions rank before Ward strips, then by target Power.
- Reason: a Ward strip is progress but not a kill.
- Amended by D-218: with trades on (Agitated), the order is clean kills, then trades, then Ward strips.

**D-093 · Face-down attack threshold (rule 3)**
- Date: 2026-10-14
- Question: "7+ Power" — which Power?
- Decision: His attacker's effective Power without element bonus (element unknown before reveal) ≥ `AI_FACEDOWN_ATTACK_MIN_POWER`.
- Reason: public info only.

**D-094 · Reference bot for the difficulty check**
- Date: 2026-10-14
- Question: Which bot, and what is "varied but deterministic decision noise"?
- Decision: The expert bot. Noise: at each player decision, with probability `BOT_NOISE_EPSILON = 0.10` it picks its second-best scored action instead of the best. Noise RNG = `cyrb128(seedString + "#" + k + "/noise/" + runIndex)`. The Collector AI never has noise.
- Reason: varied play without a weaker bot; reproducible per run.

**D-095 · Intent: timing, categories and honesty** [REVIEW]
- Date: 2026-10-14
- Question: When is the intent computed, from what, and is the Collector bound by it?
- Decision: Computed once at the start of each player turn (after the draw) from the Collector's view of the current state, then frozen for that turn. Category priority: **appraise** (his next turn is an Appraisal round and you currently have an eligible target) > **attack** (his attack rules would make ≥ 1 attack on the current board) > **scheme** (his play rules would cast a spell or set a trap) > **guard**. It is a forecast: his actual turn is chosen by the same AI on the board as it is then, so your turn can change what he does. The sim reports intent accuracy.
- Reason: computing it after the player's turn would leak his hand in response to your moves; freezing it at turn start shows a category only. Binding him to it would require planning ahead of the player's actions.
- Amended by D-221: the forecast is `endTurn` applied to a redacted copy, and the engine computes the intent after `step = 'main'`. Forced Vain attacks count as attack.

**D-096 · Intent policy is injected into the engine**
- Date: 2026-10-14
- Question: The intent must be in the saved state but is computed by the AI package.
- Decision: `createEngine(content, globals, { intent })` accepts an `IntentPolicy` function; the engine calls it at step 4 of D-016 and stores the result in `state.collector.intent`. Engine never imports `ai`.
- Reason: keeps dependency direction engine ← ai; replays stay deterministic.

**D-097 · Dialogue**
- Date: 2026-10-14
- Question: Dialogue lines per mood: chosen how?
- Decision: `collector.json › dialogue[mood][]`; the UI shows line `(turn index) mod length`. Not part of engine state.
- Reason: deterministic, cosmetic.

---

## J. Daily loop, objectives and meta

**D-098 · Star rating mapping** [EXTENDS]
- Date: 2026-10-14
- Question: "maps win rate to 1–3 stars" — thresholds?
- Decision: Split the accepted range into thirds: win rate ≥ 0.5667 → 1 star (easy), ≥ 0.4333 → 2 stars, else 3 stars (hard). Globals `DIFFICULTY_STAR_CUTS = [0.5667, 0.4333]`.
- Reason: even split of 30–70%.

**D-099 · Where the difficulty check runs**
- Date: 2026-10-14
- Question: The client must know the day's deck before play.
- Decision: The client runs the check on-device in a Web Worker on first open of the day and caches the result per date + content version. Determinism guarantees all devices reach the same result; `pnpm sim:seed <date>` reproduces it. A precomputed `seeds/<date>.json` shipped with a build is used if present and must match.
- Reason: offline-capable PWA, no server in v0.1. Expected cost: 500 duels ≈ 1–2 s on a phone at ≥ 300 duels/s.
- Amended by D-236: a shipped seeds manifest is the primary source; the on-device check is the fallback.

**D-100 · "Par" for the share text** [EXTENDS]
- Date: 2026-10-14
- Question: What is "the day's par"?
- Decision: The median winning round of the reference bot over the accepted seed's 500 runs (rounded half up; 12 if it never won).
- Reason: comes free from the difficulty check.

**D-101 · Share-grid emoji priority**
- Date: 2026-10-14
- Question: One emoji per round but several things can happen.
- Decision: Priority per round: appraised (your monster was Appraised) > monster lost (you lost a monster to destruction) > graft (you grafted) > attack (you attacked) > guard (none of these). Emoji glyphs are constants in `apps/web/src/meta/share.ts` (presentation, not rules).
- Reason: the most dramatic event wins; deterministic.

**D-102 · Bonus objectives**
- Date: 2026-10-14
- Question: How are 3 picked; do they count on a loss?
- Decision: 3 distinct objectives from `objectives.json` via the `objectives` stream. Each launch objective requires a win; 1 star each, 0 on a loss. Numeric thresholds are globals (`OBJ_HIGH_LIFE = 15`, `OBJ_WIN_BY_ROUND = 8`). "Never lose a monster to Appraisal" fails on any successful Appraisal, including to the vault.
- Reason: all four examples are phrased as win conditions.

**D-103 · Weekly twist selection**
- Date: 2026-10-14
- Question: How is the week's twist chosen?
- Decision: `twists.json` entries have an `isoWeek` (e.g. `"2026-W42"`); if none matches, rotate by ISO week number mod list length. Off in v0.1 (`FLAGS.WEEKLY_TWIST = false`).
- Reason: data-defined, deterministic for a date.

**D-104 · Local date and dev override**
- Date: 2026-10-14
- Question: Date source; what if midnight passes mid-duel?
- Decision: The date is read once, outside the engine (UI), from local time at the moment the duel is created, or from the dev override (`?date=YYYY-MM-DD` / settings). A duel in progress keeps its seed after midnight.
- Reason: engine stays date-free; no mid-duel surprises. The open question (local vs global reset) stays open.

**D-105 · Practice mode**
- Date: 2026-10-14
- Question: What does practice change?
- Decision: Same seed, unlimited attempts, available after the daily attempt ends; does not affect stats, streaks or the Binder.
- Reason: comparability of the daily result.

**D-106 · Streaks**
- Date: 2026-10-14
- Question: "local stats and streaks" — streak of what?
- Decision: Consecutive local dates with a daily win (and a separate "played" streak). Stored locally.
- Reason: Wordle convention.

**D-107 · Hand order**
- Date: 2026-10-14
- Question: Order of cards in hand.
- Decision: Draw order; cards returned by Echo/Grave Recall/Restoration are appended. The UI may display sorted but actions reference instance ids.
- Reason: deterministic and stable references.

**D-108 · Save/resume**
- Date: 2026-10-14
- Question: "progress saves after every action; refresh resumes".
- Decision: Persist `{ seedString, rerollK, contentVersion, actions[] }` after every action; resume by replaying through the engine. If the content version changed, the in-progress duel is finished on the version it started with (the old content is bundled for one version) or, if unavailable, voided without a loss.
- Reason: smallest durable record; also the replay format for future leaderboards.

---

## K. Content pipeline and architecture

**D-109 · Stat budget formula** [REVIEW]
- Date: 2026-10-14
- Question: "Power + Guard = 8–10; a keyword costs about 1 point". Four launch cards have Power + Guard = 7 (Pyre Wisp, Whispering Draft, Votive Spirit, Veil Shade), all with a keyword.
- Decision: Validator rule: `Power + Guard + KEYWORD_COST × keywordCount ∈ [STAT_BUDGET_MIN, STAT_BUDGET_MAX]` for player base monsters (`KEYWORD_COST = 1`). All 25 launch monsters pass (range 8–10). Relics and Chimeras are exempt (Relics are "stronger than your base cards").
- Reason: literal P+G would fail four designed cards; including the keyword cost is the doc's own qualifier.
- Amended by D-167 (owner, 2026-10-14): a miss is a warning, not an error.

**D-110 · Art briefs location**
- Date: 2026-10-14
- Question: DESIGN says each card's art brief is "in its data file"; the Phase-0 brief lists `art-briefs.json`.
- Decision: `packages/content/art-briefs.json` maps every card id and Chimera family id to a one-line brief; the validator requires an entry for each and rejects orphans.
- Reason: lets the artist work from one file; the validator keeps it in sync with cards. (Minor deviation from DESIGN wording — owner may prefer inline.)
- Amended by D-174: a missing or orphan brief is a warning, not an error.

**D-111 · Keyword auto-registration**
- Date: 2026-10-14
- Question: "files are auto-registered" must work in Vite (web), Vitest and plain Node (sim).
- Decision: A codegen step writes `packages/content/keywords/index.gen.ts` from `keywords/*.ts`; it runs before `dev`, `test`, `build`, `sim:*`, and `content:check` fails if it is stale.
- Reason: one mechanism for every runtime (Vite's `import.meta.glob` does not exist in Node).

**D-112 · Hook registry has query hooks in addition to the seven event hooks** [EXTENDS]
- Date: 2026-10-14
- Question: Sentinel, Swift, Slow, Vain, Covetous, Tethered and Ward are not events; they constrain legality, stats or replace destruction.
- Decision: The registry keeps the seven DESIGN event hooks and adds pure query hooks: `attackPermission`, `restrictTargets`, `mustAttack`, `summonRequirement`, `staticPower`/`staticGuard`, and the replacement hook `beforeDestroy`. All are declared in the same `defineKeyword({ hooks })` object.
- Reason: keeps "one file per keyword" true for every launch keyword and Flaw.

**D-113 · Card text length**
- Date: 2026-10-14
- Question: "no card text longer than one sentence" — how is it checked?
- Decision: Validator rejects text containing more than one sentence terminator (`.`, `!`, `?` followed by space/end), ignoring decimals.
- Reason: mechanical check.

**D-114 · Validator: Relic flaws and ace**
- Date: 2026-10-14
- Question: What does the validator enforce for the Collector?
- Decision: Deck has exactly `COLLECTOR_DECK_SIZE` ids, all resolving to Collector-pool cards; every Relic has exactly 1 Flaw and ≤ 1 keyword; Covetous appears only on the card named in `collector.json › ace`.
- Reason: "Each Relic has exactly one", "(ace only)".

**D-115 · sim:quick composition**
- Date: 2026-10-14
- Question: "sim:quick (2,000 games)" — which seeds and bots?
- Decision: 2,000 duels per bot profile (expert, novice), spread as 100 consecutive dates × 20 runs from a fixed start date (default: today), without difficulty-check rerolls (raw seeds). `sim:full` = 50,000 duels per profile (500 dates × 100 runs) plus the difficulty check on 60 consecutive dates.
- Reason: fast feedback with seed variety; full runs cover rejection rate.

**D-116 · Greedy bot**
- Date: 2026-10-14
- Question: DESIGN lists a greedy bot but no balance target for it.
- Decision: Greedy = one-ply: picks the legal action with the best immediate evaluation; used as a reference line in reports only.
- Reason: diagnostic midpoint between novice and expert.
- Amended by D-222: the look-ahead uses a redacted copy, the bot keeps its opening hand, a Graft is scored by its first-choice completion, and the weights are in `bots/greedy.weights.json`.

**D-117 · Novice bot = uniform random legal action**
- Date: 2026-10-14
- Question: "random legal moves" with a multi-step Graft action space.
- Decision: Uniform over `getLegalActions(state)` at every decision, including pending Graft steps (so Graft is one option among many at the top level, not hundreds).
- Reason: matches "random legal moves"; the pending model keeps it from over-weighting Graft.
- Paper-sim: P11 differs: it argues 20–30% is unreachable for random play and proposes a scripted "naive" bot instead. **Not adopted**, because DESIGN's balance table defines the novice as "random legal moves". Logged as M-09; the sim will report both bots side by side so the owner can choose.
- See D-223: AI milestone 1 measured 0% for this bot in 300 duels on live content. This is handled in Phase 3 (M-09).

**D-118 · Does The Unpriced count toward the Collector's opening-hand monster guarantee?** (added from paper-sim)
- Date: 2026-10-14
- Question: The Unpriced is a monster, but it is unplayable without a successful Appraisal. In D3 it sat dead in his opening hand all game while counting as one of his "≥ 2 monsters".
- Decision: It counts. The guarantee checks card type (monster), as written. No special case.
- Reason: "at least 2 monsters" is literal, and excluding Covetous cards would add a rule that DESIGN doesn't state. The underlying problem (a dead ace in hand) is better solved by proposal M-04 (set The Unpriced aside), which makes this question moot.
- Paper-sim: A10 — differs (it recommends not counting it if M-04 is rejected). Revisit if the owner rejects M-04.

**D-119 · Toolchain pins for Phase 1 scaffold**
- Date: 2026-10-14
- Question: ARCHITECTURE.md §2 names `vitest.workspace.ts` and doesn't pin versions. The current releases (TypeScript 7.0, Vitest 5) change both.
- Decision: TypeScript is pinned to `~6.0` (TS 7's native compiler is not yet supported by typescript-eslint, whose peer range is `<6.1.0`, and ESLint carries the determinism bans). Vitest projects live in `vitest.config.ts › test.projects`, because Vitest 4+ removed `vitest.workspace.ts`. Node ≥ 24, pnpm 12. Workspace packages are named `@vault-duel/{engine,content,ai,sim}`; the web app stays `web` so `pnpm --filter web` works.
- Reason: the determinism lint is a hard requirement (§1.2), so the compiler follows what the linter supports. Revisit TS 7 when typescript-eslint widens its peer range.

**D-120 · `CompiledSpell` / `CompiledTrap` are the DSL definitions as written**
- Date: 2026-10-14
- Question: ARCHITECTURE §3 uses `CompiledSpell` and `CompiledTrap` but never defines them. Engine milestone 1 aliased them to `SpellDef` / `TrapDef` (§9.1). Should compilation instead resolve `$NAME` refs or translate effects into another form?
- Decision: Confirmed. `CompiledSpell = SpellDef` and `CompiledTrap = TrapDef`, stored in `CompiledContent.spell` / `.trap` by `DefIdx` (`null` for other card types). `Num` refs stay symbolic in compiled content. `effects/num.ts` resolves them against the globals bound by `createEngine`, and may only read `NumericGlobal` keys (the `Globals` keys whose type is `number`, D-126). Unknown refs are already a validator error (§10.3). If profiling (§18.10) shows `Num` resolution in a hot path, `createEngine` may cache resolved values per engine instance without changing the content shape.
- Reason: content is compiled once, without globals. Globals are overridden per sim run (`--set`) and bound at `createEngine` (§11). Symbolic refs keep one compiled content valid for every globals variant, and `state.cfg` already hashes both.

**D-121 · `CompiledTwist` is one twists.json row**
- Date: 2026-10-14
- Question: §3 uses `CompiledTwist` without defining it.
- Decision: Confirmed as inferred: `{ id, text, isoWeek?, modifiers: [{ where: Cond, power?, guard? }] }`, the §10.1 row unchanged. `power`/`guard` are plain integers because twist values are content, not globals (§11, D-074). `isoWeek` and `text` stay in compiled content because `prepareDay` picks the week's twist from `CompiledContent.twists` (D-103) and the UI shows its text. The engine only reads `twists[state.twist].modifiers`, inside the effective-stat formula in `stats.ts` (D-031). Evaluating `{ element }` / `{ kind }` conditions in `where` needs the id tables from D-129.
- Reason: no separate compiled form is needed. The engine never sees dates, so selection stays outside it.

**D-122 · Hook event payloads, `TargetQueryCtx`, and synchronous attack cancellation**
- Date: 2026-10-14
- Question: §8.1/§8.2 name `SummonEvt`, `AttackEvt`, `DestroyedEvt`, `DestroyEvt`, `TurnEvt`, `GraftEvt` and `TargetQueryCtx` without defining them. Engine milestone 1 inferred their shapes from the §5 pipelines.
- Decision: The inferred shapes are confirmed, and these meanings are now fixed:
  - `SummonEvt { iid, side, slot, covetous }`: dispatched only for a summon or a Covetous summon. Graft and Appraisal never dispatch `onSummon` (§5.6, D-077).
  - `AttackEvt { attacker, target }`: `target` is `-1` for a direct attack. The `attacker`/`defender` refs and the `directAttack` condition read it. `target` is never `-1` in `beforeCombat`.
  - `DestroyedEvt { iid, side, slot, cause, by, power, guard, kw }`: the last-known information of §5.5, snapshotted after Ward replacement and before removal. `side` is the **controller** at destruction (D-048). The owner comes from `inst[iid].owner` (D-046, D-047). `power`/`guard` are effective stats (D-031) without the element bonus. `kw` is the active keyword mask at removal (0 if face-down, D-037). Dispatch uses it to select the destroyed monster's own `onDestroyed` hooks, because the monster is no longer on a board. `by` is the destroyer (the `destroyer` ref, D-045).
  - `DestroyEvt { iid, cause, by }`: the payload of `beforeDestroy` (Ward).
  - `TurnEvt { turn, round, side }`: the same values as the `TurnStarted` event.
  - `GraftEvt { iid, side, family, materials }`: describes the final Chimera after Ascend and position (D-065). The `grafted` ref is `iid`.
  - `TargetQueryCtx = QueryCtx & { attacker }`: `restrictTargets` is asked once per face-up defending monster, with `self` set to that defender.
  - The `cancelAttack` op is **not queued**. When a trap's subscriber runs, `traps.ts` calls `ctx.cancelAttack(trapIid)` immediately. The card's other effects are queued in card order (§8.3.2).
- Reason: these are the smallest payloads that cover every launch keyword, trap and DSL ref; anything else can be read through `QueryCtx`. If cancellation were queued like other effects, every later `onAttackDeclared` trap would still see a live attack, so Snare + Mirror Sigil would both fire on one attack. That contradicts §8.3.4 and D-071.

**D-123 · `KeywordDef` is declared in `types/hooks.ts`**
- Date: 2026-10-14
- Question: §8.4 places `KeywordDef` in `hooks/define.ts`, but `CompiledContent` (§3, `types/content.ts`) needs the type.
- Decision: Confirmed. The interface is declared in `types/hooks.ts` next to `Hooks`, which it contains. `hooks/define.ts` re-exports the type and defines `defineKeyword`. The package root exports `defineKeyword` by name, and the type comes through `types/hooks`.
- Reason: `types/` is a dependency-free layer that every module imports. Declaring the type in `hooks/` would make the type layer depend on a runtime module. Content authors import both names from `@vault-duel/engine`, so nothing changes for them.

**D-124 · `beforeCombat` sets flags through context methods on a read-only snapshot**
- Date: 2026-10-14
- Question: Engine milestone 1 made `CombatScratch` fully mutable so that `beforeCombat` hooks can set `pierce` and `brittleWin`. Is that acceptable for determinism and the ordering rules (§8.3)?
- Decision: Changed. Hooks receive `ctx.combat: CombatSnapshot`, which holds `{ aP, dP, dG, defPos, advantage }`. All five fields are readonly, and the snapshot is taken after the reveal (§5.4). Hooks raise flags through two methods, `ctx.setPierce()` and `ctx.setBrittleWin()`. Both are idempotent, can only turn a flag on, and are not readable by hooks. The engine ORs the flags after the whole `beforeCombat` subscriber list has run, so `pierce`/`brittleWin` are local to `combat.ts` and reported in `CombatResolved`. Effects queued during `beforeCombat` run after the list and before `resolve`. They cannot change the snapshot (D-032). If such an effect removes either combatant from the board, the attack fizzles with no outcome or damage (no launch content can do this; it matches the §9.1 fizzle rule).
- Reason: a fully mutable scratch has two problems. Any hook could rewrite `aP`/`dP`/`dG`/`advantage` outside the effect interpreter, with no event and no Ward or zone rules. And a later subscriber could read what an earlier one wrote, so outcomes would depend on subscriber order (attacker's hooks before defender's) and on keyword bit order. That is deterministic but fragile, because adding a keyword could change existing fights. A read-only snapshot with OR-folded flags cannot depend on order, like the query-hook lattice (§8.3.6), and costs nothing at run time.

**D-125 · `Sfc32` has two factories and no warm-up switch**
- Date: 2026-10-14
- Question: §12.1's constructor always warms up, so it can't resume from `GameState.rng`. Engine milestone 1 added `Sfc32.restore(state)` plus a public 5th constructor parameter `warmUp = true`.
- Decision: Changed in shape only; the stream is unchanged. The constructor is `private` and never warms up. `Sfc32.from(key)` runs cyrb128 and then 15 warm-up `next()` calls, giving output identical to §12.1, so the known-answer vectors don't change. `Sfc32.restore(rng)` resumes exactly from a `state()` snapshot with no warm-up. There is no `warmUp` parameter.
- Reason: a public parameter that defaults to warm-up means `new Sfc32(...state.rng)` silently runs the warm-up again and forks the stream, which is the replay bug `restore` exists to prevent. With a private constructor, the only two ways in are the two factories, and each states its intent.

**D-126 · Types of `Globals`**
- Date: 2026-10-14
- Question: §11 says `Globals` is "widened types of the object above" without spelling them out. Engine milestone 1 chose: `Range = readonly [number, number]` for pairs, `readonly number[]` for `APPRAISAL_ROUNDS`, the union `'endOfNextOwnTurn' | 'startOfOwnTurnAfterNext'` for `UNSTABLE_EXPIRY`, and 13 `Flags`.
- Decision: Confirmed, with one correction. `Range` covers the min/max pairs (`TARGET_*` ranges). `DIFFICULTY_STAR_CUTS` is not a range: it holds two descending cut points (D-098). It gets its own alias, `StarCuts = readonly [number, number]`, so the globals sanity check can enforce `min ≤ max` on every `Range` without an exception. `APPRAISAL_ROUNDS` stays a variable-length `readonly number[]` so `--set APPRAISAL_ROUNDS=[3,6]` works. The `UNSTABLE_EXPIRY` union lists the DESIGN rule (`'endOfNextOwnTurn'`, the default) and the M-02 lever. `Flags` has 13 entries: DESIGN's 10 plus the three proposal levers of §11, with defaults equal to DESIGN as written. `types/globals.ts` also exports `NumericGlobal = { [K in keyof Globals]: Globals[K] extends number ? K : never }[keyof Globals]`, the set of names a `$NAME` ref may use (D-120).
- Reason: these are the narrowest types that still accept every `--set` override §11 promises. A separate star-cut type keeps the range invariant checkable.

**D-127 · `RoundFlag` and `HOOK_NAMES` are public exports**
- Date: 2026-10-14
- Question: neither is in the docs. `RoundFlag` gives names to the §4 Track bit comment, and `HOOK_NAMES` is a fixed-order array so code never iterates object keys.
- Decision: Both confirmed. `RoundFlag = { Attacked: 1, Grafted: 2, LostMonster: 4, Appraised: 8 }` (plain `as const`, like `DefType`/`Pool`). These names replace the `ATTACKED`/`LOST`/`GRAFTED`/`APPRAISED` placeholders in §5. `Track.round` is created by `newGame` with length `MAX_ROUNDS`, zero-filled, and indexed by `round − 1`, recording player-side events only (§5). For `HOOK_NAMES`, one change: derive the type from the array (`type HookName = (typeof HOOK_NAMES)[number]`) instead of checking the array with `satisfies readonly HookName[]`, because `satisfies` doesn't catch a missing name. `compile.ts` builds `hookMask` by iterating `HOOK_NAMES`, never `Object.keys(hooks)`.
- Reason: named bits remove magic numbers from four pipelines. A pre-sized round array is monomorphic and never has holes. A single source for hook names means adding a hook can't leave it out of `hookMask`.

**D-128 · `Tx` API (copy-on-write transaction)**
- Date: 2026-10-14
- Question: §4 and §18.2 require a copy-on-write `Tx` but never specify its API. Engine milestone 1 implemented: `state`, `dirty`, `commit`, `set(rootField)`, `pushInstance`, `setLife`, `setZone`, `zonePush`, `zoneUnshift`, `zoneRemove`, `zoneTake`, `setSlot`, `patchMonster`, `setTrap`.
- Decision: Confirmed as the engine's only state-writing API, documented in ARCHITECTURE §4.1, with this contract:
  1. `tx.state` is a live draft. An array read from it may be mutated by the next write in the same transaction, so no zone or board reference may be held across a write. Pipelines first collect the iids/slots they will act on into a local array (destroy batch order, draw loops, trap scans).
  2. Only engine modules construct a `Tx`. It is not part of the package's public API, so UI, AI and sim can only advance a duel through `applyAction`. Hooks never see it (§8.2).
  3. Nested root records (`track`, `appraisal`, `collector`, `pending`) and `Monster`/`TrapSlot` records are always replaced, never mutated.
  4. Randomness: `Sfc32.restore(tx.state.rng)` … `tx.set('rng', r.state())` (D-125).
  5. Because the base state is never written, an `EngineError` thrown mid-action leaves the caller's state intact: actions are atomic.

  Determinism review: the `Tx` uses no randomness, clock or key iteration (`ZONE_BIT` is read by key only). Output depends only on the base state and the call sequence. Performance review: per action, at most one root copy (18 fields), two side copies (7 fields each), one slice per touched zone (≤ 24 entries) and one 13-field record per patched monster. The base state is never cloned, untouched branches are shared, and a transaction with no writes returns the base state itself. That fits §18's roughly 5 µs/action budget. Pipeline fitness: every write in §5.2–§5.8 maps onto these methods (draws: `zoneTake` + `zonePush`; destroy: `setSlot(null)` + `zonePush(owner, 'discard')`; Ward, reveal, modifiers, position: `patchMonster`; traps: `setTrap(null)` + `zonePush`; Graft commit: `zoneRemove`/`setSlot` + `pushInstance` + `setSlot`; Echo/Recall: `zoneRemove` + `zonePush`; redraw: `setZone`; life: `setLife`; turn, step, result, log: `set`).

  Small code changes: remove `Tx` from the package root exports; type `set`'s value as `GameState[K]` (drops the duplicate `RootFieldTypes`); exclude `iid` from `patchMonster`'s patch; throw `EngineError` instead of `Error` once it exists.
- Reason: the API is small, covers every pipeline, and meets the copy-on-write and performance rules of §18. The live-view rule is the one hazard copy-on-write introduces, so it is written down and added to the review checklist (§19).

**D-129 · `CompiledContent` carries element and kind id tables**
- Date: 2026-10-14
- Question: found while reviewing D-121. `Cond` has `{ element: id }` and `{ kind: id }` (§9.1), which the validator accepts in `TargetSpec.where`, `TrapDef.when`, `Effect.if` and twist modifiers. But `CompiledContent` (§3) only has `ElemIdx`/`KindIdx` arrays and counts, with no index → id mapping, so these conditions can't be evaluated.
- Decision: Add `elementIds: readonly string[]` (`ElemIdx` → element id) and `kindIds: readonly string[]` (`KindIdx` → kind id) to `CompiledContent`. They use the same index order as `element`, `kind`, `beats` and `recipe`. `effects/conditions.ts` evaluates `{ element }` as `elementIds[elementOf(i)] === cond.element`, where a Chimera's element comes from `inst[i].chimera.element`. It evaluates `{ kind }` as `kindIds[kind[def]] === cond.kind`, which is false for Chimeras: they have no kind (family `kind = -1`, D-056).
- Reason: no launch spell or trap uses these conditions, but DESIGN's twist example ("Umbra monsters +1 Power") does, and the flag exists. Two small string arrays are the simplest fix: no maps, no key iteration, and `Cond` keeps the same shape in JSON and in the engine.

**D-130 · Content values DESIGN.md doesn't give (owner-approved 2026-10-14)**
- Date: 2026-10-14
- Question: The §10.1 schemas require values DESIGN.md doesn't supply: element hex colors, kind silhouettes, Collector dialogue lines and per-card art briefs.
- Decision:
  - **Final (owner-approved):** element colors ember `#C8452C`, gale `#8FBF9A`, tide `#2B4C7E`, lumen `#D4A93C`, umbra `#6B4C9A`, muted versions of DESIGN's Red / Pale green / Deep blue / Gold / Violet. Kind silhouettes: beast `quadruped`, knight `armored-humanoid`, wyrm `serpent`, construct `golem`, spirit `wisp`; these are used only by placeholder art (`apps/web/src/art/placeholder.ts`).
  - **Drafts, pending an owner rewrite:** every line in `collector.json › dialogue` and every entry in `art-briefs.json`. These are written by content-author, not by the design. They carry no in-file marker because the strings are shown in the UI.
  - Also settled: `twists.json` ships empty because DESIGN says weekly twists are not in v0.1, and the Collector deck is all 20 listed Relics, spells and traps, in DESIGN order.
- Reason: the schemas need concrete values, and inventing them silently would break the "never invent content" rule. This entry is the record of which content values didn't come from DESIGN.md.

**D-131 · Engine-internal effect and hook interfaces**
- Date: 2026-10-14
- Question: Engine milestone 2 introduced `Refs`, `QueuedEffect`, `EffectSink`, `EffectHost` (in `effects/run.ts`) and `Env`, `HookRegistry` (in `hooks/registry.ts`). ARCHITECTURE doesn't name them.
- Decision: Confirmed in those files, as engine-internal types that are not exported from the package root. Their roles are fixed as follows:
  - `Env { c, g, reg }` holds everything a rule needs besides the state.
  - `HookRegistry { kw, masks, trapHooks }` maps a keyword bit to its hooks, a hook name to its bit mask (the same object as `c.hookMask`, checked against the hook tables at creation), and a trap `DefIdx` to the hooks compiled by `traps.ts`.
  - `Refs` has one field per DSL `Ref`, bound when an effect is queued.
  - `QueuedEffect { effect, refs, source, side }`: `side` is the source card's controller at queue time, and every duration is relative to it (D-136).
  - `EffectSink { queue, emit }` is what hook contexts write into.
  - `EffectHost { emit, destroy, lifeChanged }` is how the interpreter reaches later pipelines. `destroy` always means cause `'effect'` with no destroyer. Unstable expiry and combat call `destroyBatch` (§5.5) directly with their own cause.
  ARCHITECTURE §8.6 lists them.
- Reason: the names and files match the §2 layout. Keeping them internal keeps the public surface to `createEngine`, `applyAction`, `getLegalActions` and the content-facing types.
- Amended by D-209: `Env` stays internal. The read-only queries that need it (stats, keyword folds, `previewCombat`, `previewGraft`) are public as methods on the `Engine` facade, which binds the `Env` once.

**D-132 · `EngineError` is a public export**
- Date: 2026-10-14
- Question: `EngineError` lives in `src/errors.ts` and is not exported from `index.ts`. Do consumers need it?
- Decision: Yes. Export the class from the package root. The sim worker catches it to record the failing seed and action index and keep the batch running. The web app catches it when resuming a save: a replay that hits an illegal action or a config mismatch voids the duel without a loss (D-108), whereas any other error is a bug. No error codes for now; the message is enough for logs.
- Reason: callers can only tell engine-reported failures from crashes with `instanceof`, and that needs the class.

**D-133 · A used Ward switches off every `beforeDestroy` bit**
- Date: 2026-10-14
- Question: To avoid hard-coding the `ward` id, the engine drops every keyword bit that has a `beforeDestroy` hook once `wardUsed` is set (D-044). A future keyword with `beforeDestroy` would be switched off too.
- Decision: Confirmed, as an explicit contract: **a `beforeDestroy` keyword is a one-shot destruction replacement.** When any of a monster's `beforeDestroy` bits returns `'prevent'`, the engine sets `wardUsed`, and all of that monster's `beforeDestroy` bits become inactive until it leaves the board (D-043). The contract goes in §8.4 and in CONTENT_GUIDE's keyword checklist. If a future keyword needs a reusable or separate replacement, `wardUsed: boolean` becomes a per-bit `spentKw: KwMask` (same cost, one int). That change is deferred until such a keyword exists. `WARD_CHARGES` is not consumed by the engine yet, because Ward is a boolean (§4). Until a charge counter exists, the globals sanity check (§10.3) rejects any `WARD_CHARGES` other than 1, so the global can't silently do nothing.
- Reason: this is the simplest generic rule that is exactly right for the only launch replacement keyword. Writing the contract down makes the coupling visible to whoever adds the next one.

**D-134 · `beforeDestroy` asks only the monster being destroyed**
- Date: 2026-10-14
- Question: Engine milestone 2 asks only the destroyed monster's own active keywords, in bit order, and stops at the first `'prevent'`. The generic §8.3.1 subscriber order would also ask other monsters, so a neighbour's Ward (whose hook is just `() => 'prevent'`) would block this monster's destruction.
- Decision: Confirmed. `beforeDestroy` is a per-monster replacement query. The subscribers are the destroyed monster's own active keyword bits in registry order; neighbours and traps are never asked. This is an exception to §8.3.1, recorded in §8.3 rule 1 and §5.5.
- Reason: Ward's text is about itself ("it loses Ward instead"), and `wardUsed` is set on the monster that was saved. Asking other cards would be a bug, not a feature.

**D-135 · `beforeCombat` uses the §8.3.1 subscriber order**
- Date: 2026-10-14
- Question: Engine milestone 2 dispatches `beforeCombat` in the generic §8.3.1 order, not §5.4's "A's hooks then T's hooks".
- Decision: Confirmed. The two orders are consistent: the attacker is always on the active side and the target on the inactive side, so §8.3.1 always runs A before T. The only difference is that other board monsters (and traps) with a `beforeCombat` hook are also called. Keyword hooks must check `ctx.isAttacker(ctx.self)` or `ctx.evt.target === ctx.self`, as Pierce and Brittle already do (§8.5). Flags can't depend on order (D-124). Queued effects and events follow the same deterministic order as every other event hook. §5.4 is reworded to cite §8.3.1.
- Reason: one dispatch rule for all event hooks is simpler, and it allows a future keyword that reacts to fights it isn't in.

**D-136 · Durations are relative to the source's controller**
- Date: 2026-10-14
- Question: §9.1 says durations are "relative to the card's controller at cast/trigger time". Engine milestone 2 defines `n` = the controller's next own turn = `turn + DURATION_NEXT_OWN_TURN` (2) when the controller is the active side, otherwise `turn + 1`. It then stores:
  - `thisTurn` → `until = turn`
  - `untilEndOfYourNextTurn` → `until = n`
  - `untilYourNextTurn` on `modifyStats` → `until = n − 1`
  - `preventAppraisal` → `shroudUntil = max(old, n)`
  Does this match DESIGN?
- Decision: Confirmed. Every DESIGN duration comes from a spell, and spells are cast on their caster's own turn t:
  - Bloodlust "this turn" ends after turn t.
  - Gilt Frame "until the end of his next turn" applies through t+2 (D-069).
  - Shroud "until your next turn" protects on turns t and t+1, so it covers the Collector's Appraisal, and expires as turn t+2 starts (§5.2).
  The different storage (`TimedMod.until` is inclusive, `shroudUntil` is exclusive, §4) encodes the same moment: the start of turn `n`. The off-turn branch (`n = turn + 1`) applies only to a timed effect triggered on the opponent's turn. No launch card does that: Mirror Sigil and Counterfeit are permanent, and Last Rites and Insurance Claim have no duration. The branch reads "your next turn" as the next turn of yours that begins after now, so an off-turn "until your next turn" ends when the current turn ends. A shroud never shortens an existing one. §9.1 now has the table.
- Reason: this is a literal reading of DESIGN's three durations for every launch card, and it is the only sensible reading of "your next turn" for off-turn triggers. No game feel changes, because the off-turn branch can't be reached in v0.1.

**D-137 · Folding `summonRequirement` across several Flaws**
- Date: 2026-10-14
- Question: Engine milestone 2 folds several `summonRequirement` results like this: any `sacrifice` beats `normal`, and two `sacrifice` results intersect their `zones`. An empty intersection makes the card unsummonable.
- Decision: Confirmed. That is "most restrictive" (§8.3.6), it can't depend on order, and with an empty intersection neither `summon` nor `summonCovetous` is legal. With launch content it never comes up: every Relic has exactly one Flaw (D-114), and only the ace has Covetous. `legal.ts` enumerates sacrifice candidates in a fixed order (own board in slot order, then the vault in vault order), filtered by `zones`, never in the order of the `zones` array.
- Reason: the intersection is the only fold that respects every Flaw. A fixed enumeration order keeps the legal-action list independent of keyword bit order.

**D-138 · `changePosition` on a face-down monster fizzles**
- Date: 2026-10-14
- Question: Engine milestone 2 makes `changePosition` fizzle (no write, no event) when the target is face-down.
- Decision: Confirmed, for both `to: 'guard'` (already guard) and `to: 'attack'`. An effect never reveals or flips a face-down monster: DESIGN reveals them only through reposition ("flipped to attack is revealed") and attacks. Unreachable with launch content, because Thornwall and Display Case target the attacker, which is always face-up in attack position.
- Reason: it is the simplest rule, and it keeps hidden information from leaking through effects (D-037).

**D-139 · `graftedThisTurn` means "created by a Graft this turn"** (changed)
- Date: 2026-10-14
- Question: Engine milestone 2 makes `graftedThisTurn` true for any Chimera whose board record has `entered === turn`. That includes a Chimera re-summoned from hand this turn and a Chimera Appraised this turn (D-077). Should those count?
- Decision: Changed. They don't count. `ChimeraInfo` gets `readonly grafted: number`, the turn index of the Graft that created the instance (set once at commit, §5.6; `Instance` is immutable). The condition is `inst.chimera !== null && inst.chimera.grafted === state.turn`, and it doesn't care where the card is (combine it with `onBoard` if needed). No launch card uses this condition: Counterfeit targets the `grafted` ref of `onGraft`.
- Reason: the condition is named after Counterfeit's text "a Chimera grafted this turn". Re-summoning or stealing is not grafting. One immutable integer gives the exact answer without inspecting the board.

**D-140 · `FLAGS.CHIMERA_TO_HAND = false` (proposal M-12 lever)**
- Date: 2026-10-14
- Question: With the flag off, engine milestone 2's `returnToHand` never returns a Chimera (it stays where it is). Engine-dev left it to `legal.ts` whether Grave Recall can target a Chimera.
- Decision: The interpreter is confirmed. With the flag off, `returnToHand` on a Chimera fizzles wherever the Chimera is: a destroyed Echo Chimera stays in the discard, which is M-12's intent. A Chimera on the board stays on the board; no launch card bounces from the board, so this case only needs revisiting if one is added while M-12 is under test. Changed for legality: with the flag off, a spell whose effects include `returnToHand` on `chosen` doesn't offer Chimeras as targets, so Grave Recall can't target a Chimera, as M-12 says. The filter lives in `effects/targets.ts › targetCandidates`, the single place for spell targets, not in a card-specific branch in `legal.ts`. With the flag on (default, DESIGN as written), nothing changes (D-046, D-068).
- Reason: offering a target that is certain to fizzle would be a wasted play by accident, which D-067 forbids. Putting the filter in the generic candidate function keeps it data-driven.

**D-141 · `CombatSnapshot` is frozen in dev mode only; dev mode is an engine option**
- Date: 2026-10-14
- Question: `CombatSnapshot` is readonly only at the type level. Should `combat.ts` `Object.freeze` it, given the §18 budget?
- Decision: Freeze it when the engine runs in dev mode, and not in production. That is the same policy as the other dev-only safety checks (§18.9). Dev mode is an explicit option, `createEngine(…, { dev: true })`, stored as `Env.dev`, because the engine must not read `process.env.NODE_ENV` (no Node APIs, §1.2). Tests, the board-DSL fixtures and the web dev build set it. The sim and the production web build don't. In dev mode the engine also deep-freezes every committed state (§18.9). A `MAX_TRIGGER_CHAIN` overrun throws `EngineError` in every mode, as milestone 2 already does. §8.3 rule 7 is corrected from "in dev/test", because a runaway chain must not continue silently in production either.
- Reason: ES modules are strict, so a hook that writes to a frozen snapshot throws during keyword-example and scenario tests, where content is exercised. Production pays nothing. The cost would be negligible anyway (about 30 snapshots per duel), but one consistent dev switch is simpler than a special case.

**D-142 · Round-1 attack ban reads `FIRST_ATTACK_ROUND_PLAYER`**
- Date: 2026-10-14
- Question: Engine milestone 2 implements the ban as `round < FIRST_ATTACK_ROUND_PLAYER`, while §6.2 says `round === 1`.
- Decision: Confirmed. The global already exists for this rule (D-015). With the default of 2 the two are identical. §6.2 is corrected to the global form.
- Reason: every number goes through globals, and the doc literal was the outlier.

**D-143 · Guard against drift in the engine's test globals**
- Date: 2026-10-14
- Question: `packages/engine/test-utils/globals.ts` copies the §11 values so engine tests needn't import content (which would break the dependency direction). The copy can drift.
- Decision: Keep the copy and guard it from the content side, which may import engine. The engine package exports its test utilities as a subpath (`"./test-utils/*": "./test-utils/*.ts"`), which §2 already intends for the board DSL. `packages/content/src/test-globals.test.ts` asserts that `{ ...TEST_GLOBALS, CONTENT_VERSION: DEFAULT_GLOBALS.CONTENT_VERSION }` deep-equals `DEFAULT_GLOBALS`, FLAGS included, and that `TEST_GLOBALS.CONTENT_VERSION === DEFAULT_GLOBALS.CONTENT_VERSION + '-fixture'`. `pnpm test` runs both packages, so any drift fails CI.
- Reason: this is the smallest guard that keeps `engine ← content`. The deliberate `-fixture` suffix stays visible, so fixture state hashes can never be mistaken for real ones.
- Superseded by D-168: `TEST_GLOBALS` is an engine-owned fixture, independent of `DEFAULT_GLOBALS`; the content side checks only that it passes `GlobalsSchema`.

**D-144 · Forfeit's "your monsters" are the player's**
- Date: 2026-10-14
- Question: DESIGN lists Forfeit as "destroy one of your monsters with Power 4 or less" in the Collector section; §9.2 uses target side `enemy`.
- Decision: Confirmed. DESIGN addresses the player as "you" everywhere, including the Collector section ("he takes your highest-Power face-up monster"). So Forfeit, cast by the Collector, targets the player's board: `side: 'enemy'` from the caster's point of view. The card text stays as DESIGN wrote it, which reads correctly to the player who sees it.
- Reason: the only reading consistent with the rest of DESIGN. Read the other way, the Collector would destroy his own Relic.

**D-145 · `collector.json › ai` ids are closed enums checked by content, mirrored by ai**
- Date: 2026-10-14
- Question: §10.2 has no schema for `collector.json › ai`. Content-author's schema accepts any string for rule ids and parameter values (`guardUnlessBeater`, `allAttack`, `attackAnything`, `fewerOrEqual`, `previewAttack`, …). Should the validator check them against `ai/collector/rules`?
- Decision: Yes, but without content importing `ai` (that would break `engine ← content ← ai`):
  - **Closed enums in `packages/content/src/schemas/collector.ts`:**
    - `AI_PLAY_RULES`: `winThisTurn`, `summonAce`, `summonBeater`, `setTrapWhenBehind`, `castHighValueSpell`, `summonFallback`, `utility`
    - `AI_ATTACK_RULES`: `lethal`, `killWithoutLoss`, `faceDownIfStrong`, `directIfEmpty`, `holdExceptVain`, `attackAnything`
    - `AI_REPOSITION`: `toAttackIfUsable`, `allAttack`
    - Parameter values: `compare` takes `fewer` / `fewerOrEqual` for `setTrapWhenBehind` and `previewAttack` for `summonBeater`; `position` takes `attack` / `guard` / `guardUnlessBeater`; `slowPick` takes `highestGuard`; `pick` takes `highestPower`; `when` takes `contestedAttack`; `utility.order` takes `castDrawSpell` / `setTrap` / `pass`; `tieBreak` takes `leftmostSlot` / `cardId` / `instanceId`.
    Unknown values become zod `invalid_value` errors, which §10.3 already renders as "use one of: …".
  - **Cross-file validator rule:** `trapPreference` ids and the `castHighValueSpell` keys must be Collector-pool trap/spell ids present in `collector.json › deck`.
  - **ai mirror:** a test in `packages/ai` asserts that the `ai/collector/rules/` registry keys equal `AI_PLAY_RULES ∪ AI_ATTACK_RULES` and that every enum value has a handler. Adding a rule then means one enum entry plus one rule file, and the build fails if either is missing.
- Reason: catching typos at `content:check` time is the point of the validator. The ai-side test closes the loop, the dependency direction stays intact, and every value is a data field (the M-13 A/B variant only uses existing ids).
- Amended by D-210: `ai` reads the block from the compiled content (`GameContent.collector.ai`). It no longer reads it from `RAW_CONTENT` or from a `createCollector` option.
- Amended by D-204: `castHighValueSpell` is a record keyed by Collector spell id, with `pick`/`when` as the closed values. The cross-file rule's field is `params.castHighValueSpell.<id>`.

**D-146 · Zod 4 conventions in the schemas**
- Date: 2026-10-14
- Question: §10.2/§10.3 were written in zod 3 style. With zod 4 (D-119 toolchain, `zod ^4.6`), a quoted number reports `expected number`. Content-author also maps optional fields to `z.exactOptional()` because of `exactOptionalPropertyTypes`.
- Decision: Confirmed, and the docs now follow zod 4:
  - `z.int()` instead of `z.number().int()`.
  - `z.exactOptional(x)` for every optional field (so an explicit `undefined` is rejected, matching the engine types).
  - `.strict()` objects.
  - `Num` is `z.union([z.int(), GlobalRef])`, where `GlobalRef` is a `z.custom` refinement typed as the template literal.
  - Spell/trap schemas carry the compile-time proof `z.ZodType<SpellDef>` / `z.ZodType<TrapDef>`.
  - The §10.3 line format is `<file> › <entry> › <field>: <problem> › <how to fix>`, and the example reads `power: expected number, got "7"`.
- Reason: the docs describe the code. Matching optionality between zod output and the engine types is what makes the `satisfies` and `ZodType<…>` checks meaningful.

**D-147 · Where `deepFreeze`, `GlobalsSchema` and `withOverrides` live**
- Date: 2026-10-14
- Question: §11 uses `deepFreeze` and `withOverrides` without defining them. Content-author defined `deepFreeze` locally in `globals.ts`. `withOverrides` needs a `GlobalsSchema` that doesn't exist yet.
- Decision:
  - **`deepFreeze`:** `packages/engine/src/freeze.ts`, exported from the engine root. The engine needs it for dev-mode state freezing (D-141), and content imports it rather than keeping a copy. It iterates own property values. That is the one allowed key iteration in the engine, because freezing doesn't depend on order; it carries a single documented lint exception.
  - **`GlobalsSchema`:** `packages/content/src/schemas/globals.ts`, a strict zod object for every `Globals` key, with the compile-time proof `z.ZodType<Globals>` (as for spells/traps). It also runs the globals sanity checks of §10.3: `Range` min ≤ max, `APPRAISAL_ROUNDS` within 1…`MAX_ROUNDS`, `WARD_CHARGES = 1` (D-133).
  - **`withOverrides(base, sets)`:** `packages/content/src/globals.ts`, exported from the content root. Each `"KEY=VALUE"` / `"FLAGS.KEY=VALUE"` is parsed as JSON (a bare word is a string). Unknown keys are rejected. The merged object is validated with `GlobalsSchema` and returned deep-frozen. Card overrides (`card.<id>.…`) stay in `sim/overrides.ts` (§15).
- Reason: one freeze implementation in the lowest package that needs it, and the globals schema next to the other content schemas. `withOverrides` stays where §11 already shows it.

**D-148 · Objective metrics (owner-approved 2026-10-14)**
- Date: 2026-10-14
- Question: DESIGN.md lists four example objectives (D-102) but doesn't name the §10.3 metric each one checks.
- Decision: final, as in `objectives.json`. Every objective has `requiresWin: true`.
  - "Win without grafting" → `grafts` lte `0`
  - "Win with 15+ life" → `playerLife` gte `$OBJ_HIGH_LIFE` (15)
  - "Win by round 8" → `round` lte `$OBJ_WIN_BY_ROUND` (8)
  - "Never lose a monster to Appraisal" → `appraisedLost` lte `0`
- Reason: each maps one-to-one onto a §10.3 metric. The two numeric thresholds come from globals rather than literals, so balance can tune them with `--set`.

**D-149 · Owner confirms the section L interpretations (2026-10-14)**
- Date: 2026-10-14
- Question: Section L lists interpretations made where DESIGN.md was unclear that needed owner review.
- Decision: The owner confirmed every D-row in section L as written: D-019, D-083, D-089, D-118, D-046, D-068, D-117, D-053, D-039, D-049, D-081, D-085, D-095, D-109, D-077, D-054, D-004, D-098 and D-100. They are final and no longer pending review.
  - D-053 stays as written: Slow is a legality hook with no extra effect for now. Its proposal to make Slow meaningful is still open as M-01.
  - D-046/D-068 stand: Echo returns to the owner, and Grave Recall may target a Chimera when `CHIMERA_TO_HAND` is on (D-140). Whether the flag stays on is still decided by M-12.
  - D-117 stands: the novice bot is uniform random. M-09 stays open, and the sim reports both bots.
- Not covered: the M-01…M-16 proposals (section M), which wait for Phase 3 sim A/B results, and the D-130 drafts (dialogue, art briefs).

**D-150 · `Run`, `Services` and `IntentPolicy` (pipeline plumbing)**
- Date: 2026-10-14
- Question: Engine milestone 3 added `pipeline.ts`. `Run` is one `applyAction`: it owns the `Tx`, the event list (`null` under `{ events: false }`), the FIFO `EffectQueue`, the `EffectHost` and `flush()`. A re-entrant `flush()` does nothing, and the outer drain picks up the new effects. `Services { intent?, appraisal? }` is injected so `turn.ts` could land before `appraisal.ts`. `IntentPolicy` is `(s: GameState) => Intent`, while §5.2 calls the policy with `collectorView(tx)`.
- Decision: Confirmed as engine-internal (not exported), with these rules:
  - `Run`: one per `applyAction`, built only by `reducer.ts`. Pipelines take a `Run`; hooks never see it (§8.2).
  - `IntentPolicy = (s: GameState) => Intent` is final, and it is exported as a type from the package root because `createEngine` takes it (D-096). The engine can't build the `CollectorView`, because it lives in `ai/collector/view.ts` and the engine never imports `ai`. So `ai`'s `intentPolicy` builds `collectorView(s)` itself before deciding, which keeps D-086's guarantee at the `ai` boundary. Contract: the policy is pure and deterministic, and it only reads. `s` is the live draft (§4.1 contract 1), so the policy must not keep references into it.
  - `createEngine` throws `EngineError` when `FLAGS.INTENTS` is on and no policy is given. The intent is stored state and bots read it (§14), so two engines with and without a policy would diverge on the same seed and log. To run without intents, turn the flag off (`state.cfg` hashes it).
  - `Services.appraisal` is temporary. When `appraisal.ts` lands, `turn.ts` imports `appraisal()` directly and the field is removed, so no configuration can skip Appraisal silently. `Services` then holds only `intent`.
  - §5.2 now reads `intentPolicy(tx.state)`. §8.6 lists `Run`, `Services` and `IntentPolicy`.
- Reason: the injection seam was the right call while modules land in sequence. Once a service is an engine module, an optional field only adds a way to misconfigure the engine. Passing the state and redacting in `ai` is the only option that keeps the dependency direction (§2).
- Amended by D-209, D-210 and D-221:
  - The policy may apply actions to a `redactState` copy through its own engine (look-ahead). That is still read-only for `s`.
  - The engine calls the policy after `step = 'main'` and `played = false`.
  - `createCollector` takes the compiled content that carries the AI block.

**D-151 · `checkWin`, `lifeChanged` and `endGame` live in `pipeline.ts`**
- Date: 2026-10-14
- Question: §5.8 puts `checkWin` in `reducer.ts`. Engine milestone 3 put `checkWin`, `lifeChanged`, `endGame` and `dealDamage` in `pipeline.ts`, and `moodOf` in `mood.ts`, because `EffectHost.lifeChanged` and `combat.ts` need them before the reducer exists.
- Decision: Confirmed. `reducer.ts` imports them and has no second win check. After any life change, `lifeChanged` emits `MoodChanged` (if the mood changed), then runs `checkWin`, which may emit `GameOver`. So a lethal hit on the Collector emits `MoodChanged{to: desperate}` before `GameOver`. §5.8 and §2 are updated.
- Reason: `reducer.ts` imports `turn.ts` and `combat.ts`, so keeping the win check there would create an import cycle. One home for "life changed" keeps mood and win checks from drifting apart.

**D-152 · Unstable expiry prevented by Ward — owner ruled (A)**
- Date: 2026-10-14
- Question: This case is reachable with launch content: a player Chimera can inherit Ward (Drowned Oathkeeper, Candle Templar) and be Unstable (e.g. Candle Templar + Nightglass Wyrm, Lumen + Umbra → Dragoon Abomination 9/5 with Ward, 12 Power while Unstable). D-044 and D-062 say Ward prevents the expiry destruction, but neither says what happens to the Unstable bonus after that. Engine milestone 3 leaves `unstableUntil` set to a past turn. Because the bonus applies while `unstableUntil ≥ 0` (§4, D-031), the Chimera keeps +`UNSTABLE_BONUS` Power forever and is never checked again. This changes what the player experiences, so it is the owner's call.
- Options:
  - (A) Ward saves the Chimera and Unstable ends: the +3 is lost and no new timer starts. In the engine, the Ward replacement for cause `'unstable'` also sets `unstableUntil = -1`.
  - (B) Ward saves it and it keeps +3 permanently. This is the current code and the most literal reading ("the Chimera gets +3 Power" has no end).
  - (C) Ward saves it and it stays Unstable, with a new timer for the end of its controller's next turn.
- Recommendation: (A). Unstable is a bargain (+3 now, destroyed later), so Ward should buy survival, not a permanent +3. Under (B) that Dragoon Abomination stays at 12 Power for the rest of the duel and stays an Appraisal target (≥ `APPRAISAL_MIN_POWER`) every round. (C) invents a second timer that DESIGN doesn't mention.
- Ruling (owner, 2026-10-14): (A). When Ward prevents the Unstable expiry destruction, the Ward replacement also sets `unstableUntil = -1`, so the +3 is lost and no new timer starts. Engine-dev pins this with one scenario test.
- Settled now (event plumbing, not a rule): `UnstableExpired` is emitted for every monster whose timer ran out, before the batch. Each one is then followed by either `WardBroken` or `Destroyed`.

**D-153 · `DrawSkipped` reasons**
- Date: 2026-10-14
- Question: Engine milestone 3 emits `DrawSkipped{handFull}` whenever the draw step wants 0 cards. That happens on every full-hand turn, round 1 included (D-012). It emits `DrawSkipped{deckEmpty}` when the deck holds fewer cards than wanted (D-013).
- Decision: Confirmed. The draw step emits at most one `DrawSkipped`. `handFull` means `HAND_SIZE − hand ≤ 0`; it takes precedence when the deck is also empty, because nothing was wanted. `deckEmpty` comes after the `CardDrawn` events of a partial draw. Effect draws ignore the cap (D-011), so they emit only `deckEmpty`. The UI may ignore `handFull`.
- Reason: one small event per skipped draw step makes "why didn't I draw?" answerable from the log, and it costs nothing in the sim (`{ events: false }`).

**D-154 · Covetous summon events and `Track.unpriced`**
- Date: 2026-10-14
- Question: A Covetous summon emits `Sacrificed{reason:'covetous'}`, then `Summoned`, then `CovetousSummoned` (which has no `pos`). Is the double event intended? `Track.unpriced` is set when the summoned def equals `c.collector.ace`.
- Decision: Confirmed as is. `Summoned` is the one event for every board entry made by a summon action, and it pairs 1:1 with the `onSummon` dispatch (D-122). Anything that counts summons listens to `Summoned` alone. `CovetousSummoned` is an extra marker that links the ace to its sacrifice for the UI. It has no position because `Summoned` already carries one. A Graft is different: `Grafted` replaces `Summoned` because a Graft doesn't dispatch `onSummon`. `Track.unpriced` keys on `c.collector.ace` (D-162). `reason: 'covetous'` is an event label that means "sacrifice summon", not a keyword lookup.
- Reason: each event has one meaning, and removing either one would make some consumer infer a fact from a neighbouring event.

**D-155 · The first attack closes Reposition and forfeits the play inside `declareAttack`**
- Date: 2026-10-14
- Question: `declareAttack` itself sets `step = 'attack'` and `played = true` (D-014).
- Decision: Confirmed. Every play (summon, Covetous, set trap, and the Graft commit and `cast` when they land) uses the same tail: `played = true; step = 'attack'`. `legal.ts` reads only `step` and `played`.
- Reason: the state change belongs to the action that causes it, so there is one rule and no reducer special case.

**D-156 · Combat event semantics**
- Date: 2026-10-14
- Question: Engine milestone 3 fixed the meaning and order of the combat events.
- Decision: Confirmed:
  - `CombatResolved` is emitted after the `beforeCombat` effects and before the destruction batch. `destroyed` is the set the outcome marks for destruction, before Ward. What actually happened comes from the `WardBroken`/`Destroyed` events that follow.
  - `aP` includes the element bonus. `dStat` is the stat the attack is compared against: the defender's Power in attack position, its Guard in guard position. `previewCombat` uses the same fields.
  - Damage: no v0.1 outcome damages both sides. The code applies the attacker side's damage, then the defender side's, with a win check after each. `source` is the opposing combatant (the monster whose stat caused it), even if that monster was destroyed in the batch.
  - Direct attacks emit no `CombatResolved`, only one `Damage` with `source` = the attacker.
- Reason: listeners can tell "what the fight decided" apart from "what Ward changed", with no duplicated fields.

**D-157 · Fizzled attacks emit no event; `AttackCancelled` order**
- Date: 2026-10-14
- Question: §7 has no fizzle event. Engine milestone 3 emits nothing when `onAttackDeclared` or `beforeCombat` effects remove a combatant. It emits `AttackCancelled` before the cancelling card's other queued effects.
- Decision: Confirmed. Order: `AttackDeclared` → the `TrapTriggered` events from the `onAttackDeclared` list → `AttackCancelled{by}`, once, after the list → events from queued effects (Mirror Sigil's `StatsModified`, the `PositionChanged` from Display Case or Thornwall). A fizzle ends the attack with no further event, and the attacker stays marked as having attacked (D-033). No launch content can cause a fizzle. If future content can, add an `AttackFizzled` event then.
- Reason: no event exists for a case no card can produce, and the cancellation is visible before the effects it caused.

**D-158 · `onDestroyed`: dispatch the whole batch, then flush once** (changed)
- Date: 2026-10-14
- Question: Engine milestone 3 flushes queued effects after each destroyed monster's `onDestroyed` dispatch, so monster 1's Echo is visible to monster 2's hooks. §5.5 and §8.3 rule 2 don't settle it. But `Run.flush()` does nothing when the batch was raised by an effect that is already draining (the `destroy` op). So the same batch would resolve one way from combat or Unstable expiry and another way from a future multi-target destroy effect.
- Decision: Changed. `destroyBatch` dispatches `onDestroyed` for every destroyed monster in batch order (each monster's own hooks first, D-122), then flushes once. The queue is FIFO, so effects still run monster by monster. Every hook in the batch sees the same post-removal board. This depends on traps being spent at dispatch time (§8.3 rule 3, D-071): `traps.ts` must move a firing trap to its owner's discard and emit `TrapTriggered` when its subscriber runs, like `cancelAttack` (D-122), not in a queued effect. A fresh `Dispatcher` is built per monster, so a trap spent for monster 1 is never offered for monster 2. If monster 1's effects end the game, monster 2's hooks were already dispatched, and their effects are dropped (§8.3 rule 5).
- Reason: this resolves a batch the same way whether it comes from the top level or from inside a drain. It matches "simultaneous destructions are one batch" (§8.3 rule 2) and D-045's "after the whole destruction batch resolved". With launch content, only the order of events changes.

**D-159 · `ModifierExpired` is per monster**
- Date: 2026-10-14
- Question: Engine milestone 3 emits one `ModifierExpired` per monster, not per modifier. It does so after the Unstable destruction, only for monsters still on the board, and not if the game ended.
- Decision: Confirmed. At the end of turn t, `ModifierExpired{iid}` goes once to each board monster (active side first, slot order) that has at least one timed modifier with `until === t`, before `TurnEnded`. Expired modifiers stay in `Monster.timed` and just stop applying (D-031). The UI recomputes stats; it doesn't need to know which modifier expired.
- Reason: the event only tells the UI to refresh a card, and monsters that left the board have no card to refresh.

**D-160 · `EffectHost.destroy(iids)` has no `by` parameter** (changed)
- Date: 2026-10-14
- Question: `EffectHost.destroy(iids, by)` ignores `by`, because effect destruction never has a destroyer (D-045, D-131).
- Decision: Changed. The signature becomes `destroy(iids: readonly Iid[]): void`, which always means `destroyBatch(run, iids, 'effect')` with no destroyer. If a future effect needs a destroyer, add a parameter then, together with a DSL ref.
- Reason: a parameter that is always ignored makes a caller think it does something.

**D-161 · Deferred to later modules: reposition, dev-mode freezing, initial mood**
- Date: 2026-10-14
- Question: Engine milestone 3 left three things for later: `reposition` (with `Revealed` on a face-down flip), deep-freezing committed states in dev mode (D-141), and setting `collector.mood` from life at setup. Fixtures use mood 0, so a fixture whose Collector life isn't Composed emits a spurious `MoodChanged` at its first life change.
- Decision:
  - **Reposition** goes in a new `reposition.ts`, called by `reducer.ts`, with legality in `legal.ts` (D-014, D-022, D-023). A face-up monster toggles `pos`. A face-down monster becomes face-up attack, emitting `Revealed{iid, side}` and then `Repositioned{iid, pos: 0}`. Either way `repositioned = turn`. No hook fires, the play is not used and `step` doesn't change.
  - **Dev freeze** goes in `reducer.ts › applyAction`: after `tx.commit()`, `if (env.dev) deepFreeze(next)`. `newGame` freezes its state in dev mode too. `deepFreeze` skips frozen objects, so shared subtrees aren't walked again.
  - **Initial mood:** `setup/initial-state.ts` sets `collector.mood = moodOf(sides[1].life, g)` and `intent = null`. The board-DSL fixture builder (`test-utils/board-dsl.ts`) derives the mood the same way from the fixture's Collector life. Only setup and `lifeChanged` ever write the mood.
- Reason: each item belongs to the module that owns that step. Deriving the mood in one way everywhere removes the fixture artefact.

**D-162 · The engine has no card or keyword ids**
- Date: 2026-10-14
- Question: Engine milestone 3 finds Ward by its `beforeDestroy` hook and the ace by `c.collector.ace`. It has no id literals.
- Decision: Confirmed (a grep of `packages/engine/src` outside tests finds no card or keyword id). Ward is found by its hook (D-133), the ace via `CompiledContent.collector.ace`, and Covetous via `summonRequirement` (D-137). The rule is added to the §19 checklist.
- Reason: content stays data-only (§1.3).

**D-163 · Trap and spell ref sets; where `cancelAttack` may appear**
- Date: 2026-10-14
- Question: `validate.ts` restricts the refs each trap trigger may use, and spells may use only `chosen`. These sets weren't written down anywhere. Separately, the interpreter throws `EngineError` if `cancelAttack` is ever queued (D-122), but no validator rule stops a spell or a non-attack trap from using it.
- Decision: The sets are confirmed and written into §9.1:

  | Trigger | Hook | Refs |
  | --- | --- | --- |
  | `enemyAttack` | `onAttackDeclared` | `attacker`, `defender` (`-1` on a direct attack: the effect fizzles) |
  | `enemyDirectAttack` | `onAttackDeclared` | `attacker` |
  | `allyDestroyed` | `onDestroyed` | `destroyed`, `destroyer` (`-1` unless destroyed in combat: fizzles) |
  | `enemyGraft` | `onGraft` | `grafted` |

  Spells may use only `chosen`. `self` isn't available to spells or traps, because the card isn't on a board, so it would always fizzle. The table stays in `validate.ts` as `Record<TrapTrigger, …>`, so adding a trigger fails to compile until the table is updated. **Added rule:** `cancelAttack` is allowed only in traps whose trigger is `enemyAttack` or `enemyDirectAttack`. Anywhere else it is a validator error: `cards/player-spells.json › x › "cancelAttack" only works in a trap with trigger enemyAttack or enemyDirectAttack › remove it or change the trigger`.
- Reason: these are exactly the refs `hooks/dispatch.ts` binds per hook. The new rule turns a runtime `EngineError` into a `content:check` error, which is the validator's job.

**D-164 · Validator wording that §10.3 doesn't give**
- Date: 2026-10-14
- Question: content-author wrote the messages for an orphan art brief, the pool-size warning and some spell-ref problems. §10.3 has no text for them.
- Decision: Confirmed, and added to §10.3 as the reference examples:
  - `art-briefs.json › x › orphan brief, no card or Chimera family has this id › delete the entry`
  - `cards/player-monsters.json › pool › has 24 monsters, expects POOL_MONSTERS=25 › add or remove monsters, or change POOL_MONSTERS in globals.ts` (a warning)
  - `… › ref "attacker" is not available for spells › use "chosen" with a target spec`
  - `… › has a "target" but no effect uses "chosen" › remove "target" or use "chosen" in an effect`
  
  The deck-entry "no longer exists" message already matches §10.3's delete-a-card example.
- Reason: the messages follow the `<problem> › <how to fix>` pattern, and each says what to do.
- Amended by D-170: the pool-size warning and the `POOL_*` globals are removed and replaced by the pool-capacity error.

**D-165 · `formatError` omits an empty field**
- Date: 2026-10-14
- Question: content-author changed `load.ts › formatError` to drop the `field:` part when a problem concerns the whole entry (`field === ''`), to match the §10.3 examples. `load.ts` was outside the files the task allowed.
- Decision: Confirmed, and the change stays. The line format is `<file> › <entry> › [<field>: ]<problem> › <how to fix>`; the field is omitted for whole-entry problems. §10.3 and D-146's format line are read this way. Edits outside the assigned files must be listed in the hand-off, which this one was.
- Reason: without the change, every cross-file message would carry a stray `: `. The change is one line, and it makes the code match the documented examples.
- Confirmed by D-206: parse errors still printed `(entry):` from `files.ts › fieldName`, and read errors printed `(file):` from `load.ts`. Both now omit the field.

**D-166 · After v0.1 the content JSON and globals are the source of truth for every value (owner ruling, 2026-10-14)**
- Date: 2026-10-14
- Question: v0.1 exists for playtesting, and many card, effect and tuning changes will follow. Until now every value was checked against DESIGN.md: content-author transcribes it, tests pin it, and the main session compares 172 fields. Which document is authoritative for values after v0.1, and when does that switch?
- Decision (owner ruling):
  - **Switch point.** The switch happens at the commit that lands content M3, once the main session's verification passes: `tsc -b`, `eslint`, `content:check`, `vitest run` from the root, and one final DESIGN-vs-JSON comparison (172 fields, 0 mismatches). The launch transcription has then been verified field by field, so the JSON starts out equal to DESIGN.md. The commit message says "D-166 switch". After it, nobody runs the DESIGN-vs-JSON comparison again.
  - **Canonical in data from then on:** every value in `packages/content/src/globals.ts` (numbers, ranges, flag defaults); the card list; every card field (name, element, kind, Power/Guard, keywords, Flaw, text, effects, targets, conditions); recipes (family names and stats); elements (list, `beats`, colors, icons); kinds; the Collector deck list and ace; objectives; twists; dialogue; art briefs.
  - **DESIGN.md keeps the rules and mechanics:** turn structure, the combat table, what each keyword and Flaw does, Graft/Ascend/Unstable, Appraisal, the AI priority lists and mood behaviours, the daily loop, which deck-generation constraints exist, and the balance targets as goals.
  - **DESIGN.md's value tables become "launch values".** They are kept, not deleted, because they are the baseline that the paper-sim, the M-proposals and every later sim A/B compare against. The owner (agents never edit DESIGN.md) adds one line above each value block: *"Launch values (v0.1). The live values are in packages/content (see CONTENT_GUIDE.md); this table is not updated."* The blocks are: the pool sizes (L147), the monster table (L151–157), the stat budget (L159), the spell and trap tables (L163–179), the Chimera family table (L125–141), the Relic table and the Collector spells/traps (L189–207), and the globals block (L285–298).
  - **Owner-only settings.** These live in data, but changing one is a rule or goal change, so it needs an owner-approved D-entry: the `TARGET_*` balance targets; the proposal levers (`FLAGS.APPRAISED_ENTERS_GUARD`, `FLAGS.ACE_SET_ASIDE`, `FLAGS.CHIMERA_TO_HAND`, `UNSTABLE_EXPIRY`, `SLOW_TURNS`), which stay at DESIGN-as-written until an M-proposal is adopted; the rule lists, mood overrides and string params in `collector.json › ai` (they encode D-081…D-093); and `WARD_CHARGES` (an engine limit, D-133). The owner may change anything else directly, and balance-analyst may change it with an entry in `docs/BALANCE_LOG.md`.
  - **Review.** Agents and reviewers stop checking content values against DESIGN.md. A value change is reviewed for a clean `content:check`, green tests, and a `sim:quick` run when it affects balance. Rule fidelity is still checked against DESIGN.md and this log.
  - Values quoted in older entries (D-109's "all 25 pass", D-152's example cards) and in ARCHITECTURE examples (§9.2, §11) describe launch content. The files win.
- Reason: the owner expects many changes and doesn't want to lose track of them. One authoritative place per value, which the tooling already validates, is simpler than keeping a prose copy in sync. Keeping the launch tables as a frozen baseline costs nothing and preserves the history.
- Amended by D-204 (owner ruling, 2026-10-14): the AI card lists (`castHighValueSpell` spell ids, `trapPreference` ids) are edited freely like `deck`. The AI rule lists, mood rule lists and other params stay owner-only.

**D-167 · A monster outside the stat budget is a warning (owner ruling, 2026-10-14)** (amends D-109)
- Date: 2026-10-14
- Question: D-109 makes the stat budget a `content:check` error. During playtesting the owner will deliberately try off-budget cards.
- Decision (owner ruling): the D-109 formula is unchanged (`Power + Guard + KEYWORD_COST × keywords ∈ [STAT_BUDGET_MIN, STAT_BUDGET_MAX]`, player base monsters only), but a miss is a **warning** and never fails `content:check` or the build: `warning: cards/player-monsters.json › kiln-whelp › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended`. This supersedes DESIGN.md's "the validator fails the build on … stats outside the budget" (Technical architecture › Content pipeline, L335). The owner updates that line; agents don't.
- Reason: the budget is a design guide, not a rule of play, so it should flag outliers rather than block experiments.

**D-168 · Tests check rules on fixtures; `content:check` checks live content; no test pins a live value** (changed; revises D-143)
- Date: 2026-10-14
- Question: Changing one balance number takes three edits. `content/src/globals.test.ts` pins `DEFAULT_GLOBALS` to the DESIGN numbers, `test-globals.test.ts` (D-143) forces `TEST_GLOBALS` to deep-equal `DEFAULT_GLOBALS`, and `content.test.ts` pins the entity counts (25/6/4/13/4/3/20/4/0). Adding or removing a card also breaks tests.
- Decision: three layers, and each owns one kind of truth:
  1. **Engine tests check rules on fixtures.** They use `test-utils/fixture.ts` (`fx-` content) and `TEST_GLOBALS`, which the engine now owns and which is deliberately independent of `DEFAULT_GLOBALS`. Its `CONTENT_VERSION` is the constant `'0.0.0-fixture'`. Engine logic must not depend on particular values. Where a number is incidental, a test derives its expectation from `g` (for example `life - g.HAUNT_PENALTY`). The fast-check walk (§17 properties 1–5) also runs under a second fixture set, `ALT_GLOBALS = withGlobals({ … })`, with different board, hand, draw, round, Appraisal-round, life and bonus values chosen by engine-dev to keep the fixture setup feasible. That catches hard-coded constants.
  2. **Content tests check validator behaviour on synthetic inputs** (as `validate.test.ts` already does), plus exactly **one live-content test**: the live content loads, validates with zero errors, compiles, and a smoke run finishes. The smoke run is 20 fixed seeds, each a uniformly random legal-action walk for both sides under `withOverrides(DEFAULT_GLOBALS, ['FLAGS.INTENTS=false'])`, and it must end with no `EngineError`. It asserts nothing about counts or values.
  3. **The sim checks live balance** against `TARGET_*`.

  Concrete changes:
  - `globals.test.ts`: delete the value pins. Keep two tests. (a) `GlobalsSchema.safeParse(DEFAULT_GLOBALS).success`. (b) The **rule-lever pin**: `FLAGS.APPRAISED_ENTERS_GUARD === false`, `FLAGS.ACE_SET_ASIDE === false`, `FLAGS.CHIMERA_TO_HAND === true`, `UNSTABLE_EXPIRY === 'endOfNextOwnTurn'`, `SLOW_TURNS === 1`, with a comment saying these are owner-only rule levers (D-166) and change together with the D-entry that adopts an M-proposal.
  - `test-globals.test.ts`: replace the deep-equal and the version-suffix check with `GlobalsSchema.safeParse(TEST_GLOBALS).success`. TypeScript (`TEST_GLOBALS: Globals`) already enforces the shape, and the schema adds the sanity rules.
  - `content.test.ts`: delete the "entity counts" block, and delete the id, art-brief and Collector-deck checks that duplicate validator rules. Keep "parses and validates with zero errors". Add the compile + smoke test once engine M4's `newGame`/`applyAction`/`getLegalActions` exist.
  - **Structural invariants live in `content:check`, not in tests:** one recipe per unordered kind pair; a Collector deck of `COLLECTOR_DECK_SIZE` that contains the ace; pools big enough for the deck (D-170); deckgen feasibility on 1,000 dates; unique ids; resolving refs.
  - **Still pinned, and why:** the cyrb128/sfc32 known-answer vectors (the determinism contract: changing them changes every seed); the rule levers above (they encode DESIGN rules, not tuning); `WARD_CHARGES = 1` and the other inert-global refinements (D-170), which are engine limits; fixture expectations in engine tests (independent of live values by construction); golden replays, which run **only** on fixture content plus `TEST_GLOBALS` (a live-content replay asserts only that a replay reproduces its own run's hash, never a stored hash); and `COLLECTOR_DECK_SIZE` (DESIGN's validator rule; resizing the Collector deck is deliberately two edits, with a clear error).
- Reason: tuning a value or adding a card should be one edit, with only `content:check` and the structural tests reacting. A test that compares a value with a copy of itself verifies nothing, and every copy is one more edit. Varying the fixture globals shows that the engine reads its globals, which is what D-074 actually requires.

**D-169 · Scenarios and keyword examples declare their own cards and run under `TEST_GLOBALS`**
- Date: 2026-10-14
- Question: §8.4's example keyword tests use live cards (`stormcrow`, `halo-stag`, `brazier-golem`) and, implicitly, live values. Moving Sentinel to another card or retuning a stat would break the Sentinel example, so value pins come back through the tests.
- Decision:
  - The board DSL (§17) gets a declaration line: `card <id> <P|C> <element> <kind> <power>/<guard> [<kw>[,<kw>…]]`. It declares a monster for that scenario only. `P` is the player pool. `C` is the Collector pool (a Relic; its Flaw goes in the keyword list). A declared id that collides with a content id is a parse error.
  - The parser returns the declared cards separately, so each package builds the content in its own way:
    - Engine tests: `buildContent` over `FX_SPEC` plus the declared cards.
    - Content tests (keyword examples, and test-writer scenarios that need the real keyword files): a helper `scenarioContent(declared)` in `packages/content/test-utils/` compiles the live elements, kinds, recipes and `KEYWORDS` with **only** the declared cards. It may stub the Collector deck and ace.
  - Every scenario and example runs under `TEST_GLOBALS`.
  - Keyword examples use declared cards only and never live card ids. They don't assert Chimera family stats, which come from live `recipes.json`.
  - The generated example tests live in `packages/content/src/keyword-examples.test.ts`, because the engine can't import content (this corrects §20 CG-2). Examples written in content M3 against live ids are converted.
- Reason: an example tests a keyword's logic, so it should depend only on that keyword file and the DSL. Live elements and kinds rarely change, and when they do the failure message says exactly what broke.

**D-170 · Globals: one value in one place, and no silent no-ops**
- Date: 2026-10-14
- Question: Some globals are derived from others or duplicate the data: `PLAYER_DECK_SIZE` (= DECK_MONSTERS + DECK_SPELLS + DECK_TRAPS), `COLLECTOR_DECK_MONSTERS/SPELLS/TRAPS` (a breakdown of the deck list) and `POOL_MONSTERS/SPELLS/TRAPS` (D-164 pool-size warning). Changing `DECK_SPELLS` or adding a card therefore takes a second edit or produces a warning. Other globals exist that no code reads yet, so a `--set` on one silently does nothing.
- Decision:
  - Remove `PLAYER_DECK_SIZE`, `COLLECTOR_DECK_MONSTERS`, `COLLECTOR_DECK_SPELLS`, `COLLECTOR_DECK_TRAPS`, `POOL_MONSTERS`, `POOL_SPELLS` and `POOL_TRAPS` from `Globals`, `DEFAULT_GLOBALS`, `GlobalsSchema` and `TEST_GLOBALS`. Code that needs the player deck size computes the sum, via the engine helper `playerDeckSize(g)`. `COLLECTOR_DECK_SIZE` stays (DESIGN's validator rule, D-168).
  - The D-164 pool-size warning is replaced by an error for a pool that can't fill the deck:
    `cards/player-spells.json › pool › 2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts`
    The number to add is `ceil(DECK_X / MAX_COPIES) − count`. Monsters, spells and traps are each checked this way.
  - **Inert globals.** After engine M4, engine-dev lists every `Globals` key that no code in engine or content reads. Keys reserved for ai and sim (`AI_*`, `BOT_*`, `SIM_*`, `SEED_*`, `TARGET_*`, `DIFFICULTY_*`, `PERF_*`) are exempt until those packages land. Content-author adds a `GlobalsSchema` refinement for each listed key, pinning it to its only supported value, like `WARD_CHARGES` (D-133): `globals.ts › RELIC_FLAWS › must be 1 until the engine supports other values › keep 1`. A refinement is removed in the same change that teaches the code the key.
- Reason: a derived value stored twice means two edits. A warning that every new card trips is noise. A global that is accepted but ignored misleads the person tuning it.
- Amended by D-205: the inert list becomes three states (read, pinned, planned) checked by a reader tripwire test, and `planned-globals.ts` replaces the prefix exemption. `RELIC_FLAWS` is pinned by D-202.

**D-171 · Content numbers: a new card number is one line in `globals.ts`**
- Date: 2026-10-14
- Question: A new spell with a new number, say "drain 4", needs a new global. Today that takes four edits in two packages: the engine's `Globals` interface, `TEST_GLOBALS`, `GlobalsSchema` and `DEFAULT_GLOBALS`. Two of those belong to engine-dev. Content changes are meant to be data-only (§1.3).
- Decision:
  - `Globals` gets `readonly CONTENT_NUMBERS: Readonly<Record<string, number>>`, an open section at the end of `DEFAULT_GLOBALS`, commented "add a line here for a new card number".
  - Names that move into it (unchanged, so every `$NAME` ref in JSON, every `--set NAME=V` and the M-levers keep working): `UNMAKE_MAX_POWER`, `BLOODLUST_POWER`, `SCRYING_DRAW`, `SIPHON_DRAIN`, `SIPHON_GAIN`, `MIRROR_SIGIL_PENALTY`, `LAST_RITES_DRAW`, `PROVENANCE_DRAW`, `GILT_POWER`, `GILT_GUARD`, `FORFEIT_MAX_POWER`, `COUNTERFEIT_PENALTY`, `INSURANCE_HEAL`, `OBJ_HIGH_LIFE`, `OBJ_WIN_BY_ROUND`, `AI_FACEDOWN_ATTACK_MIN_POWER`.
  - **Rule:** a number that TypeScript reads as a property (engine, ai, sim, or `q.g.X` in a keyword's query hook) is a core global, and adding one is an engine change. A number referenced only as `$NAME` is a content number.
  - **Resolution.** `effects/num.ts` resolves `$NAME` as follows: an own property of `CONTENT_NUMBERS` first, then a core `NumericGlobal`, otherwise `EngineError` (unreachable after validation). The engine root exports `resolveNum(g, num)`, so ai, objectives and text rendering all use one resolver. `QueryCtx` gets `num(name: string): number` with the same lookup, so a new keyword's query hook can use a content number without an engine type edit.
  - **Schema.** `GlobalsSchema` validates `CONTENT_NUMBERS` as a record of `/^[A-Z][A-Z0-9_]*$/` → `z.int()`, and rejects any name that is also a core key.
  - **Overrides.** `withOverrides` routes `NAME=V` to `CONTENT_NUMBERS` when `NAME` is defined there, and also accepts `CONTENT_NUMBERS.NAME=V`. An unknown name is still rejected (`--set` never adds a number).
  - **Validator.** The `$NAME` check (§10.3) and the placeholders (D-172) accept both namespaces, and "did you mean" searches both. `keyword-files.ts` scans each keyword source for `'$NAME'` / `'-$NAME'` and `num('NAME')` literals and reports unknown names in the §10.3 format (`keywords/x.ts › x › "$FOO" not in globals.ts › did you mean $FOOD?`).
  - `TEST_GLOBALS.CONTENT_NUMBERS` holds whatever the fixtures use (`UNMAKE_MAX_POWER` for `fx-spell-bolt`, …).
- Reason: card numbers are content. They belong in the content-owned file, so adding one is one line and stays out of the engine's type surface. Flattened names mean none of the existing data, docs or proposal levers change.

**D-172 · `{NAME}` placeholders in text** [EXTENDS]
- Date: 2026-10-14
- Question: Card and keyword `text` is written by hand, so it goes stale. Unmake says "Power 5 or less" while its effect reads `$UNMAKE_MAX_POWER`. Haunt says "loses 2 Power" (HAUNT_PENALTY), and Tethered says "−2 Power" (TETHERED_PENALTY). A `--set` or a tuning edit leaves the text wrong.
- Decision:
  - **Syntax.**
    - `{NAME}` renders the value as a decimal integer.
    - `{NAME|singular|plural}` renders the value, a space, then the singular word if the value is 1, otherwise the plural.
    - `NAME` matches `[A-Z][A-Z0-9_]*` and must be a numeric core global or a `CONTENT_NUMBERS` entry (the same set `$NAME` may use).
    - Words match `[^{}|]+`. There is no nesting, and `{` and `}` may not appear in text otherwise.
    - Signs are written outside the placeholder (`−{TETHERED_PENALTY} Power`), so globals stay positive.
  - **Where placeholders are allowed:** card `text` in all six card files (including the optional monster and Relic text), `objectives.json › text`, `twists.json › text`, and `KeywordDef.text` in `keywords/*.ts`. Not names, dialogue or art briefs.
  - **Where substitution happens.** `packages/content/src/text.ts` (browser-safe, pure) exports `parseTemplate(text)` (pieces, placeholder names, malformed spans; used by the validator) and `renderText(text, g): string`. Substitution is **not** done in `compile.ts`, because compiled content holds no rendered strings and stays independent of globals (D-120). Text is rendered at the display edge with the same `Globals` object the engine was created with, so `--set` and the web's `?set=` (D-176) show up in the text. `KeywordDef.text` (in `CompiledContent.keywords`) and `CompiledTwist.text` stay as templates, and the UI renders them like card text. The sim renders text with the run's globals wherever a report prints card text.
  - **Validator rules.** The field is `text` in every case.
    1. Malformed placeholder, error: `cards/player-spells.json › unmake › text: malformed placeholder "{Unmake}" › write {NAME} or {NAME|word|words} with a global name in capitals`
    2. Unknown name, error: `cards/player-spells.json › unmake › text: unknown placeholder {UNMAKE_MAX_POWR} › did you mean {UNMAKE_MAX_POWER}?` (with no close match: `› use a numeric name from globals.ts`)
    3. Non-numeric global, error: `cards/player-spells.json › x › text: {CONTENT_VERSION} is not a number in globals.ts › use a numeric global`
    4. Bare number on an entry that references a global, error. If a card or objective has any `$NAME` in its effects, target, `when` or thresholds, and its text still contains a digit once placeholders are removed: `cards/player-spells.json › unmake › text: bare number "5" while the card uses $UNMAKE_MAX_POWER › write {UNMAKE_MAX_POWER} instead of 5`. With several refs the fix reads `write one of {GILT_POWER}, {GILT_GUARD} instead of 2`.
    5. Bare number in keyword or Flaw text, error. Any digit counts, because keyword numbers always come from globals (§1.3): `keywords/haunt.ts › haunt › text: bare number "2" › write a {NAME} placeholder for the global the keyword uses`. Rules 1–3 apply to keyword text too. `content:check` runs these on the `KEYWORDS` registry next to the keyword-file checks.
    6. Placeholder the card doesn't use, warning (cards and objectives only): `warning: cards/player-spells.json › siphon › text: {SIPHON_GAIN} is not used by this card's effects or conditions › check the name`
    7. The one-sentence check (D-113) runs on the rendered text.
  - **Migration.** Content-author does it, in the same change as the rules. The rendered text must stay identical:
    - unmake "Destroy an enemy monster with Power {UNMAKE_MAX_POWER} or less."
    - bloodlust "One of your monsters gets +{BLOODLUST_POWER} Power this turn."
    - scrying-bones "Draw {SCRYING_DRAW|card|cards} (ignores the draw cap)."
    - siphon "The Collector loses {SIPHON_DRAIN} life; you gain {SIPHON_GAIN}."
    - mirror-sigil "When an enemy monster attacks, it loses {MIRROR_SIGIL_PENALTY} Power permanently before combat."
    - last-rites "When your monster is destroyed, draw {LAST_RITES_DRAW|card|cards}."
    - provenance-ledger "Draw {PROVENANCE_DRAW|card|cards}."
    - gilt-frame "+{GILT_POWER} Power and +{GILT_GUARD} Guard until the end of his next turn."
    - forfeit "Destroy one of your monsters with Power {FORFEIT_MAX_POWER} or less."
    - counterfeit "A Chimera grafted this turn loses {COUNTERFEIT_PENALTY} Power."
    - insurance-claim "When his monster is destroyed, he gains {INSURANCE_HEAL} life."
    - objectives: "Win with {OBJ_HIGH_LIFE}+ life", "Win by round {OBJ_WIN_BY_ROUND}"
    - haunt.ts "When destroyed, the monster that destroyed it loses {HAUNT_PENALTY} Power permanently."
    - tethered.ts "−{TETHERED_PENALTY} Power while it is his only monster."

    Any other digit that rule 4 or 5 finds is migrated the same way. The main session checks the result by rendering every text with `DEFAULT_GLOBALS` before and after (a scratchpad script against `git show HEAD:`). No committed test pins the strings (D-168).
- Reason: the number is written once, so the text can't drift from the value. Rendering at the edge keeps compiled content globals-free and makes overrides visible. Rule 4 targets exactly the stale-text failure without banning numbers that no global backs.

**D-173 · `MAX_BASE_KEYWORDS` is enforced by the validator, not hard-coded in zod**
- Date: 2026-10-14
- Question: `PlayerMonster.keywords` is `z.array(Id).max(1)`, so changing `MAX_BASE_KEYWORDS` does nothing, and the §10.3 message names a global that the check never reads.
- Decision: drop `.max(1)` from the schema. `validate.ts` checks that base monsters and Relics (D-114) have at most `MAX_BASE_KEYWORDS` keywords, using the existing §10.3 message `cards/player-monsters.json › x › 2 keywords, max MAX_BASE_KEYWORDS=1 › remove one`.
- Reason: one number, read in one place.
- Amended by D-201: it was not built; the message is now `keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword`.

**D-174 · A missing or orphan art brief is a warning** (amends D-110)
- Date: 2026-10-14
- Question: Every new card needs an `art-briefs.json` entry or `content:check` fails, and deleting a card leaves an orphan error. Adding or removing a card therefore takes two files.
- Decision: both rules become warnings, with unchanged messages (§10.3, D-164) prefixed `warning:`. `art-briefs.json` stays a separate file for the artist (D-110).
- Reason: art briefs don't affect play. A warning keeps the artist's list visible without blocking a playtest change.

**D-175 · Card ids are permanent; renaming a card changes its `name`**
- Date: 2026-10-14
- Question: Ids are the kebab-case of the name. Renaming a card would mean renaming its id, which breaks references: the Collector deck, `ai` params, art briefs, saved Binder entries, sim reports, painted art `public/art/<id>.webp`, and formerly keyword examples.
- Decision: an id is created from the name once and never changes. A rename edits `name` (and `text`) only, and an id that no longer matches its name is fine. If an id truly must change, edit it and fix every line `content:check` then reports (`"x" no longer exists › remove the reference`, orphan-brief warnings). Keyword examples no longer use card ids (D-169). Binder entries for the old id are lost; that is acceptable for v0.1 local storage. No alias mechanism.
- Reason: a rename is then a one-field edit. The validator already lists the references for the rare real id change.

**D-176 · Browser-safe content entry; JSON edits hot-reload in the web dev build**
- Date: 2026-10-14
- Question: The content root exports `load.ts` and `keyword-files.ts`, which import `node:fs`, so the web app can't import it. Nothing defines how an edit to JSON or `globals.ts` reaches a running playtest.
- Decision:
  - **Package split (content-author):**
    - `src/files.ts`, pure: `CONTENT_FILES`, `ContentKey`, `ContentData`, `ContentError`, `formatError`, `parseFile`, and a new `parseContent(raw: Readonly<Record<ContentKey, unknown>>)` (the loop now in `loadContent`).
    - `src/data.ts`: statically imports every JSON file (`with { type: 'json' }`) and exports `RAW_CONTENT`.
    - `src/load.ts`: keeps `loadContent(root)` (fs read, then `parseContent`), which tests and the CONTENT_GUIDE example tests use on temp copies.
    - Exports: the package's `"."` export is browser-safe (globals, text, files, data, validate, compile, KEYWORDS, schemas). `"./node"` exports `load.ts` and `keyword-files.ts`. `scripts/content-check.ts` imports from `./node`, and `validate.ts` imports from `files.ts`.
    - An ESLint `no-restricted-imports` rule bans `node:*` in `packages/content/src`, except `load.ts` and `keyword-files.ts` (and scripts).
  - **Web (ui-dev):** at startup the dev build runs `parseContent(RAW_CONTENT)`, `validateContent`, then `compileContent`. Errors replace the app with a full-screen list of §10.3 lines; warnings go to the console and the debug overlay. Vite HMR reloads content when a JSON, `globals.ts` or keyword file is saved. The duel in progress restarts, because `state.cfg` changed: the session replay throws `EngineError`, the duel is voided without a loss (D-108), and a "content changed, duel restarted" notice is shown. Hosted playtest builds pick up edits on redeploy (`build` runs `content:check`).
  - **Can wait:** in dev builds, `?set=KEY=VALUE` (repeatable) applies `withOverrides(DEFAULT_GLOBALS, sets)`. The overrides are shown in the debug overlay and in rendered card text (D-172).
- Reason: during playtesting the loop from editing a file to seeing it in the game should take seconds. Splitting the Node-only parts out is the minimum needed for that.

**D-177 · `content:check` warns when the Collector AI can never play a deck card** [EXTENDS]
- Date: 2026-10-14
- Question: The AI casts Collector spells through `ai.params.castHighValueSpell` keys (D-087) or the draw-spell utility step (D-085), and sets traps from `ai.trapPreference` (D-088). A newly added Collector spell or trap would be silently dead, which skews the sim.
- Decision: two warnings.
  - `warning: collector.json › deck[n] › Collector spell "x" has no AI rule that casts it › add "x" to ai.params.castHighValueSpell with a pick, or make it draw-only`. Raised for a deck spell that isn't a key of `castHighValueSpell` (base or any mood) and isn't draw-only (every effect `{ op: 'draw', who: 'self' }`).
  - `warning: collector.json › deck[n] › Collector trap "x" is not in ai.trapPreference › add it, or AI rule 4 never sets it`.
- Reason: cheap, and it catches the one way a valid content change silently has no effect.
- Amended by D-204: `castHighValueSpell` becomes a map keyed by spell id, so the first warning's fix can be done in data. Both warnings are built with it.

**D-178 · CONTENT_GUIDE.md plan**
- Date: 2026-10-14
- Question: docs-keeper writes `docs/CONTENT_GUIDE.md` in Phase 1 for a non-engineer owner. Which sections must it have now that D-166…D-177 exist?
- Decision: the required sections and their order are in ARCHITECTURE §10.5. Each section gives the exact file, a copy-paste template, one worked example, the commands to run, and the common `content:check` messages with fixes. Every worked example is backed by a test in `packages/content/test/guide.test.ts` that applies it to a temp copy of the content (`loadContent(tmpRoot)`) and expects the stated `content:check` result. Examples must not depend on live values: each sets up whatever it needs on the temp copy. The sections marked "before playtesting" in §10.5 ship before v0.1 playtesting; the rest follow in Phase 1.
- Reason: the guide is how the owner makes changes without an engineer, so it has to match the tooling, and the tests keep it matching.

**D-179 · Reviewed for post-v0.1 friction, no change now**
- Date: 2026-10-14
- Question: Do the 32-bit keyword mask, `CONTENT_VERSION` in the seed, or literal twist values need work before playtesting?
- Decision: no change.
  - **Keyword mask:** launch uses 11 of 32 bits, and `content:check` already errors past 32. Widening it (two words, or a `BigInt` mask) is a contained engine change if the pool ever gets near 32.
  - **`CONTENT_VERSION`:** it isn't bumped per edit (that would be a second edit). Saves are protected automatically by `state.cfg`, the content hash plus the globals hash (D-108). Bump it only when publishing a new playtest build, so results and seeds from different builds stay separable. The guide says so.
  - **Twists:** `twists.json` modifier values stay literal content (D-121). Twists are off in v0.1, and their text may use placeholders (D-172).
- Reason: none of these will hurt during playtesting, and each has a clear upgrade path.

**D-180 · Graft: material-1 candidates; `Track` counts the player's Grafts only**
- Date: 2026-10-14
- Question: Engine M4 offers a `mat1` pick only for an eligible monster that has at least one valid partner (a recipe and a free slot after the sacrifice), and `graftBegin` uses the same test (`graft.ts › mat1Candidates`, `graftAllowed`). §6.2 says "each eligible base monster". Separately, `Track.grafts`, `Track.families` and `RoundFlag.Grafted` are updated only for side 0, and §5.6 doesn't say which side.
- Decision: Both confirmed.
  - The partner test applies D-057's slot rule one step earlier. A pending Graft can't reach a dead end that only `graftCancel` leaves, and no Graft that could complete is removed. §6.2's table now says this.
  - `Track` is player-side by definition (D-127). Its counters feed objectives (D-148), the share grid, the Binder (D-066) and the BT-5 metric (grafts per winning game), and all of these are about the player. The Collector can't graft (D-026). If `collector.json › canGraft` is ever turned on, a Collector counter is added at that point.
- Reason: legality stays a single list, and the UI never offers a pick that leads nowhere.

**D-181 · Chimeras inherit keywords, never Flaws**
- Date: 2026-10-14
- Question: `graft.ts › keywordUnion` masks out Flaw bits. D-059 says "keywords" and doesn't mention Flaws.
- Decision: Confirmed. DESIGN requires it: "Flaws appear only on the Collector's Relics", and Chimeras "inherit up to 2 keywords". A Flaw bit never counts toward `MAX_INHERITED_KEYWORDS`. The case can't happen with launch rules: Appraisal only moves player monsters, zone moves follow ownership (D-046, D-047), so a player never holds a Relic, and the Collector never grafts (D-026).
- Reason: this follows from a written rule and no player can reach it, so it isn't an owner call.

**D-182 · Which keywords a board material contributes to a Graft** — owner ruled (B)
- Date: 2026-10-14
- Question: D-059 says the available keywords are the union of the materials' "active" keywords. Engine M4 reads this literally (`graft.ts › keywordUnion`). A board material contributes only its active keywords: none while it is face-down (D-037), and no Ward once the Ward is used (D-133). A hand material contributes its printed keywords. Two player-visible cases follow, and both can happen with launch cards:
  - Grafting a face-down Sentinel or Ward monster from the board passes on no keyword.
  - A monster whose Ward was broken passes on no Ward.
  The same card grafted from the hand would pass on its keyword in both cases. DESIGN only says "inherit up to 2 keywords from their materials". The choice changes what the player gets, so it is the owner's.
- Options:
  - (A) Board materials give their active keywords and hand materials their printed ones. This is the current code and D-059 read literally.
  - (B) Every material gives its printed keywords, wherever it is.
- Recommendation: (B).
  - Sacrificed materials leave the board, and leaving the board resets board state (D-043), so the same card should make the same Chimera from the hand or the board.
  - A face-down material is the player's own card and the Graft reveals it (D-057), so D-037's hidden-information reason doesn't apply.
  - One rule is simpler to show in the preview.
  - Under (B) a broken Ward comes back on the Chimera, just as it already does through Echo (D-043).
- Ruling (owner, 2026-10-14): (B). Every material gives its printed keywords, wherever it is. engine-dev changes `graft.ts › keywordUnion` (and the preview) to use `printedKw` for every material, plus one fixture scenario.


**D-183 · Plumbing for the M-01 (`SLOW_TURNS`) and M-02 (`UNSTABLE_EXPIRY`) levers**
- Date: 2026-10-14
- Question: The code reads neither lever.
  - `graft.ts` always stores `unstableUntil = turn + UNSTABLE_EXPIRY_TURNS` and ignores `UNSTABLE_EXPIRY`.
  - `keywords/slow.ts` uses `enteredThisTurn`. That can't express `SLOW_TURNS > 1`, because `QueryCtx` doesn't expose the turn a monster entered.
  So a `--set` of either lever silently does nothing (D-170), and the Phase 3 A/B (§15) can't run.
- Decision: Wire both. The defaults stay DESIGN as written and keep their D-168 pins. Neither proposal is adopted.
  - **M-02.** `graft.ts` gets one helper, `unstableExpiry(turn, g)`, used by the commit and by `previewGraft`. Let `e = turn + UNSTABLE_EXPIRY_TURNS`, the end of the grafter's next turn (D-062).
    - `'endOfNextOwnTurn'` returns `e`.
    - `'startOfOwnTurnAfterNext'` returns `e + DURATION_NEXT_OWN_TURN − 1`, the end of the opponent's turn just before the grafter's turn after next. This reuses D-136's encoding of "until the start of turn n" as "through the end of turn n − 1", so the end-of-turn destruction step (§5.3) doesn't change.
    - The only visible difference from destroying literally at the start of the turn is the order of events around `TurnEnded`/`TurnStarted`, and no launch card has a turn hook. If the owner adopts M-02, revisit it then.
  - **M-01.** `QueryCtx` gets `ownTurnsSinceEntered(i): number`.
    - It counts how many of the monster's controller's turns have started after the turn it entered: 0 during the entry turn, −1 if the monster isn't on a board.
    - With `e = Monster.entered`, `t = turn` and controller `x`, it is `((t − x) >> 1) − ((e − x) >> 1)`. The shift is arithmetic, so the board DSL's `entered = −1` works. It uses integers only.
    - `slow.ts` becomes `attackPermission: (q) => (q.ownTurnsSinceEntered(q.self) < q.g.SLOW_TURNS ? { restrict: 'none' } : {})`.
    - With `SLOW_TURNS = 1` this is exactly today's behaviour. With 2 it is M-01's "cannot attack until his second turn after it is summoned".
  - Tests: one engine fixture test per `UNSTABLE_EXPIRY` value, and a declared-card Slow example under `TEST_GLOBALS` with `SLOW_TURNS` 1 and 2.
- Reason: these are the smallest changes that make each lever do what its proposal says. A `QueryCtx` method keeps Slow in one file (D-112), and the D-136 encoding avoids adding a second destruction step.

**D-184 · M-03 and M-04 levers (`APPRAISED_ENTERS_GUARD`, `ACE_SET_ASIDE`)**
- Date: 2026-10-14
- Question: Engine M4 implements `FLAGS.APPRAISED_ENTERS_GUARD` as "the stolen monster enters his board in guard" (`appraisal.ts`). It doesn't implement `FLAGS.ACE_SET_ASIDE`, because no state zone can hold a set-aside card. A vault placement emits `Appraised{to:'vault', toSlot:-1}`.
- Decision:
  - **M-03:** confirmed as M-03's own wording. A stolen monster is always face-up (D-076), so "guard" means face-up guard. Off by default.
  - **`toSlot: -1` for the vault:** confirmed. It is the same convention as `target: -1`.
  - **M-04 plumbing** (engine-dev, before the Phase 3 A/B):
    - Add `SideState.aside: readonly Iid[]`, `[]` by default and public. `IidZone` gains `'aside'`, and the conservation property and `hashState` include it.
    - Setup with the flag on: the ace's instance goes to `sides[1].aside`, and the Collector's deck is shuffled from the remaining cards. The opening-hand guarantee runs on those cards, so D-118 no longer arises.
    - `appraisal()`: on the duel's first success (`successes` was 0), if `aside` isn't empty, the ace moves from `aside` to the hand right after `Appraised`, with the event `CardDrawn{side:1, iid, byEffect:true}`.
    - Nothing else changes. Covetous still needs a sacrifice (D-054). `collector.json` still lists all 20 cards including the ace, so the validator is unchanged.
  - Until the plumbing lands, `FLAGS.ACE_SET_ASIDE` is on the D-170 inert list. `GlobalsSchema` pins it to `false` with the message `globals.ts › FLAGS › ACE_SET_ASIDE: must be false until the engine supports other values › keep false`. The pin is removed in the change that wires the flag.
- Reason: a zone keeps card conservation and copy-on-write (§4.1) uniform, whereas a root field would need special cases in both. The pin stops a `--set` from silently doing nothing (D-170).

**D-185 · What a trap's `when` is evaluated on**
- Date: 2026-10-14
- Question: §9.1 doesn't say. Engine M4 (`traps.ts › fire`) evaluates `TrapDef.when` on the triggering monster, with the event refs bound:
  - the attacker for `enemyAttack` and `enemyDirectAttack`;
  - the destroyed monster for `allyDestroyed`;
  - the grafted Chimera for `enemyGraft`.
- Decision: Confirmed.
  - Found in review: for `allyDestroyed` the subject has already left the board (§5.5). Leaves that read board state (`faceUp`, `powerLte`, `powerGte`, `onBoard`, `keyword`) don't see its last-known information, so they can't give the intended answer. No launch card uses `when`, or an `if` on the destroyed monster.
  - Validator rule (content-author): a `when` on an `allyDestroyed` trap, and an `if` on an effect whose target is `destroyed`, may use only leaves that don't depend on the zone. Those are `type`, `relic`, `chimera`, `element`, `kind` and `graftedThisTurn`, plus `all`/`any`/`not` over them.
  - Message: `cards/player-traps.json › x › condition "powerGte" can't be checked on a destroyed monster › use type, relic, chimera, element, kind or graftedThisTurn`.
  - When a card needs a board-state condition on a destroyed monster, the engine change to make then is to evaluate it against the `DestroyedEvt` last-known information.
- Reason: the monster the trap is about is the only subject every trigger has. Restricting the leaves turns a silently wrong result into a `content:check` error.

**D-186 · `HookCtx.holds`, trap spending, and live state in hook contexts**
- Date: 2026-10-14
- Question: Engine M4 adds `holds(cond, iid)` and `spendTrap()` to the public `HookCtx`, and `spendTrap(side, iid)` to the internal `EffectSink`. §8.2 lists neither.
- Decision:
  - `holds(cond, iid)` stays on `HookCtx` and is documented in §8.2. It is a read-only condition check with the event's refs bound, so `directAttack` works. Keyword hooks may use it.
  - `spendTrap()` comes off the public `HookCtx`. It only means something for the compiled trap subscribers in `traps.ts`, and it throws when a keyword calls it. It moves to an engine-internal `TrapCtx` extension that only trap hooks receive, and the trap table in `HookRegistry` gets that type. `EffectSink.spendTrap` stays, since `EffectSink` is internal (D-131).
  - Found in review: `spendTrap` writes during a subscriber list, but the `Dispatcher` and its contexts keep the `GameState` captured when `Run.dispatcher()` built them. If nothing was written earlier in the action, as in the `onTurnEnd` dispatch at the start of `endTurn`, that is the base state, and it goes stale at the first write (§4.1 contract 1). This can't happen today, because no trap triggers on a turn hook. But the claim in `dispatch.ts`'s header that calling hooks never writes state is no longer true. Contexts read the state through the `Run` (`get s() { return run.state }`) instead of keeping a reference.
- Reason: the public context should offer only what a keyword author can use, and contexts must follow the copy-on-write contract now that one subscriber can write.

**D-187 · Identical traps: one per (definition, side) per dispatch**
- Date: 2026-10-14
- Question: Engine M4 enforces D-071's "two identical traps → only the leftmost is used" per dispatch. A destruction batch gives each destroyed monster its own dispatch (D-158), so each monster can use one trap of an identical pair.
- Decision: Confirmed. D-071's rule is about one trigger event: two identical traps must not both answer the same attack or the same destruction. Two of your monsters destroyed together are two "your monster is destroyed" events, so two Last Rites draw one card each. This can't happen with launch content, where a batch never destroys two monsters on one side, and it matches D-158's one dispatch per monster.
- Reason: it reads D-071 per event, which is how every trigger is defined.

**D-188 · The spell cast lives in `cast.ts`**
- Date: 2026-10-14
- Question: §2 names no file for the cast action. Engine M4's order is: the card goes to its owner's discard, `SpellCast` is emitted, the play tail runs (D-155), then the effects are queued in card order with `chosen` bound and flushed.
- Decision: Confirmed, and §2 now lists `cast.ts`. The card is in the discard before its effects run, like a spent trap (§8.3 rule 3). `getLegalActions` fixed the targets before the move. No spell can target itself, because Grave Recall and Restoration require `{ type: 'monster' }`.
- Reason: one module per action, and the same "leaves its zone, then resolves" order as traps.

**D-189 · Summoning a Chimera card from the hand** — owner ruled (A)
- Date: 2026-10-14
- Question: A Chimera card can reach the hand through Echo or Grave Recall (D-046, D-068, with `CHIMERA_TO_HAND` on). Engine M4 lets it be summoned like any monster in hand, in all three modes, face-down included (`legal.ts`).
  - Whether it can be summoned at all is settled: D-046 (owner-confirmed, D-149) says it "costs a full play to re-summon".
  - Whether it can be summoned face-down is not. D-063 bars a face-down Chimera, but only for the Graft's own entry (Graft rule 6), and the reason it gave was that face-down Chimeras would be Appraisal-proof.
  Whether a re-summoned Chimera may be hidden changes what the player can do, so it is the owner's call.
- Options:
  - (A) All three summon modes. This is the current code: DESIGN's summon rule ("face-up attack, face-up guard, or face-down guard") applies to every monster in hand.
  - (B) Face-up attack or guard only, extending D-063 to every Chimera.
- Recommendation: (A). It is the literal summon rule, with no special case.
  - A returned Chimera has already lost Unstable (D-043) and costs a full play.
  - Face-down, it is Appraisal-safe like any face-down monster, and its keywords are off until it is revealed (D-037).
  - The value concern behind M-12 already has its own lever, `CHIMERA_TO_HAND`.
- Either way, the summoned Chimera:
  - keeps its family, element, inherited keywords and Ascend, which live on its `Instance`;
  - has no Unstable timer;
  - isn't a Graft (`graftedThisTurn` is false, D-139, and `Track.grafts` doesn't change);
  - fires `onSummon`.
- Ruling (owner, 2026-10-14): (A). All three summon modes, as the current code does. No change.

**D-190 · Reposition legality and the per-turn globals**
- Date: 2026-10-14
- Question: Engine M4 implements §6.2 literally (`entered < turn` and `repositioned !== turn`). It doesn't read `PLAYS_PER_TURN`, `REPOSITIONS_PER_TURN` or `ATTACKS_PER_TURN`, and D-022's "unless a keyword grants it" has no reposition hook.
- Decision: Confirmed. This isn't an owner question, because no case is left open:
  - Under strict step order (D-014), a summon or Graft closes the Reposition step. So `entered < turn` only applies to a monster taken by Appraisal at the start of the Collector's turn, and D-077 (owner-confirmed) already says that monster can't reposition.
  - D-022's "unless a keyword grants it" means Swift, and Swift grants attacks only ("Can attack monsters the turn it is summoned"). A reposition-permission query hook is added when a keyword needs one.
  - The three per-turn globals encode DESIGN's "one" in the structure itself (`played: boolean` and the per-monster turn indices). They go on the D-170 inert list, and `GlobalsSchema` pins each to 1 until the engine has counters.
- Reason: the code is DESIGN plus confirmed decisions, and pinning keeps a `--set` from silently doing nothing.

**D-191 · `state.cfg` hashes the globals in canonical form, and replay checks it** (changed)
- Date: 2026-10-14
- Question: `setup/seed.ts › configHash` hashes `JSON.stringify(globals)`, which follows property insertion order. Engine-dev chose this because §19 bans key iteration.
- Decision: Changed. Two equal `Globals` objects must give the same `cfg`, and today they can differ:
  - `withOverrides` returns zod's parse output, which is in schema key order.
  - `DEFAULT_GLOBALS` follows its object literal, and `TEST_GLOBALS` follows its own order.
  - `CONTENT_NUMBERS` keeps insertion order.
  Reordering one line in any of these would void every save (D-108) even though the values are identical. The fix:
  - The engine gets `canonicalJson(v)` in `src/canonical.ts`, exported from the root. It writes JSON with object keys sorted by code unit and drops `undefined` members. Its output doesn't depend on key order, so it is the second allowed key iteration after `deepFreeze` (D-147), with the same documented lint exception.
  - `configHash` = `c.hash + ":" + hex(cyrb128(canonicalJson(g)))`.
  - `compile.ts` drops its private copy and imports this one, so content and globals are hashed the same way.
  - Replay checks `cfg`, as §11 says. `replay(seed, actions, { cfg })` throws `EngineError` before applying any action if the new game's `cfg` differs.
  - The web session stores `cfg` alongside its action list (an addition to D-108's record) and passes it to `replay`.
- Reason: a replay guard that depends on how an object was built isn't a guard. Sorting is the simplest order-independent form, and one shared function keeps content and globals consistent.

**D-192 · Setup: deckgen exhaustion, `REDRAW` off, the redraw count, Collector instance ids**
- Date: 2026-10-14
- Question: Engine M4 made four setup calls:
  - deckgen exhaustion throws `EngineError`, because the engine has no `ContentError`;
  - with `FLAGS.REDRAW` off, `newGame` runs the `keep` code;
  - after `redraw` only `keep` is legal;
  - Collector iids start at the player deck's length.
- Decision: All four confirmed.
  - `generateDeck` exhaustion throws `EngineError`, since the engine can't import content's `ContentError`. D-005 and §12.3 are amended, and `content:check` turns the failure into a §10.3 record (D-200).
  - With `FLAGS.REDRAW` off, `newGame` returns round 1 in `main` with the intent set and `redrawsLeft = 0`. That is what "the mulligan step is skipped" (D-008) means.
  - `redraw` decrements `redrawsLeft`, which starts at `REDRAWS`. `keep` ends the mulligan and sets it to 0. Each redraw takes the next `OPENING_HAND` cards, and D-007 guarantees every redraw window.
  - Collector iids start at the player deck's length; D-006's "24–43" is the launch case. Iids are positions, so nothing depends on the absolute numbers.
- Reason: each matches the written rule with no extra state.

**D-193 · Board DSL: defaults, syntax, and a dedicated filler card**
- Date: 2026-10-14
- Question: Engine M4's `test-utils/board-dsl.ts` makes these calls:
  - a monster without `new` gets `entered = −1`;
  - an unspecified hand is empty;
  - an unspecified deck, or `deck *`, is 2 × `OPENING_HAND` filler cards;
  - an `appraised` monster, on a board or in the vault, is owned by the player;
  - the filler is the first keyword-less monster in the content (`fillerDef`);
  - the `do`/`expect` syntax beyond §17's examples is defined in the file header, and `expect event <Name> [<slot>]` resolves the slot against the board at setup.
- Decision: Everything is confirmed except the filler. Under D-169, content tests compile only the declared cards. The filler is then one of the scenario's own cards, or a keyworded card if every declared card has a keyword (the fallback loop), and a drawn filler can change a test's result.
  - **Changed:** the filler is a reserved card, `dsl-filler`: player pool, first element, first kind, 1/1, no keywords. The engine's `withDeclared` and content's `scenarioContent` (D-169) always add it. `fillerDef` looks it up by id, and declaring a card with that id is a parse error.
  - The file header is the canonical syntax reference, and §17 points to it.
- Reason: a scenario should contain exactly the cards it declares, plus inert filler.

**D-194 · `hashState`, dev freeze, and what stays outside the engine**
- Date: 2026-10-14
- Question: Engine M4's `hashState` excludes `log` and includes `nActions`. Dev mode freezes the caller's action object. Several pieces were left out by design.
- Decision: Confirmed.
  - `hashState` uses explicit field lists with compile-time completeness checks, so it doesn't iterate keys. It excludes `log`, which records how the state was reached. It includes `nActions`, which identifies the position in the replay. A `graftBegin` + `graftCancel` pair changes `nActions`, and that is intended.
  - Freezing the caller's action in dev mode is fine. Actions are typed `readonly`, `getLegalActions` returns fresh objects, and production pays nothing.
  - These stay outside the engine:
    - objective and twist selection (D-102, D-103), so `objectives.json` isn't in `CompiledContent` and `newGame` takes a `twist` index;
    - `pickSignature`, which is called by `ai/difficulty.ts › prepareDay` (§12.5), not by `newGame`;
    - `view/redact.ts` and `meta/*`, which land with the ai and web work.
- Reason: as documented in §12.5 and §19.

**D-195 · Keyword and Flaw icon and visual ids** — owner ruled (A)
- Date: 2026-10-14
- Question: DESIGN gives a visual for each keyword ("Motion streaks", …) but no icons, and gives neither for Flaws. Content M3 chose these (`keywords/*.ts`):
  - Swift: icon `swift`.
  - Echo: icon `echo`, visual `faded-double-image`.
  - Pierce: icon `pierce`, visual `spear-notch-on-frame`.
  - Every Flaw: icon `<id>`, visual `<id>-frame`.
  The visuals are DESIGN's words in kebab-case. Sentinel, Ward and Haunt use §8.4's ids. The art and the UI will key on these asset names, so like D-130's values they are an art decision.
- Options:
  - (A) Keep content-author's ids as drafts. The placeholder art draws something for each id, and the art pass may rename them with a data edit (D-166). Flaws get a frame visual like keywords.
  - (B) The owner supplies names and visual concepts now.
  - (C) As (A), but Flaws get only an icon badge and no frame.
- Recommendation: (A). The ids are internal names and nothing in play depends on them. A frame for each Flaw follows DESIGN's "each keyword is shown as a visual frame or effect". Every Relic has exactly one Flaw, so its frame tells the player which weakness to exploit.
- Ruling (owner, 2026-10-14): (A). content-author's ids stay as drafts and Flaws get a frame. No change; the ids can be renamed in data later.

**D-196 · Keyword-file items already covered (content M3)**
- Date: 2026-10-14
- Question: content-author raised four keyword-file items that existing decisions may already cover: Haunt and Tethered text, missing examples, Sentinel's face-up check, and Slow's `SLOW_TURNS`.
- Decision:
  - **Haunt and Tethered text** hard-code "2 Power". D-172 covers this, and content-author migrates them to `{HAUNT_PENALTY}` and `{TETHERED_PENALTY}` as part of that work.
  - **No keyword has `examples`.** D-169 covers this. Each of the 11 keyword files gets at least one declared-card example, because DESIGN promises "tests auto-generated from its examples". `keyword-files.ts` warns on a file without one: `warning: keywords/x.ts › x › no examples › add one board-DSL example with declared cards (D-169)`.
  - **Sentinel's `restrictTargets: () => true`:** confirmed. The engine asks only active keyword bits (`hooks/dispatch.ts › attackTargets` uses `activeKwOf`, which is 0 for a face-down monster), so D-037's face-up rule holds without a check in the keyword.
  - **Slow ignoring `SLOW_TURNS`:** handled by D-183.
- Reason: no new rule is needed. The examples warning keeps DESIGN's promise of auto-generated keyword tests visible.

**D-197 · Compiled content: DefIdx order, family rows, hash coverage**
- Date: 2026-10-14
- Question: content-author asked about three choices in `compile.ts`:
  - the DefIdx order;
  - Chimera family rows with `pool = Player` and `element = kind = −1`;
  - a content hash that covers the parsed content and the keyword ids, but not globals or keyword code.
- Decision:
  - **DefIdx order:** confirmed: player monsters, Relics, player spells, player traps, Collector spells, Collector traps, then families in recipes.json order. Nothing outside `compile.ts` may depend on it.
  - **Pool order (changed):** `playerPool.monsters/spells/traps` are sorted by card id. Deckgen picks by pool position (D-005), so with JSON order a reordered file would change every generated deck.
  - **Family rows:** confirmed. A Chimera's owner is `Instance.owner` and its element is `ChimeraInfo.element` (D-129). Nothing reads `pool` for a family, since `{ relic }` requires `DefType.Monster`. That stays true if `canGraft` is ever turned on.
  - **Hash (changed):** §3 says the hash covers keyword text templates, but `compile.ts` hashes only keyword ids.
    - It now covers each `KeywordDef`'s data fields (`id`, `name`, `kind`, `icon`, `visual`, `text`) in bit order.
    - `examples` (tests only) and hook code stay out. A hook-code change is a code change, and the D-108/D-179 version rule protects saves from it.
    - In the web dev build, ui-dev restarts the duel on any content hot reload (D-176), not only when `cfg` changes.
    - Globals stay out of `CompiledContent.hash`, because `state.cfg` covers them (D-191).
- Reason: a pure reordering of a JSON file shouldn't change play, and the hash should cover what §3 says it covers.
- Amended by D-210: the hash already covers `collector.json › ai`, because it hashes the whole parsed content. This is confirmed as required. `compileContent` now also returns the AI block (`GameContent`).

**D-198 · Validator keyword rules and messages**
- Date: 2026-10-14
- Question: Content M3 made several validator calls about keywords that §10.3 doesn't settle:
  - the default registry;
  - extra keyword-file checks, and where they run;
  - rejecting a Flaw in a keyword slot;
  - `Cond { keyword }` accepting Flaw ids;
  - the wording for an unregistered Flaw.
- Decision:
  - **Default registry:** confirmed as the generated barrel (D-111).
  - **Kebab-case and empty-field checks on keyword files:** confirmed, as part of §10.3's "keyword file problems". Ids are kebab-case everywhere (§10.2 `Id`), and §8.4 requires the display fields.
  - **A Flaw in a `keywords` list is an error**, alongside §10.3's keyword-as-Flaw rule. It would give a Relic a second Flaw (D-114) or put a Flaw on a player card, and DESIGN forbids both.
  - **`Cond { keyword }` accepts Flaw ids:** confirmed. A condition may test a Flaw, for example a twist like "Brittle monsters −1 Guard", and it reads active bits the same way as for a keyword.
  - **Unregistered-Flaw message:** `cards/relics.json › x › Flaw "frail" is not registered › use one of: brittle, covetous, slow, tethered, vain, or add packages/content/keywords/frail.ts`. Added to §10.3.
  - **Changed (later):** the checks that need only the registry move from `keyword-files.ts` into `validateContent`, so the browser dev build (D-176) reports them too. These are duplicate ids, kebab-case, empty display fields, the sentence count on the rendered text (D-172 rule 7), and the 32-keyword limit. `keyword-files.ts` keeps the checks that need the files: id = file name, load failures, the `$NAME` source scan (D-171) and barrel staleness.
- Reason: each rule follows from DESIGN or an earlier entry. Running the pure checks everywhere means the web dev build catches the same problems as `content:check`.

**D-199 · `GlobalsSchema` sanity checks and `withOverrides` errors**
- Date: 2026-10-14
- Question: Content M3's `GlobalsSchema` uses decimals for a few keys and `z.int()` elsewhere. It has no non-negativity or star-cut ordering check, and its `WARD_CHARGES` fix text is generic. `withOverrides` throws a single multi-line `Error` and accepts a whole-object `FLAGS={…}`.
- Decision:
  - **Number types:** confirmed. Only the listed rates and ranges are decimals, and every other number is `z.int()`.
  - **New sanity refinements**, in the §10.3 format (`globals.ts › KEY › problem › fix`):
    - Every numeric global and every `CONTENT_NUMBERS` value must be ≥ 0, since signs are written outside the number (D-172): `must be 0 or more › use 0 or more`.
    - `SEED_WINRATE_MIN`, `SEED_WINRATE_MAX`, `BOT_NOISE_EPSILON`, `TARGET_NOVICE_POINT`, `TARGET_SEED_REJECT_MAX` and both `DIFFICULTY_STAR_CUTS` lie in 0…1.
    - `SEED_WINRATE_MIN ≤ SEED_WINRATE_MAX`.
    - `DIFFICULTY_STAR_CUTS` is strictly descending (D-098, D-126): `cuts must descend, got [0.4, 0.6] › write the higher (1-star) cut first`.
  - **One pin message:** `WARD_CHARGES` and every D-170 pin share one form: `globals.ts › WARD_CHARGES › must be 1 until the engine supports other values › keep 1`.
  - **`withOverrides` errors:** it throws `OverridesError extends Error`, exported from the content root.
    - It carries `errors: readonly ContentError[]` (file `globals.ts`, entry = the key), and its `message` is the `formatError` lines.
    - The sim CLI prints those lines and exits non-zero. The web dev build shows them like content errors (D-176).
    - Zod's default wording stays only where no refinement sets a message.
  - **Whole-object overrides of `FLAGS` and `CONTENT_NUMBERS` are rejected:** `globals.ts › FLAGS › set one entry at a time › write FLAGS.<NAME>=<value>`, and the same with `CONTENT_NUMBERS.<NAME>=<value>`. For `CONTENT_NUMBERS` a whole object could add a name, which D-171 forbids for `--set`. Arrays and ranges are still set whole (`APPRAISAL_ROUNDS=[3,6]`).
- Reason: these checks catch tuning typos that would otherwise surface as odd sim results. Structured errors let the sim and the web show the same §10.3 lines.

**D-200 · Deck-generation feasibility check**
- Date: 2026-10-14
- Question: §10.3, D-005 and D-168 require `content:check` to prove deck generation feasible on 1,000 test dates. The rule was deferred until the engine's `setup/deckgen.ts` existed, and it now does.
- Decision:
  - **Engine export:** the engine root exports `deckForSeed(c, g, seed): DefIdx[]`, defined as `generateDeck(c, g, stream(seed, 'deck'))`. That is exactly what `newGame` runs, and ai's `prepareDay` uses it too.
  - **The check:** `packages/content/src/feasibility.ts` (pure and browser-safe) exports `checkDeckgen(c, g): ContentError[]`.
    - It runs `deckForSeed` on `rerollSeed(seedString(g, date), 0)` for 1,000 consecutive ISO dates starting at 2026-01-01. The start date and the count are named constants in the file; they are check parameters, not rule numbers.
    - It catches `EngineError` only and counts the failing dates.
    - Any failure produces one error: `cards/player-monsters.json › pool › deck constraints unsatisfiable on 3 of 1000 test dates › relax DECK_MIN_ELEMENTS, DECK_MIN_KINDS or the CURVE_* globals, or add monsters`.
    - It is skipped when the pool-capacity rule (D-170) has already failed, because every date would then fail for that reason.
  - **Callers:** `scripts/content-check.ts` calls it after `compileContent`, and the web dev build may call it after compile (D-176). The entry in `DEFERRED_RULES` is removed.
- Reason: the check runs the shipping generator rather than a copy, so it can't drift from it.

**D-201 · `MAX_BASE_KEYWORDS` is read by the validator, with a counted message** (amends D-173)
- Date: 2026-10-14
- Question: D-173 was never built. `schemas/card.ts` still has `keywords: z.array(Id).max(1)`, nothing reads `MAX_BASE_KEYWORDS`, and raising it does nothing (`guide.test.ts` §4 pins that). The real output is zod's `keywords: ["swift","sentinel"] is above the maximum 1 › use 1 or less`. D-173's message has no field part and no count.
- Decision: D-173 is confirmed, with this message.
  - Drop `.max(1)` from `PlayerMonster.keywords`. `Relic` extends it, so it changes too.
  - `validate.ts` checks every base monster and every Relic: `keywords.length ≤ g.MAX_BASE_KEYWORDS`. It is an error, with field `keywords`:
    `cards/player-monsters.json › example-beast › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword`
    The same text applies to `cards/relics.json`. Counts use the existing `plural()` helper (`has 1 keyword, max MAX_BASE_KEYWORDS=0 › remove 1 keyword`). The fix names only the card edit. The guide explains that the global sets the limit for every base card.
  - Chimeras are not checked here. Their limit is `MAX_INHERITED_KEYWORDS`, applied by `graft.ts`.
  - Delete "a base card with more than one keyword (keywords .max(1))" from the "Covered by the zod pass" comment in `validate.ts`.
- Reason: one number, read in one place. The message says what to remove and which global sets the limit.

**D-202 · `RELIC_FLAWS` is pinned to 1**
- Date: 2026-10-14
- Question: no code reads `RELIC_FLAWS`, and `GlobalsSchema` accepts any integer for it, although D-170 and §10.3 use it as the example of a pinned global. "Exactly one Flaw" is enforced by the card format instead: `Relic.flaw` is a single required id.
- Decision: pin it. `RELIC_FLAWS: pinned(1)` in `schemas/globals.ts`, with the shared D-199 message `globals.ts › RELIC_FLAWS › must be 1 until the engine supports other values › keep 1`. The global stays, because DESIGN makes every number a global ("Each Relic has exactly one"). More than one Flaw would need a format change (`flaws: []`), engine work and a DESIGN rule change, so only an owner-approved entry removes this pin.
- Reason: a pin is one line, and it turns a silent no-op into an error. Removing the global would need an engine type edit and gain nothing.

**D-203 · The Collector's ace must be a Relic in his deck**
- Date: 2026-10-14
- Question: only the Covetous rule reads `collector.json › ace`. An unknown id passes `validateContent`, and then `compile.ts › lookup` throws an unformatted `compile: unknown card id "…"`. A Collector spell named as the ace compiles without complaint, and AI rule 2 is then dead. Must the ace exist? Must it be a Relic, be in the deck, or carry Covetous?
- Decision: three rules in `validate.ts › checkCollector`. They run when `relics.json` and every pool file parsed. The entry is `ace`, with no field, like `collector.json › deck › …`.
  1. The ace is an id in `cards/relics.json`. Otherwise: `collector.json › ace › "no-such-relic" is not a Relic › use a Relic id from cards/relics.json`. The message is the same whether the id is unknown, a player card, or a Collector spell or trap.
  2. The ace is in the deck list. D-168 already lists "a Collector deck … that contains the ace" as a `content:check` invariant. Otherwise: `collector.json › ace › "the-unpriced" is not in the deck › add it to the deck list in collector.json`. This is checked only when rule 1 passes.
  3. The ace doesn't have to carry Covetous. DESIGN says Covetous is ace-only, not that the ace must be Covetous, and the Flaw is a card field (D-166). The existing "Covetous is ace-only" rule stays.
- Reason: DESIGN's ace is one of the 20 deck cards, and AI rule 2, Covetous and the M-04 lever all look it up. A wrong id should produce a `content:check` line, not a crash in compile or a rule that never fires.

**D-204 · `castHighValueSpell` is keyed by Collector spell id** (amends D-145's schema; generalises D-087; D-177 is built with it) [REVIEW]
- Date: 2026-10-14
- Question: `schemas/collector.ts` makes `params.castHighValueSpell` a strict object with exactly three keys: `forfeit`, `restoration` and `gilt-frame`. A new Collector spell that the AI should cast is refused (`collector.json › ai › params.castHighValueSpell: unknown key(s) example-collector-purge › remove example-collector-purge`), so it needs a schema change. But D-145's cross-file rule already treats the keys as spell ids, and D-177's warning tells the owner to "add "x" to ai.params.castHighValueSpell with a pick". D-177 itself is not built.
- Decision:
  - **Schema.** `castHighValueSpell: z.record(Id, CastWhen)`. `CastWhen` is `z.object({ pick: z.exactOptional(AI_PICK), when: z.exactOptional(AI_WHEN) }).strict()`, refined to exactly one of the two, with `params.fix` (rendered per D-207): `collector.json › ai › params.castHighValueSpell.x: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"`. Base and mood params share the shape. A new `pick` or `when` mode is still a code change: one enum value plus its handler, covered by D-145's ai mirror test.
  - **Semantics (ai).** These generalise D-087 and don't change the three launch spells.
    - `{ "pick": "highestPower" }`: the spell qualifies when it has at least one legal cast choice. The AI casts it on the target with the highest effective Power that the view shows (face-down monsters are skipped, D-086), with ties broken by `tieBreak`. An untargeted spell has one choice. For Forfeit and Restoration this is exactly D-087, because their target specs already encode "Power ≤ `$FORFEIT_MAX_POWER`" and "a Relic in his discard".
    - `{ "when": "contestedAttack" }`: D-087's Gilt Frame test. In place of the literal +2, it uses the Power the spell gives `chosen`: the resolved `power` of its `modifyStats` effect on `chosen`.
    - **Order.** The candidates are the spells in his hand that have an entry, in card-id order (D-090). The first one that qualifies is cast. The key order in the JSON never matters.
    - **Moods.** A mood's `params.castHighValueSpell` merges over the base per spell id. A mood entry replaces the base entry for that id, and base entries the mood doesn't name stay. Other rule params merge per key the same way, as `summonFallback`'s partial override already does.
  - **Validator.**
    - D-145's rule stays: each key must be a Collector spell in the deck. Its field becomes the real JSON path: `collector.json › ai › params.castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck`. The mood form keeps `moods.<mood>.params.castHighValueSpell.<id>`.
    - New error. A `when: contestedAttack` entry on a spell with no `modifyStats` effect giving Power to `chosen` could never fire: `collector.json › ai › params.castHighValueSpell.x: "contestedAttack" needs a spell that gives Power to "chosen" › use "pick": "highestPower" instead`.
    - D-177's two warnings are built as written, in `checkCollector`.
  - **Ownership (owner ruling, 2026-10-14; amends D-166).** `castHighValueSpell` entries and `trapPreference` ids are card lists, like `deck`: the owner adds or removes them freely when adding or removing a Collector card, with no D-entry. The rule lists, mood rule lists, `reposition` and the other `collector.json › ai` params stay owner-only under D-166.
  - **Edit count.** A new Collector spell that the AI casts takes three data edits: the card, its deck line and its `castHighValueSpell` entry. Its art brief is only a warning. A missing AI entry is a D-177 warning. No code changes.
- Reason: the keys were always spell ids (D-145, D-177). With fixed keys, the AI was the one place where new content needed code. The AI's vocabulary is the modes, not the spell ids, so the closed enums move to the values.
- Amended by D-219:
  - `contestedAttack` applies the cast to a redacted copy and compares combat previews, instead of reading the resolved `power` of a `modifyStats` effect.
  - The validator's check resolves `$NAME` references and requires a resolved Power above 0.

**D-205 · Unread globals: pinned, planned, or read, kept true by a test** (amends D-170)
- Date: 2026-10-14
- Question: D-170 promised that no global is accepted and then ignored. The inert list was never written into the repo.
  - `RELIC_FLAWS` and `MAX_BASE_KEYWORDS` were unread and unpinned (D-201, D-202).
  - `OBJECTIVES_PER_DAY`, `OBJECTIVE_STARS_MAX`, `RESET_HOUR_LOCAL`, `FLAGS.BONUS_OBJECTIVES`, `FLAGS.ANIMATIONS` and `FLAGS.DEBUG_OVERLAY` wait for code that isn't built: engine `meta/`, ai and web.
  - D-170's prefix exemption (`AI_*`, `SIM_*`, `TARGET_*`, …) is a blind spot that stays open after ai and sim land.

  Pinning a planned global to today's value would copy the value, and it would need a manual unpin later that nothing reminds anyone to do.
- Decision: every core global and every flag is in exactly one of three states, and a test keeps the states true.
  1. **Read:** some non-test source reads it. It needs no mark.
  2. **Pinned:** the code supports only one value, an engine or format limit. `GlobalsSchema` pins it (D-170, D-199). The pins today are `WARD_CHARGES`, `PLAYS_PER_TURN`, `REPOSITIONS_PER_TURN`, `ATTACKS_PER_TURN`, `MIN_GRAFT_MATERIALS`, `RELIC_FLAWS` (D-202) and `FLAGS.ACE_SET_ASIDE` (D-184). As before (D-170), a pin is removed in the change that teaches the code the key.
  3. **Planned:** its reader is a module that isn't built yet. It is listed in a new file, `packages/content/src/planned-globals.ts`, which is browser-safe and exported from the content root:
     ```ts
     export interface PlannedGlobal { readonly reader: 'engine' | 'ai' | 'sim' | 'web'; readonly where: string }
     export const PLANNED_GLOBALS: Readonly<Record<string, PlannedGlobal>> = {
       OBJECTIVES_PER_DAY: { reader: 'ai', where: 'ai/difficulty.ts › prepareDay (D-102)' },
       'FLAGS.ANIMATIONS': { reader: 'web', where: 'web duel store (§16)' },
       // …
     };
     ```
     Flags are written `FLAGS.<NAME>`. A planned global is **not** pinned. Any value that passes the sanity checks is accepted and takes effect when its reader lands, so there is no copy of the value and nothing to unpin. The list replaces D-170's prefix exemption. Its first contents are whatever the tripwire below reports as unread and unpinned. Today that is the six keys above, plus `SIM_RUNS_PER_SEED`, `SIM_QUICK_GAMES`, `SIM_FULL_GAMES`, `SIM_SEED_CHECK_DATES`, `SEED_WINRATE_MIN`, `SEED_WINRATE_MAX`, `SEED_MAX_REROLLS`, `BOT_NOISE_EPSILON`, `DIFFICULTY_STAR_CUTS`, every `TARGET_*` and `PERF_DUELS_PER_SEC_PER_CORE`.
  - **Visible, not silent.** When `content:check` succeeds and the list isn't empty, it prints one more line after the counts. The count and the readers (sorted) are computed from the list:
    `not yet read: 28 globals wait for ai, engine, sim, web › see packages/content/src/planned-globals.ts`
    CONTENT_GUIDE §7 explains the line.
  - **Reader tripwire.** This is `packages/content/test/globals-readers.test.ts`, a Node test.
    - **What it reads.** The comment-stripped text of every non-test `.ts`/`.tsx` file under `packages/*/src`, `packages/content/keywords` and `apps/*/src`, plus every `"$NAME"` in the content JSON.
    - **What it skips.** `*.test.ts`, `test-utils/`, `dist/`, and the four files that define the keys: `engine/src/types/globals.ts`, `content/src/globals.ts`, `content/src/schemas/globals.ts` and `content/src/planned-globals.ts`. Any other excluded file needs a comment saying why.
    - **Read and pinned.** A key is read when its name appears in that text as a whole word. A key is pinned when `GlobalsSchema` refuses a changed value (number + 1, or the flag negated) with the D-199 pin message.
    - **What it asserts.** Three things, each failing with a line that names the fix:
      - A planned key that is now read: `OBJECTIVES_PER_DAY is in planned-globals.ts but packages/ai/src/difficulty.ts reads it › delete its line from planned-globals.ts`
      - A key that is not read, pinned or planned: `RESET_HOUR_LOCAL is read by no code › wire it, pin it in schemas/globals.ts, or add it to planned-globals.ts`
      - A key that is both pinned and planned: `FLAGS.ACE_SET_ASIDE is both pinned and planned › keep one`

    So the change that wires a planned global fails its own tests until the line is deleted. Nobody has to remember.
  - **Unused content numbers.** A `CONTENT_NUMBERS` entry that nothing references is the same silent no-op. It is typically left behind by a deleted card. `content:check` warns: `warning: globals.ts › CONTENT_NUMBERS › QUILL_TOLL: not used by any card, objective, AI param or keyword › delete the line, or use $QUILL_TOLL in an effect`.
    - Any of these counts as a use: a `$NAME` anywhere in the data, a `{NAME}` in card, objective, twist or keyword text, or a `'$NAME'` / `num('NAME')` literal in a keyword source (the D-171 scan in `keyword-files.ts`).
    - The last kind needs the source files. So `validateContent` takes the keyword-source refs as an optional fourth argument and runs this rule only when it is given. `content:check` gives it; the browser dev build doesn't.
- Reason: three states plus a test cover every key and keep themselves current. A planned global needs no copy of its value and no unpin. The tripwire catches both directions (wired but still listed, unread but unlisted), including the ai and sim keys that D-170's prefixes would have hidden for good.

**D-206 · A whole-entry problem has no field part; `(file)` stays as the entry of a whole-file problem** (confirms D-165)
- Date: 2026-10-14
- Question: `files.ts › fieldName` returns `(entry)` for an issue on the entry itself, so lines read `cards/relics.json › r1 › (entry): unknown key(s) flaw › remove flaw`. `load.ts` sets the field to `(file)` for a missing or unreadable file. D-165 and §10.3 say the field part is omitted. Which is right?
- Decision: D-165 is right.
  - `fieldName([])` returns `''`, so `formatError` omits the field: `cards/relics.json › r1 › unknown key(s) foo › remove foo`.
  - `load.ts` read errors use field `''`: `elements.json › (file) › file is missing › create elements.json` and `elements.json › (file) › invalid JSON (…) › fix the JSON syntax`.
  - `(file)` stays in the **entry** slot whenever a problem belongs to a whole file: read errors, a top-level zod issue, and `keywords/index.gen.ts › (file) › stale, does not match keywords/*.ts › run pnpm content:gen`. Every line keeps the format `<file> › <entry> › [<field>: ]<problem> › <fix>`.
  - Nothing prints `(entry)` any more.
- Reason: one format, as documented. The entry slot is required, so it needs a stand-in. The field slot is optional, so a stand-in there is noise.

**D-207 · Plain-language parse messages for the mistakes a non-engineer makes most**
- Date: 2026-10-14
- Question: zod's generic wording reaches the owner for three common mistakes:
  - a missing field: `flaw: expected string, got undefined › write a string value`;
  - a Flaw on a base monster: `unknown key(s) flaw › remove flaw`, which doesn't say why;
  - refinements whose fix is the generic `fix the value so it matches packages/content/src/schemas`.

  Which of these are worth a code change in `files.ts › describeIssue`?
- Decision: four changes, all in `describeIssue`, which now also gets the file path from `parseFile`. All other wording stays (`got "rounds" › use one of: …`, `is above the maximum`, `expected number, got "7" › write numbers without quotes`), because its fix already lists what to write.
  1. **Missing field:** any issue whose path ends at a key that is absent from its object. `<field>: missing › add "<key>"`, for example `cards/player-monsters.json › example-beast › power: missing › add "power"`.
  2. **Missing Flaw:** case 1 for `flaw` in `cards/relics.json`. `cards/relics.json › example-relic › flaw: missing, a Relic needs exactly 1 Flaw › add "flaw": "<flaw id>"`.
  3. **Flaw on a base monster:** an `unrecognized_keys` issue in `cards/player-monsters.json` whose only key is `flaw`. `cards/player-monsters.json › example-beast › Flaws appear only on Relics › remove "flaw"`. If there are other unknown keys too, the generic line lists them all.
  4. **Refinement fixes:** a `custom` issue uses `params.fix` when the schema sets it, as `globalsProblems` already does. The objective refinement gets `params: { fix: 'keep exactly one of "lte" or "gte"' }`, which prints `objectives.json › x › needs exactly one of "lte" or "gte" › keep exactly one of "lte" or "gte"`. D-204's entry refinement uses the same mechanism.
- Reason: these are the lines the owner will see most when following the guide's §4. Each takes a few lines in one function, and none changes what is accepted.

**D-208 · §10.3 examples follow the real output; a message change updates the guide, its test and the changelog in the same commit**
- Date: 2026-10-14
- Question: several §10.3 example lines no longer match `content:check`: `keywords/index.gen.ts › stale`, `unknown metric "rounds"`, the `CONTENT_NUMBERS` clash text, and the keyword-limit and Flaw lines. CONTENT_GUIDE quotes the real text, and `guide.test.ts` asserts it verbatim, so a wording change in code can break the guide.
- Decision:
  - §10.3 shows the real text, or the target text that D-201…D-207 specify, marked with its D-number until the code lands.
  - A change to any message that `content:check`, `withOverrides` or the validator prints updates all of these in the same commit:
    - the code and its unit tests;
    - every CONTENT_GUIDE quote of the message;
    - `guide.test.ts`;
    - §10.3, if the message is listed there;
    - one line in `docs/CHANGELOG.md`.
  - `docs/CHANGELOG.md` (new, docs-keeper) is the owner-facing log of the tooling changes he will notice: new or changed `content:check` lines, newly pinned or planned globals, and new edit steps. Each change gets a dated section, and each line ends with its D-number. It is not a commit log.
- Reason: the guide is only useful while it matches the tool. Bundling the edits turns drift into a failing test in the same change, and the changelog tells the owner why a familiar line changed.

**D-209 · Read-only engine queries are methods on the `Engine` facade; `ai/shared/mirror.ts` is deleted** (extends D-083, D-131, D-150)
- Date: 2026-10-14
- Question: The engine root exports none of `effectivePower`, `effectiveGuard`, `previewCombat`, `attackPermission` or `mustAttack`, because each needs the internal `Env` (D-131).
  - So AI milestone 1 recomputes them in `packages/ai/src/shared/mirror.ts`, about 440 lines covering stats, conditions, twist modifiers, the hook folds and the resolve table.
  - `ai/test/mirror.test.ts` checks it against engine events over 100 live-content duels.
  - That makes a second implementation of the rules, the kind of drift §6.2 rules out for legality.

  What is the public API that replaces it? Where does it live? Which helpers from `mirror.ts` and `brain.ts` (`previewSummon`, the `after`/`winsAfter` look-ahead, `scrub`) should move to the engine?
- Decision:
  - **Where.** The queries are methods on the `Engine` that `createEngine` returns, next to `getLegalActions`. They are not root functions taking `(content, globals, state)`, because those would have to rebuild the `Env` on every call (the hook registry and the compiled traps) or hide a cache in module state. The facade already holds the `Env`, and the AI already owns an engine for legality (`Brain.engine`).
  - **Methods.** The state comes first. `iid` is any instance id.
    ```ts
    effectivePower(s, iid): number         // D-031, no element bonus, ≥ STAT_FLOOR; off the board: printed (+ Ascend)
    effectiveGuard(s, iid): number
    printedKeywords(s, iid): KwMask        // definition bits | Chimera-inherited bits
    activeKeywords(s, iid): KwMask         // 0 off the board or face-down; a used Ward's beforeDestroy bits removed (D-037, D-133)
    elementOf(s, iid): ElemIdx             // a Chimera's is its first material's; -1 for spells and traps
    kindOf(s, iid): KindIdx                // -1 for Chimeras, spells and traps (D-129)
    attackPermission(s, iid): AttackPerm   // the §6.2 lattice: summoning sickness, the round-1 ban, grants, restrictions; 'none' off the board
    attackRestriction(s, iid): AttackPerm  // the restriction fold alone, 'any' when no hook restricts (D-212)
    mustAttack(s, iid): boolean            // OR of the active mustAttack hooks (Vain)
    previewCombat(s, attacker, target: Iid | -1): CombatPreview   // §5.4 without side effects
    previewGraft(s): GraftPreview | null   // §5.6
    ```
    - The root also exports the types `CombatPreview`, `CombatOutcome` and `GraftPreview`.
    - `previewCombat` is the engine's existing `combat.ts › previewCombat`. It doesn't reveal, trigger traps or queue effects. `beforeCombat` hooks run into a sink that discards their effects, so Pierce and Brittle show in the result. A face-down target gives `{ known: false }`, and an attacker or target that isn't on a board throws `EngineError`.
    - There is no "extra Power" parameter. To ask what a buff would do, apply the cast to a redacted copy (D-219).
  - **Purity.** Each method is a pure function of the bound content, the bound globals and its arguments:
    - it never writes `s` and keeps no reference into it;
    - it reads no clock and no random source;
    - it works on a `Tx` draft and on a frozen state;
    - a call never changes the engine (no caches).
  - **Performance.** Each method calls straight into `stats.ts`, `hooks/dispatch.ts`, `combat.ts` or `graft.ts` with the bound `Env`. There is no `Env` per call and no state copy. Only `previewCombat` and `previewGraft` allocate (their result and one dispatcher). §18's budget of about 5 µs per action holds.
  - **Redaction moves to the engine.** `brain.ts › scrub` becomes `redactState(s, viewer): GameState` in `engine/src/view/redact.ts`, exported from the root. It is pure and needs no `Env`.
    - It empties the opponent's hand, the opponent's deck and every opponent trap slot. It also empties the viewer's own deck, because its order is unknown even to him. It sets `log: null`. Everything else is shared by reference.
    - It lives next to `redactEvent` because it encodes which parts of `GameState` are hidden. A new hidden zone, such as D-184's `aside`, is then redacted by the same change that adds it.
    - **What it doesn't hide.** A face-down opponent monster keeps its identity, because the board needs it for legality. So look-ahead code must never apply an action that targets a face-down opponent monster (an attack on it, or a cast on it). `ai` makes that check in one helper (below).
  - **What stays in `ai`.** `previewSummon`, `after`, `winsAfter`, `winningAttacks` and `attackPotential` are AI search policy, not rules.
    - They are built from `applyAction` on a `redactState` copy plus the queries above, in one helper file, `ai/src/shared/look-ahead.ts`. The helper returns null for an action that targets a face-down opponent monster.
    - `previewSummon` applies the summon (attack mode) to the copy and queries the result, so `ai` never builds a `Monster` record by hand.
    - The copy is made once per decision and shared by that decision's look-aheads.
    - Small locating helpers (the slot of an iid) stay in `ai`, because they only read the public state shape.
  - **Tests.**
    - `ai/test/mirror.test.ts` is deleted together with `mirror.ts`.
    - Its check becomes an engine property in `properties.test.ts`. It runs on fixture content (D-168) under `TEST_GLOBALS` and `ALT_GLOBALS`, and once more with a fixture twist and `FLAGS.WEEKLY_TWIST` on. In a random walk, take every legal attack on a face-up target with no trap set on either side. `previewCombat` must equal the `CombatResolved` fields (`aP`, `dStat`, `advantage`, `pierce`, `brittle`, `destroyed`) and both life changes. For a direct attack it must equal the `Damage` amount.
    - A second property: two states that differ only in hidden information give equal `hashState(redactState(s, viewer))`.
    - Unit tests cover each facade method on fixture cards.
- Reason: every rule has one implementation. The facade binds the `Env` once, so a query costs what the engine's own call costs, and the dependency direction (§2) doesn't change. Redaction depends on the state shape, which the engine owns.

**D-210 · The compiled content carries `collector.json › ai`** (extends D-145, D-197)
- Date: 2026-10-14
- Question: `ai` reads the AI block with `parseContent(RAW_CONTENT)` (`liveCollectorAi()`), and `createCollector({ ai })` takes an override.
  - The bundled files and the compiled content can differ: sim overrides of `collector.json` for the M-08, M-10 and M-13 A/B runs, web hot reload, test fixtures.
  - When they do, the AI silently plays the bundled block unless every caller remembers to pass `ai`.

  Should the compiled content carry the block? Should it go into the content hash and `state.cfg`?
- Decision:
  - **Type.** `compileContent` returns `GameContent`, a type that the content package owns:
    ```ts
    interface GameContent extends CompiledContent {
      readonly collector: CompiledContent['collector'] & { readonly ai: CollectorAiConfig };
    }
    ```
    `CollectorAiConfig` is the parsed `collector.json › ai` (`z.output<typeof CollectorAi>`). It is exported from the content root and deep-frozen. The path matches the JSON path.
    - The engine's `CompiledContent` doesn't change, and the engine still knows nothing about the AI. A `GameContent` is a valid `CompiledContent` for `createEngine`.
  - **Hash.** Nothing changes. D-197's hash already covers the whole parsed content, `collector.json` included, so an edit to the AI block changes `CompiledContent.hash` and therefore `state.cfg`. That coverage is required: replays recompute the stored intent with the policy (D-096), so a replay under a different AI block would diverge.
  - **ai.** `createCollector({ content: GameContent, globals })`. The `ai` option and `liveCollectorAi()` are removed, which leaves one source.
    - A test that needs a different block builds it through content, either with a fixture or with `{ ...content, collector: { ...content.collector, ai } }`. The spread leaves the hash stale, so it is for tests only.
    - The sim applies `collector.json` overrides to the raw content before compiling (§15), so A/B levers reach the AI with no extra plumbing.
    - The web recompiles on hot reload (D-176) and builds a new Collector from the result.
- Reason: there is one path from the file to the AI, so an override can't be silently ignored (the D-170 principle). The engine gets no AI type.

**D-211 · The win search's node budget is the core global `AI_SEARCH_NODE_BUDGET`** (extends D-082, D-171)
- Date: 2026-10-14
- Question: `ai/collector/win-search.ts` caps each "can he win this turn" search at 600 nodes with a module constant. Should that be a global or an implementation constant?
- Decision: it is a core global, `AI_SEARCH_NODE_BUDGET: 600`. That is ai-dev's value, not a new one.
  - `ai` reads it as a property, so under D-171 it is a core global:
    - engine `Globals` and `TEST_GLOBALS`;
    - content `DEFAULT_GLOBALS`, in a new "Collector AI" group;
    - `GlobalsSchema`, as an integer of at least 1.
  - It is listed in `planned-globals.ts` (reader `ai`) until `ai` reads it. The `ai` change that reads it deletes the line (D-205).
  - It is a safety cap like `MAX_TRIGGER_CHAIN` and `DECKGEN_MAX_ATTEMPTS`.
    - With `BOARD_SLOTS = 3`, a full search is at most about 225 nodes: at most 3 attackers, each attacking once, with at most 3 targets each. So the cap never binds at launch values.
    - A larger `BOARD_SLOTS` can make it bind. Then it changes what he does, so it has to be tunable in one place and hashed into `state.cfg` like every other global.
- Reason: a number that can change the Collector's play is a global (§1.3), with `MAX_TRIGGER_CHAIN` as the precedent.

**D-212 · Rule 6's "not Slow": an active keyword restricts attack permission to `none` on the entry turn** (extends D-084)
- Date: 2026-10-14
- Question: How does the AI know that a hand monster is Slow? With `SLOW_TURNS = 1`, Slow changes nothing in practice (D-053), so the folded attack permission on the entry turn is `none` for every non-Swift monster and can't tell them apart.
- Decision: ai-dev's reading is confirmed, now through the engine query.
  - Summon the card in attack mode on the redacted copy (D-209). It is Slow for rule 6 when `attackRestriction(copy, iid) === 'none'`.
  - This is generic: any keyword whose `attackPermission` hook restricts to `none` on the entry turn counts. The AI finds it by hook, not by Flaw id, the same way the engine finds Ward (D-162).
  - It works unchanged under M-01 (`SLOW_TURNS = 2`).
- Reason: rule 6 means "a monster held back from attacking", and the restriction fold is exactly that. No Flaw id appears in code.

**D-213 · Rule 2 (the ace): attack position, and a vault sacrifice before a board one** (extends D-054, D-089, D-203)
- Date: 2026-10-14
- Question: ai summons the ace in attack position. When several Covetous sacrifices are legal, it takes the weakest by Power, a board monster before a vault one, then `tieBreak`. Neither DESIGN nor D-054 says which acquired monster he sacrifices.
- Decision:
  - **Position:** attack, confirmed. D-089 lets only rule 6 summon in guard.
  - **Normal summon first:** confirmed. If the engine lists a normal summon of the ace (D-203 doesn't require the ace to carry Covetous), that is taken first.
  - **Sacrifice order (changed):** a vault monster first, then a board monster. Within a zone, the lowest Power goes first (board: effective Power; vault: printed Power), then `tieBreak` (board: leftmost slot; vault: card id, then instance id).
- Reason: a vault card has no use except as this sacrifice (D-078), while a board monster attacks and blocks. A vault sacrifice never costs him board, so board-first would throw away a live monster to keep a dead card. When his board is full, only a board sacrifice is legal (a slot must be free after the sacrifice), and the engine's legal list already says so.

**D-214 · `allowFaceDown: true` makes his guard summons face-down** (extends D-025)
- Date: 2026-10-14
- Question: `collector.json › ai.allowFaceDown` exists (D-025) but has no written meaning. ai-dev made a guard summon go face-down when it is on.
- Decision: confirmed. The flag stays `false` (D-025) and is owner-only like the other AI params (D-166).
  - When it is `true`, every summon that a rule makes in guard position is face-down guard instead of face-up guard. Those are rule 6's guard cases: Composed's `guardUnlessBeater`, and the all-Slow case (`slowPosition: guard`).
  - Attack-position summons (rules 2 and 3, and rule 6 in attack) don't change.
  - When it is `false`, no rule summons face-down.
  - With the flag on, the player bots face face-down Collector monsters, and look-ahead must not peek at them (D-209).
- Reason: a schema field must do something when it is changed (D-170). Face-down is one way of being in guard (D-037), so this reading leaves each rule's position choice intact.

**D-215 · Which trap rule 4 and play step 7 set** (extends D-085, D-088)
- Date: 2026-10-14
- Question: D-088 orders traps by `trapPreference` for rule 4. D-085's step 7 says "set a trap if he holds one". What happens with a held trap that isn't on the list?
- Decision: ai-dev's reading is confirmed.
  - Rule 4 sets only the first held trap in `trapPreference` order. D-177's warning ("AI rule 4 never sets it") assumes this.
  - Step 7 (`utility.setTrap`) sets the first held trap in `trapPreference` order. Otherwise it sets any other held trap, by card id, then instance id.
- Reason: rule 4 is driven by the preference list. Step 7 literally says "a trap", so an unlisted trap is still played rather than staying a dead card.

**D-216 · `guardUnlessBeater` with no face-up opposing monster summons in attack** (extends D-081)
- Date: 2026-10-14
- Question: Composed summons in guard "unless the monster's Power exceeds your strongest face-up monster's Power". What if you have no face-up monster?
- Decision: confirmed. With no face-up opposing monster, the summon goes in attack position. Face-down monsters aren't compared, because only public information counts (D-082, D-086).
- Reason: with nothing to compare, nothing stops the summon from counting as exceeding. A guard summon facing an empty board would also waste his next attack.

**D-217 · `toAttackIfUsable` runs the mood's rules on a redacted copy** (extends D-089)
- Date: 2026-10-14
- Question: D-089 says a guard monster switches to attack only if that gives it an attack under rule 1, 2 or 4 this turn. How exactly is that tested?
- Decision: ai-dev's reading is confirmed.
  - Rules 1, 2 and 4 are `lethal`, `killWithoutLoss` and `directIfEmpty`. Each counts only when it is in the current mood's attack list.
  - The test is exact: apply the reposition to the redacted copy (D-209), then run those rules on the copy's view. If one of them returns an attack by that monster, he switches.
  - His face-down monster is in guard position (D-037), so it may flip to attack under the same test. The flip reveals it (D-161).
  - He considers one reposition at a time, in slot order, and the policy asks again after each one. That gives D-089's "zero or more".
- Reason: "gives it an attack under rule 1, 2 or 4" is a statement about what those rules would do, so running them is the exact test. A rule that isn't in the mood's list can't give an attack.

**D-218 · Attack rule 2 (`killWithoutLoss`): trades, the trade test, and which attacker** (extends D-081, D-092; the attacker choice is an owner item)
- Date: 2026-10-14
- Question: ai-dev made three choices that D-081 and D-092 don't settle:
  - Agitated's trades rank after clean kills and after Ward strips.
  - The trade test compares Power without the element bonus.
  - For a given target, the strongest attacker that can kill it takes the kill (D-090 read literally), not the weakest one that is enough.
- Decision:
  - **Ranking (changed):** clean kills first, then trades (only when `allowTrades` is on, as for Agitated), then Ward strips. Within a tier, the highest target Power goes first, then attackers in D-090 order.
  - **Trade test (confirmed):** effective Power without the element bonus on both sides, the same "Power" as D-093. With launch rules, every attack-position tie already meets it (target Power = attacker Power + the element bonus, if any), so it only binds for a future keyword.
  - **Which attacker (owner ruling, 2026-10-15):** the strongest attacker that can kill the target, per D-090's "attackers act in descending effective Power", for v0.1. The alternative, the weakest attacker whose kill succeeds, is A/B-tested in Phase 3 as M-17.
- Reason: D-091 already orders a trade before a Ward strip, and Agitated "prioritizes removing your monsters". A trade removes a monster and a strip removes none. The trade test changes nothing today, so the simplest basis is kept. The attacker choice is a strategy and balance question, so it belongs to the owner.

**D-219 · `contestedAttack`: per target, tested by applying the cast; the validator resolves `$NAME`** (amends D-204; extends D-087)
- Date: 2026-10-14
- Question:
  - ai-dev reads D-087's test per target: a kill that the extra Power newly makes possible.
  - The extra Power is the sum of the spell's `modifyStats` Power on `chosen`, and effects with an `if` are ignored.
  - Separately, `validate.ts › givesPowerToChosen` doesn't resolve `$NAME` references. So a `$GLOBAL` that resolves to 0 passes, against D-204's "resolved Power".
- Decision:
  - **Per target (confirmed).** A cast on his monster M qualifies when M is in attack position and can attack this turn, and some face-up target that M doesn't destroy now would be destroyed after the cast. Ward counts as in D-092: a strip is not a kill. Among the qualifying casts, he picks the one that enables the highest-Power kill, then `tieBreak`.
  - **How the effect is known (changed).** The AI no longer adds up `modifyStats` Power. It applies the cast to the redacted copy (D-209) and compares `previewCombat` before and after. That uses the spell's whole effect list, `if` conditions included, and needs no "extra Power" parameter. For Gilt Frame at launch the result is the same.
    - `OwnCard.grantsPower` stays only as an upper bound for the pruning in `winThisTurn` (D-220). It counts effects with an `if` too, because an upper bound must not undercount.
  - **Validator (content-author).** `givesPowerToChosen` resolves each `power` with `resolveNum`, using the globals passed to `validateContent`. It requires at least one `modifyStats` effect on `chosen` whose resolved Power is above 0. Effects with an `if` count, because they can apply.
    - A reference to an unknown name is skipped here, because the unknown-reference rule already reports it.
    - The message text doesn't change. The line now also appears when the reference resolves to 0 or less. That goes in `docs/CHANGELOG.md`.
- Reason: "a contested attack" is an attack that fails without the spell and succeeds with it, which is a per-target question. Applying the real cast is exact for any spell, and it leaves one combat implementation. The validator's purpose is to refuse an entry that can never fire, and a Power that resolves to 0 can't fire.

**D-220 · `winThisTurn` and `lethal`: every legal play is tried as the enabling play** (extends D-082)
- Date: 2026-10-14
- Question: ai-dev's win search runs on a scrubbed copy, never attacks face-down targets and ignores traps. It tries only casts other than draw spells as the play that makes the win possible.
- Decision:
  - **Search (confirmed).** It runs on `redactState(s, Collector)`, with `AI_SEARCH_NODE_BUDGET` as the node budget (D-211). It never attacks a face-down monster, which stays as a blocker ("assumed to survive", D-082). Your set traps are ignored, because the copy has none (D-082). `lethal` is the same search with no play.
  - **Enabling play (changed).** Every legal play is tried on the copy: summons in each mode, Covetous summons, casts and trap sets.
    - Example: a Swift summon that destroys your only monster opens direct attacks for his other monsters. Ashen Duchess can do this at launch.
    - A draw finds nothing on the copy, because his deck is redacted. So a draw-only cast can never succeed, and `ai` may skip it as a pure optimisation.
    - The order is the hand card's id, then instance id, then the engine's legal order (§6.2). The first play that wins is played.
    - Any pruning (such as `attackPotential` plus `grantsPower`) must be an upper bound over the plays it skips. ai-dev chooses how.
- Reason: DESIGN says "If he can win this turn, do it", and Swift summons are a real way to win at launch. On the redacted copy every play is evaluated with public information only, so no special case is needed for draws.

**D-221 · The intent forecast is `endTurn` applied to a redacted copy** (extends D-095; changes the §5.2 order)
- Date: 2026-10-14
- Question: ai forecasts his next turn on a hand-built state: the same state with the turn index plus 1, `step: 'main'`, no draw, and the same life and mood. That skips the end of your turn and the start of his: Unstable expiry, turn hooks and Appraisal. Does it count repositions and forced Vain attacks? Is "scheme" the first non-null play rule being a cast or a trap?
- Decision:
  - **Engine.** `startTurn` computes the intent after `step = 'main'` and `played = false` (§5.2 is reordered). `IntentSet` is still the last event of the turn start. The policy then sees a well-formed decision state.
  - **ai.** The forecast state is `endTurn` applied to `redactState(s, Collector)` with the Brain's engine. The engine runs the end of your turn and the start of his: turn hooks, Unstable expiry and Appraisal. He draws nothing, because his deck is redacted (D-095's "no draw"). Life and mood change only if those steps change them. There is no hand-built state.
    - This can't recurse. The Brain's engine has a stub intent policy, and the start of his turn never calls the policy.
    - `s` is only read.
  - **Categories (D-095 priority, confirmed):**
    - **appraise:** the Appraisal at the start of his turn took a monster in the forecast (`appraisal.successes` grew).
    - **attack:** after the repositions he would make (D-217), some rule in the mood's attack list returns an attack, or a monster with an active `mustAttack` keyword has a legal attack. The second case is a forced attack (D-052), whatever the list says.
    - **scheme:** the first play rule that returns something returns a cast or a trap set.
    - **guard:** otherwise.
- Reason: turn advancement then has one implementation, and the forecast is what happens if you do nothing. "appraise" differs from D-095's "you currently have an eligible target" only when that monster expires (Unstable) at the end of your turn, and there the forecast is the honest answer. Counting forced attacks keeps the icon true even if the owner removes `holdExceptVain` from a list.

**D-222 · Greedy bot: look-ahead, opening hand, Graft scoring, weights in JSON** (extends D-116)
- Date: 2026-10-14
- Question: ai-dev's greedy bot looks ahead on a scrubbed copy, so it never values a draw spell. It always keeps its opening hand. It scores a Graft by its first-choice completion. `GREEDY_WEIGHTS` lives in `evaluate.ts` as heuristic tuning, and is planned to move to `expert.weights.json` in milestone 2. Is that right under the one-edit rule (D-166 to D-171)?
- Decision:
  - **Confirmed:**
    - The look-ahead uses `redactState(s, Player)` (D-209). Draws find nothing there, which is acceptable for a diagnostic bot.
    - It keeps its opening hand, because the outcome of a redraw is hidden.
    - It scores a Graft by completing it with its best choice at each step.
    - A look-ahead that the helper refuses (an action on a face-down Collector monster, D-209) scores as the current position.
  - **Weights (changed):** they move now to `packages/ai/src/bots/greedy.weights.json`, typed as `EvalWeights` where it is imported.
    - The one-edit rule already holds in `evaluate.ts` (one value, one line). But §1.3 and §14 put tuning numbers in data files, and the expert's weights go to `bots/expert.weights.json` in milestone 2, so both bots follow the same pattern.
    - They are not globals. They are settings of a measuring instrument, not rules, and they aren't in `state.cfg`.
    - Tests never pin them (D-168).
  - **Note for milestone 2.** The expert drives the difficulty check, which picks the date's reroll `k` (D-003). So a change to the expert's weights changes which duel a date produces. Milestone 2's D-entry must tie those weights to the daily setup. The greedy bot doesn't feed the difficulty check.
- Reason: both bots keep their weights in data the same way. The milestone-2 note keeps "same game for everyone" from depending on an untracked file.

**D-223 · Balance note from AI milestone 1 (record, not a decision)**
- Date: 2026-10-14
- Question: In 300 duels on live content, the novice bot won 0% and the greedy bot about 7%. The novice target is 20–30% (`TARGET_NOVICE_WINRATE`, D-117). Where is this handled?
- Decision: nothing is tuned now.
  - The result matches the paper-sim's estimate for uniform-random play (under 5%, P11), which is why M-09 exists.
  - It is handled in Phase 3:
    - balance-analyst runs `sim:quick`/`sim:full` against the `TARGET_*` globals, with entries in `BALANCE_LOG.md`;
    - the owner rules on M-09 (the novice bot's definition);
    - the owner rules on the M-01…M-17 A/B results.
  - The AI readings in D-212 to D-221 land before the Phase 3 runs, so the sim measures the final AI.
  - The greedy bot has no target (D-116).
- Reason: tuning before the AI and the expert bot are final would measure the wrong thing.

**D-224 · Expert plan search** (extends §14, D-222)
- Date: 2026-10-15
- Question: How does the expert enumerate and score turn plans within the performance budget, without peeking?
- Decision:
  - A turn plan is a reposition subset, then one play option, then a greedy attack ordering.
  - Play options are summons in each mode, Covetous summons, casts, trap sets, and full Graft variants.
  - A Graft is expanded to the best `graftPairs` material pairs, ranked by `previewGraft` value minus the materials lost. Each pair then gets every Ascend, keyword and position finish, and the best `graftVariants` are kept.
  - Plans are ranked by `evaluate()` after the play. Only the best `finalists` get an attack ordering.
  - The attack ordering scores each attack from `previewCombat`: damage dealt, minus damage taken, plus the value of a kill, minus the value of a loss, with Ward respected.
  - An attack on a face-down Collector monster can't be looked ahead (D-209). It is scored with a guess (`unknownAttack` × Power above `unknownStat`) and ends the plan. The bot re-plans from the real state after playing it.
  - The plan is replayed through `getLegalActions`. The bot re-plans when its next action is not legal, and after any cast, because a draw is invisible to the redacted look-ahead.
  - The plan count is bounded by `maxPlans`. Each reposition-subset node keeps at most `floor(maxPlans / nodes)` plays. Measured with launch content: at most 368 plans per turn, about 25 on average.
  - A greedy fallback applies only when a Graft is pending and no plan fits it.
- Reason: keeps plans small, honours "no peeking", and stays within the performance budget (about 380 expert duels/s/core).

**D-225 · Expert weights and search bounds are tuning data, and the daily setup records their hash** (fulfils the D-222 milestone-2 note)
- Date: 2026-10-15
- Question: D-222 says the expert's weights must be tied to the daily setup. How?
- Decision:
  - `bots/expert.weights.json` holds the evaluation terms, the attack and Graft heuristics, and the search bounds (`maxPlans`, `finalists`, `graftPairs`, `graftVariants`). They are bot settings, not globals, and tests never pin them (D-168).
  - `DailySetup.expertHash` (also exported as `expertHash()`) is a hash of that file. Changing any weight can change a date's `k`.
  - Any cache keyed by date plus content version, and any shipped `seeds/<date>.json`, must also carry or match `expertHash`. Web and sim apply this when they are built.
- Reason: "same game for everyone" must not depend on an untracked file.

**D-226 · Noise applies at every player action decision** (clarifies D-094)
- Date: 2026-10-15
- Question: D-094 says "at each player decision". Is that each action or each turn, and what is "second-best" for a turn planner?
- Decision:
  - One RNG draw per bot call after the mulligan (`Noise.swerve()`), from the D-094 key `seedString#k/noise/runIndex`.
  - On a swerve the bot re-plans and follows the best plan whose first action differs from the best plan's first action. If there is none, it follows the best plan.
  - `Noise.pick(scores)` applies the same rule to a score list (used by tests).
  - The Collector never has noise.
- Reason: per-turn noise would leave about 35% of runs identical to the noise-free duel.

**D-227 · PlayerView additions** (extends §14)
- Date: 2026-10-15
- Decision:
  - New view members: `previewCombat(attackerIid, targetIid | -1)`, `previewGraft()`, `beats(attackerElement, defenderElement)` and `appraisalTarget` (the monster the Collector would take next turn, or null).
  - `beats` reads the content element table, because the engine has no public query for it.
  - Heavy view fields are lazy.
  - `OwnMonster` gains `unstableUntil` and `shroudUntil`; `PublicMonster` gains `iid`.
  - `evaluate()` takes optional `ExpertTerms` (face-down own, appraisal, appraisalFlat, unstable, matchup, sentinel, foeFaceDown). Greedy's results are unchanged.
- Reason: the §14 expert terms need these inputs, all of them public information.

**D-228 · prepareDay and DailySetup details** (extends §12.5)
- Date: 2026-10-15
- Decision:
  - `prepareDay(ctx, date, run?)` takes `ctx = { content, globals, objectiveIds }`, because compiled content has no objectives.
  - `rateSeed(ctx, seedString, twist, run?)` takes an injectable duel runner (tests, sim). A job is `{ seedString, k, runIndex, twist }`, matching the §15 run model.
  - `DailySetup` also carries `date`, `expertHash` (D-225) and `difficulty.check` (`'accepted'` or `'fallback'`, D-004). `deckList` and `signature` are card ids; `twist` is an index or -1.
  - The ISO week is computed with integer arithmetic, because ai may not use `Date`.
  - The D-004 fallback's "nearest 0.50" is the midpoint of the accepted band, `(SEED_WINRATE_MIN + SEED_WINRATE_MAX) / 2`, so no literal appears in code.
  - Star cuts are inclusive: a win rate equal to a cut gets the easier rating.
  - ai re-implements the D-010 signature pick (same algorithm and stream key), because the engine doesn't export `pickSignature` or `stream`. Later item: export `pickSignature` from the engine and delete the ai copy.
- Reason: keeps prepareDay pure and testable without hundreds of duels.

**D-229 · Difficulty-check note from AI milestone 2 (record, not a decision)**
- Date: 2026-10-15
- Question: What did the first expert runs show, and where is it handled?
- Findings (ai-dev's measurements, ≥ 1,500 duels per date):
  - Expert vs Collector: 45.7–47.1% without noise (target 45–55%, near the low edge), about 43–44% with ε = 0.1. Novice 0%, greedy about 6% (see D-223).
  - **Seed rejection is about 75%** over 12 dates (BT-8 target ≤ 15%), about 4 rerolls a day on average, fallback never reached. Noise only perturbs a near-deterministic duel, so per-seed win rates are bimodal (examples: 0.08, 0.90, 0.87, 0.95, 0.67).
  - **D-099's "500 duels ≈ 1–2 s on a phone" doesn't hold:** one `rateSeed` attempt takes about 1.6 s on a desktop core, and a full `prepareDay` averages about 6 s (1.6–13.1 s).
- Decision: nothing is changed now. Possible levers are a higher `BOT_NOISE_EPSILON`, varying the shuffle per run, or a wider `SEED_WINRATE_MIN`/`MAX` band, each a change to D-094 or a global. They are measured with `sim seed`/`sim full` in Phase 3 and go to the owner. The cost finding bears on whether web computes the day on the device or ships precomputed `seeds/<date>.json`; decide that before the web daily loop is built.
- Reason: tuning before the sim exists would measure the wrong thing.

**D-230 · BT-3b "most games end in rounds 8–12"** (clarifies §15 reports) [REVIEW]
- Date: 2026-10-15
- Decision: BT-3b passes when more than half of the expert's finished games end inside `TARGET_TYPICAL_END_ROUNDS`. The "more than half" threshold is written in `sim/src/report.ts`, not a global.
- Reason: DESIGN says "most" and gives no number; a majority is the plain reading. If the owner wants a different share, it should become a `TARGET_*` global so the change is one edit.

**D-231 · Seeds in sim quick and full** (amends D-115)
- Date: 2026-10-15
- Decision: game *i* of a bot plays date *i* mod D at reroll k = *i* div D, with runIndex 0, where D is `--seed-dates` (default `SIM_SEED_CHECK_DATES`) counted from `--from` (default today, as in D-115). Every bot gets the same seeds. The seeds are not filtered by the difficulty check.
- Reason: D-115's "dates × runs" would replay identical games for the noise-free expert; stepping k gives distinct seeds at the same cost.

**D-232 · Seed rejection rate** (defines BT-8 for §15)
- Date: 2026-10-15
- Decision: rejection rate = rejected candidate seeds ÷ candidate seeds played, over the dates checked. `sim full` also reports dates needing a reroll, mean rerolls per date, D-004 fallbacks and a candidate win-rate histogram in tenths.
- Reason: BT-8 names a rate but not its denominator; per-candidate is the quantity the levers in D-229 move.

**D-233 · Intent accuracy** (extends D-095 for §15 reports)
- Date: 2026-10-15
- Decision: the intent shown at the player's `endTurn` is compared with what the Collector did on his next turn, classified in D-095's priority order: "appraise" if an Appraisal succeeded, else "attack" if he made any attack, else "scheme" if he cast a spell or set a trap, else "guard".
- Reason: measures the intent's honesty against observable actions, using the existing category order.

**D-234 · Duels per second per core** (defines the `PERF_DUELS_PER_SEC_PER_CORE` measurement)
- Date: 2026-10-15
- Decision: duels ÷ summed worker busy time, with worker start-up excluded. It lives in the report's `perf` section, outside the deterministic `results`. Judge it from a `--workers 1` run: with more workers than performance cores the figure falls to about 25–30% of the 1-worker value on the dev machine (4 performance + 6 efficiency cores).
- Reason: keeps `results` byte-identical across worker counts while still reporting speed.

**D-235 · Sim job batching** (extends §15 worker pool)
- Date: 2026-10-15
- Decision: about 250 jobs per message (`BATCH_SIZE` in `sim/src/pool.ts`), fewer when that would leave workers idle. Balance duels return aggregates only; rated (difficulty-check) duels return their `{ won, round }` outcomes, because `rateSeed` needs per-run results. Batch size never changes a result.
- Reason: matches §15's ~250 while keeping the long tail of the seed check spread across workers.

**Sim milestone note (record, extends D-229):** the first `sim full` over 60 dates from 2026-01-01 rejected **88.1%** of candidate seeds (428 of 486; BT-8 ≤ 15%), 55 of 60 dates needed a reroll (7.1 on average), and **2 dates reached the D-004 fallback**. Candidate win rates are bimodal (172 in 0–0.1, 78 in 0.9–1.0, 6 in 0.4–0.5). `sim quick`: expert 47.4% (pass), novice 0.1%, expert median round 6 (BT-3 9–11), 2.0% reach round 12 (BT-4 15–30%), expert ~400 duels/s on one core (PERF 1000). Nothing tuned; reports in `docs/reports/*-2026-10-15.*`.

**D-236 · Daily seeds are precomputed at build time; the on-device check is the fallback** (amends D-099, D-225; answers the D-229 owner item)
- Date: 2026-10-15
- Question: D-229 and the sim milestone showed the on-device check is far slower than D-099 assumed. Should web rate the day on the device or ship precomputed ratings?
- Decision:
  - **Primary: a shipped manifest.** `apps/web/public/seeds.json` holds `{ contentHash, globalsHash, expertHash, days: { "<date>": { k, winRate, stars, par, check } } }`. One file, not one per date (replaces D-225's `seeds/<date>.json`). It stores only the rating; the rest of the day is rebuilt by `daySetupFor(ctx, date, rating)` (packages/ai), which plays no duel.
  - **Key.** `checkKey(ctx)` (packages/ai) returns the three hashes. The content hash leaves globals out (D-197), so `globalsHash` is needed. The manifest is used only when all three match the running build; otherwise it is ignored as a whole.
  - **Fallback: on-device.** A date missing from the manifest, or any key mismatch (dev builds, D-176 hot reload, `?set=`, `?date=` beyond the window), runs `prepareDay` in `difficulty.worker.ts` with a progress screen. Its rating is cached in localStorage per date plus the three hashes.
  - **Generator.** A `sim seeds --from DATE --days N` command writes the manifest with the existing worker pool. It must be byte-identical for any worker count, as `sim full` is. Built later in a small sim round; the web app works without it (every day falls back).
  - A stale manifest is never an error: the app falls back. The production build prints a warning when the manifest key does not match.
- Reason: measured cost. A rating attempt takes about 1.6 s on one desktop core, and the sim milestone averaged 8.1 attempts a date (about 13 s), with fallback dates at 21 attempts (about 34 s). A phone is slower still, so first open of the day would block for 30 s to 2 min. Even at the BT-8 target (≤ 15% rejected) a phone would wait several seconds. Precomputing moves that cost to a build machine with all cores. The client stays offline-capable with no server, and every device still gets the same day because the rating is deterministic. The fallback keeps dev hot reload and owner tuning working without a regeneration step.

**D-237 · Web visual direction** (owner choices, 2026-10-15; extends §16 and D-195)
- Date: 2026-10-15
- Question: What should the web UI look like around the locked "dark fantasy painted cards"?
- Decision (owner chose each):
  - **Direction: gilded auction house.** Black velvet, gold leaf, ivory, brass plaques; cards read as exhibits.
  - **Type:** an engraved-style serif display face (Cormorant or Cinzel class) for names and headers, a clean sans (Inter class) for rules text and numbers.
  - **Duel layout: mirrored classic.** Collector header (life, Appraisal countdown, intent, mood) and his traps/monsters on top; round marker across the middle; your monsters/traps, life, fanned hand and End turn at the bottom in thumb reach.
  - **Board cards: mini cards.** Art, name, Power/Guard, element badge (color + icon) and keyword frame on every board card; tap for full text.
  - **Input: tap card, tap target.** Tapping a hand card lifts it and makes legal slots/targets glow; tapping one plays it; tapping elsewhere cancels. Face-up/face-down is a small toggle on the lifted card.
  - **Motion: snappy.** About 150–250 ms per beat, every animation skippable and never blocking input.
  - **Placeholder art (D-195): silhouette on element glow.** A dark kind silhouette over a radial glow in the element color, under a gilt frame.
  - **Collector: portrait + speech line.** A small header portrait that changes with mood, and a one-line quip on mood shifts and Appraisals that fades by itself.
- Reason: owner's choice; the auction-house look fits the Collector, the vault, Appraisal and Relics.

**D-238 · Web screens and card visuals** (owner choices, 2026-10-15; extends D-237)
- Date: 2026-10-15
- Question: What should the screens and card details D-237 leaves open look like?
- Decision (owner chose each):
  - **Home: auction catalogue.** "Lot of <date>" header, difficulty stars, the day's signature card on a velvet plinth, brass lines for the weekly twist and the Appraisal rounds (3 · 6 · 9), and a deck list (24) that folds open. One large "Enter the vault" button, with Practice · Binder · Stats beneath it.
  - **Graft: workbench sheet.** Choosing Graft slides a sheet up over the hand, with two numbered material slots filled by tapping board or hand cards and a ⇄ button that swaps the order. A live result preview shows family, element (from slot 1), Power/Guard, inherited keywords (chips to choose from when more than 2 are available) and an Unstable warning, with Cancel and Graft buttons. After confirming, an Ascend button offers the second step. The board stays visible above the sheet.
  - **Card inspect: bottom sheet.** Tapping a card opens a half-height sheet with an art thumbnail, name, element · kind, Power and Guard, each keyword or Flaw with its rule, and the element's beats/weak-to line. The board stays visible behind it, dimmed. Swipe down or tap outside to close.
  - **Intent and Appraisal: round track and plaque.** The middle round marker is a 1–12 track with gavel marks on the Appraisal rounds, a sealed-vault mark on 12 and the current round lit. The Collector's intent icon sits on a brass plaque beside his portrait. Appraisal rounds are read from content, not hard-coded.
  - **Result: bill of sale.** An ivory receipt with a wax stamp (ACQUIRED on a win, SEALED IN THE VAULT on a loss) listing the date, rounds against par, life left, the 3 objectives with ✓/✗, and the emoji round row exactly as it will be shared. On a win, an "Added to your Binder" strip shows the signature card. Buttons: Share, Practice, Binder.
  - **Binder: calendar and kind matrix.** Two tabs. Signatures is a month calendar with a card thumbnail on each won day, and lost or unplayed days stay dark. Chimeras is the kind-pair triangle (15 cells for 5 kinds, built from content kinds), with discovered families painted and undiscovered ones as labelled silhouettes. Tapping a cell shows the card and its recipe.
  - **Element colors: jewel tones.** Round gilt-ringed badges with a gem fill and an engraved icon: Ember ruby #C8323A, Gale pale jade #8FD3A8, Tide sapphire #2456A6, Lumen pearl-gold #F3E6B3 (kept apart from the UI gold leaf #C9A24A), Umbra amethyst #7A4FB8, on velvet #120D12. The icon always appears with the color. Colors are tokens keyed by element id, so a new element needs one token entry.
  - **Keywords: frame effect plus glyph.** Each keyword changes the frame as DESIGN's keyword table lists it (Sentinel iron shield border, Pierce spear notch, Ward pale barrier, Haunt wisps, Echo double image, Swift motion streaks), and a small engraved corner glyph names it. With two keywords, the frame shows the higher-priority one (Sentinel > Ward > the rest) and both glyphs appear. Flaws show as a cracked-red glyph on Relics. Frame treatments and glyphs are keyed by keyword id, with a plain-glyph fallback for unknown ids.
- Reason: owner's choice.

**D-239 · Web visual layer judgment calls (W1.5)**
- Date: 2026-10-15
- Question: Which implementation choices did ui-dev make while building D-237/D-238 that the specs leave open?
- Decision:
  1. **Element colors** are a CSS token pair per element id (`--el-<id>`, `--el-on-<id>`) in `apps/web/src/style/tokens.css`, with an `--el-neutral` fallback for unknown ids. The `color` field in `elements.json` is not read, so a new element's color is one token line.
  2. **Graft ⇄ swap** is the store action `graftSwap`: `graftCancel`, `graftBegin`, then `graftPick` for both materials in reverse order, each taken from the legal actions. It logs four actions and is enabled once two materials are picked.
  3. **Ascend comes before position.** The engine asks for Ascend before the position, so after two materials the sheet shows the preview, "Graft" (`graftSkipAscend`) and a hint to tap a glowing card to Ascend. The final confirm is "Graft · Attack" or "Graft · Guard" (`graftPosition`). This replaces D-238's "after confirming, an Ascend button". The Ascend and Unstable copy are templates rendered with `renderText` (`view/copy.ts`).
  4. **The workbench sits in the layout flow.** While grafting, the sheet replaces the hand and bottom bar, the trap rows are hidden and the Collector header shrinks, so board cards stay visible and tappable. Hand materials appear as a strip inside the sheet.
  5. **Taps.** Tapping a hand card lifts it, with Attack/Guard and Face-up/Face-down toggles in their own row. Tapping your board monster selects it if it can attack or reposition, otherwise it opens inspect. Tapping an opponent card opens inspect unless it is a glowing target. Holding any card for 450 ms opens inspect, and the action bar has an Inspect button.
  6. **Collector quip** comes from `collector.json › dialogue`, picked by `nActions % length`. It appears on `GameStarted`, `MoodChanged` and `AppraisalAttempt` and fades by itself after about 6 s.
  7. **Objective ✓/✗** on the Result screen is computed from `objectives.json` (metric, lte/gte, `$GLOBAL`). It is presentation only, until the engine's objectives module (D-102) exists.
  8. **Flaw frames (D-195)**: the card carries `data-flaw=<visual>` and gets a generic cracked-red overlay; there is no per-Flaw frame art yet. A keyword frame takes priority over a Flaw frame.
- Also: the fonts are self-hosted (`@fontsource`) so the offline PWA needs no third-party requests. Motion is CSS with a `--beat` of 190 ms, set to 0 by the animations flag or the OS reduced-motion setting. Framer Motion was skipped because no release was clearly outside the 14-day age window. Displayed life is clamped at 0.
- Reason: ui-dev's drafts, reviewed by the main session; none changes a rule.

**D-240 · Gothic restyle and larger screens** (owner choices, 2026-10-15; amends D-237 and D-238)
- Date: 2026-10-15
- Question: The first visual pass (W1.5) read as a clean tech app with a gold color scheme. How should it fit the gothic dark-fantasy card art, and how should it use screens larger than a phone?
- Decision (owner chose each):
  - **Direction: cursed auction house.** D-237's auction house, decayed and gothic: tarnished gold and blackened iron, moth-eaten velvet, cracked lacquer, wax, candlelight. Board slots are carved display niches, buttons are iron-and-brass plaques with rivets, and dividers are thorned filigree. No pill shapes, flat fills or dashed outlines. Base palette: soot #0D0A0B, oxblood #5A1A1F, tarnished gold #9C7C3C, bone #D9CDB4. The D-238 element jewel tones stay, as gems set in that metal.
  - **Type: engraved serif throughout.** An ornate engraved capital face (Cinzel Decorative class) for names and headers, a readable old-book serif (EB Garamond or IM Fell class) for rules text, and bold lining serif figures for numbers. No sans anywhere. This replaces D-237's serif + sans pairing.
  - **Motion: snappy with gothic effects.** D-237's 150–250 ms beats, always skippable and never blocking, stay. Effects change: candle flicker and drifting ash as quiet idle atmosphere, cards burn to embers when destroyed, damage is a blood-ink splash on the life seal, Appraisal is a gavel strike with a shadow hand taking the card, Graft stitches the materials together in smoke. Idle atmosphere stops, and every effect is instant, under reduced motion or when the animations flag is off.
  - **Screens: scaled stage plus side panels.** Phones keep the portrait layout. Tablets get the same layout with larger cards. Wide landscape screens (laptop, desktop) keep the board central at a comfortable size, with a left panel for the Collector (portrait, quip, intent, mood) and a right panel for a duel log, deck and graveyard counts, and card inspect (which replaces the bottom sheet there). A mouse hover previews a card. Tap-only play still works everywhere; hover only adds information.
- Reason: owner's choice. The UI should sit under the commissioned gothic dark-fantasy card art rather than compete with it.

**D-241 · Card-name face by card width** (W1.6, applies D-240)
- Date: 2026-10-15
- Question: Cinzel Decorative is illegible at the smallest card widths (~50 px). Which face do small card names use?
- Decision: Mini-card names use EB Garamond 700 below an 88 px card width and Cinzel Decorative at 88 px and up (a container query on the card). Headers and the inspect view always use Cinzel Decorative. Fonts are `@fontsource/cinzel-decorative` 5.3.0 (400, 700) and `@fontsource/eb-garamond` 5.3.0 (400, 400 italic, 700), latin only; Inter and Cormorant are removed. Only the debug overlay and the error screen's code use a monospace stack.
- Reason: ui-dev's draft, reviewed by the main session; D-240's "engraved serif throughout" still holds, the readable serif just takes over where the decorative capitals break down.

**D-242 · Unstable and the small-card icon cap** (W1.6)
- Date: 2026-10-15
- Question: At 360×640 the mini-card corner icons (element badge, position, keyword glyph, Unstable) overlapped. How do they fit?
- Decision: The corners are two columns sized from the card width. On cards 72 px wide or less, each column shows at most 2 icons, so Unstable (third, after position) can be dropped. Unstable is therefore also drawn as a cracked-frame overlay (`data-unstable`), and the card's aria-label always states position, Ascended and Unstable. Flaw cracks (D-239 item 8) are drawn at 0.45 opacity. On cards 72 px or less the stat row shrinks (10.5 px figures, 8 px icons) so both numbers stay inside the frame down to the 44 px minimum.
- Reason: ui-dev's draft, reviewed by the main session; color and icons are never the only signal (the overlay and aria-label carry Unstable).

**D-243 · Burn and taken cues, ghosts and the duel log** (W1.6)
- Date: 2026-10-15
- Question: How do D-240's destroy and Appraisal effects and the wide-screen duel log get their data without new engine coupling?
- Decision: New visual cues: `burn` from `Destroyed`, `taken` (plus a flash) from `Appraised`. Because `Destroyed` carries no slot, the burning or taken card is a ghost rebuilt from the previous state in `ui/useStepFx.ts`. The duel log is built from step events by `view/log.ts`, newest first, and is not persisted, so it starts empty after a reload.
- Reason: ui-dev's draft, reviewed by the main session; presentation only. A persisted log is a possible later item.

**D-244 · Wide breakpoint and hover** (W1.6)
- Date: 2026-10-15
- Question: Where does D-240's wide layout start, and how is hover gated?
- Decision: Wide means `min-width: 1024px and orientation: landscape`. The same query drives the CSS and the `useWide` hook, which swaps the inspect bottom sheet for the right panel. Hover preview fires only for `pointerType === 'mouse'`, and the CSS hover lift is under `@media (hover: hover) and (pointer: fine)`; hover never acts. On wide screens the hand fan is half strength with 28 px side padding and a 26 px gap above the action row, so no card overlaps End turn, Graft or the life seal at 1024×768 or 1440×900.
- Reason: ui-dev's draft, reviewed by the main session. Tablets in landscape below 1024 px and phones in landscape keep the portrait layout (not separately designed).

**D-245 · Short-phone layout** (W1.6)
- Date: 2026-10-15
- Question: How does the gothic chrome fit 360×640?
- Decision: Minimum card width is 44 px (was 48). The Collector life seal is 42 px and the hand strip is 6 px shorter. The Graft sheet's max height is 54dvh on phones and 46dvh when wide; its header, material slots and confirm row stay outside the scroll area. On phones under 700 px tall, lifting a card hides the Collector's set-trap row and Appraisal line until the card is dropped, so the board keeps its size.
- Reason: ui-dev's draft, reviewed by the main session (verified at 360×640: board fills 287/287 px, Graft slots and confirm visible with the preview showing).

**D-246 · Graft smoke and stitch** (W1.6)
- Date: 2026-10-15
- Question: D-240 says Graft stitches the materials together in smoke. What animates?
- Decision: The stitch and smoke play on the new Chimera only; the materials do not animate in.
- Reason: ui-dev's judgment that material ghosts aren't worth the extra plumbing; reviewed by the main session. Can be revisited with real art.

**D-247 · Stats, Practice, Share and app icon visuals** (owner choices, 2026-10-15; extends D-238 under D-240)
- Date: 2026-10-15
- Question: What should the W2 meta pieces that D-238 leaves open look like?
- Decision (owner chose each):
  - **Stats: ledger page.** An aged ledger page headed "The Collector's Ledger" with played, won, win %, current and best streak, average rounds against par, and total objective stars in engraved serif figures, with the current streak in red ink. Below that, a rounds-used chart drawn as inked tally bars, one row per round count plus a "lost" row, with today's row marked.
  - **Practice: unrecorded ribbon.** The same duel screen with a "Practice · Unrecorded" ribbon across the header and the gold dimmed a notch. Its Result is a plain receipt with no wax stamp and no Share button. Practice never touches stats, streaks or the Binder.
  - **Share: text only.** The emoji round row, rounds against par, life left and the objective stars, plus a link, sent through the Web Share API with a clipboard fallback. No image.
  - **App icon and splash: wax-seal gavel.** An oxblood wax seal with a stamped gavel and a tarnished-gold rim on soot (D-240 palette), used for the PWA icons and splash.
- Reason: owner's choice.

**D-248 · Streak, stats and share-line definitions** (W2, applies D-247)
- Date: 2026-10-15
- Question: DESIGN and D-247 name the streak, the stats and the share line but don't define them. How are they counted?
- Decision:
  - **Streak:** the current streak counts consecutive calendar days with a win. It ends today, or yesterday while today is still unplayed. A loss or a missed day ends it, as in Wordle. Best streak is the longest such run.
  - **Stats:** derived from one record per date (the first counted result), so reloads never double-count. A day's stars are the number of objectives met, 0 on a loss. "Rounds vs par" is the mean of (rounds − par) over wins only. The rounds chart has one row per round count from 1 to MAX_ROUNDS plus a Lost row, and today's row is marked.
  - **Binder:** a win adds the day's signature card. A Chimera family counts on its first graft in any counted (daily) duel, win or loss.
  - **Storage:** records are versioned (`vd:stats`, `vd:binder`). Unreadable entries are dropped, and a record from a newer version is read as empty and never overwritten.
  - **Share line:** it reads "<n> rounds (par <p>) · Life <l> · <stars>" ("1 round" when singular), as in the D-247 preview. The objective-star maximum is the day's objective count, not the planned OBJECTIVE_STARS_MAX global.
- Reason: ui-dev's draft, reviewed by the main session. The main session changed the share line from "Round 3/7", which read as "round 3 of 7".

**D-249 · Practice rules** (W2, applies D-247)
- Date: 2026-10-15
- Question: When does Practice unlock, and what does it keep?
- Decision: Practice unlocks when the daily duel has ended, win or loss, and replays today's seed. It keeps its own resumable record, `vd:practice:<date>`, and never touches the stats, Binder or daily session records. Leaving Practice ("Today's lot") restores the daily Result and deletes the practice record, and "Practice again" starts a fresh duel. Its receipt is headed "Practice receipt · Unrecorded" and has no stamp or Share button.
- Reason: ui-dev's draft, reviewed by the main session.

**D-250 · Offline shell without vite-plugin-pwa** (W2; amends ARCHITECTURE §16)
- Date: 2026-10-15
- Question: ARCHITECTURE named vite-plugin-pwa for the offline cache. Is it worth its dependency tree (workbox)?
- Decision: No. A small Vite `closeBundle` step writes `dist/sw.js` from `apps/web/src/sw/sw.template.js`. It precaches every emitted file except card art, `seeds.json`, the worker script itself and the `.woff` fallbacks, and the cache name hashes the contents. There is no skipWaiting, so an open tab keeps the chunks it loaded. `seeds.json` is network-first with the last good copy as fallback, and `art/*.webp` is cache-first. Content is bundled in the JS, so it works offline too.
- Reason: ui-dev's draft, reviewed by the main session; offline reload and the Binder offline were checked in Chromium.

**D-251 · App icon and manifest** (W2, applies D-247)
- Date: 2026-10-15
- Question: How are the icon sizes produced?
- Decision: `apps/web/public/icon.svg` is the single source. `apps/web/scripts/make-icons.mjs` renders the PNGs with Playwright (192, 512, maskable 512 with the seal at 80%, apple-touch 180, favicon 32); run it as `node scripts/make-icons.mjs <path to playwright/index.mjs>`. The loading screen and the in-page splash reuse the SVG. Per-device iOS startup images are not made yet.
- Reason: ui-dev's draft, reviewed by the main session.

**D-252 · Dev-only overrides and debug overlay** (W2)
- Date: 2026-10-15
- Question: How do `?set=` and the debug overlay behave, given that FLAGS.DEBUG_OVERLAY is not yet read by content?
- Decision: `?set=NAME=VALUE` (repeatable) and `?debug` work in dev builds only. `?debug` equals `?set=FLAGS.DEBUG_OVERLAY=true`, overrides also go to the difficulty worker, and a bad override shows the D-176 error screen. In production the overlay needs the content flag. The overlay is a collapsed "dbg" tab opening a read-only panel with the seed, setup source, step, mood, intent, overrides, warnings, the Collector's recent actions and the legal actions (first 40). It can't show the Collector's chosen rule yet, because `createCollector.act` returns only the action; exposing it is a later packages/ai item.
- Reason: ui-dev's draft, reviewed by the main session.

**D-253 · Phone hand fan and action row fit** (W2; amends D-245)
- Date: 2026-10-15
- Question: How are the W1.6 360x640 leftovers fixed (hint text at the screen edge, leftmost card clipped, fan dipping into the action row)?
- Decision: On phones the hand fan keeps a 44 px side gutter (`--fan-gutter`), a shallow dip (drop × 0.25) and an 8 px lift. The hint bar has a 16 px side gutter. Below 400 px the player bar has tighter button padding, so Graft and End turn fit at 360 px. Below 420 px the Binder's kind headers drop to normal case and Chimera names to 9 px, so "Construct" and "Clockwork" fit their 50 px columns. Wide layouts keep their D-244 values.
- Reason: ui-dev's draft plus the main session's Binder fix; checked in Chromium at 360 to 1440 px.

**D-254 · `sim seeds` generator and the seeds:check build step** (implements D-236)
- Date: 2026-10-15
- Question: How is the D-236 manifest produced and kept honest?
- Decision:
  - `pnpm seeds --from DATE --days N [--workers W] [--out FILE]` (default out `apps/web/public/seeds.json`) rates each date with the sim's `checkDates` on the worker pool. It writes `{ contentHash, globalsHash, expertHash, days }` keyed by `checkKey(ctx)`, with dates ascending, fields in the order k, winRate, stars, par, check, and a trailing newline. The bytes don't depend on the worker count.
  - `pnpm seeds:check` (`sim seeds --check`) reads the manifest and prints a WARNING when the file is missing or unreadable, when any of the three hashes differs from the current build (including `--set` overrides), or when days in the next 30 are missing. It always exits 0, because a stale manifest is never an error. The root `build` runs it after `content:check`.
  - `packages/sim/src/seeds.ts › parseManifestText` copies the web reader's rules (`apps/web/src/daily/manifest.ts › parseManifest`), since sim must not import apps/web. A change to one must be made to the other. A shared export from packages/ai would remove the copy (later item).
  - A test checks that a manifest rating equals the on-device `prepareDay` rating for the same date on every field, and that `daySetupFor` with that rating gives the device's `DailySetup`.
- Reason: playtest-runner's draft, reviewed by the main session. The main session checked 1 vs 9 workers byte-for-byte and the web app using the manifest without starting the worker.

**D-255 · Seeds manifest for 2026-10-15 to 2027-01-12** (applies D-254)
- Date: 2026-10-15
- Question: Which manifest ships, and when must it be regenerated?
- Decision: The shipped `apps/web/public/seeds.json` covers 90 days, 2026-10-15 to 2027-01-12. 84 dates were accepted and 6 fell back (2026-10-18, 2026-11-24, 2026-11-26, 2026-11-27, 2027-01-04, 2027-01-10). It took 333,000 duels in 277 s on 9 workers. Regenerate it with `pnpm seeds --from <date> --days 90` after any change to content, globals or the expert weights, and before the window runs out. Until then, the app falls back to the on-device check (about 7 s on a desktop) and `pnpm build` warns.
- Observed, not tuned (for Phase 3 with the D-229/D-230 items): par ranges from 3 to 12 (10 days at par 3, against BT-3's 9–11), and 57 of the 90 days rate 1 star.
- Reason: D-236 measured cost; the window gives about two months of headroom before the next regeneration is needed.

**D-256 · Engine exports for turn arithmetic and the signature pick** (closes the D-228 later item)
- Date: 2026-10-15
- Question: ai, sim and web each re-implemented the round, the active side and the D-010 signature pick, because the engine kept them internal. Should the engine export them?
- Decision: Yes. The engine's public index exports `roundOf(s)` and `activeSide(s)` (`stats.ts`), `pickSignature(c, deckList, rng)`, and a thin wrapper `signatureForSeed(c, deckList, seed)` (`setup/signature.ts`). The wrapper takes the full seed string, rerolls included, and draws from that seed's `signature` stream (D-010). The algorithm and the stream key are unchanged. `ai/difficulty.ts › daySetupFor`, `ai/bots/player-view.ts`, `ai/collector/view.ts`, `ai/collector/intent.ts`, `sim/duel.ts` and `web/duel/turn.ts` use them in place of their own copies; web keeps its `activeSideOf`/`roundOfState` names as aliases. A deck with no monster now throws the engine's `EngineError('signature: the deck has no monster')` instead of ai's own error, a case real decks cannot reach. The ai tests still repeat the turn arithmetic as test code.
- Reason: one source of truth for rules the UI, AI and sim all read. It is a pure refactor: regenerated seeds for a fallback date and an accepted date are byte-identical to the shipped manifest (D-255).

**D-257 · Playtest readiness: developer's guide, How to play, feedback link, deploy** (owner, 2026-10-15)
- Date: 2026-10-15
- Question: What must exist before outside playtesters get a link, and where does it live?
- Decision:
  - **Developer's guide:** a repo file, `docs/DEVELOPER_GUIDE.md`, versioned with the code (not a Claude Doc). It shows how the packages wire together (content → engine → ai → sim and web) with Mermaid diagrams, the data flow of a daily duel, the build, test and seeds commands, and where to change what.
  - **Playtest scope:** a How to play primer and a feedback link only. No bug-report footer and no analytics.
  - **How to play:** 5–6 illustrated, swipeable catalogue pages in the D-240 gothic style: the goal, playing cards, combat and elements, Graft, Appraisal, winning. They show on first open and again from a "?" on Home. The copy follows the content and DESIGN rules; numbers such as Appraisal rounds and starting life are read from globals, never hard-coded.
  - **Feedback link:** a Tally form. Its URL comes from the build-time variable `VITE_FEEDBACK_URL` (set in Vercel, or `.env.local` for dev); when it is unset, the link is hidden. The link appends `date`, `seed` and `build` query parameters, which the form reads as Tally hidden fields of the same names. `build` is the short commit SHA (`VERCEL_GIT_COMMIT_SHA`, else `git rev-parse --short HEAD`, else `dev`) plus `CONTENT_VERSION`.
  - **Deploy:** GitHub + Vercel. The repo carries `vercel.json` (build command `pnpm build`, output `apps/web/dist`, Node 24, pnpm via `packageManager`/corepack, no-cache header on `sw.js`, short cache on `seeds.json`, SPA fallback). The owner creates the GitHub repo and connects Vercel. `phase-1` merges into `main` only when the owner says so. The daily date stays device-local (`localDate`).
- Reason: owner's goal of a playtest-ready build on Vercel soon. An env variable lets the owner swap the form without a code change.
- Note (developer's guide round): the arrow list above gives the order data flows in. The package imports run the other way: content and ai build on engine, then sim and web on top of them (ARCHITECTURE §2). `docs/DEVELOPER_GUIDE.md` draws the import graph.

**D-258 · How to play is shown once per browser** (W3, applies D-257)
- Date: 2026-10-15
- Question: When do the How to play pages open on their own?
- Decision: On the first landing on Home. The `vd:howto` flag (version 1) is written when the player presses Skip or Done, not when the pages open, so a reload in the middle shows them again. Raising the version shows them to everyone once more. If storage throws, the pages show on every load. The "?" on Home always reopens them.
- Reason: ui-dev's draft, reviewed by the main session.

**D-259 · How to play layout** (W3, applies D-240 and D-257)
- Date: 2026-10-15
- Question: How do six pages and their controls fit at 360 px?
- Decision: There are six pages: the goal, playing cards, combat and elements, Graft, Appraisal, winning. The Appraisal page, and the Ascend and Unstable lines, are left out when their feature flag is off. The pages are a native scroll-snap strip with Prev/Next, arrow keys, Escape, Skip and Done. The page dots are 44 × 44 tap targets on their own row above Prev/Next, because six dots and two buttons don't fit on one row at 360 px. A page taller than the screen scrolls inside the dialog with a fade at the bottom. Every number comes from globals or compiled content through `{NAME}` placeholders. The star count uses `OBJECTIVES_PER_DAY`, because `OBJECTIVE_STARS_MAX` is still a planned global.
- Reason: ui-dev's draft; checked in Chromium from 360 × 640 to 1440 × 900, with and without reduced motion.

**D-260 · Feedback link placement and fields** (W3, applies D-257)
- Date: 2026-10-15
- Question: Where does the feedback link appear, and what exactly does it send?
- Decision: On Home and on the daily Result, not on the Practice receipt. `seed` is `setup.seedString` without the reroll index (date + build identify `k` through the manifest). `build` is `<short sha>+<CONTENT_VERSION>`. The link opens in a new tab with `rel="noopener noreferrer"`. `apps/web/.gitignore` ignores `.env.local` and `.env.*.local`, and `apps/web/.env.example` shows the variable.
- Reason: ui-dev's draft, reviewed by the main session.

**D-261 · Home "?" button** (W3)
- Date: 2026-10-15
- Question: Where does the How to play button go on Home?
- Decision: A text "?" button in the top row of the Home header. The eyebrow line gets side padding so the button never covers the title.
- Reason: ui-dev's draft, reviewed by the main session.

**D-262 · `?date=` works in dev builds only** (owner, 2026-10-15; extends D-252)
- Date: 2026-10-15
- Question: The `?date=YYYY-MM-DD` override worked in production too, so a playtester could play any day, including future ones, and write stats and Binder entries for them. Keep it?
- Decision: No. Like `?set=` and `?debug` (D-252), `?date=` is read only in dev builds (`import.meta.env.DEV` in `main.tsx`). Production always uses the device's local date (`localDate`). To check another day locally, use `pnpm dev` with `?date=`.
- Reason: the daily duel is one attempt per real day (DESIGN "Daily loop"). Found while verifying W3.

**D-263 · `vercel.json` details** (main session, 2026-10-15; applies D-257)
- Date: 2026-10-15
- Question: D-257 fixed the outline of the Vercel config. Which details does it leave open?
- Decision:
  - `framework: null`, `installCommand: pnpm install --frozen-lockfile`, `buildCommand: pnpm build`, `outputDirectory: apps/web/dist`.
  - Node: root `engines.node` is now `24.x` (was `>=24`). Vercel reads it, and an open range makes it pick the newest major with a warning.
  - pnpm: Vercel uses the `packageManager` pin (pnpm 12.11.2) only when the project env variable `ENABLE_EXPERIMENTAL_COREPACK=1` is set. Without it, Vercel picks pnpm from the lockfile version (9.0), which is an older pnpm that ignores `allowBuilds`. The owner sets this variable in the Vercel project.
  - Caching: `sw.js` gets `no-cache`. `seeds.json` gets `public, max-age=600`; a stale copy is safe because the app checks the manifest key (D-236) and falls back to on-device `prepareDay`. `/assets/*` (Vite's hashed file names) gets a one-year immutable cache. Every other file keeps Vercel's default (revalidate each time).
  - SPA fallback: paths without a file extension rewrite to `/index.html`. A missing `.js` or `.json` file stays a 404 instead of returning HTML. The app has no URL routes today, so this only catches mistyped links.
  - `.gitignore` gains `*.local` (for `apps/web/.env.local`) and `.vercel/` (the CLI's local project link).
- Reason: checked with a fresh clone (`pnpm install --frozen-lockfile` and `pnpm build` succeed, `seeds:check` passes, the commit SHA is stamped) and with the rewrite pattern tested against path-to-regexp 6.1.0.

**D-264 · GitHub repo, Vercel account and v0.1 merge** (owner, 2026-10-15; applies D-257)
- Date: 2026-10-15
- Question: Where does the code live, which Vercel account deploys it, and which branch is production?
- Decision:
  - Repo: private `hassanshirazi-ls/vault-duel` on the owner's company GitHub account. `origin` points there.
  - Vercel: the owner's business account, because the game may earn income (the free Hobby plan is for
    non-commercial use).
  - Commit author: every earlier commit uses the owner's personal gmail, which isn't on `hassanshirazi-ls`.
    Vercel blocks a deploy whose commit author isn't on the account, so this clone sets
    `user.email = hassan.shirazi@leonisstudios.com` locally. Only the deployed commit's author is checked, so
    the history isn't rewritten.
  - Branch: the whole of Phase 1 is v0.1, so `phase-1` is merged into `main` (fast-forward), and Vercel
    production deploys from `main`.
  - The root `README.md` holds the Vercel import steps and the env variables (`ENABLE_EXPERIMENTAL_COREPACK=1`
    required, `VITE_FEEDBACK_URL` optional).
- Reason: owner's call. It replaces the personal-account plan discussed earlier the same day.

**D-265 · Menus, Undo and the duel log** (owner feedback, 2026-10-16)
- Date: 2026-10-16
- Question: How do players move between the daily duel, Practice and the menus, take back a mistake without learning hidden information, and trace a game on a phone?
- Decision:
  - Home is the main menu: Daily duel (Enter the vault / Resume / Today's result), Practice (locked until the daily duel is over; Resume once one is saved), How to play, Binder, Stats. Both Result screens have a Main menu button; the Practice Result's "Practice again" is now "Replay".
  - A menu button in the duel header opens a sheet: How to play (over the board), Duel log, Restart (Practice only, confirmed with a second tap) and Main menu. The daily duel and Practice stay saved when you leave.
  - Undo removes the last player action of the current turn, in the daily duel and in Practice. It never goes past the start of the turn, and a Graft counts as one action. It is blocked at a checkpoint: an action whose events include Revealed, TrapTriggered, AttackCancelled, CardDrawn, Redrawn or HandDealt; an attack, summon, cast or graft finish made while the Collector had a set trap; the mulligan; and endTurn. One pure function holds the rules (`apps/web/src/view/undo.ts`), and the disabled button says why.
  - The duel log is built from the action trail. It covers the whole duel, survives a reload and drops undone lines. Phones open it from the duel menu.
- Reason: owner feedback after the v0.1 launch. The engine is deterministic from seed plus log, so undo is a truncation plus a replay. The checkpoints stop undo from leaking hidden information.

**D-266 · Animation pacing and the Collector telegraph** (owner feedback, 2026-10-16; supersedes D-237's "snappy motion")
- Date: 2026-10-16
- Question: Players could not tell what had just happened. How fast should animations run?
- Decision: Cue animations run about 2.2× slower: `TIMING` in `apps/web/src/visual/cues.ts` sets BEAT_MS 420, TAIL_MS 800, TELEGRAPH_MS 600 and SETTLE_MS 500, and the `--cue` token in tokens.css must equal BEAT_MS (a test checks it). The beat-merging cap is gone, so each beat finishes before the next. The Collector's turn plays one move at a time; before each move a telegraph lights his card or attacker, marks the target or slot, and names the move in a reserved status line (a face-down card is never named). Interface transitions keep the 190 ms `--beat`. One tap skips to the end of the sequence. The animations flag and reduced motion still turn it all off.
- Reason: readability over speed; the sequence is skippable. The telegraph comes from the step's frames only, so engine results are unchanged.

**D-267 · Graft un-pick rewrites the log**
- Date: 2026-10-16
- Question: Tapping a picked Graft material takes it out, but the engine has no un-pick action. How?
- Decision: The store rewrites the log back to the current `graftBegin` and re-adds the kept picks, each taken from `getLegalActions`. It appends no graftCancel. The result is one state change with no animation and no log lines. If a kept pick would be illegal as the new first pick, the Graft stays unchanged and an error shows.
- Reason: the log stays clean for replay and Undo, and a reload gives exactly the state shown.

**D-268 · The tap that skips the Collector's turn is swallowed**
- Date: 2026-10-16
- Question: Should the tap that skips the Collector's sequence also press whatever is under it?
- Decision: No. While his moves are still to play, the skipping tap is swallowed. Taps during cues that block nothing pass through, as before.
- Reason: prevents an accidental End turn or card tap while the board changes under the finger.

**D-269 · Unique, prefixed React keys** (bug: extra summoning zones and stray monsters)
- Date: 2026-10-16
- Question: What caused the extra summoning zones and monsters in the wrong slots?
- Decision: Empty slots were keyed by slot index and monsters by instance id, and player instance ids start at 0, so keys collided and React reused the wrong elements. Keys are now `slot-${i}`, `g-${i}`, `m-${iid}`, `trap-${i}` and `h-${iid}`, built in `apps/web/src/view/keys.ts`. `test/keys.test.ts` runs the keys over every board state of four real duels; it failed with the old keys.
- Reason: instance ids and slot indices overlap.

**D-270 · The layout stays put when a selection changes**
- Date: 2026-10-16
- Question: How do selections avoid moving the board?
- Decision: The mode toggles and the error line float over the board. The hint bar is a fixed 54 px with a 3-line clamp, the Collector status line is reserved at 20 px, and the Graft workbench is a fixed `min(52dvh, 360px)`. The short-phone `data-lifted` rule is gone. The header menu button is 32 px with a 44 px hit area, and the Collector name truncates before anything overflows.
- Reason: about 20 px of board height buys a board that no longer jumps.

**D-271 · The owner's visual picks for the playtest round** (owner, 2026-10-16)
- Date: 2026-10-16
- Question: Which of the mocked-up options does the web app build?
- Decision: Flaw B (cracked frame), wheel A (orrery ring with tracers) on the How to play combat page plus wheel C (in-duel compass), and menu A (auction-catalogue Home). The duel menu sheet and the guide page with a live demo are built as drawn. The mockups came from a design canvas, and the build uses the real components and tokens, in `apps/web` only.
- Reason: owner's picks.

**D-272 · Flaw B, and a separate look for Unstable**
- Date: 2026-10-16
- Question: How is a Flaw shown without the old red X, and how does Unstable stay distinct?
- Decision: A Flaw is an SVG overlay on the frame only: short fracture lines at the edges and a chip missing from the top-left corner. The art is untouched and the frame stays gilt. Large cards and the Inspect thumbnail add a jagged oxblood plate with the Flaw's name; mini cards show only the cracks. Unstable gets its own pulsing dashed halo in a new cold `--unstable` token with a `spark` glyph tag (opacity animation only), and the Graft preview warning uses the same color.
- Reason: red cracks for a Flaw and a cold spark for Unstable can't be confused.

**D-273 · Home layout: the menu first, today's details folded**
- Date: 2026-10-16
- Question: Where do the day's details go so the menu sits above the fold?
- Decision: Top to bottom: the title with a date eyebrow; the Daily plate (date, stars, par, and Enter the vault, Resume or Today's result); four engraved plates with italic subtitles (Practice, How to play, Binder, Stats); a folded "Today's lot" holding the signature card, twist, Appraisal rounds, bonuses and deck; then a footer with the feedback link (hidden when `VITE_FEEDBACK_URL` is unset) and "Next duel in Xh Ym" to local midnight, refreshed every 30 seconds. The "?" button stays for the first-open flow.
- Reason: every menu entry is above the fold at 390×844 and 360×740, and nothing was dropped.

**D-274 · Duel menu sheet: Undo and Restart tiles**
- Date: 2026-10-16
- Question: What do the duel menu's tiles show?
- Decision: The title is "Round N · your turn" (or "his turn") over a 2×2 grid and the last 5 log lines with a "Full log" link; the full log has a small back control and a one-line title. The Undo tile names what it would take back (from `undoLabel`, for example "Summon Ashguard Squire"), or why it is blocked, or "Wait for the Collector" while he acts; Undo stays in the hint bar too. Restart is a disabled "Practice only" tile in the daily duel and tap-twice-to-confirm in Practice.
- Reason: matches the mockup; the label comes from the log events, so no rule lives in the UI.

**D-275 · How to play: demos and "Try it", all data-driven**
- Date: 2026-10-16
- Question: How do the guide's demos and questions survive rule and content changes?
- Decision: Each of the six pages keeps the swipe strip, dots and first-open behavior, and gains a looping demo, one short summary paragraph and a "Try it" question; the old lines move under an "All the rules" fold. Demos rest in their finished picture and animate in beats, so they are still under reduced motion or with the animations flag off. The combat demo uses the first one-way advantage pair from the matrix and shows the bonus, not a computed damage number. Try it answers come only from globals and `elements.json`, and a test checks each question has exactly one right answer.
- Reason: step 3's ring change flows through with no edits, and no combat rule is re-implemented in the UI.

**D-276 · Compass placement and wheel layout**
- Date: 2026-10-16
- Question: Where does the in-duel compass sit, and how does the wheel arrange the elements?
- Decision: The compass is a 116 px disc overlaid at the top right of the board area, with `pointer-events: none`, shown while a board or hand monster is selected. It covers the Collector's second trap slot and the top of his right-hand monster, which are not interactive during selection. `wheelLayout` (`apps/web/src/view/wheel.ts`) reads only the compiled elements: a single cycle is laid out in cycle order, so every arrow goes to the clockwise neighbor; anything else keeps content order, with chords for non-neighbors and a double-headed arrow for a two-way pair (today's Lumen ⇄ Umbra). The center shows `+{ELEMENT_BONUS}`.
- Reason: the board has no free space beside the cards. The compass can hide the corner of his right-hand card; revisit this with the lanes UI (D-281).

**D-280 · Summoning sickness: monsters-only on the summon turn (owner ruling R1, 2026-10-16)**
- Date: 2026-10-16
- Question: After playtests, a freshly summoned monster feels useless. What may it do on its summon turn, and what do Swift and Slow mean afterwards?
- Decision (owner ruling, defaults accepted): from round 2 on, a monster may attack **monsters** the turn it is summoned but not the player's life; it may attack life from its owner's next turn. **Swift** becomes "may also attack life directly the turn it is summoned". **Slow** becomes "cannot attack at all the turn it is summoned". The player still cannot attack on round 1 (D-015, absolute).
- Decision (judgment, flagged): one global, `SICKNESS_MODE: 'classic' | 'monstersOnly'`, shipped default `'classic'` (today) until the sim A/B. `attackPermission` (ARCHITECTURE §6.2) becomes:
  - `base = entered !== turn ? 'any' : (SICKNESS_MODE === 'monstersOnly' ? 'monstersOnly' : 'none')`;
  - Swift grants `'any'` under `monstersOnly` and `'monstersOnly'` under `classic` (so classic Swift is unchanged);
  - Slow still restricts to `'none'` while `ownTurnsSinceEntered < SLOW_TURNS` (1), so it becomes meaningful with no change of its own;
  - the fold `min(max(base, grants), restr)` is unchanged, so Slow beats Swift as today.
- **"Summoned" means any new `Monster` record with `entered = turn`**: a hand summon in any mode; `summonCovetous`; a Graft Chimera (including an Ascended one; it dispatches no `onSummon`, D-065, but is still new); an **Appraised monster** (D-077 resets `entered` to the Collector's turn, so for that turn it can hit monsters but not life, and a Slow one cannot attack); a card that Echo, Grave Recall or Restoration returned to the hand and that is summoned again. It does **not** cover a lane move, an attack/guard switch, a flip, Ward loss or a stat change; none of those touch `entered`.
- Pierce spillover to life on the summon turn is still dealt: it is combat damage to a monster, not a direct attack (D-039 unchanged). The reposition ban on the summon turn (DESIGN round step 2) stays.
- Text changes (content-author): Swift "Can also attack life directly the turn it is summoned." Slow "Cannot attack the turn it is summoned." The Swift row must not claim "not life directly" any more.
- Resolves paper-sim **M-01**: Slow is no longer a no-op, so `SLOW_TURNS = 2` is withdrawn as a lever (the global stays, value 1).
- Reason: the owner ruled it. A single enum keeps today's behavior as the default-off variant and one switch for the sim.
- Open owner questions: items 2 and 3 of D-288.

**D-281 · Lanes: each monster faces one enemy monster (owner ruling R2a, R2b, R2e, 2026-10-16)**
- Date: 2026-10-16
- Question: How do the three monster slots become lanes, and what is a legal attack?
- Decision (owner ruling): the 3 slots per side are lanes, mirrored. A monster can attack only the enemy monster in the lane across from it. If that lane is empty it cannot attack life; a direct attack is legal only when the enemy's whole monster board is empty (and R1 permits life, so `attackPermission === 'any'`).
- Decision (judgment): **lane identity.** Lane `i` is slot index `i` (0 = leftmost as the viewer sees it, `i < BOARD_SLOTS`) on both sides. Player slot `i` faces Collector slot `i`. D-237's layout mirrors the rows vertically (his on top) and never left-to-right, so slot 0 is the left column on both rows; the web must render columns, not a horizontal flip. The engine knows nothing about layout. "Leftmost" everywhere means lowest slot index = lowest lane.
- Switch: `FLAGS.LANES`, default `false` (all slots are free targets, as today).
- Target function (`lanes.ts`, pure, O(3)): `laneTargets(state, attackerIid) → Iid[]`. With `LANES` off it returns all enemy monsters filtered by classic Sentinel (D-037, D-038). With `LANES` on:
  1. `C` = the lanes the attacker reaches = `{ lane(A) + o : o in attackReach(A) } ∩ [0, BOARD_SLOTS)`; `attackReach` defaults to `{0}` (D-284).
  2. `T` = the monsters in lanes `C` (face-down ones included).
  3. Sentinel cover (D-283) is applied to `T`.
  4. If the enemy has no monster at all, the only target is direct (`-1`), subject to permission. A non-empty enemy board with `T` empty gives the attacker **no legal attack**.
- The `attack` action keeps its shape (`target: Iid | -1`). `previewCombat`, hooks, traps and combat resolution are untouched; lanes change only which attacks exist.
- Vain (D-052, D-091): "best legal target" is now at most the opposite monster, or the Sentinel choice(s) of D-283. With no legal target, the monster has no obligation and `endTurn` is not blocked.
- Reason: owner ruling. Slot index as lane needs no new state and no renumbering. Not mirroring left-to-right keeps "leftmost" one idea.

**D-282 · Lane moves (owner ruling R2c, 2026-10-16)**
- Date: 2026-10-16
- Question: What does a lane move cost, and where may a monster move?
- Decision (owner ruling): each turn each monster may make **either one lane move or one attack/guard switch, not both**, and neither on the turn it was summoned.
- Decision (judgment, from the owner's default): a lane move is a **step of up to `LANE_MOVE_RANGE` (1) lanes** into an empty own lane, or, when `FLAGS.LANE_SWAP` is on (default true), **a swap with the own monster in that lane**. A swap spends the reposition of **both** monsters, so it is legal only when both are eligible (`entered < turn` and `repositioned !== turn`). Both monsters get `repositioned = turn`.
  - It keeps position and face-down state; it changes only the slot. A face-down monster may move.
  - A moved monster may still attack that turn, from its new lane (moves belong to the reposition step, which closes at the play or the first attack, D-014, D-155, D-190).
  - The single `repositioned` stamp already used for the switch is the shared "used your reposition" mark, so "not both" needs no new state.
- New action `{ t: 'moveLane'; m: Iid; to: number }` (`to` is the target lane). New event `LaneMoved { iid, from, to, swapped: Iid | -1 }`. Enumeration order: after `reposition m`, for each own `m` in slot order, `to` ascending.
- Switch: only exists under `FLAGS.LANES`; `FLAGS.LANE_SWAP` and `LANE_MOVE_RANGE` are the A/B levers.
- Reason: a one-step move with swap is a single rule (move to the neighbor lane; if occupied, trade places). A free choice of any empty lane is not needed with 3 lanes: 0 to 2 takes two turns, which is a real cost and is what makes Sentinel placement matter. An "empty only" rule would let a full board never rearrange, so a Sentinel could not be placed and a bad summon lane would be permanent.

**D-283 · Sentinel reach under lanes (owner ruling R2d, 2026-10-16)**
- Date: 2026-10-16
- Question: What does "guards its own lane and the adjacent lanes" mean when attacks only go across?
- Decision (owner direction, owner's suggestion made precise): a face-up Sentinel in lane `s` **covers lanes `s − SENTINEL_REACH … s + SENTINEL_REACH`** (clamped; `SENTINEL_REACH` default 1). For an attacker whose lane is `a` (and whose reach set is `C`, D-281):
  - if the defender in lane `a` is a face-up Sentinel, its only target is that monster;
  - else if any face-up enemy Sentinel covers `a`, the attacker's targets are **those Sentinels** (the attack is redirected to them). The attacker chooses when two Sentinels cover `a` (one `attack` action each); the engine needs no tie rule, and the AI breaks the choice by "best legal target" then leftmost (D-091, D-090);
  - else the target is the monster in lane `a`.
- **An empty lane `a` covered by a Sentinel gives the attacker that Sentinel as a target** (owner asked for one rule; this is mine). A Sentinel's cover is a statement about which attacks must go to it, so it applies whether or not the attacker's own lane is occupied. This also keeps a board with one Sentinel from freezing the opponent's attackers. The empty-board rule (D-281) never meets a Sentinel, since no Sentinel means an empty board.
- A face-down monster is never a Sentinel (D-037: face-up only); one in lane `a` can be bypassed by a covering face-up Sentinel. Ward on the Sentinel or the Sentinel being in guard changes nothing here.
- `SENTINEL_REACH` is read only when `FLAGS.LANES` is on. `0` means Sentinel guards its own lane only: it protects nothing beyond what the lane already does, so Sentinel is then close to a plain wall. It is the A/B variant.
- The keyword is the `restrictTargets` hook as today; it receives the lane geometry in its environment.
- Text: "Enemy attacks in its lane and the lanes beside it must target it." (one sentence).
- Reason: classic Sentinel was "the attacker may choose among Sentinels"; this keeps that, shrinks the cover from the whole board to three lanes, and has no special case for empty lanes.

**D-284 · Lane placement, "leftmost" and every lane-sensitive rule (owner ruling R2f, R2g, 2026-10-16)**
- Date: 2026-10-16
- Question: Where do monsters land, which tie-breaks stay, and which cards need new wording?
- Decision (owner ruling, defaults accepted): the player picks any empty lane for a summon. Reach keywords are DEFERRED until base lanes are simmed.
- Decision (judgment), under `FLAGS.LANES`; with it off everything keeps "leftmost free slot":
  - **Summon, summonCovetous, Graft**: `summon` gains `lane`, `summonCovetous` gains `lane`, and `graftPosition` gains `lane` (the stage that commits). Legal lanes are the empty ones (for Covetous and Graft, after the sacrifice frees its lane). One legal action per (card, mode, lane), lane ascending. The Chimera does **not** inherit a material's lane; the player chooses. `lane` is optional in the type and means "leftmost free" when absent (classic). Engine rejects a lane under `LANES` off and requires it under `LANES` on.
  - **Appraisal** (D-075…D-079): tie-break stays "lowest slot of the player's monsters" (the highest-Power rule is untouched). The stolen monster goes to his **leftmost free lane** (unchanged), else the vault. Reason: no new rule; where he places stolen cards is a Collector detail the AI policy already owns.
  - **Other leftmost uses stay as they are**: trap slots and trap order (D-071), destruction batch order (slot order), Unstable expiry order, Desperate `allAttack` order, AI tie-breaks (D-090). Lane order = slot order.
  - **Haunt, Pierce**: unchanged (they act on the combatants).
  - **Brittle**: unchanged; the defender's lane decides who can hit it, so a Brittle monster is exposed only to the attacker across from it or a Sentinel redirect.
  - **Spells keep free targeting** (Unmake, Forfeit, Bloodlust, Gilt Frame, Shroud, Restoration, Grave Recall): they target by `TargetSpec`, not by attack. Lanes are why a removal spell matters. No spell or trap text changes. Trap triggers (`onAttackDeclared`, Thornwall's "directly") are unchanged. **Thornwall** now only fires when the player has no monster at all, which is accepted (record for balance).
  - **Reach hook point (R2g)**: a query hook `attackReach(self, env) → readonly number[]` (lane offsets, default `[0]`, union fold, order-independent) in the registry. No keyword defines it. A test-only keyword proves it. `forEachLegal` and `laneTargets` already call it.
- Reason: a lane the player selects is the smallest change that keeps summoning a choice. Spells keep the escape from the lane rule. Appraisal keeps its code and its D-077 position rule.

**D-285 · Element ring (owner ruling R3; order A chosen by the owner on 2026-10-16, see D-288)**
- Date: 2026-10-16
- Question: Players saw a monster "both strong and weak against one type" (the Lumen⇄Umbra pair). Which single 5-cycle replaces the Ember→Gale→Tide→Ember cycle plus that pair?
- Decision (owner ruling): one 5-cycle; each element beats exactly one and loses to exactly one. `ELEMENT_BONUS` stays 2 and applies to the attacker only.
- **OWNER DECISION PENDING: the order.** Options (arrow = beats):
  - **A (recommended): Ember→Gale→Tide→Lumen→Umbra→Ember.** The illustration the owner has seen, and it is the order of the element rows in DESIGN and elements.json, so "each beats the next one down, Umbra wraps to Ember" is one sentence. Keeps ember>gale, gale>tide, lumen>umbra; drops tide>ember and umbra>lumen; adds tide>lumen and umbra>ember. (The earlier summary said it keeps two; it keeps three.) Themes: Ember burns Gale (aggression outpaces speed); Gale cuts Tide (Swift and Pierce through durability); Tide drowns Lumen (durable and Echo ground down defensive walls); Lumen exposes Umbra (light against tricks); Umbra smothers Ember (Haunt and Pierce punish the high-Power rush). Identity: Tide, "Durable", is now the natural answer to the Sentinel/Ward element; Ember's checker becomes Umbra, which is the Collector's biggest element (4 Relics + ace), so the player's Ember hits harder there. Weakest part: water no longer beats fire.
  - **B: Ember→Gale→Tide→Umbra→Lumen→Ember.** Keeps ember>gale, gale>tide, umbra>lumen; adds tide>umbra and lumen>ember. Themes: Tide washes out Umbra; Umbra undermines Lumen's defenses; Lumen quells Ember (walls stop rushes). Identity: Lumen finally gets an offense into the aggressive element, Umbra is held down by Tide (Ward and Echo vs Haunt and Pierce). Cost: Lumen, the defensive element, now has its only advantage over Ember, whose Power lead it already cannot match.
  - **C: Ember→Gale→Umbra→Lumen→Tide→Ember.** Keeps ember>gale, tide>ember, umbra>lumen (water beats fire survives); adds gale>umbra and lumen>tide; drops gale>tide and lumen>umbra. Themes: Gale outruns Umbra's tricks; Umbra beats Lumen; Lumen dries Tide; Tide douses Ember. Identity: Gale (Swift, Pierce) becomes the Umbra answer, which fits the fast/tricky contrast. Cost: it breaks the Ember/Gale/Tide trio players already learned and moves two edges.
  - Recommendation: **A**, on teachability and because the web wheel (D-271) reads the order straight from the data. B and C are alternates for the sim.
- Data-only change: `packages/content/elements.json` `beats` arrays (one id each) plus the `identity` strings if the owner wants them to reflect the new matchups. **Checked: nothing in code assumes the old matrix shape.** `compile.ts` builds `beats` and `opposes` from the arrays for any shape; engine and ai tests use their own fixtures (`fx-*`, `fire/air/water`, and content `test-utils/fixture.ts`), so none pins Lumen/Umbra mutual advantage in the real matrix (the "both ways" tests in engine `combat.test.ts` and `stats.test.ts` run on the engine fixture and stay valid as tests of the mechanism); `content/test/guide.test.ts` mentions lumen only as a card element. `validate.ts` checks only that each `beats` id exists. The web wheel and "weak to" list are data-driven (D-271). The DESIGN text ("Lumen and Umbra beat each other both ways", the Beats column) and the howto row are the only edits. Check `packages/content/test` and the content guide for a hard-coded matrix when the change lands.
- Effect on Unstable: `opposes` is beats in either direction, so a 5-cycle has 5 opposing pairs of 10 (today 4 of 10). Unstable Chimeras become slightly more common; the sim measures it.
- Reason: owner ruling; the order is a design choice the owner has not made.

**D-286 · Collector AI under lanes (extends D-081…D-093, D-217; 2026-10-16)**
- Date: 2026-10-16
- Question: Which §13.2 rules change when attacks go across?
- Decision (judgment; the AI still sees only public information, ties by leftmost then card id):
  - **Summon lane** (new data, `collector.json › ai.params.summonLane`, an ordered list; first rule that yields lanes narrows the candidates, final tie leftmost): `sentinelCenter` (a Sentinel takes the middle lane if free, else the free lane covering the most of his occupied lanes); `facingBeatable` (a free lane whose attacker target, per `laneTargets` from that lane, is a face-up monster the card beats by `previewAttack`; the highest Power target wins); `facingEmpty` (a lane across from an empty player lane, so the card cannot be attacked by that lane's occupant); `leftmostFree`. Default list: `["sentinelCenter","facingBeatable","facingEmpty","leftmostFree"]`.
  - **Play 2 (`summonAce`)**: lane from `summonLane`; the sacrifice frees a lane first.
  - **Play 3 (`summonBeater`)**, reworded: "If a lane is open and he holds a monster that beats the monster it would attack from that lane (the opposite one, or the Sentinel it is redirected to), play the card and lane whose target has the highest Power; ties leftmost lane, then card id." It replaces "beats your strongest face-up monster", which is not reachable from every lane. Under `classic` sickness the comparison is the threat for next turn; the check is the same `previewAttack`.
  - **Play 6 (`summonFallback`)**: unchanged text; lane from `summonLane`.
  - **Attack 1 and 4** (`lethal`, `directIfEmpty`): unchanged text; direct is legal only on an empty board.
  - **Attack 2 (`killWithoutLoss`)**: "Destroy your highest-Power monster he can beat without losing his attacker" is restricted to currently legal (attacker, target) pairs. Which attacker is nearly forced by lane; attackers only compete for a target when a Sentinel redirects (D-283) or when reach exists (deferred). **M-17 therefore becomes nearly moot**; `strongest` stays the default and `weakestSufficient` only matters for the Sentinel case. The loop recomputes legal attacks after each attack, so killing a Sentinel opens the covered lanes with no extra rule.
  - **Attack 3 (`faceDownIfStrong`)**: legal pairs only. **Attack 5 / Vain**: best legal target per D-091.
  - **M-10 (`skipBrittleCountered`)**: counters only count the monster it would face; no other player monster can hit a Brittle one.
  - **Reposition**: new mode `laneAware`, extending `toAttackIfUsable` (D-089, D-217): a monster makes a lane move or a swap only if, on the redacted copy, the lethal, `killWithoutLoss` and `directIfEmpty` rules then take strictly more kills than before, or a Sentinel is not in the middle lane while moving it there loses no attack; at most one move per monster; candidates in slot order, then target lane ascending, empty lanes before swaps; no attack-to-guard switch (unchanged). The default stays `toAttackIfUsable` until `LANES` ships.
  - `AI_SEARCH_NODE_BUDGET` (600, D-211): lanes triple the summon branching; ai-dev re-checks that the cap still never binds.
  - The redacted view (§13.1) gains `laneTargets(lane)` for hypothetical lanes. Nothing hidden is exposed.
- Reason: rules keep their intent; only the candidate sets shrink to what lanes allow.

**D-287 · Sim A/B switches and rollout (2026-10-16)**
- Date: 2026-10-16
- Question: How are the three changes simmed alone and together, and what ships?
- Decision: all four mechanics ship behind switches with today's behavior as the default; the shipped defaults flip only after the sim and an owner decision.
  - `SICKNESS_MODE: 'classic' | 'monstersOnly'` (core global, default `'classic'`; owner-only lever).
  - `FLAGS.LANES: false` (default off), `FLAGS.LANE_SWAP: true` (read only with LANES), `LANE_MOVE_RANGE: 1`, `SENTINEL_REACH: 1` (both read only with LANES). `Flags` goes from 13 to 15 booleans. `SENTINEL_REACH` and `LANE_MOVE_RANGE` are core numbers because the engine reads them as properties.
  - Ring: alternate `beats` data. `withOverrides` handles globals only, and `sim/world.ts › loadContext` applies nothing to raw content, so the sim needs a small raw-content override: `--set element.<id>.beats=["gale"]` applied before `parseContent`, plus `--ring ember,gale,tide,lumen,umbra` as shorthand for the five sets; the report lists the sets (`overrides`, report.ts). It also needs the documented `card.<id>.<field>` overrides if they are still missing (ARCHITECTURE §11).
  - Each switch is reachable by `--set`: `--set SICKNESS_MODE=monstersOnly`, `--set FLAGS.LANES=true`, `--set SENTINEL_REACH=0`, `--set FLAGS.LANE_SWAP=false`, `--set LANE_MOVE_RANGE=2`.
  - Matrix (playtest-runner, `sim quick` 2000 games, expert and novice bots): baseline; R1; R2; R3-A, R3-B, R3-C; R1+R2; R1+R3; R2+R3; R1+R2+R3; then R2 variants (`SENTINEL_REACH=0`, `LANE_SWAP=false`) and R1 with `APPRAISED_ENTERS_GUARD`. `sim full` for the finalists.
  - The Collector AI under `LANES` needs D-286 first; without it the AI plays lanes badly and the matrix is meaningless. Bots need the same.
- Consequence for rollout: new globals change `state.cfg` (the hash of content and globals), so in-progress saved sessions fail the replay check once shipped. When defaults flip, bump `CONTENT_VERSION` and have the web start a fresh duel with a notice. Regenerate `seeds.json` (`sim seeds`) because the difficulty ratings depend on the rules.
- Reason: one change is one edit (§10.4), and the owner wants each change measured on its own.

**D-288 · Owner questions open after D-280…D-287**
- Date: 2026-10-16
- Question: Which items are still undecided?
- Decision: **owner ruling 2026-10-16: every recommended default below is accepted, and the ring order is A.** The ring still flips only after the step-4 sim (D-287), and B and C stay as sim alternates.
  1. **Ring order** (D-285): A, B or C. Recommended A. **Owner chose A (2026-10-16).**
  2. **Appraised monsters and sickness** (D-280): treat as summoned (can hit monsters, not life, the turn it is stolen). Recommended: yes, then test `APPRAISED_ENTERS_GUARD` (M-03), since a steal followed by a kill in the same turn is a bigger swing than today.
  3. **Pierce on the summon turn** (D-280): still deals spillover to life. Recommended: yes, keep.
  4. **Lane move reach** (D-282): one step with swap. Recommended as written; `LANE_MOVE_RANGE=2` is one sim run.
  5. **Empty lane next to a Sentinel** (D-283): attacker may hit the Sentinel. Recommended as written.
  6. **Chimera lane** (D-284): player's choice rather than a material's lane. Recommended as written.
  7. **Appraisal lane** (D-284): leftmost free. Recommended as written.
  8. **Thornwall** (D-284): only fires on an empty player board under lanes. Recommended: leave, re-check after the sim.
- Reason: the owner accepted every default so far; the list exists so none of these is decided silently.

**D-289 · Sentinel geometry lives in `lanes.ts`, not in the keyword** (engine-dev, 2026-10-16)
- Date: 2026-10-16
- Question: ARCHITECTURE §8.5 calls Sentinel's `restrictTargets` cover-aware. Where does the lane geometry go?
- Decision: `restrictTargets` stays a boolean ("I am a mandatory target for this attacker") and `keywords/sentinel.ts` is unchanged. `lanes.ts` applies D-283: own lane first, then Sentinels within `SENTINEL_REACH` of the attacker's lane. `TargetQueryCtx` gains `attackerLane`, `lanes` and `reach`, so a future keyword can read the geometry.
- Reason: the one tie rule stays in one place. Moving the geometry into the hook later is a small change in `lanes.ts` and `sentinel.ts`.

**D-290 · Swift's hook is mode-aware** (engine-dev, 2026-10-16)
- Date: 2026-10-16
- Question: D-280 changes what Swift grants, and its hook lives in a content keyword file.
- Decision: Only the `attackPermission` line of `packages/content/keywords/swift.ts` changed. Under `classic` it grants `'monstersOnly'` (as before); under `monstersOnly` it grants `'any'`. The card text and examples are unchanged until the defaults flip.
- Reason: there is no other place for the hook, and the examples still pass under the defaults.

**D-291 · AI look-ahead names a lane under `LANES`** (engine-dev, 2026-10-16)
- Date: 2026-10-16
- Question: `packages/ai/src/shared/look-ahead.ts` builds a hypothetical summon with no lane, which the engine rejects when `FLAGS.LANES` is on, so every lanes duel crashed.
- Decision: The smallest fix: add the leftmost free lane when `LANES` is on. Behavior is identical with it off. Real lane play (D-286) stays with ai-dev, who also checks for other hand-built actions.
- Reason: keeps the sim runnable under lanes before the AI round.

**D-292 · Cover is read from the attacker's own lane** (engine-dev, 2026-10-16)
- Date: 2026-10-16
- Question: How does `attackReach` combine with Sentinel cover?
- Decision: The Sentinel check uses the attacker's own lane. A covering Sentinel replaces all reach targets, and a Sentinel in the attacker's lane is the only target, even when `attackReach` excludes offset 0.
- Reason: follows D-283's wording; reach keywords (D-284) can't be used to dodge a Sentinel.

**D-293 · Legal-action enumeration order with lanes** (engine-dev, 2026-10-16)
- Date: 2026-10-16
- Question: The spec put `moveLane` after `reposition` but left the nesting of lane expansions open.
- Decision: `moveLane` entries follow all `reposition` entries. Summon nests card, then mode, then lane. Covetous nests card, sacrifice, mode, then lane; its lanes are the empty ones plus the board sacrifice's lane. Graft's position stage nests position, then lane; its lanes are the empty ones plus the board materials' lanes.
- Reason: a fixed order keeps bots and replays deterministic.

**D-294 · The redacted view answers lane questions per card** (ai-dev, 2026-10-16)
- Date: 2026-10-16
- Question: D-286 assumed a `view.laneTargets(lane)` query. What does the Collector's redacted view expose?
- Decision: `previewSummon(card, lane?, sacrifice?)` returns `targets`, the foe slots from the engine's `laneTargets` on the redacted copy; that is the only hypothetical-lane question the rules ask. A bare-lane query would need a stub attacker, so there is none. The engine facade gains `laneTargets`, `targetsFromLane` and `attackReach` as thin wrappers over `lanes.ts`.
- Reason: answers exactly what the rules need without inventing an attacker.

**D-295 · Covetous lane preview** (ai-dev, 2026-10-16)
- Date: 2026-10-16
- Question: Which lanes may a Covetous summon consider?
- Decision: It is previewed as a Covetous apply over its sacrifice, so a board sacrifice's lane counts as free for `facingBeatable`.
- Reason: matches the engine, where the sacrifice frees its lane (D-293).

**D-296 · `laneAware` reposition: kill score and the Sentinel clause** (ai-dev, 2026-10-16)
- Date: 2026-10-16
- Question: When does the Collector move a lane under `reposition: laneAware`?
- Decision: After the `toAttackIfUsable` switch, lane moves are considered in slot order, then destination ascending, empty lanes before swaps. A move is taken if it strictly raises the kill score (distinct targets taken by `lethal`, `killWithoutLoss` and `directIfEmpty`, plus 100 when a lethal attack exists), or if it puts a face-up Sentinel in the middle lane without lowering the score or losing that Sentinel's usable attack. The default reposition stays `toAttackIfUsable`; whether `laneAware` becomes the default is a sim question.
- Reason: deterministic, cheap, and it only moves when the move helps.

**D-297 · `summonBeater` under lanes** (ai-dev, 2026-10-16)
- Date: 2026-10-16
- Question: D-286's "beats your strongest face-up monster" has no meaning when a summon only faces one lane.
- Decision: Under `LANES`, each (card, lane) pair is previewed against the monster across or the covering Sentinel. The pair whose beaten target has the highest Power wins; ties go to the leftmost lane, then card id. It no longer requires beating the player's strongest monster.
- Reason: a lane summon can only threaten what it faces.

**D-298 · Bot lane heuristics** (ai-dev, 2026-10-16)
- Date: 2026-10-16
- Question: How do the greedy and expert bots value lanes?
- Decision: `evaluate` gains two terms read only under `LANES`, in the bot weight files (D-222; untuned): `laneFace` (plus per lane where my face-up monster beats the one across, minus where theirs beats mine) and `sentinelCover` (plus per own lane covered by my Sentinel). Greedy penalizes a no-op `moveLane` by 1e-6 so ties favor ending the turn. The expert adds one plan node per single lane move. The novice stays uniform over legal actions.
- Reason: gives the bots a lane sense without changing anything when lanes are off.

**D-299 · No search-budget change for lanes** (ai-dev, 2026-10-16)
- Date: 2026-10-16
- Question: Lanes roughly triple summon branching. Does `AI_SEARCH_NODE_BUDGET` (600) need to rise?
- Decision: No. At 600 and at 100,000, greedy and expert gave identical outcomes under lanes plus monsters-only plus `laneAware`, so the cap never binds. The expert runs about 2.4× slower under lanes (372 → 152 duels/sec single-process); trimming its plan limits (`maxPlans` 400 → 200, `finalists` 30 → 15) is an untested proposal.
- Reason: measured, not assumed.

**D-300 · Content overrides in the sim** (playtest-runner, 2026-10-16)
- Date: 2026-10-16
- Question: D-287 planned `--set element.<id>.beats`. What does the sim actually accept?
- Decision: `--ring A|B|C|a,b,c,d,e` rewrites the `elements.json` `beats` arrays into one cycle on a clone of the raw content, before parse and compile (`packages/sim/src/overrides.ts`); it rejects anything that is not a permutation of the element ids. `--collector ai.<path>=<json>` (repeatable) sets fields of `collector.json › ai`, still validated by the schema; `--collector-reposition MODE` is shorthand. Workers receive the same override strings. The report header lists every override, and the content hash reflects them. The `card.<id>.<field>` overrides from ARCHITECTURE §11 are not built yet.
- Reason: the matrix needed only the ring and the Collector `ai` block.

**D-301 · `sim quick --seed-check`** (playtest-runner, 2026-10-16)
- Date: 2026-10-16
- Question: How does a quick cell report seed rejection without a 60-date full run?
- Decision: `sim quick --seed-check` runs the difficulty check over the quick run's own `--seed-dates`.
- Reason: per-cell seed rejection at low cost; the 60-date full runs remain the reference.

**D-302 · New per-bot sim metrics** (playtest-runner, 2026-10-16)
- Date: 2026-10-16
- Question: How are the new metrics defined?
- Decision: Damage is the life change across each action, divided by rounds played in finished games, split into damage to the Collector and to the player. Direct share is damage from attacks with target -1. Unstable counts Grafts whose Chimera enters Unstable (`unstablePerGame`, `unstableGameShare`). Vault-sealed share is `vaultSealed` endings over finished games. Also `medianWinRound`. Existing metric definitions are unchanged.
- Reason: measures the owner's burst-damage concern and the ring's Unstable effect.

**D-303 · Finalist rule for the A/B matrix** (playtest-runner, 2026-10-16)
- Date: 2026-10-16
- Question: Which matrix cells get full runs?
- Decision: Distance to target is the sum of per-target shortfalls, each divided by its band width (the rounds 8–12 term uses the 50% threshold). The three closest cells plus 123L (the full owner package) got `sim full`.
- Reason: 123L is always wanted; the top three show the alternatives.

**D-304 · Pass/fail marks in the matrix** (playtest-runner, 2026-10-16)
- Date: 2026-10-16
- Question: Which matrix columns get pass/fail marks?
- Decision: Only columns with a DESIGN target. Greedy win rate, vault-sealed share, Unstable rate and damage per round are information only.
- Reason: no invented targets.

**D-305 · Bond actions: Graft, Split and Symbiosis as the main chess pieces (owner picks, 2026-10-16)**
- Date: 2026-10-16
- Question: Games are getting shorter, so each turn must matter more. How do Graft, Split and Symbiosis become three real options whose value depends on the board?
- Decision (owner picks, fixed): the three are **bond actions**, each with one job.
  - **Graft = power**: one big body, but 2 cards for 1 and an Appraisal magnet (unchanged, D-056…D-065).
  - **Split = tempo and evasion** (D-307): unbind your own face-up Chimera into its stored materials.
  - **Symbiosis = staying power and protection** (D-308): attach a base monster from your hand under a face-up board monster.
  - **Turn shape** (D-306): one card play plus one bond action per turn, either order, behind `FLAGS.BOND_ACTION`. Today's rule (Graft is your one play) stays the default.
- Decision (judgment): three independent switches, all default off, each A/B-able alone (D-310): `FLAGS.SPLIT`, `FLAGS.SYMBIOSIS`, `FLAGS.BOND_ACTION`. With a switch off the engine is byte-for-byte today's: same legal actions, same outcomes. Only `state.cfg` changes (new globals), so saved sessions fail the replay check once shipped (D-287).
- Decision (judgment): **Split and Symbiosis are player-only.** The Collector never grafts, splits or symbiotes (DESIGN, locked). `canBond(side) = side === 0` is hardcoded in the engine, like `canGraft` for the Collector is data in `collector.json`; here there is no data switch because the rule cannot change without a DESIGN edit. An Appraised Chimera or host on his board is never split or bonded by anyone.
- Decision (judgment): when a bond switch is on but `BOND_ACTION` is off, Split and Symbiosis are **plays** (they set `played`, move `step` to `'attack'`), like Graft today. So `SPLIT` alone means "Split competes with summoning for the one play"; that is the cell the sim needs.
- Reason: three options with different jobs, chosen by the board, is the owner's goal. Independent switches let the sim separate "more actions per turn" from "new action kinds".

**D-306 · Turn shape: one card play plus one bond action (`FLAGS.BOND_ACTION`)**
- Date: 2026-10-16
- Question: What does a bond action cost, when can it be taken, and what does Graft's hand-material use do to the play?
- Decision (owner pick): with `BOND_ACTION` on, a turn has **one card play** (summon, Covetous, cast, set trap) **and one bond action** (Graft, Split or Symbiosis), in either order. Off (default): Graft is a play, and Split and Symbiosis, if enabled, are plays too.
- Decision (judgment), with `BOND_ACTION` on:
  1. **Max one bond action per turn.** `BONDS_PER_TURN` is a pinned global = 1 (D-205 pinned pattern). Ascend is the second step of the same Graft (pending), so it is one bond action.
  2. **A Graft never consumes the card play, even when its materials come from the hand.** The player may therefore use up to 3 hand cards (Ascend) plus the play card in one turn. This is the "3 cards in one turn" problem. It is bounded by the lever `BOND_GRAFT_MAX_HAND_MATERIALS` (default 3 = no limit; the sim also runs 1 and 2). The cost is real: 5-card hand, 2 draws a turn.
  3. **State:** `GameState.bond: 0 | 1 | 2` (0 open, 1 used, 2 closed), reset to 0 in `startTurn`. It is only written when `BOND_ACTION` is on; with it off it stays 0, so default play is unchanged. Bond actions are legal while `bond === 0` and `step` is `'main'` or `'attack'`.
  4. **The first attack closes the bond** (`bond = 2`), as it closes the play and the reposition step (D-014, D-155, D-190). Reason: otherwise "attack with X, then graft X away" is a free extra attack, and Split after an attack would be strictly better than before. Playing a card moves `step` to `'attack'` as today and does not close the bond.
  5. **A bond action does not close the reposition step** and does not set `played`; only a play or an attack does. Graft's commit calls `bondUsed(run)` instead of `playUsed(run)` and leaves `step` alone.
  6. The `played` guard on `graftBegin` becomes the `bond === 0` guard. A Graft cancelled at any stage leaves `bond` at 0.
- Reason: simplest reading of "1 card play + 1 bond action". Closing at the first attack keeps D-014's idea (attacking ends the planning part of the turn) and costs one three-valued field.

**D-307 · Split: unbind a Chimera (`FLAGS.SPLIT`)**
- Date: 2026-10-16
- Question: How does a Chimera come apart?
- Decision (owner pick): your own face-up Chimera on the board comes apart into its stored materials (`ChimeraInfo.materials`, in stored order; Ascended = 3). Base monsters cannot split. New action `{ t: 'split'; m: Iid }`, one step, no pending state.
- Facts about storage (checked in `graft.ts`): Graft sends hand and board materials to the owner's **discard** and keeps their iids in `ChimeraInfo.materials`. So Split takes them back out of the discard.
- Decision (judgment), legality: `FLAGS.SPLIT`; side is the player; `m` is a face-up Chimera on the player's board with `chimera !== null`; `m.entered !== turn` (a Chimera that entered this turn cannot split: no free "graft then unbind", no Echo-summon then unbind); **every stored material is currently in the owner's discard** (a material taken back by Grave Recall makes the Chimera unsplittable; this also prevents two cards with one iid); `m` carries no symbiote (D-308); the bond is open (D-306) or, with `BOND_ACTION` off, the play is unused.
- Decision (judgment), resolution:
  1. The Chimera record leaves the board. The Chimera **instance is dissolved**: it goes to no zone (not discard), so Grave Recall and Echo cannot bring back a Chimera whose parts are also in play. Card conservation gets one more exception (ARCHITECTURE §4). No `Destroyed`, no `onDestroyed` hooks (no Echo, Haunt, Last Rites, Insurance Claim), no Ward check: it is not destruction.
  2. **Placement.** The first material takes the Chimera's slot (so the lane is kept). Each other material, in stored order, takes the leftmost free slot. A material with no free slot goes to the **hand** (never lost; the hand may exceed `HAND_SIZE`, which only limits drawing, D-011). With `LANES` on there is no lane choice, so there is no new action fan-out; a moved part can use `moveLane` later.
  3. **Position and state.** Every part enters face-up in the Chimera's current position. Each part is a fresh record: `wardUsed = false` (a used Ward comes back), `permP/permG = 0` (plus `SPLIT_PART_PERM_P`, default 0), no timed mods, `unstableUntil = -1` (this is how Split escapes the Unstable self-destruct), `shroudUntil = -1`, `appraised = false`, `sym = -1`.
  4. **Sickness.** Each part has `entered = turn` (it is "summoned", D-280) **and** `attacked = turn`, so it **cannot attack this turn in either `SICKNESS_MODE`, and Swift does not help** (owner pick: parts enter unable to attack). No new field: `attacked === turn` already makes `attack` illegal. A part may not reposition or move lanes this turn (`entered === turn`). On the next own turn it is free.
  5. Parts dispatch **no `onSummon`** (D-065 pattern) and no `onGraft`. `Track` is unchanged.
  6. A split Chimera that was Ascended gives 3 parts; the Ascend bonus is gone with the Chimera.
  7. Chimera that came back via Echo or Grave Recall and was summoned again: `ChimeraInfo` is on the instance, so it splits like any other as long as its materials are still in the discard. With `FLAGS.CHIMERA_TO_HAND` false (M-12) this case does not occur.
  8. Unstable Chimera: may split (escape). Parts are not Unstable. Re-grafting the parts in another order or element later makes a new Chimera.
- Uses (for the preview): dodge Appraisal in rounds 3, 6, 9 when the Chimera is the target; recover board width or lanes; re-graft in another order or element; escape Unstable; refresh a used Ward. Costs: the Chimera's stats, Ascend and Unstable bonuses; parts cannot attack this turn; with a full board, parts go to the hand.
- Reason: the owner's pick, with the least new state (none) and one deterministic placement rule.

**D-308 · Symbiosis: host and symbiote (`FLAGS.SYMBIOSIS`)**
- Date: 2026-10-16
- Question: How does attaching a card work, and what is its state?
- Decision (owner pick): attach a base monster from your hand under one of your face-up board monsters (the host). The host gets `+SYMBIOSIS_GUARD_BONUS` Guard (2) and the symbiote's keyword. The symbiote uses no slot. When the host is destroyed, the symbiote comes out in the host's slot (lane). If the host is Appraised, the Collector gets both. New action `{ t: 'symbiose'; c: Iid; host: Iid }`, one step, no pending state.
- Decision (judgment), state: `Monster.sym: Iid` (−1 none) on the host record; ARCHITECTURE §4. The symbiote instance is in no zone array while attached (a new "attached" location: `locate` returns it, card conservation counts it). It keeps its owner (D-047). **Public information**: the attached card is face-up, so its identity is public (D-311).
- Decision (judgment), eligibility: player only; `c` is a base monster in the hand (not a Chimera card in the hand, not a spell or trap); `host` is a **face-up** monster on the player's board, Chimera or base, with `sym === -1` (**one symbiote per host**, pinned global `SYMBIOTES_PER_HOST = 1`); bond open or play unused (D-306). A face-down host is not eligible (it would hide an attachment; the owner said face-up). Hosts per turn are not limited beyond one bond.
- Decision (judgment), effect:
  - Guard: `effectiveGuard(host) += SYMBIOSIS_GUARD_BONUS` while `sym >= 0`, floored at `STAT_FLOOR`. **Power is unchanged**, so Appraisal's 7-Power check and "highest Power" ignore the bonus. The symbiote's own Power and Guard are unused while attached.
  - Keywords: `active(host) = hostKw | (popcount(hostKw) < MAX_INHERITED_KEYWORDS ? keywordBits(symbiote) : 0)`, keyword bits only, never Flaws. So a base host (≤1) takes the symbiote's keyword; a Chimera host with 2 keywords takes only the Guard. A face-down or Ward-used host is masked by the existing rules (Ward used removes the Ward bit whichever card gave it). A keyword the host already has adds nothing.
  - The bonus keyword is read wherever keywords are read: hooks, Sentinel cover, Pierce, Haunt/Echo in the LKI snapshot (D-122), `attackPermission`.
- Decision (judgment), when the host leaves the board:
  - **Destroyed (combat, effect, Unstable expiry)** or **returned to hand by any effect**: after the removal and `Destroyed` (or `ReturnedToHand`) and **before** `onDestroyed` dispatch, the symbiote becomes a fresh monster in the host's slot, in the host's position (face-up), with `entered = turn` (it is "summoned", D-280; `attacked` unchanged, so on its owner's next turn it attacks freely and on the foe's turn it simply stands), `wardUsed = false`, no mods, no `onSummon`. Its slot is always free at that moment, so no fallback rule is needed. A Ward on the host that prevents the destruction leaves the symbiote attached. Echo on the host returns the host to the hand and the symbiote still comes out.
  - **Appraised**: the Collector takes the host. If it goes to his board, the record keeps `sym` (attached on his side, public to him, with the Guard and keyword). If it goes to his vault, the symbiote goes to the vault as a second card. When a Collector-side host is later destroyed, the symbiote comes out on **his** side in that slot with `appraised = true` (he acquired it by Appraisal; it is a legal Covetous sacrifice) and goes to the player's discard when it dies (D-047). `appraisal.taken` lists the host only; `Track.appraisedLost` counts one Appraisal (host); the symbiote shows in `Appraised.sym`.
  - **Sacrificed as a Covetous sacrifice** (his host): the symbiote goes to the player's discard with it (`Sacrificed`, reason `covetous`, from `board`).
  - **Graft material and Split**: a host with a symbiote is **not an eligible Graft material and cannot split.** Bonding commits the host. (Simplest rule; the alternatives need an extra state or placement rule. See D-316 Q5.)
- Uses and costs (for the preview): resilience (a second body behind the host, +2 Guard, a borrowed keyword), works on a full board (no slot), makes a Sentinel or Ward host. Bad: Appraisal costs two cards; the attached card is not attacking; a kill on the host costs the foe nothing extra but the symbiote then stands in a lane it did not choose.
- Reason: owner's pick. One field on the host record is the least state; the "emerges where the host stood" rule is one destroy-path call.

**D-309 · Interactions table (bond rules with existing rules; D-280…D-293, D-056…D-079)**
- Date: 2026-10-16
- Question: What does each existing rule do with the new actions, with the lanes, sickness and ring switches both on and off?
- Decision (judgment):

| Rule | Behavior |
| --- | --- |
| Appraisal (D-075…D-079) | Candidate test unchanged: face-up, not Shrouded, **Power** ≥ 7 (Guard bonus ignored), highest Power, tie leftmost. Host taken: symbiote follows (D-308). Shrouded host or Chimera is safe and may still split or bond. Split parts are base monsters: a Wyrm with Power ≥ 7 is a target again. |
| Appraisal + Shroud | Shroud is per host record; the symbiote has none. A Shrouded Chimera that splits loses its Shroud (parts are fresh), so splitting a Shrouded Chimera is rarely wise. |
| `SICKNESS_MODE` classic / monstersOnly | Split parts: cannot attack this turn in both modes, no Swift exception (D-307). Emerging symbiote: `entered = turn`, so a new record under D-280; Swift/Slow behave as for any entry. |
| `LANES` off | Split: first part in the Chimera's slot, the others leftmost free. Symbiote: host's slot. |
| `LANES` on | Same: the first part keeps the lane, the others take the leftmost free lane, no lane parameter on `split` (D-307). The emerging symbiote takes the host's lane. `symbiose` has no lane. Sentinel cover (D-283) is recomputed from the host's active keywords, so a Sentinel symbiote makes the host a Sentinel. |
| Sentinel (symbiote-granted) | The host is a Sentinel while face-up; `restrictTargets` reads active keywords. |
| Swift / Pierce / Ward / Haunt / Echo (symbiote-granted) | Active keywords of the host. Haunt and Echo use the LKI snapshot at destruction (D-122), which already includes the granted bits. Ward is the host's `wardUsed`; the symbiote's own Ward is intact when it emerges. |
| Slow / Vain / Brittle / Tethered / Covetous | Flaws are never granted by a symbiote (keyword bits only). |
| Unstable (D-061, D-152) | Chimera host: allowed. At expiry the host is destroyed and the symbiote comes out. Split is the other escape. Counts the +3 only while the Chimera lives. |
| Last Rites, Insurance Claim (D-073) | Trigger once for the host's destruction. The emerging symbiote is not a destruction and does not trigger them. |
| Counterfeit (Collector trap: a Chimera grafted this turn loses 3 Power) | Fires on `onGraft` only. Split parts are not a Chimera. Split also removes a `permP` malus the Chimera carried. |
| Haunt on a split Chimera | No Haunt, no Echo: Split is not destruction. |
| Echo / Grave Recall / Restoration | Grave Recall returning a stored material makes its Chimera unsplittable (D-307). A Chimera in the discard is not affected by Split of a different Chimera. A returned host's symbiote has already come out. |
| Covetous summon (D-054) | Sacrificing an Appraised host with a symbiote sends both to the player's discard (D-308). The AI's sacrifice pick stays "weakest, vault before board" (D-213). |
| Thornwall | Unchanged. |
| Forfeit, Unmake, Bloodlust, Gilt Frame, Shroud | Target hosts normally. A destroyed host brings out its symbiote. Timed mods on a host do not pass to the symbiote. |
| Vault sealed, Track | No change. Sim counters come from events (D-314). |
| Hand overflow | Split parts that find no slot go to the hand; the hand may exceed `HAND_SIZE`. |

- Reason: each row follows from "fresh record on entry, keyword bits only, Power untouched".

**D-310 · Globals and flags for the bond rules**
- Date: 2026-10-16
- Question: Which switches and numbers does the engine need, and where do they live (D-166, D-205)?
- Decision (judgment): `FLAGS` goes from 15 to 18 booleans. All new keys are in `globals.ts`; every number is one edit.

| Key | Default | Kind | Read when |
| --- | --- | --- | --- |
| `FLAGS.SPLIT` | `false` | flag, owner-only | `split` is legal |
| `FLAGS.SYMBIOSIS` | `false` | flag, owner-only | `symbiose` is legal; stats read `sym` |
| `FLAGS.BOND_ACTION` | `false` | flag, owner-only | bond is its own slot (D-306) |
| `SYMBIOSIS_GUARD_BONUS` | `2` | core number | `sym >= 0` |
| `BOND_GRAFT_MAX_HAND_MATERIALS` | `3` | core number (3 = `MAX_GRAFT_MATERIALS`, no limit) | `BOND_ACTION` only |
| `SPLIT_PART_PERM_P` | `0` | core number | each part's `permP` (negative = "weaker parts" lever) |
| `BONDS_PER_TURN` | `1` | core number, **pinned** | — |
| `SYMBIOTES_PER_HOST` | `1` | core number, **pinned** | — |

- The pinned two follow D-205 (`PLAYS_PER_TURN` pattern): the schema refuses another value until a change teaches the code. The keyword cap on a host reuses `MAX_INHERITED_KEYWORDS`. Parts' sickness is a rule, not a number.
- Owner-only levers (add to the ARCHITECTURE §11 list): `FLAGS.SPLIT`, `FLAGS.SYMBIOSIS`, `FLAGS.BOND_ACTION`, `BOND_GRAFT_MAX_HAND_MATERIALS`. Tuning: `SYMBIOSIS_GUARD_BONUS`, `SPLIT_PART_PERM_P`.
- All are reachable by `--set` (`--set FLAGS.SPLIT=true`, `--set SYMBIOSIS_GUARD_BONUS=3`).
- Reason: today's behavior is the default of every key; one value is one edit.

**D-311 · Collector AI and the redacted view under bonds**
- Date: 2026-10-16
- Question: How does the Collector react, given he never bonds?
- Decision (judgment): no new play or attack rule. The AI's inputs change in three places only.
  1. **Appraisal is not a choice** (highest Power at 7 or more, tie leftmost, DESIGN and D-075); it is unchanged. With a symbiote he gets both cards; the AI needs no rule for that.
  2. **Attack evaluation.** `previewAttack` and `winningAttacks` already use the engine's stats, which include the host's `+Guard` and keyword. A symbiote on a foe host is **public** (it is attached face-up), so `FoeMonster` (PublicMonster) gains `sym: PublicCard | null`, and `redactState` keeps `Monster.sym` for the viewer's opponent. Hidden information is unchanged: hand, deck, set traps and face-down identities. A face-down host cannot hold a symbiote (D-308), so no face-down information is exposed.
  3. **Kills that release a symbiote.** `killWithoutLoss` ranks by what the kill leaves. Ranking and look-ahead use the engine on the redacted copy, so a destroyed foe host brings out its symbiote in the look-ahead and the follow-up attacks are seen. No rule text changes; ai-dev adds one tie-break only if the sim shows it matters (kill the host with no symbiote first). His own Appraised host's `sym` appears on `OwnMonster` (public to him).
- The AI never sees `bond`; his `getLegalActions` never contains `split`, `symbiose` or a bond-slot `graftBegin`. `intentPolicy` forecasts with `endTurn` on the redacted copy and is unaffected.
- Reason: Appraisal and attack choice are already functions of public stats. Making the symbiote public needs one field and no new hidden information.

**D-312 · Bot brief: bonds in the novice, greedy and expert bots (ai-dev)**
- Date: 2026-10-16
- Question: How do the bots use the new actions so the sim measures them?
- Decision (judgment), brief for ai-dev; weights live in the bot weight files (D-222), nothing in globals:
  - **Novice** stays uniform over `getLegalActions`, which now includes `split` and `symbiose` and a bond-slot `graftBegin`. No code change. It is the "random" baseline.
  - **Greedy** (one ply on `evaluate`) works through the look-ahead helper with no new code. `evaluate` gets terms, read only when a bond switch is on: `symbioteGuard` (plus per bonded host: Guard bonus and keyword value), `bondedKeyword`, `appraisalExposure` (minus: the Power and card count that the next Appraisal would take, where the next Appraisal round is the next Collector turn or the one after; a host counts 2 cards), `unstableTimer` (existing: an Unstable Chimera at its last turn is worth less), `boardWidth` (plus per body, so Split's width and overflow cards register). Greedy penalizes a no-op bond that changes nothing by 1e-6, so ties favor ending the turn (as D-298).
  - **Expert**: add the bond slot to the plan: plan = reposition subsets × play option × bond option (none, Graft variants, Split, Symbiosis), applied in both orders when both exist and keeping legal, de-duplicated end-of-turn states. Bound the bond options with a bot setting `maxBondOptions` (6, by the greedy score of each option alone), so the ~400-plan bound stays. Split is a candidate only when it changes Appraisal exposure, escapes an Unstable timer, or frees a lane/slot; Symbiosis only on hosts whose Guard or keyword helps. Under `BOND_ACTION` off the options compete with plays as today.
  - Heuristic summary: split the Chimera that the next Appraisal would take; split an Unstable Chimera on its last turn; split to get width back on a thin board; bond a Ward/Sentinel symbiote under the host that will be attacked; do not bond a host that is the Appraisal target (two-card loss) unless the host is Shrouded.
  - Re-run the node and plan budget check after the change (D-299); report duels/sec per bot.
- Reason: gives the sim its measurements without changing the novice, and keeps the expert's plan count bounded.

**D-313 · Options preview: `engine.bondOptions(state)` (pure helper for the UI)**
- Date: 2026-10-16
- Question: The owner wants "check options, see the best". What data does the engine hand the UI?
- Decision (judgment): a pure facade query `bondOptions(s): BondPreview` in `packages/engine/src/bond-preview.ts`, exported from the root next to `previewGraft` (ARCHITECTURE §8.7). For the player's turn it lists every legal bond action with its predicted result, applies each on a transaction draft (never touching `s`), and returns facts only. Data shape in ARCHITECTURE §5.6c.
  - It returns facts (stats, keywords, slots, cards, Appraisal exposure), **not a verdict**. The "best" marker is `ai/bots/rank-bonds.ts › rankBondOptions(preview, weights)`, which scores each option's result with the bot `evaluate` terms (D-312); the UI uses it as a hint and the look is decided later with the owner (UI design gate).
  - Graft options are one per (ordered materials, keyword choice), with position and lane left open (`positionFree`), so the list stays at most a few dozen; `steps` are the actions to apply up to the commit.
  - Cost: one draft per option, no deep clone (structural sharing); not for use in the hot sim loop. The bots use the look-ahead helper instead.
- Reason: one source of truth for "what would this do", testable against the real actions (a property test applies each `steps` list and compares).

**D-314 · Sim A/B plan for the bond rules (playtest-runner)**
- Date: 2026-10-16
- Question: Which cells are added to the D-287 matrix?
- Decision (judgment): `sim quick` 2000 games, expert, greedy and novice, with Collector `reposition` as shipped. Cells (flags as `--set FLAGS.X=true`): **baseline**; **B** (`BOND_ACTION`); **S** (`SPLIT`); **Y** (`SYMBIOSIS`); **BS**; **BY**; **SY**; **BSY** (all three); **BSY+123L** (all three plus `SICKNESS_MODE=monstersOnly`, `LANES`, ring A, the full R1+R2+R3 package of D-303). Variants on the best of BSY and BSY+123L: `BOND_GRAFT_MAX_HAND_MATERIALS=1` and `=2`; `SYMBIOSIS_GUARD_BONUS=1` and `=3`; `SPLIT_PART_PERM_P=-1`; `CHIMERA_TO_HAND=false`. `sim full` for the three closest cells plus BSY+123L (D-303 finalist rule).
- New metrics (information only, no invented targets, D-304): per bot `splitsPerGame`, `symbiosesPerGame`, `graftsPerGame`, `bondUseShare` (turns with a bond action over own turns); **bond mix** (share of Graft / Split / Symbiosis among bond actions; a healthy meta has no single kind above about 70%, reported as a note, not a mark); `splitAppraisalDodge` (splits of the Appraisal target on the round before an Appraisal round); `splitUnstableEscape`; `symbioteDoubleLoss` (Appraisals that took a host with a symbiote); `symbioteEmerged` per game; `handMaterialGrafts` (Grafts using 2+ hand cards in a turn that also played a card); median rounds and damage per round (existing). Existing definitions unchanged (D-302). Counters come from events (`Split`, `Bonded`, `SymbioteEmerged`, `Appraised.sym`), not from new state.
- Prerequisite: bots and AI per D-311/D-312 first; without them the matrix measures nothing (as D-287 said for lanes). Default-equivalence gate: with all three off, the sim equals the previous baseline run exactly (same seeds, same outcomes).
- Reason: separates "more actions" from "new kinds"; keeps each switch measured alone.

**D-315 · Rollout and flip notes**
- Date: 2026-10-16
- Question: What ships, in what order, and what changes at the flip?
- Decision (judgment):
  1. **Implementation order:** engine (state, actions, legality, pipelines, preview) with all switches off and the default-equivalence test green; then content (globals, schema, planned text drafts); then ai/bots; then sim metrics; then the matrix; then the web logic. Each package's size is in the report of this task.
  2. **Texts follow the content-draft pattern** (`docs/reports/rules-flip-content-draft.md`): content-author writes `docs/reports/bond-flip-content-draft.md`; nothing in live JSON or DESIGN changes until the switch flips, and then in the same commit. One sentence each: Split "Unbind your Chimera into the monsters it was grafted from."; Symbiosis "Attach a monster from your hand under one of yours: it gains +{SYMBIOSIS_GUARD_BONUS} Guard and the attached monster's keyword."; the Graft line "It is your one play for the turn" changes under `BOND_ACTION`. These are howto/rules texts, not card text; no card changes.
  3. **State fields:** `Monster.sym` and `GameState.bond` are always present with default values (−1 and 0). Test fixtures that build Monster literals need `sym: -1`; `makeMonster` supplies it. Board-state DSL (ARCHITECTURE §17) gains a `sym(<card-id>)` flag and a `bond@used` flag.
  4. **`state.cfg`** changes with the new globals, so saved sessions fail replay when the defaults flip: bump `CONTENT_VERSION`, start a fresh duel with a notice, regenerate `seeds.json` (`sim seeds`), as D-287.
  5. **DESIGN.md** is edited by the owner at the flip, never by the architect: Graft ("your one play"), Keywords table (no change), a new "Bond actions" section.
  6. **UI** logic only until the owner picks the visual design (design gate): the store reads `bondOptions` and the action list; no component work.
- Reason: same discipline as D-287; texts change only at flip time.

**D-316 · Owner questions open after D-305…D-315 (recommended defaults)**
- Date: 2026-10-16
- Question: Which items are undecided?
- Decision: each default below is the recommended answer and is already in D-305…D-315; the sim can test the alternative as a lever.
  1. **Graft with hand materials under `BOND_ACTION`** (D-306): it does not use the card play; up to 3 hand cards plus the play card in a turn. Default yes, lever `BOND_GRAFT_MAX_HAND_MATERIALS` 3 (sim 1 and 2).
  2. **Bond closes at the first attack** (D-306): default yes, so a bond is a pre-combat choice; the alternative (bond any time) makes attack-then-graft or attack-then-split free value.
  3. **Split placement** (D-307): first part keeps the Chimera's slot and lane, the rest take the leftmost free slots, overflow to the hand, no player choice. Default as written; a placement choice would need a `PendingSplit` stage.
  4. **Parts are no weaker than their printed stats** (D-307): `SPLIT_PART_PERM_P = 0`. The Chimera's loss of bonuses is the cost. The lever is there if the sim shows Split is free.
  5. **Hosts with a symbiote** (D-308): cannot be Graft materials or split; Chimera hosts are allowed; a face-down host is not. Default as written.
  6. **Keyword cap** (D-308): the symbiote's keyword is added only while the host has fewer than `MAX_INHERITED_KEYWORDS`. Default as written.
  7. **Appraisal with a symbiote** (D-308): the Collector gets both; in the vault they are two cards; the symbiote is a legal Covetous sacrifice. Default as written.
  8. **A Chimera that entered this turn cannot split** (D-307): default yes. And the symbiote is public to the Collector (D-311): default yes.
- Reason: none is decided silently; the owner has accepted recommended defaults so far (D-288).
- Owner ruling (2026-10-16, night): the owner asked the main session to finish and ship the whole change without waiting for them, so all eight defaults above are accepted as written. The UI follows the current D-237/D-271 style instead of new mockups, and the main session updates DESIGN.md at the flip (owner's request, an exception to D-315's "edited by the owner").

**D-317 · Attached symbiotes are found with `hostOfSymbiote`** (engine-dev, 2026-10-16)
- Decision: `locate` stays board-only. An attached symbiote is in no zone (D-308), so `stats.ts › hostOfSymbiote(s, iid)` finds its host.
- Reason: keeps every existing `locate` caller unchanged.

**D-318 · The host's keyword cap counts keyword bits only** (engine-dev, 2026-10-16)
- Decision: for D-308's `MAX_INHERITED_KEYWORDS` check, a Flaw on the host does not use up a keyword place.

**D-319 · `hashState` includes `bond` and `sym` only when they are not the default** (engine-dev, 2026-10-16)
- Decision: play that never bonds hashes exactly as before, so the default-equivalence digests and replay hashes stay stable.

**D-320 · `bondOptions` lists every ordered Graft tuple** (engine-dev, 2026-10-16)
- Decision: one option per ordered material tuple (up to 155 for 8 materials, about 1.5 ms). A Graft result is shown in attack position in the leftmost lane. Appraisal exposure is judged at the Collector turn of the next Appraisal round and ignores an Unstable expiry before then. Under `BOND_ACTION` the hand-material limit applies to both sides. A Covetous sacrifice of a host emits `Sacrificed` for the host, then the symbiote (discard order host, symbiote). `SPLIT_PART_PERM_P` is the only global allowed below 0.

**D-321 · The in-duel compass becomes an element strip** (ui-dev, 2026-10-16; changes the D-271 compass C placement)
- Decision: with three lanes, the 116 px compass couldn't sit off the board at 360 px and stay legible. A strip above the player's row shows the picked monster's element gem, "Beats [gems] +N" and "Weak to [gems]", read from `elements.json` and `ELEMENT_BONUS`. The full wheel (A) stays in How to play. The strip is used with lanes on and off.
- Owner review: flagged in the 2026-10-17 morning report; the owner picked compass C on 2026-10-16.

**D-322 · Lane choice in the web UI** (ui-dev, 2026-10-16)
- Decision: under `FLAGS.LANES`, a summon is pick card → pick mode → tap an empty lane; Graft's last step shows the position toggles plus Lane 1–3 buttons in the sheet; Covetous picks the sacrifice, then a lane. Every lane tap maps to an action from `getLegalActions`; no extra confirm. A monster whose lane is empty and uncovered shows "No hit"; Sentinel cover shows as a badge; the sickness badge appears only with `SICKNESS_MODE = monstersOnly`.
- Lane moves: select your monster, then tap a lit "Move" or "Swap" slot. The hint reads "A lane move or a switch: once per turn."

**D-323 · Saved duels under other rules restart with a notice** (ui-dev, 2026-10-16)
- Decision: a cfg or `CONTENT_VERSION` mismatch on resume restarts the duel and shows `RULES_NOTICE`: "The rules changed since this duel was saved; it starts over." The dev hot-reload notice is unchanged.

**D-324 · Bond weights live in `bond.weights.json`** (ai-dev, 2026-10-16)
- Decision: the bots' bond weights and caps are in `packages/ai/src/bots/bond.weights.json`, not in `expert.weights.json`. `expertHash(bonds)` covers the bond file only when a bond flag is on, so the seed manifest key is unchanged while all bond flags are off.

**D-325 · Expert bond search caps** (ai-dev, 2026-10-16; narrows D-312)
- Decision: `maxBondOptions` = 4 (D-312 said 6), 2 combo plays, 1 card per host, 5 Graft materials per pick, and a Graft search of 2 pairs × 4 variants when Graft is the bond action. Bond lines are tried only on the unrepositioned node. A Split is a candidate only when the Chimera is the Appraisal target, is Unstable, or the board has 2 or fewer bodies. The bots plan the bond before attacking only. Symbiosis is never placed on the Appraisal target.
- Reason: keeps expert speed within about 30% of the flags-off speed (sim, all three bond flags on: 62 vs 81–91 duels/s per core; lanes + bonds 45–46).

**D-326 · The "best option" ranking** (ai-dev, 2026-10-16)
- Decision: `rankBondOptions(preview, ctx?, weights?)` in `packages/ai/src/bots/rank-bonds.ts` scores each `bondOptions` entry with the expert weights and returns `{ best, scores[i] = { index, id, kind, score, reason }, order }`. `best` is -1 unless an option scores above 0.5 (better than doing nothing). Reasons are short phrases such as "dodges Appraisal", "fills a lane", "+2 Guard and Ward", "puts 2 cards under Appraisal". `bondRankContext(engine, content, state)` builds the optional context.

**D-327 · Bond UI in the web app** (ui-dev, 2026-10-16; current style, owner pre-approved no new mockups)
- Decision: with `FLAGS.BOND_ACTION`, "Play" and "Bond" pips show what is left this turn (open, used, closed by an attack), and selecting an attacker while the bond is unused warns "Attacking closes your bond." Split is a button on a selected Chimera and in its inspect sheet, with a preview of the parts and their lanes before the confirm. A hand monster gets an Attach button, then lit hosts with a "+Guard" badge; an attached card shows as a tab under its host and in full in inspect. `Split`, `Bonded`, `SymbioteEmerged` and `Appraised.sym` are logged and animated; the Appraisal ghost carries the tab. With all bond flags off, none of this renders.

**D-328 · The Bond options sheet** (ui-dev, 2026-10-16)
- Decision: a Bonds button beside Undo opens a sheet fed by `engine.bondOptions`, grouped Graft / Split / Symbiosis. Each row shows the result, keywords, lane or hand, Appraisal exposure ("safe" / "exposed in round N") and board deltas. Graft options fold into result families ("N ways to make it"). Tapping a row replays its steps through `performBond`, which checks each step against the legal list; a Graft opens the existing workbench at its position step. "Best" (badge, gold reason line, and a "Best: …" box that performs it) comes from ai `rankBondOptions` (D-326) and is a hint only.

**D-329 · Bond copy lives in `view/howto.ts`** (ui-dev + content-author, 2026-10-16)
- Decision: the Split and Symbiosis How to play pages appear only with their flags. The play, Graft, quiz and Appraisal lines follow `docs/reports/bond-flip-content-draft.md`, one constant per sentence, numbers rendered from globals. A `rules-text.json` content file is the long-term home (a schema change), not done now.

**D-330 · Sim metrics for the bond rules** (playtest-runner, 2026-10-16)
- Decision: per-bot `graftsPerGame`, `splitsPerGame`, `symbiosesPerGame`, `symbioteEmergedPerGame`, `symbioteDoubleLossPerGame` and `bondUseShare`, plus a "Bond usage" table in the markdown report. Events are collected only with `FLAGS.SPLIT` or `FLAGS.SYMBIOSIS` on, so flags-off runs do the same work and every earlier field is identical. Not built: Appraisal-dodge, Unstable-escape and hand-material Graft counts.

**D-331 · Bond matrix result** (playtest-runner, 2026-10-16; docs/reports/bond-matrix-2026-10-16.md)
- Result: on 123L, adding all three bond rules keeps every round-length target failing, drops Appraisal success to 15% and Unpriced to 8% (Split dodges the target; Symbiosis replaces Grafts), and puts the expert at 62.8% (full run). `BOND_GRAFT_MAX_HAND_MATERIALS` is the strength lever: 2 gives expert 53.4% with grafts/win 1.65 (both in band), 1 gives 49.2% with grafts/win 1.25 (fail). `SPLIT_PART_PERM_P = -1` and `SYMBIOSIS_GUARD_BONUS = 1` showed no visible effect on win rate. Expert speed with lanes + bonds: 37–52 duels/s/core. No value was changed by the sim.

### Paper-sim ambiguity index (docs/reports/phase0-paper-sim.md §2)

| A# | Topic | Entry | Outcome |
| --- | --- | --- | --- |
| A1 | Summoning sickness vs Slow | D-022, D-053 | agrees; P1 → M-01 |
| A2 | Draw wording, hand cap, Collector draws | D-011, D-009 | agrees |
| A3 | Collector positions and repositioning | D-089, D-084 | D-089 changed to match |
| A4 | Moods vs priority list | D-081 | kept; paper-sim variant → M-13 |
| A5 | "Beats your strongest face-up" | D-083 | changed (element bonus, post-summon stats) |
| A6 | Hand tie-breaks | D-090 | agrees (lexical id order) |
| A7 | Collector fallback / Ledger | D-085 | changed to match |
| A8 | Appraised monster position, sickness, timers, Echo owner | D-077, D-062, D-046 | agrees except forced guard → M-03 |
| A9 | The vault | D-078, D-054 | agrees |
| A10 | Unpriced and the opening guarantee | D-118 (new) | counts; M-04 would remove the issue |
| A11 | Chimeras as materials | D-056 | agrees |
| A12 | Chimera face-down | D-063 | agrees |
| A13 | Echo / Grave Recall on Chimeras | D-046, D-068 | kept (literal card text); paper-sim version → M-12 |
| A14 | Ward vs damage and spells | D-035, D-044 | agrees |
| A15 | Brittle resolution | D-049 | agrees |
| A16 | Face-down Sentinel; AI holds vs unbeatable Sentinel | D-037, D-038 | agrees |
| A17 | Vain best target | D-091 | agrees; refined |
| A18 | Contested / high-value targets | D-087 | agrees |
| A19 | Insurance Claim vs lethal | D-032 | agrees |
| A20 | Sacrifice vs destroy | D-058, D-054 | agrees |
| A21 | Life cap | D-019 | changed to no cap |
| A22 | Pierce vs attack position | D-039 | agrees |
| A23 | Unstable on a stolen Chimera | D-062 | agrees |
| A24 | Tethered when checking "beats" | D-083 | changed to match |

---

## L. Summary of items needing owner review

> **2026-10-14:** the owner confirmed every D-row below up to D-149 (D-149). D-152 (added after D-149) was ruled (A) the same day. D-182 (B), D-189 (A) and D-195 (A) were ruled the same day. D-218 was ruled on 2026-10-15 (strongest attacker for v0.1). Still open: the M-01…M-17 proposals.

| Id | Topic | Why |
| --- | --- | --- |
| D-182 | Keywords a board material gives a Graft: active (face-down gives none, a used Ward gives none) or printed | DESIGN is silent; reachable with launch cards. Owner ruled (B): printed keywords |
| D-189 | May a Chimera card summoned from the hand go face-down? | D-063 covers only the Graft entry. Owner ruled (A): all three summon modes |
| D-204 | Is a `castHighValueSpell` entry (or a `trapPreference` id) for a newly added Collector card an owner-only AI param under D-166, or a card list the owner edits freely like `deck`? | Settled 2026-10-14 (owner): both are card lists, edited freely like `deck`. The rule lists, mood rule lists, `reposition` and the other params stay owner-only |
| D-195 | Keyword and Flaw icon/visual ids; do Flaws get a frame? | Art decision; DESIGN gives no icons and no Flaw visuals. Owner ruled (A): content-author's ids as drafts, Flaws framed |
| D-218 | Attack rule 2: which of his attackers takes a kill, the strongest that can (D-090 literal, current) or the weakest that is enough? | Ruled 2026-10-15 (owner): the strongest, for v0.1. The weakest-sufficient alternative is A/B-tested in Phase 3 as M-17 |
| D-229 | Difficulty check rejects ~75% of seeds (BT-8 ≤ 15%); `prepareDay` costs ~6 s, against D-099's 1–2 s | Measured in AI milestone 2. Levers (ε, per-run shuffle, band) change D-094 or globals; decide with Phase 3 sims. On-device vs precomputed: decided by D-236 (precomputed manifest, on-device fallback). Sim milestone (60 dates): 88.1% rejected and 2 D-004 fallbacks |
| D-230 | BT-3b "most games end in rounds 8–12" read as more than half | DESIGN gives no number. Confirm, or give a share to make a `TARGET_*` global |
| M-01…M-16 | Balance/rule proposals from the paper-sim (section M) | None applied; each needs a Phase 3 sim A/B test and an owner decision. Levers M-01 and M-02 get plumbing in D-183, and M-04 in D-184 |
| D-152 | Ward saves an Unstable Chimera from expiry: does it keep the +3? | DESIGN is silent and it's reachable with launch cards. Owner ruled (A): Unstable ends and the +3 goes |
| D-019 | No life cap (changed after paper-sim) | First draft capped life; DESIGN states no cap |
| D-083 | Rule 3 "beats" uses the combat preview (element bonus, Guard vs a guard target) | Changed after paper-sim; affects which Relic answers your monster |
| D-089 | Collector reposition: guard → attack only | Simplified after paper-sim |
| D-118 | The Unpriced counts toward his opening-hand guarantee | Dead-ace openings until M-04 is decided |
| D-046, D-068 | Chimeras can return to hand (Echo) and be Grave Recalled | Paper-sim flags a value exploit (M-12) |
| D-117 | Novice = uniform random | Paper-sim estimates < 5% win rate vs the 20–30% target (M-09) |
| D-053 | Slow is a no-op (PROPOSAL; see M-01) | Universal summoning sickness already forbids attacking on the summon turn |
| D-039 | Pierce only against guard | Literal text could be read as also changing attack-position fights |
| D-049 | Brittle = attacker auto-wins, only as defender | Damage/attacker outcome unspecified |
| D-081 | Mood → AI switches | Prose turned into concrete rules |
| D-085 | AI play step 7 (cast Ledger / set trap) | Otherwise Provenance Ledger is never cast |
| D-095 | Intent is a non-binding forecast | "Telegraphs his intent" could be read as a promise |
| D-109 | Stat budget includes keyword cost | Four launch cards fail the literal P+G rule |
| D-077 | Appraised monster has summoning sickness | Unstated; big balance lever |
| D-054 | Covetous can sacrifice from the vault | Affects Unpriced appearance rate |
| D-004, D-098, D-100 | Reroll cap, star cuts, par | New numbers not in DESIGN |

---

## M. Balance/rule proposals pending owner review

Source: `docs/reports/phase0-paper-sim.md` §3 (5 hand-played duels, n = 5, directional only). **None of these is applied.** The engine implements DESIGN.md plus sections A–K. Each proposal must be **A/B-tested in the Phase 3 sim** (`sim:full` with and without the change, same dates and runs) against the DESIGN balance targets before the owner adopts it. Every proposal is set up as a `--set` global, a card override, a `collector.json` field, or a flagged keyword variant, so testing it needs no engine fork.

| Id | Paper-sim | Type | One-line summary | Paper-sim rationale | A/B lever |
| --- | --- | --- | --- | --- | --- |
| M-01 | P1 | rule | Slow = "cannot attack until his second turn after it is summoned" | Slow is a no-op under universal summoning sickness (A1, D-053) | `SLOW_TURNS=2` in `keywords/slow.ts` |
| M-02 | P3 | rule/global | Unstable: destroyed at the **start of the grafter's turn after next** instead of the end of their next turn | Unstable is the dominant play and is Appraisal-proof unless made on R3/6/9; skilled play went 0/7 on Appraisals | `UNSTABLE_EXPIRY` mode global |
| M-03 | P2 (part) | rule | An Appraised monster enters his board in **guard** (D-077 keeps its position) | Reduces the three-way swing of a steal; protects novices on R3 | `APPRAISED_ENTERS_GUARD` flag |
| M-04 | P4 | rule + validator | Set The Unpriced aside: his draw pile is 19 cards; the first successful Appraisal puts the ace in his hand (validator: 19 + ace = 20) | No dead ace in hand (D1, D3); appearance rate = "games with ≥ 1 Appraisal"; less seed variance | `ACE_SET_ASIDE` flag |
| M-05 | P5 | card | The Unpriced 10/8 Ward → 10/8, no keyword | Once it lands it is effectively unbeatable (D4, both lines lost) | `--set card.the-unpriced.keywords=[]` |
| M-06 | P8 | card | Forfeit: "Power 4 or less, **or with Sentinel**" | High-Guard Sentinels shut down his whole offense under AI rule 2; Vain Relics bleed into them (D3) | alternate effect in `collector-spells.json` |
| M-07 | P6 | card/global | Unmake: Power 5 or less → **6 or less** | Unmake hits almost no Relic; it is the best non-Graft tool for weaker players | `UNMAKE_MAX_POWER=6` |
| M-08 | P7 | AI | Move play rule 4 (trap when behind) below rule 6, gated on "no summonable monster" | He sets traps instead of developing when behind, which opens direct lethal (D2 R7, D3 R5) | `collector.json › ai.play` order |
| M-09 | P11 | bot definition | Replace the "random legal" novice with a scripted naive bot (highest-Power face-up attack summons, grafts only for ≥ 8 Power, attacks when raw Power ≥ the displayed stat, ignores traps/Appraisal) and apply the 20–30% target to it | Uniform random play is estimated at < 5% against a deterministic planner (D5) | add `bots/naive.ts`; report both |
| M-10 | P13 (tweak) | AI | Rule 3 skips a Brittle monster if you have a face-up monster with element advantage over it | The AI throws Brittle Relics into obvious counters (D1 R1) | `collector.json › ai.params.summonBeater.skipBrittleCountered` |
| M-11 | P15 | card | Bastion Warden 6/9 → 7/8 (only if walls are still dominant after M-06) | The only ≤ 6-Power Guard ≥ 8 wall: Appraisal-immune and unbreakable | `--set card.bastion-warden.power=7 guard=8` |
| M-12 | P12 (part) | rule/card | A Chimera that would go to hand goes to the discard instead; Grave Recall cannot target Chimeras | Re-summoning a Chimera from hand is a value exploit; Chimera-in-hand was undefined (A13) | `CHIMERA_TO_HAND` flag |
| M-13 | A4 reading | AI data | Paper-sim mood variant: Composed = list as written; Agitated = rule 2 takes ties; Desperate = face-down any Power + trades | Simpler than D-081 (D-081 kept because it implements all of DESIGN's mood prose) | alternate `collector.json › ai.moods` |
| M-14 | P10 | global | `PLAYER_LIFE` 20 → 24 | Most losses were empty-board swings of 13–23 damage; +4 life buys one more decision turn | `--set PLAYER_LIFE=24` |
| M-15 | feel notes | UX only | Mark "will be appraised" on face-up 7+ Power monsters during the player turn before an Appraisal round | Novices lose 7-Power base cards on R3 to a rule they haven't absorbed | none (UI; no rule change, no sim needed); recommended for the UI phase |
| M-16 | P9 (note) | card | Mirror Sigil −3 → −2, only if walls stay too strong after M-06 | Vain bounce damage into Mirror Sigil + high Guard is large (6 in one hit, D3) | `--set MIRROR_SIGIL_PENALTY=2` |
| M-17 | AI milestone 1 (D-218) | AI | Attack rule 2: the weakest attacker that is enough takes the kill, instead of the strongest | More kills per turn; D-090 read literally sends the strongest | `collector.json › ai.params.killWithoutLoss.attacker` (`strongest` / `weakestSufficient`). Not built; built only if the owner asks for the A/B |

**Paper-sim proposals that were pure clarifications** (adopted as decisions, not listed above):
- **P2** — summoning sickness on the stolen monster, timers staying with the grafter, Echo to the original owner: D-077, D-062, D-046. Only the "enters in guard" part is a proposal (M-03).
- **P9** — Vain "best legal target": D-091.
- **P12** — Chimeras always face-up (D-063); Chimeras are materials only as the Ascend base (D-056). The discard/Grave Recall part is a proposal (M-12).
- **P13** — Collector AI bundle: D-081, D-083, D-084, D-085, D-087, D-089, D-090. The Brittle-skip tweak is a proposal (M-10).
- **P14** — combat bundle: Ward (D-035, D-044), Brittle (D-049), face-down Sentinel (D-037), traps before damage (D-032), sacrifice ≠ destroy (D-058), no life cap (D-019, changed), Pierce only vs guard (D-039).

The paper-sim's combined expectation (proposals 1–10 together reach every target) is a hypothesis. Phase 3 should test the proposals one at a time first, then as the bundle.
