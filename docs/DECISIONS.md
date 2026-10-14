# Vault Duel — Decisions Log

Owner: game-architect. Source of truth for rules is `docs/DESIGN.md` (v0.1, Oct 13 2026). This file records every place where DESIGN.md is ambiguous, silent, or internally inconsistent, and the interpretation the engine implements. Rule of thumb: **pick the simplest interpretation that keeps the written rule true**. Nothing here changes a DESIGN.md rule; where a rule looks wrong, the entry is marked **PROPOSAL — needs owner review** and the design rule is still implemented as written.

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

**D-082 · AI "can win this turn" uses public information only**
- Date: 2026-10-14
- Question: Can the lethal check account for the player's set traps or face-down monsters' stats?
- Decision: No. Lethal is computed from his own known cards and the public board; unknown traps are ignored; face-down monsters are treated as blockers of unknown Guard (assumed to survive). If the attempt is foiled by a trap, so be it.
- Reason: "The Collector never cheats … sees only public information".

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

**D-085 · Provenance Ledger and other "no target" spells are never cast by the written priorities** [EXTENDS] [REVIEW] (revised after paper-sim)
- Date: 2026-10-14
- Question: Priorities 1–6 only cast spells with "a legal high-value target"; Provenance Ledger has no target, so as written he never casts it. What does he do when no rule applies?
- Decision: Add an implicit final play step 7: "otherwise cast a draw spell (Provenance Ledger) if held; otherwise set a trap if he holds one and a trap slot is free; otherwise pass". Defined in `collector.json` so it can be removed.
- Reason: a deck card that is never played is a dead draw, which skews the balance sim. Owner should confirm.
- Paper-sim: A7 — **changed to match**. The first draft only cast Ledger with a hand of ≤ 2 cards; the paper-sim's unconditional order is simpler (no extra threshold number).

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

**D-088 · Trap choice (priority 4)**
- Date: 2026-10-14
- Question: Which trap is set when he holds several?
- Decision: `collector.json › ai.trapPreference = ["display-case", "insurance-claim", "counterfeit"]`, first one held.
- Reason: deterministic and data-driven.

**D-089 · Collector repositioning** [EXTENDS] (revised after paper-sim)
- Date: 2026-10-14
- Question: His priority list has no reposition step and gives no summon position except rule 6's all-Slow case.
- Decision: Before playing, a guard monster switches to attack only if that gives it an attack under rule 1, 2 or 4 this turn. He never switches attack → guard. Desperate: all monsters switch to attack. Summon positions: attack, except rule 6's all-Slow case and Composed's guard preference (D-081).
- Reason: without it, guard summons would stay in guard forever; one direction only is the simplest policy.
- Paper-sim: A3 — **changed to match**. The first draft also had a defensive attack → guard switch; it was dropped as extra complexity. Composed's "favors guard" is still expressed through its summon position (D-081).

**D-090 · AI tie-breaks**
- Date: 2026-10-14
- Question: "ties broken by leftmost slot, then card id" — for hand cards, which have no slot?
- Decision: Board: leftmost slot, then card id. Hand: card id (string order), then instance id. Attackers act in descending effective Power, tie leftmost.
- Reason: total order; deterministic.
- Paper-sim: A6 — agrees on card id for hand ties. Small difference: the paper-sim used DESIGN table order (M1…M13), whereas this entry uses lexical order of the kebab-case id. **Kept**: ids are the only stable key in content, and no extra "order" field is needed. (Both orders give the same result in every tie seen in the paper duels.)

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

**D-110 · Art briefs location**
- Date: 2026-10-14
- Question: DESIGN says each card's art brief is "in its data file"; the Phase-0 brief lists `art-briefs.json`.
- Decision: `packages/content/art-briefs.json` maps every card id and Chimera family id to a one-line brief; the validator requires an entry for each and rejects orphans.
- Reason: lets the artist work from one file; the validator keeps it in sync with cards. (Minor deviation from DESIGN wording — owner may prefer inline.)

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

**D-117 · Novice bot = uniform random legal action**
- Date: 2026-10-14
- Question: "random legal moves" with a multi-step Graft action space.
- Decision: Uniform over `getLegalActions(state)` at every decision, including pending Graft steps (so Graft is one option among many at the top level, not hundreds).
- Reason: matches "random legal moves"; the pending model keeps it from over-weighting Graft.
- Paper-sim: P11 differs: it argues 20–30% is unreachable for random play and proposes a scripted "naive" bot instead. **Not adopted**, because DESIGN's balance table defines the novice as "random legal moves". Logged as M-09; the sim will report both bots side by side so the owner can choose.

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

| Id | Topic | Why |
| --- | --- | --- |
| M-01…M-16 | Balance/rule proposals from the paper-sim (section M) | None applied; each needs a Phase 3 sim A/B test and an owner decision |
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

**Paper-sim proposals that were pure clarifications** (adopted as decisions, not listed above):
- **P2** — summoning sickness on the stolen monster, timers staying with the grafter, Echo to the original owner: D-077, D-062, D-046. Only the "enters in guard" part is a proposal (M-03).
- **P9** — Vain "best legal target": D-091.
- **P12** — Chimeras always face-up (D-063); Chimeras are materials only as the Ascend base (D-056). The discard/Grave Recall part is a proposal (M-12).
- **P13** — Collector AI bundle: D-081, D-083, D-084, D-085, D-087, D-089, D-090. The Brittle-skip tweak is a proposal (M-10).
- **P14** — combat bundle: Ward (D-035, D-044), Brittle (D-049), face-down Sentinel (D-037), traps before damage (D-032), sacrifice ≠ destroy (D-058), no life cap (D-019, changed), Pierce only vs guard (D-039).

The paper-sim's combined expectation (proposals 1–10 together reach every target) is a hypothesis. Phase 3 should test the proposals one at a time first, then as the bundle.
