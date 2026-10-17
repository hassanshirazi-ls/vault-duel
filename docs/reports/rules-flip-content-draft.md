# Rules flip content draft (R1 sickness, R2 lanes, R3 ring order A)

Status: DRAFT for owner review. Nothing here is in the live JSON or keyword TS. Each text below ships in the same commit as the switch it describes: `SICKNESS_MODE` (R1), `FLAGS.LANES` (R2), or the ring data (R3). Until its switch flips, the current text stays, because it is the right text for the current rules.

Sources: D-280 to D-288 (ring order A per D-288 #1), DESIGN.md L60 to L107, `packages/content/elements.json`, `packages/content/keywords/*.ts` (text fields), `packages/content/cards/*.json`. Globals used in placeholders already exist in `packages/content/src/globals.ts` (`ELEMENT_BONUS`, `BOARD_SLOTS`, `SICKNESS_MODE`, `SENTINEL_REACH`, `LANE_MOVE_RANGE`).

---

## 1. Keyword and Flaw text under the new rules

Only the texts whose meaning changes are listed. Every other keyword and Flaw keeps its text (see the list at the end of this section).

| Keyword / Flaw | Ships with | Current text | Proposed text | Basis |
| --- | --- | --- | --- | --- |
| Swift | R1 (`SICKNESS_MODE = monstersOnly`) | Can attack monsters the turn it is summoned, but not life directly. | Can also attack life directly the turn it is summoned. | D-280 |
| Sentinel | R2 (`FLAGS.LANES`) | Enemy attacks must target Sentinels first. | Enemy attacks in its lane and in the lanes within {SENTINEL_REACH\|lane\|lanes} of it must target it. | D-283 |
| Slow (Flaw) | R1 (`SICKNESS_MODE = monstersOnly`) | Cannot attack the turn it is summoned. | No text change. Same sentence as today. | D-280 |

Notes:

- **Swift** is correct today only under `classic`. Under `monstersOnly` the old sentence is false, because Swift then grants life. The text flips with R1 and not before.
- **Sentinel** is a reach rule only with lanes on. Its current sentence is the right one with `FLAGS.LANES` off (classic Sentinel guards the whole enemy board). The proposed sentence is right only with lanes on, so the two must flip together. The placeholder keeps the text true for the A/B variant `SENTINEL_REACH = 0` (see section 5, Q2).
- **Slow** keeps its text. Today the sentence is already true, but under `classic` Slow changes nothing (M-01), because the summon turn is already closed to every monster. Under `monstersOnly` the same sentence describes a real restriction: a Slow monster cannot attack monsters or life on its summon turn, while a plain monster can attack monsters. The meaning changes; the words do not.

Unchanged (text stays exactly as it is; the reason is given):

| Keyword / Flaw | Current text | Why it still reads correctly |
| --- | --- | --- |
| Pierce | Power beyond the defender's Guard is dealt to its owner's life. | Pierce acts on the combatants (D-281, D-284). Spillover on the summon turn is still dealt (D-280). |
| Vain | Must attack if able, choosing the best legal target. | "Legal" now means lane-legal (D-281). "If able" already covers a monster with no legal attack, so no obligation applies (D-281). |
| Brittle | Destroyed by any attack with element advantage, regardless of Power. | "Any attack" means any attack the monster can receive. Lanes limit who can attack it, not what counts as an attack (D-284). |
| Haunt | When destroyed, the monster that destroyed it loses {HAUNT_PENALTY} Power permanently. | Triggers on destruction, not targeting. |
| Echo | When destroyed, return it to its owner's hand. | Same. |
| Ward | The first time it would be destroyed, it loses Ward instead. | Same. |
| Covetous | Can only be summoned by sacrificing a monster he acquired through Appraisal (ace only). | The summon lane is a new choice, not a new condition (D-284). |
| Tethered | −{TETHERED_PENALTY} Power while it is his only monster. | Board count, not targeting. |

---

## 2. Card text that assumes free targeting

Grep scope: every `packages/content/cards/*.json`. A literal search for "target", "any", "your strongest", "leftmost", "Sentinel" and "empty" finds no card text with those words. The card text that depends on attacks is listed below by its real hit: the Sentinel and Swift and Slow keywords on monsters (their text is inherited from the keyword, so the keyword change in section 1 fixes them), and the attack-triggered traps and spells.

**Flagged: 14 cards.** 13 monsters and relics carry a keyword whose text changes, and Thornwall is kept as is (D-288 #8). No card JSON needs an edit. Every flagged monster inherits its new text from the keyword.

### 2a. Monsters and Relics whose inherited keyword text changes

| Card id | File | Keyword(s) | Current text (inherited) | Reads under lanes | Proposed text |
| --- | --- | --- | --- | --- | --- |
| brazier-golem | player-monsters.json | Sentinel | Enemy attacks must target Sentinels first. | No. Implies free targeting. | Inherits Sentinel proposed text. |
| weathervane-sentry | player-monsters.json | Sentinel | (same) | No | Inherits Sentinel. |
| coral-bastion | player-monsters.json | Sentinel | (same) | No | Inherits Sentinel. |
| reliquary-sentinel | player-monsters.json | Sentinel | (same) | No | Inherits Sentinel. |
| grave-effigy | player-monsters.json | Sentinel | (same) | No | Inherits Sentinel. |
| abyssal-curator | relics.json | Sentinel + Slow (Flaw) | Sentinel text as above; Slow text as above | No for Sentinel; Slow reads correctly | Inherits Sentinel. Slow text unchanged. |
| cinderjaw-hound | player-monsters.json | Swift | Can attack monsters the turn it is summoned, but not life directly. | No under R1 | Inherits Swift proposed text. |
| stormcrow | player-monsters.json | Swift | (same) | No under R1 | Inherits Swift. |
| gloam-stalker | player-monsters.json | Swift | (same) | No under R1 | Inherits Swift. |
| ashen-duchess | relics.json | Swift (Flaw: Tethered) | (same) | No under R1 | Inherits Swift. |
| gilded-penitent | relics.json | Slow (Flaw) | Cannot attack the turn it is summoned. | Yes, text is true; meaning is live only under R1 | No change. |
| saint-of-brass | relics.json | Slow (Flaw) | (same) | Yes | No change. |
| weeping-automaton | relics.json | Slow (Flaw) | (same) | Yes | No change. |

Monsters that carry Swift or Slow but are not flagged by text (no change needed, listed for the record): none beyond the rows above. Monsters with Pierce, Vain or Brittle (for example `windward-lancer`, `ossuary-seraph`, `reliquary-hound`, `stormglass-hydra`) keep their text (section 1).

### 2b. Spells and traps with targeting or attack wording

| Card id | File | Current text | Reads under lanes | Proposed text |
| --- | --- | --- | --- | --- |
| thornwall | player-traps.json | When you are attacked directly, take no damage and switch the attacker to guard. | Literally true, but it now fires only when the player has no monster at all (D-284). **Flagged.** Kept as is per D-288 #8. | None now. Re-check after the sim. |
| snare | player-traps.json | When an enemy monster attacks, cancel that attack. | Yes. Triggers on any declared attack, which is now a lane-legal one. | No change. |
| mirror-sigil | player-traps.json | When an enemy monster attacks, it loses {MIRROR_SIGIL_PENALTY} Power permanently before combat. | Yes. | No change. |
| display-case | collector-traps.json | Cancel an attack and switch the attacker to guard. | Yes. | No change. |
| unmake | player-spells.json | Destroy an enemy monster with Power {UNMAKE_MAX_POWER} or less. | Yes. Spells keep free targeting (D-284). This is the escape from lanes that D-284 relies on. | No change. |
| forfeit | collector-spells.json | Destroy one of your monsters with Power {FORFEIT_MAX_POWER} or less. | Yes. Free targeting kept. | No change. |
| bloodlust | player-spells.json | One of your monsters gets +{BLOODLUST_POWER} Power this turn. | Yes. | No change. |
| gilt-frame | collector-spells.json | +{GILT_POWER} Power and +{GILT_GUARD} Guard until the end of his next turn. | Yes. Target is in the spec, not the text. | No change. |
| restoration | collector-spells.json | Return a destroyed Relic to his hand. | Yes. | No change. |
| grave-recall | player-spells.json | Return a monster from your discard pile to your hand. | Yes. | No change. |
| shroud | player-spells.json | One of your monsters cannot be Appraised until your next turn. | Yes. | No change. |

Cards with no targeting or attack wording (no change): provenance-ledger, scrying-bones, siphon, counterfeit, insurance-claim, last-rites.

The Collector's AI text in `collector.json` is out of scope for this draft (ai-dev is editing it).

---

## 3. elements.json under ring A

Ring A (D-285, owner choice D-288 #1): Ember beats Gale, Gale beats Tide, Tide beats Lumen, Lumen beats Umbra, Umbra beats Ember.

| Element | Current `beats` | New `beats` | Change |
| --- | --- | --- | --- |
| ember | ["gale"] | ["gale"] | none |
| gale | ["tide"] | ["tide"] | none |
| tide | ["ember"] | ["lumen"] | changed |
| lumen | ["umbra"] | ["umbra"] | none |
| umbra | ["lumen"] | ["ember"] | changed |

Identity strings: no change proposed. None of the five identity strings names a matchup, so none contradicts ring A:

- Ember, "Aggressive, high Power": still true (Ember still beats Gale; Umbra now beats Ember, which is a risk, not a contradiction).
- Gale, "Fast, Swift and Pierce": unaffected.
- Tide, "Durable, Ward and Echo": still true; Tide now beats Lumen, the Sentinel element, which fits durability.
- Lumen, "Defensive, Sentinel and Ward": still true; it now loses to Tide and beats Umbra.
- Umbra, "Tricky, Haunt and Pierce": still true; it now beats Ember.

Related DESIGN edits (not in elements.json, listed for the flip):

- The Beats column of the table in DESIGN.md L64 to L70 becomes Gale, Tide, Lumen, Umbra, Ember for the five rows in the current row order, with Tide's and Umbra's entries changed as above. Row by row: Ember → Gale; Gale → Tide; Tide → Lumen; Lumen → Umbra; Umbra → Ember.
- DESIGN.md L72, "Lumen and Umbra beat each other both ways", is removed. Replacement sentence: "Each element beats exactly one other and loses to exactly one: Ember beats Gale, Gale beats Tide, Tide beats Lumen, Lumen beats Umbra, and Umbra beats Ember."
- DESIGN.md L62, "+2 Power", becomes "+{ELEMENT_BONUS} Power" (placeholder, D-172).

---

## 4. Rules text for the How to play and DESIGN.md

Plain language for a new player. Each paragraph reads in well under 60 seconds. Numbers come from globals by placeholder. The plural form `{NAME|singular|plural}` is the one already used for `LAST_RITES_DRAW` (see Q2).

**Summoning sickness.** A monster you summon can act at once, but with limits. On the turn it arrives it can attack the Collector's monsters, not the Collector's life. A monster with Swift can also attack life that turn, and a monster with Slow cannot attack at all that turn. From your next turn on, a monster can attack anything it could attack normally. The opening round is different: you cannot attack at all.

**Lanes.** Each side has {BOARD_SLOTS|lane|lanes}, one per monster slot, and each of your lanes faces the Collector's lane across from it. A monster can attack only the enemy monster across from it. If that lane is empty, the monster can hit the Collector's life only when the Collector has no monsters at all; otherwise it has no attack. Each turn, a monster may either move up to {LANE_MOVE_RANGE|lane|lanes} sideways into an empty lane, trade places with your own monster in that lane, or switch between attack and guard, but not more than one of these. A monster cannot move on the turn it arrives, and a monster that moves may still attack from its new lane that turn.

**Sentinel.** A face-up Sentinel guards its own lane and the lanes within {SENTINEL_REACH|lane|lanes} of it. An enemy monster that would attack a guarded lane must attack a Sentinel that guards it instead, even if the lane is empty. A face-down monster never guards, so it is never a Sentinel.

**The ring.** Each element beats exactly one other element and loses to exactly one. Ember beats Gale, Gale beats Tide, Tide beats Lumen, Lumen beats Umbra, and Umbra beats Ember. When a monster attacks an element it beats, it gets +{ELEMENT_BONUS} Power for that combat. Each element always shows its color and its icon.

---

## 5. Open questions for the owner

1. **Text follows its switch.** The Sentinel and Swift texts are each right under one setting only. Confirm they flip in the same commit as `FLAGS.LANES` and `SICKNESS_MODE`, and that the current text stays until then. There is no text that fits both settings.
2. **Placeholder wording for Sentinel and the plural form.** The owner's ruling (D-283) said "the lanes beside it", which is correct only at reach 1. This draft uses `{SENTINEL_REACH|lane|lanes}` so the text stays true for the `SENTINEL_REACH = 0` variant. Confirm (a) that wording, and (b) that the renderer chooses singular or plural by value for the lane placeholders. At reach 0 the sentence reads "0 lanes". Confirm that is acceptable for the A/B variant, or ask for a different phrasing.
3. **Face-up in the Sentinel text.** D-283 says a face-down monster is never a Sentinel. The proposed text says only "a Sentinel", and it does not say "face-up". Add "face-up" to the text, or leave it to the rules page in section 4?
4. **Slow text.** The proposed text is the same sentence as today. Confirm no text change, or ask for a clearer sentence that says "monsters or life". Recommendation: no change, because the sentence is already true and the rule under `monstersOnly` is exactly that.
5. **Thornwall.** Under lanes it fires only when the player has no monster at all (D-284). Its text is literally still true. Confirm it stays as is (D-288 #8), or name a new text if you want the trap to match its new frequency.
6. **Ring identities.** No identity string is changed in this draft, because none names a matchup. Confirm, or ask for a flavor change (for example on Tide, now the answer to Lumen).
7. **Unchanged keywords with a new meaning.** Vain ("best legal target"), Brittle ("any attack") and Pierce keep their text. Confirm the owner is happy that these read correctly under lanes without a change.
8. **Collector text.** The Collector's own rules text in `collector.json` is not reviewed here, because the ai-dev agent is editing that file. A separate pass is needed when lanes flip.

---

## 6. Owner answers (2026-10-16)

The owner is asleep and accepted the recommended default for each question in section 5. Nothing here changes live content yet.

1. **Text follows its switch.** Yes. Swift, Sentinel and the rules text each flip in the same commit as their switch (`SICKNESS_MODE`, `FLAGS.LANES`, ring data). The current text stays until then.
2. **Placeholder and plural.** Yes. Use `{SENTINEL_REACH|lane|lanes}`. The renderer picks singular or plural by value, so reach 0 reads "0 lanes" in the A/B variant, which is accepted.
3. **Face-up.** No "face-up" in the Sentinel text. The rules page (section 4) says it.
4. **Slow.** No text change. The sentence stays as it is.
5. **Thornwall.** Unchanged (D-288 #8).
6. **Ring identities.** Unchanged. No identity string names a matchup.
7. **Vain, Brittle, Pierce.** Unchanged, as section 1 says.
8. **Collector text pass.** Done now, see section 7.

---

## 7. Collector text pass (lanes, monsters-only sickness, ring A)

Scope: every text field in `packages/content/collector.json`. The only player-facing text there is `dialogue` (three moods, four lines each). The `ai` block holds rule ids and parameter names; they are not shown to the player, but they are listed at the end of this section so nobody renames them by accident.

**Result: no dialogue line becomes false.** No replacement is proposed.

| Mood | Line | Still true under lanes, monsters-only sickness and ring A? |
| --- | --- | --- |
| composed | Every piece in my collection has a provenance. Yours will have one too. | Yes. Nothing about lanes or sickness. |
| composed | Patience is the first virtue of any true collector. | Yes. |
| composed | Set your monsters down gently. I will take them in good time. | Yes. Appraisal is by Power, not by lane. |
| composed | What fine work. It would look splendid in my vault. | Yes. |
| agitated | You are clumsier than I expected. Give me that one. | Yes. |
| agitated | Every one of your monsters has a price, and I am running out of patience. | Yes. |
| agitated | Your hounds are at my gate. Let them come. | Yes. Describes his stance, not an attack rule. |
| agitated | I will have your strongest, and you will watch me take it. | Yes. "Strongest" is the highest Power, which lanes do not change. |
| desperate | Very well, take your stand. I only want what is mine. | Yes. |
| desperate | No more pretense. Everything you own is mine to appraise. | Yes, with a note. "Everything" was already an exaggeration: Appraisal takes only face-up monsters with Power 7 or more. Lanes and sickness do not change this, so it is not a flip item. Owner may tidy it at any time. |
| desperate | Your vault is empty and so is your hand. Let us finish this. | Yes. |
| desperate | Even ruin makes a fine display case. | Yes. |

**AI names (not player text, checked for meaning under lanes):**

- `attack: directIfEmpty`. The rule means "direct only when the whole foe board is empty" (`packages/ai/test/rules-attack.test.ts`). Under lanes, a direct hit is legal only when the player has no monsters at all (D-284), so the name still matches. Keep it.
- `attack: lethal, killWithoutLoss, faceDownIfStrong, holdExceptVain` choose among legal (attacker, target) pairs. No name is false.
- `summonLane: sentinelCenter, facingBeatable, facingEmpty, leftmostFree`. These are lane ids from D-286. They are correct.
- `reposition: toAttackIfUsable`. Owner decision, not a text fix. It names only the position change. Under lanes the Collector may also move (`laneAware`, the lane rewording in ARCHITECTURE, D-286). If the owner wants him to move lanes, he needs `laneAware`. Changing `ai` rule lists is owner-only (D-166), so this is a question, not an edit.
