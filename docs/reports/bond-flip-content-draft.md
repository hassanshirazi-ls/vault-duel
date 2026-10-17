# Bond flip content draft (Split, Symbiosis, bond action)

Status: DRAFT for owner review. Nothing here is in live JSON, `globals.ts`, `howto.ts` or DESIGN.md. Each text ships in the same commit as the switch it describes: `FLAGS.SPLIT`, `FLAGS.SYMBIOSIS` or `FLAGS.BOND_ACTION`. The current text stays until then.

Sources: D-305 to D-316 (`docs/DECISIONS.md` L2634 to L2810), D-316 owner ruling (all defaults accepted), `docs/reports/rules-flip-content-draft.md` (pattern), `packages/content/cards/*.json`, `packages/content/keywords/*.ts`, `packages/content/collector.json` (dialogue only), `apps/web/src/view/howto.ts`, `apps/web/src/view/copy.ts`, `docs/DESIGN.md` L111, L165, L176.

Placeholder rule: every number that comes from a global is `{NAME}` or `{NAME|singular|plural}`. A sign goes outside the placeholder (`+{SYMBIOSIS_GUARD_BONUS} Guard`). Globals used below: `PLAYS_PER_TURN`, `BONDS_PER_TURN` (pinned 1), `SYMBIOSIS_GUARD_BONUS`, `SYMBIOTES_PER_HOST` (pinned 1), `MIN_GRAFT_MATERIALS`, `MAX_GRAFT_MATERIALS`, `ASCEND_POWER`, `ASCEND_GUARD`, `BOARD_SLOTS`, `LANE_MOVE_RANGE`, `HAND_SIZE`. New in this draft: `BONDS_PER_TURN`, `SYMBIOTES_PER_HOST`, `SYMBIOSIS_GUARD_BONUS` (all from D-310). Not in any text: `SPLIT_PART_PERM_P`, `BOND_GRAFT_MAX_HAND_MATERIALS`.

Ordering gate: a placeholder whose global does not exist fails `content:check`. The three new globals must land in the engine commit (D-315 #1) before any text that uses them.

---

## 1. Rules texts and where they live

### 1a. The texts (one sentence each)

Each row is one text. The "Shown on" column is the page or line that renders it (section 3).

| ID | Text | Shown on | Switch |
| --- | --- | --- | --- |
| SPLIT-1 | Unbind one of your face-up Chimeras into the monsters it was grafted from; they come back face-up and cannot attack or move that turn. | Split page, summary | `FLAGS.SPLIT` |
| SPLIT-2 | The first part keeps its slot, the rest take the nearest free slots, and any part with no room goes to your hand. | Split page | `FLAGS.SPLIT` |
| SPLIT-3 | Its materials must still be in your discard, and a Chimera that arrived this turn cannot be split. | Split page | `FLAGS.SPLIT` |
| SPLIT-4 | Splitting is not destruction, so Echo, Haunt, Last Rites and Insurance Claim do not trigger. | Split page | `FLAGS.SPLIT` |
| SYM-1 | Attach a base monster from your hand under one of your face-up monsters, which gains +{SYMBIOSIS_GUARD_BONUS} Guard and, if it has room, the attached monster's keyword. | Symbiosis page, summary and first line | `FLAGS.SYMBIOSIS` |
| SYM-2 | If the host is destroyed, the attached monster comes out in its slot as if newly summoned; if the host is Appraised, the Collector takes both. | Symbiosis page | `FLAGS.SYMBIOSIS` |
| SYM-3 | A host carries {SYMBIOTES_PER_HOST\|attached monster\|attached monsters} at most. | Symbiosis page | `FLAGS.SYMBIOSIS` |
| BOND-1 | Before your first attack you may play {PLAYS_PER_TURN\|card\|cards} and make {BONDS_PER_TURN\|bond action\|bond actions} (Graft, Split or Symbiosis), in either order. | Cards page | `FLAGS.BOND_ACTION` |
| BOND-2 | Graft is a bond action, so it does not use up your card play. | Graft page, first line (bond on) | `FLAGS.BOND_ACTION` |
| BOND-3 | Your first attack ends the bond for the turn. | Cards page | `FLAGS.BOND_ACTION` |

Notes on the texts:

- The turn shape in BOND-1 says "one card play and one bond action" with placeholders, not the words "one" and "a" typed as numbers (D-172).
- SYM-1 covers the keyword cap in one clause ("if it has room"), so a Chimera host with two keywords reads correctly (D-308).
- SYM-2 says "as if newly summoned": the emerging monster has `entered = turn` and follows the sickness rules for its mode (D-280, D-308).
- SPLIT-3 states the Grave Recall lock (D-307 #1, a material taken back makes the Chimera unsplittable) so a player can see why Split is refused.
- SPLIT-1 says "cannot move" as well as "cannot attack", because a part may not reposition or change lanes on the turn it comes back (D-307 #4).

### 1b. Where the texts should live

Options:

| Home | Verdict | Reason |
| --- | --- | --- |
| `globals.ts` strings | Rejected | `globals.ts` holds numbers and flags (ARCHITECTURE §11). Adding prose there would mix the two. |
| `keywords/*.ts` | Rejected | Split and Symbiosis are actions, not keywords. The keyword schema has one kind; a new kind is a schema change. |
| New `packages/content/rules-text.json` (id to sentence) | Best long-term, not recommended now | It gives one edit per sentence, with `content:check` on placeholders. It needs a new schema entry, and the brief says to stop and report a schema change. Not created here. |
| `apps/web/src/view/howto.ts` (How to play copy) | **Recommended now (smallest)** | The copy already lives here, with `r()` placeholders and `when(flag, …)` per switch. Make one constant per sentence (`PLAY_LINE`, `BOND_LINE`, `SPLIT_LINE`, `SYM_LINE`) at the top of the file and use each constant on every page that shows it. Then each sentence is one edit, and the switch picks the variant. |
| `apps/web/src/view/copy.ts` (in-play hints) | Only if a hint shows bond text | `ASCEND_HINT` says "or Graft now", which stays true under bonds (section 2). |
| `docs/DESIGN.md` | Mirror, not a data home | DESIGN keeps the rules (ARCHITECTURE §10.4). Owner or main session edits it at the flip (section 4, Q5). |

Today the play sentence is written three times in `howto.ts` (cards summary, cards line, quiz) and once in DESIGN. The constant fixes the three copies in the web file. DESIGN stays a mirror.

---

## 2. Existing texts that become wrong or misleading

Only texts whose meaning changes are listed. Every other text is listed at the end as "no change".

| Text (where) | Switch | Verdict | Replacement |
| --- | --- | --- | --- |
| "It is your card play for the turn" (`howto.ts` graft line 1) | `BOND_ACTION` | Wrong when on: Graft no longer uses the play. | BOND-2, as the bond-on variant of that line (section 3b). |
| "Then play … or Graft" (`howto.ts` cards summary and cards line) | `BOND_ACTION`, and `SPLIT` / `SYMBIOSIS` when bonds are off | Wrong when on. When bonds are off and Split or Symbiosis is on, it omits both. | Variant table in section 3a. |
| "a summon, a spell, a trap or a Graft each use one" (`howto.ts` quiz, "How many cards can you play") | `BOND_ACTION` | Wrong when on: Graft does not use the play. | Variant in section 3e. |
| "Spells (cast as your one play; resolve immediately)" and "Traps (set face-down as your one play …)" (DESIGN L165, L176) | `BOND_ACTION` | "One play" now means the card play, next to a bond action. | "your card play" (owner or main session at flip). |
| "It is your one play for the turn." (DESIGN L111) | `BOND_ACTION` | Wrong when on. | BOND-2 wording. |
| Shroud: "One of your monsters cannot be Appraised until your next turn." (`cards/player-spells.json`, `shroud`) | `SPLIT` | **Misleading.** Split makes fresh parts with no Shroud (D-309), so a split Chimera loses the protection. | "One of your monsters cannot be Appraised until your next turn; if you split it, this ends." (one sentence) |
| Appraisal line: "the Collector takes your highest-Power face-up monster" (`howto.ts` appraisal, line 1) | `SYMBIOSIS` | Incomplete: the attached monster goes too (D-308). | "…takes your highest-Power face-up monster, and any monster attached under it." |

Texts that stay true, with the reason (no card JSON change):

| Text | Switch | Why it stays true |
| --- | --- | --- |
| Counterfeit: "A Chimera grafted this turn loses {COUNTERFEIT_PENALTY} Power." | `BOND_ACTION`, `SPLIT` | A bond-action Graft is still a Graft (D-309). Split removes the Chimera's permanent malus (D-309), which is a player escape the text does not mention. Open question Q3. |
| Grave Recall: "Return a monster from your discard pile to your hand." | `SPLIT` | True. A returned material makes its Chimera unsplittable (D-307). SPLIT-3 explains it. |
| Echo (keyword): "When destroyed, return it to its owner's hand." | `SYMBIOSIS` | True. An Echo host returns to hand and its symbiote still comes out (D-309). |
| Haunt (keyword): "…loses {HAUNT_PENALTY} Power permanently." | `SPLIT` | True. Split is not destruction, so no Haunt (SPLIT-4). |
| Last Rites: "When your monster is destroyed, draw {LAST_RITES_DRAW\|card\|cards}." | `SPLIT`, `SYMBIOSIS` | True. Split and symbiote emergence are not destruction. SPLIT-4 says so. |
| Insurance Claim: "When his monster is destroyed, he gains {INSURANCE_HEAL} life." | `SYMBIOSIS` | True. A Collector host with a symbiote triggers it once (D-309). |
| Covetous (keyword): "…a monster he acquired through Appraisal (ace only)." | `SYMBIOSIS` | True. An appraised symbiote on his side counts as acquired (D-308). |
| Ward (keyword), Unmake, Forfeit, Bloodlust, Gilt Frame, Restoration, Snare, Mirror Sigil, Display Case, Thornwall, Provenance Ledger, Scrying Bones, Siphon | any | True. They target or count board monsters, and a destroyed host brings out its symbiote without changing the words. |
| ASCEND_HINT (`copy.ts`): "…or Graft now." | `BOND_ACTION` | True. Ascend is still part of the same Graft. |

---

## 3. How to play copy

Each block is a replacement for the named copy in `howto.ts`. Flag conditions use the existing `when(f.X, …)` pattern. Words are counted roughly. "~60" is the target. Where a page goes over, the note says why.

### 3a. Cards page (`cards`)

Play line, by switch (the constant is the same sentence on every page):

| Switch state | Play line |
| --- | --- |
| All bond switches off (today) | Then play {PLAYS_PER_TURN\|card\|cards}: summon a monster, cast a spell, set a trap, or Graft. |
| `BOND_ACTION` off, `SPLIT` and/or `SYMBIOSIS` on | Then play {PLAYS_PER_TURN\|card\|cards}: summon a monster, cast a spell, set a trap, or {the bond names that are on: Graft, Split and/or Symbiosis}. |
| `BOND_ACTION` on | Then play {PLAYS_PER_TURN\|card\|cards}: summon a monster, cast a spell or set a trap. |

Summary (`BOND_ACTION` on): "Each turn you draw back up to {HAND_SIZE} cards, then play {PLAYS_PER_TURN|card|cards}: summon a monster, cast a spell or set a trap. Tap a card, then tap where it goes. Hold any card to read it."

Extra line (`BOND_ACTION` on), BOND-1 and BOND-3 (about 30 words): "Before your first attack you may also make {BONDS_PER_TURN|bond action|bond actions}: Graft, Split or Symbiosis, in either order. Your first attack ends the bond for the turn."

### 3b. Graft page (`graft`)

Only the first line changes; the rest of the page stays as it is.

- Bond off (today, unchanged): "Graft joins {MIN_GRAFT_MATERIALS} monsters from your hand or board into one Chimera. It is your card play for the turn, and board materials are sacrificed."
- Bond on (BOND-2): "Graft joins {MIN_GRAFT_MATERIALS} monsters from your hand or board into one Chimera. It is a bond action, so it does not use up your card play, and board materials are sacrificed."

Note: the Graft page is about 100 words today, over the ~60 target. A trim is an open question (Q6). Trimmed option, bond on, about 60 words: summary "Graft joins {MIN_GRAFT_MATERIALS} monsters into one Chimera. The first material sets its element. Add one more ({MAX_GRAFT_MATERIALS} in all) to Ascend it."; then "It is a bond action, so it does not use up your card play. Board materials are sacrificed."; "The two kinds set its family, Power and Guard."; "A preview shows the result before you confirm." The keyword and Unstable lines would move to their own page.

### 3c. Split page (new, shown when `FLAGS.SPLIT`)

- Title: Split
- Summary (SPLIT-1, about 14 words): "Split unbinds a face-up Chimera of yours into the monsters it was grafted from."
- Line 1 (SPLIT-2, about 18 words): "The first part keeps its slot; the rest take the nearest free slots, or go to your hand if there is no room."
- Line 2 (SPLIT-1 rest, SPLIT-3, about 20 words): "Parts cannot attack or move that turn. Their materials must still be in your discard, and a Chimera that arrived this turn cannot split."
- Line 3 (SPLIT-4, about 14 words): "Splitting is not destruction, so Echo, Haunt, Last Rites and Insurance Claim do not trigger."

Total about 66 words. With `BOND_ACTION` off, Split is a play; the cards page line (3a) already says so, so the Split page needs no extra line.

### 3d. Symbiosis page (new, shown when `FLAGS.SYMBIOSIS`)

- Title: Symbiosis
- Summary (about 14 words): "Symbiosis attaches a base monster from your hand under one of your face-up monsters."
- Line 1 (SYM-1, about 18 words): "The host gains +{SYMBIOSIS_GUARD_BONUS} Guard and, if it has room, the attached monster's keyword."
- Line 2 (SYM-2, about 24 words): "The attached monster uses no slot. If the host is destroyed, it comes out in its slot as if newly summoned; if the host is Appraised, the Collector takes both."
- Line 3 (SYM-3, about 10 words): "A host carries {SYMBIOTES_PER_HOST|attached monster|attached monsters} at most."

Total about 66 words. Power is not changed by the symbiote, which is worth one line if the owner wants it (Q9).

### 3e. Quiz line (`howto.ts`, "How many cards can you play in one turn?")

- All bond switches off (today): "You play {PLAYS_PER_TURN|card|cards} a turn: a summon, a spell, a trap or a Graft each use one."
- `BOND_ACTION` off, Split and/or Symbiosis on: the same sentence with the switched-on bond names in place of "a Graft".
- `BOND_ACTION` on: "You play {PLAYS_PER_TURN|card|cards} a turn: a summon, a spell or a trap uses it. Graft, Split and Symbiosis are bond actions, and you may make {BONDS_PER_TURN|bond action|bond actions} before your first attack."

The answer (`numberAnswers(PLAYS_PER_TURN)`) does not change.

### 3f. Appraisal line (`howto.ts`, appraisal, line 1, `SYMBIOSIS` on)

"At the start of his turn in rounds …, the Collector takes your highest-Power face-up monster, and any monster attached under it."

### 3g. Lanes, sickness and ring (rules-flip §4, merged)

The rules-flip §4 paragraphs are longer than the 60-word target. Proposed split into pages, using the rules-flip text and trimming it. Each page is shown by its switch (`LANES`, or `SICKNESS_MODE` for sickness).

- **Lanes** (`FLAGS.LANES`, about 65 words): "Each side has {BOARD_SLOTS|lane|lanes}. Your monster can attack only the enemy monster across from it. If that lane is empty, your monster can hit the Collector's life only when he has no monsters at all. Each turn a monster may move {LANE_MOVE_RANGE|lane|lanes} sideways, swap with your monster there, or switch position: only one of these. A monster cannot move on the turn it arrives."
- **Sickness** (`SICKNESS_MODE`, condition on the value, not a flag): classic: "A monster you summon cannot attack on the turn it arrives." monstersOnly: "On the turn it arrives, a monster can attack monsters but not life. Swift lets it attack life too; Slow stops it from attacking that turn."
- **Sentinel**: the text is the keyword text in rules-flip §1 (no separate page).
- **Ring**: no change in the How to play copy. The combat page already says "follow the arrows on the wheel", and the wheel is drawn from `elements.json`. Do not type the ring list into `howto.ts` (one edit per change, §10.4). Only DESIGN.md (a mirror) lists the ring, and it is updated at the flip.

---

## 4. Open questions (recommended default for each)

The owner pre-accepts defaults (D-316), so each question below has the default that applies unless the owner says otherwise.

- **Q1. Text home.** Default: one constant per sentence in `howto.ts` (section 1b). A new `rules-text.json` is a schema change and waits for an owner decision.
- **Q2. Grave Recall lock on the Split page.** Default: keep SPLIT-3 on the page, since the rule is otherwise invisible.
- **Q3. Counterfeit malus escaped by Split (D-309).** Default: no text change. The Counterfeit text stays true. The sim should count it, but `SPLIT_PART_PERM_P` does not fix it (it sets the parts' permanent Power, not the Chimera's malus).
- **Q4. Keyword cap in SYM-1 ("if it has room").** Default: as written.
- **Q5. Who edits DESIGN.md at the flip.** D-315 #5 says the owner; the D-316 owner ruling says the main session. Default: the main session, per the D-316 ruling. Confirm that the ruling supersedes D-315 #5.
- **Q6. Graft page length.** Default: trim it at the flip copy pass (about 100 words today), not now.
- **Q7. Split page when `BOND_ACTION` is off.** Default: the cards page lists Split as a play (section 3a). The Split page itself does not repeat it.
- **Q8. Arrival lock on Split (D-307 #2).** Default: stated on the Split page (SPLIT-3).
- **Q9. Symbiote Power.** Default: not on the Symbiosis page. Add one line ("its Power does not change") only if the owner wants it.
- **Q10. Ring list in copy.** Default: no ring list in `howto.ts` (section 3g). DESIGN keeps the list.

---

## 5. Live edits at flip time (for the flip commits)

Nothing below ships now. Each item ships in the commit of the switch it depends on.

| File | Edit | Switch | Texts |
| --- | --- | --- | --- |
| `packages/content/cards/player-spells.json` | `shroud` text | `FLAGS.SPLIT` | section 2 |
| `apps/web/src/view/howto.ts` | Play constant; cards summary and line; graft line 1; quiz "why"; appraisal line 1; new `split` and `symbiosis` pages | `SPLIT`, `SYMBIOSIS`, `BOND_ACTION` | sections 3a to 3f |
| `apps/web/src/view/howto.ts` | Lanes and sickness pages (if rules-flip §4 is adopted) | `LANES`, `SICKNESS_MODE` | section 3g |
| `docs/DESIGN.md` | L111, L165, L176 wording; new "Bond actions" section | `BOND_ACTION` | section 2 |
| `packages/content/src/globals.ts` | New flags and numbers (engine commit, before any text) | all | D-310 |

No keyword file changes for bonds. No Collector JSON text changes for bonds (`collector.json` has dialogue only, and nothing there refers to bonds). `copy.ts` needs no change.
