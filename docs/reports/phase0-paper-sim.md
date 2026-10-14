# Phase 0 — Paper Simulation Report (Vault Duel, DESIGN.md v0.1)

Author: design-simulator · Date: 2026-10-14 · Source of truth: `docs/DESIGN.md` only (no engine yet).

Five full duels were paper-played by hand: a skilled human against the Collector, who follows his priority lists exactly. Each duel is set up to stress a different area. Where DESIGN.md is ambiguous, I picked the simplest reading and logged it under **Ambiguities** (numbers like A3 point there).

## 0. Conventions and working rulings used during play

Abbreviations for player cards: element initial + name, e.g. UW = Undertow Wyrm (Tide Wyrm 6/4), KW = Kiln Whelp, NW = Nightglass Wyrm, CH = Cinderjaw Hound, GSt = Gloam Stalker, VSh = Veil Shade, VS = Votive Spirit, etc. (full names given at first use in each duel). "P x / C y" = player life / Collector life after the step.

Collector card ids follow the DESIGN.md table order: M1 Gilded Penitent … M12 Weeping Automaton, M13 The Unpriced; S1 Provenance Ledger, S2 Restoration, S3 Gilt Frame, S4 Forfeit; T1 Display Case, T2 Counterfeit, T3 Insurance Claim.

Working rulings (each is detailed in §2):
- Every monster has summoning sickness: it cannot attack on the turn it is summoned unless it has Swift (A1). This makes Slow a no-op.
- Each turn a side draws until it holds 5 cards, at most 2 per turn. There is no hand cap after Ledger or Scrying (A2).
- The Collector summons in attack position, except that rule 6 puts monsters in guard when all of them are Slow. In his reposition step, a guard monster switches to attack only if that gives it a rule 1, 2 or 4 attack (A3).
- Moods: Composed means the priority list exactly as written. Agitated means attack rule 2 also takes even trades (ties). Desperate means he attacks face-down monsters with any Power and also takes trades (A4).
- "Beats your strongest face-up monster" (play rule 3) means his Power, plus any element bonus, exceeds that monster's Power. Among qualifiers he picks the highest Power, and the rule needs at least one face-up player monster (A5). Hand ties are broken by card id (A6).
- When no play rule applies, he casts Ledger, then sets a trap, then passes (A7).
- An appraised monster keeps its position and can attack that same turn, because it was moved, not summoned (A8).
- Chimeras always enter face-up and cannot be Graft materials except as the Ascend base (A11, A12).
- Ward stops destruction only; combat damage still happens (A14). A Brittle defender destroyed by an advantaged attacker with lower Power deals no damage either way (A15).
- Insurance Claim resolves before combat damage, following "traps resolve before damage" (A19).
- Sacrificing a monster is not destroying it (A20).

---

## 1. Duels

### Summary table

| # | Stress area | Result | Rounds | Final P / C | Grafts | Appraisals (success/attempts) | Unpriced |
|---|---|---|---|---|---|---|---|
| 1 | Balanced deck, played well | **Loss** (vault seals) | 12 | 14 / **1** | 2 | 0 / 3 | Drawn R8, never playable |
| 2 | Graft every turn from R2 | **Win** | 8 | 21 / 0 | 4 | 0 / 2 | Never drawn |
| 3 | Appraisal avoidance (≤6 face-up) | **Win** | 7 | 23 / 0 | 1 | 0 / 2 | Dead in opening hand all game |
| 4 | Appraisal succeeds R3, Unpriced lands | **Loss** | 7 | 0 / 15 | 2 | 1 / 2 | Summoned R3 |
| 5 | Novice-style play | **Loss** | 3 | 0 / 25 | 0 | 1 / 1 | Never drawn |

Aggregate compared with the targets. n = 5, so treat these as directional only.

| Metric | Target | Paper result | Read |
|---|---|---|---|
| Skilled win rate | 45–55% | 2/3 deliberate skilled lines won; D1 lost by 1 life | Plausible, but both wins came through exploits (Unstable timing, Sentinel wall + Vain bleed) |
| Novice win rate | 20–30% | 0/1, dead on R3 | Far below target |
| Median length | 9–11 | 7 | Too short: swings decide games early |
| Full 12 rounds | 15–30% | 1/5 (20%) | OK |
| Grafts per win | 1.5–3 | 2.5 | OK |
| Appraisal success | 30–60% | 2/10 (20%); **0/7 when the player was trying to dodge** | Too easy to dodge |
| Unpriced appears | 20–40% | 1/5, only in the line built to force it | Low for skilled play |

---

### Duel 1: balanced deck, played well

**Player deck (24).** Ember: Cinderjaw Hound (CH 6/2 Swift), Ashguard Squire (AS 5/4), Kiln Whelp (KW 7/3), Pyre Wisp (PW 4/3 Haunt). Gale: Gale Serpent (GS 6/4), Windward Lancer (WL 4/4 Pierce). Tide: Undertow Wyrm (UW 6/4), Brine Lurker (BL 5/3 Haunt), Drowned Oathkeeper (DO 4/5 Ward), Coral Bastion (CB 2/7 Sentinel). Lumen: Halo Stag (HS 5/4), Candle Templar (CT 4/5 Ward). Umbra: Mourning Vassal (MV 5/4 Haunt), Nightglass Wyrm (NW 7/3), Veil Shade (VSh 4/3 Pierce). Spells: Unmake, Bloodlust, Scrying Bones, Shroud, Siphon. Traps: Snare, Mirror Sigil, Thornwall, Last Rites.
Constraint check: 5 elements and 5 kinds. Power ≤5: 10 monsters. Power ≥6: 5 monsters. No card appears more than once. ✓

**Player shuffle:** 1 UW, 2 Snare, 3 AS, 4 HS, 5 Bloodlust, 6 KW, 7 MV, 8 Unmake, 9 CH, 10 Mirror, 11 DO, 12 Siphon, 13 GS, 14 VSh, 15 Thornwall, 16 BL, 17 Shroud, 18 NW, 19 CT, 20 Scrying, 21 PW, 22 WL, 23 Last Rites, 24 CB.
**Collector shuffle:** 1 Reliquary Hound, 2 Display Case, 3 Gilded Penitent, 4 Gilt Frame, 5 Stormglass Hydra, 6 Drowned Choir, 7 Forfeit, 8 Ashen Duchess, 9 Insurance Claim, 10 Abyssal Curator, 11 Ossuary Seraph, 12 The Unpriced, 13 Provenance Ledger, 14 Velvet Moth, 15 Counterfeit, 16 Kiln-Born Leviathan, 17 Saint of Brass, 18 Restoration, 19 Weeping Automaton, 20 Mourning Cartographer. That is 13 monsters, 4 spells and 3 traps ✓.
**Opening hands:** Player UW, Snare, AS, HS, Bloodlust (3 monsters, kept). Collector Hound, Display Case, Penitent, Gilt Frame, Hydra.

| Rnd | Player | Collector | P / C |
|---|---|---|---|
| 1 | Summon AS face-up attack. | Rule 3 plays Stormglass Hydra 8/5. The AI picks the highest monster that beats AS and ignores that Hydra is Brittle to my Ember AS. | 20/25 |
| 2 | Draw KW. Summon UW in attack. AS (Ember, +2) attacks Hydra and Brittle destroys it; 7<8, so no damage. | Draws Choir. Rule 3 plays Gilded Penitent 7/6 Ward in attack. | 20/25 |
| 3 | Draw MV. **Set Snare. No attacks**, because nothing beats Penitent profitably (dead-ish turn). | **Appraisal 1 fails** (max face-up 6). Draws Forfeit. Rule 4 sets Display Case. Penitent attacks UW; Snare cancels it. | 20/25 |
| 4 | Draw Unmake. **Graft UW (first) + KW** gives Twin-Throat Hydra, Tide, 10/4, Unstable +3 = **13/4**. Made on R4, so it dies at the end of R5 and never sees an Appraisal. AS attacks Penitent as **bait**; Display Case cancels it and AS goes to guard. | Draws Duchess. Rule 6 plays Ashen Duchess 7/5 Swift. Penitent destroys AS (guard 4). | 20/25 |
| 5 | Draw CH. Summon CH in attack. Hydra (Tide +2 vs Ember) hits Duchess at 15, for 8 damage. Hydra expires. I rejected the alternative (Bloodlust Hydra for 11 damage), because it leaves my board empty against 13 lethal power. | Draws Insurance Claim. Rule 6 plays Drowned Choir 6/6 (ties with Hound, broken by id). Penitent destroys CH: 1 damage. | 19/17 |
| 6 | Draw Mirror. Board empty facing Penitent 7 + Choir 6. Summon MV **face-up guard** as Haunt bait. | **Appraisal 2 fails.** Draws Curator. Rule 3 plays Reliquary Hound 6/4 Vain. Penitent kills MV, and Haunt leaves Penitent at **5** permanently. Choir attacks direct: 6. | 13/17 |
| 7 | Draw DO. **Graft HS (first, Lumen) + DO** gives Centaur Revenant, Lumen, 8/5 Ward (stable; R7 is safe until R9). | Draws Seraph. His board is full, so rule 5 casts **Gilt Frame on Hound** (a contested attack). Hound at 8, +2 element, hits Centaur: Ward lost, 2 damage. | 11/17 |
| 8 | Draw Siphon, GS. Summon GS. Centaur (Lumen +2 = 10) destroys Hound (8): 2 damage. Haunt drops Centaur to 6/5. | C drops to 15 and turns **Agitated**. Draws **The Unpriced** (dead card). Rule 3 plays Ossuary Seraph 8/3. Agitated trade: Choir and Centaur tie at 6, both destroyed. | 11/15 |
| 9 | Draw VSh. Set Mirror Sigil. GS (6) attacks Penitent (5): Ward lost, 1 damage. | **Appraisal 3 fails** (GS 6). Draws Ledger. Rule 6 finds only Slow monsters, so Abyssal Curator goes in guard. Seraph (Vain) attacks GS; Mirror makes it 5, it loses and is destroyed: 1 damage to him. | 11/13 |
| 10 | Draw Thornwall. **Unmake Curator** (Power 5). GS destroys Penitent (5): 1 damage. | Draws Moth. Rule 3 plays Velvet Moth 7/3. | 11/12 |
| 11 | Draw BL. Bloodlust GS (9) destroys Moth: 2 damage. | Draws Counterfeit. He has no summonable monster, so rule 4 sets Counterfeit. | 11/10 |
| 12 | Draw Shroud. **Siphon** (C 7, P 14). GS attacks direct: 6. **C ends at 1. The vault seals.** | — | 14/1 |

**Key takeaways.** A well-played balanced deck lost by 1 life on R12. Damage is the bottleneck: the Collector's board is almost never empty, so most damage comes from combat differences of 1–3. The swing turns were the Unstable graft (made on R4, so it was Appraisal-safe) and baiting his trap with a cheap attacker. The Unpriced was drawn on R8 and was a dead card.

---

### Duel 2: graft-heavy ("graft every turn from R2")

**Player deck (24).** Ember: CH 6/2 Swift, KW 7/3. Gale: Stormcrow (SC 5/3 Swift), GS 6/4. Tide: UW 6/4, BL 5/3 Haunt, CB 2/7 Sentinel. Lumen: HS 5/4, Gilded Wyrmling (GW 6/3 Pierce), Votive Spirit (VS 3/4 Echo). Umbra: Gloam Stalker (GSt 6/2 Swift), NW 7/3, MV 5/4 Haunt, VSh 4/3 Pierce, Grave Effigy (GE 3/6 Sentinel). Spells: Bloodlust ×2, Shroud, Siphon, Grave Recall. Traps: Snare, Mirror Sigil, Thornwall, Last Rites.
Constraint check: Power ≤5 = 8 monsters, ≥6 = 7. 5 elements, 5 kinds. Max 2 copies of any card ✓.

**Player shuffle:** 1 NW, 2 HS, 3 Bloodlust, 4 MV, 5 CB, 6 GS, 7 Snare, 8 KW, 9 VS, 10 Shroud, 11 UW, 12 GSt, 13 Siphon, 14 SC, 15 Mirror, 16 BL, 17 Bloodlust, 18 GW, 19 Thornwall, 20 CH, 21 Grave Recall, 22 VSh, 23 Last Rites, 24 GE.
**Collector shuffle:** 1 Velvet Moth, 2 Abyssal Curator, 3 Counterfeit, 4 Ashen Duchess, 5 Forfeit, 6 Kiln-Born Leviathan, 7 Ossuary Seraph, 8 Display Case, 9 Gilt Frame, 10 Weeping Automaton, 11 Reliquary Hound, 12 Ledger, 13 Stormglass Hydra, 14 Insurance Claim, 15 Saint of Brass, 16 The Unpriced, 17 Drowned Choir, 18 Restoration, 19 Gilded Penitent, 20 Mourning Cartographer ✓.
**Opening hands:** Player NW, HS, Bloodlust, MV, CB (4 monsters). Collector Moth, Curator, Counterfeit, Duchess, Forfeit.

| Rnd | Player | Collector | P / C |
|---|---|---|---|
| 1 | Summon HS in attack. | Rule 3 sees two 7s that beat HS (Duchess, Moth); card id picks **Ashen Duchess**. Swift, but Tethered makes it 5 vs HS 5, so it holds. | 20/25 |
| 2 | Draw GS. **Graft HS (board, first, Lumen) + NW**: Lumen/Umbra is opposed, giving Gorefang Drake, Lumen, 9/4+3 = **12/4 Unstable**. | Draws Leviathan. Rule 6 plays Kiln-Born Leviathan 9/4. Nothing can beat the Drake, so he holds. | 20/25 |
| 3 | Draw Snare. **Graft MV + CB (CB first)** gives Bastion Warden, Tide, **6/9, Sentinel + Haunt** in guard. It is Appraisal-immune at 6 Power. Drake (12) destroys Duchess: 5 damage. Drake expires at the end of the turn. | **Appraisal 1 fails** (Warden 6). Draws Seraph. Rule 3 plays Ossuary Seraph 8/3. Leviathan cannot beat Warden's 9 Guard, and Sentinel forces any attack onto it, so he holds. | 20/20 |
| 4 | Draw KW, VS. **Graft KW (first, Ember) + GS**: Ember/Gale is opposed, giving Twin-Throat Hydra, Ember, **13/4 Unstable**. I skipped Ascend to keep VS as a future material. | Draws Display Case. Rule 6 plays Moth 7/3. Seraph (Vain) has to attack the Sentinel Warden: 8 vs Guard 9, so he takes 1. | 20/19 |
| 5 | Draw Shroud, UW. **Graft UW (first) + VS** gives Phantom Wyrm, Tide, 9/5 (stable). Hydra (13) destroys Moth: 6 damage. Warden repositions to attack and its Tide attack destroys Leviathan through Brittle (no damage). | C is 13, **Agitated**. Draws Gilt. Rule 4 sets Display Case. Seraph destroys Warden (now in attack, Power 6): 2 damage. Haunt drops Seraph to 6/3. | 18/13 |
| 6 | Draw GSt, Siphon. **No graft is possible**: only one non-Chimera monster is in hand. **Shroud the Phantom. No attack**, so Display Case stays armed. | **Appraisal 2 fails** (Shroud). Draws Automaton. Rule 6 finds only Slow monsters, so Curator goes in guard. Seraph (Vain) must attack Phantom 9: Seraph is destroyed and he takes 3. | 18/10 |
| 7 | Draw SC. **Graft GSt + SC** gives Packmaw, Umbra, 7/4 with Swift. Packmaw (Swift) attacks Curator as **bait**; Display Case cancels it and Packmaw goes to guard. Phantom destroys Curator (guard 7). | Draws Hound. He has 0 monsters and holds a trap, so **rule 4 sets Counterfeit instead of summoning Hound**. | 18/10 |
| 8 | Draw Mirror, BL. Siphon (C 7, P 21). His board is empty: Phantom attacks direct for 9. **Win.** | — | 21/0 |

**Key takeaways.**
- "Graft every turn" ran out of materials on R6. A graft costs 2 monsters, and you draw at most 2 cards per turn at about 62% monster density. So the blanket strategy is **not sustainable**.
- **Unstable is dominant**: +3 Power, it still gets its one attack, and a chimera made on any non-Appraisal round (R2, R4, R5, R7, R8) expires before the next Appraisal.
- The Collector lost tempo two ways: Vain Seraph threw itself into bad attacks twice, and rule 4 had him set a trap instead of developing on R7, which opened a direct-lethal window.

---

### Duel 3: Appraisal avoidance (never anything at 7+ face-up)

**Player deck (24).** Ember: CH 6/2 Swift, AS 5/4, PW 4/3 Haunt, Brazier Golem (BG 3/6 Sentinel). Gale: SC 5/3 Swift, WL 4/4 Pierce, Weathervane Sentry (WS 3/6 Sentinel). Tide: BL 5/3 Haunt, DO 4/5 Ward, CB 2/7 Sentinel. Lumen: CT 4/5 Ward, GW 6/3 Pierce. Umbra: GSt 6/2 Swift, MV 5/4 Haunt, VSh 4/3 Pierce. Spells: Unmake ×2, Siphon ×2, Bloodlust. Traps: Snare, Mirror Sigil, Thornwall ×2.
Constraint check: Power ≥6 = 3 monsters (CH, GSt, GW), the minimum. Power ≤5 = 12. 5 elements, 5 kinds ✓.

**Player shuffle:** 1 AS, 2 Siphon, 3 WL, 4 Snare, 5 CH, 6 BG, 7 Unmake, 8 GSt, 9 DO, 10 Mirror, 11 Bloodlust, 12 SC, 13 VSh, 14 Thornwall, 15 CB, 16 Siphon, 17 MV, 18 GW, 19 Unmake, 20 PW, 21 Thornwall, 22 WS, 23 CT, 24 BL.
**Collector shuffle:** 1 Saint of Brass, 2 Reliquary Hound, 3 Insurance Claim, 4 Gilded Penitent, 5 **The Unpriced**, 6 Ledger, 7 Mourning Cartographer, 8 Kiln-Born Leviathan, 9 Display Case, 10 Drowned Choir, 11 Gilt Frame, 12 Ossuary Seraph, 13 Weeping Automaton, 14 Forfeit, 15 Stormglass Hydra, 16 Counterfeit, 17 Abyssal Curator, 18 Ashen Duchess, 19 Restoration, 20 Velvet Moth ✓.
**Opening hands:** Player AS, Siphon, WL, Snare, CH (3 monsters). Collector Saint, Hound, Insurance Claim, Penitent, **Unpriced**. The Unpriced counts as one of the "≥2 monsters" but is unplayable (A10).

| Rnd | Player | Collector | P / C |
|---|---|---|---|
| 1 | Summon AS in attack. | Rule 3 plays Penitent 7/6 Ward. | 20/25 |
| 2 | Draw BG. **Graft AS (board, first, Ember) + BG** gives Bastion Warden, Ember, **6/9 Sentinel** in guard. | Draws Ledger. Rule 6 plays Reliquary Hound 6/4 Vain. Penitent cannot beat the Sentinel's 9 Guard, so it holds. | 20/25 |
| 3 | Draw Unmake. **Siphon.** | **Appraisal 1 fails.** Draws Cartographer and plays it (rule 6). Hound (Vain) must attack the Sentinel: 6 vs 9, so **he takes 3**. | 23/19 |
| 4 | Draw GSt. Summon CH (Swift). CH (Ember +2 = 8) destroys Cartographer (Gale 6): 2 damage. Echo returns it to his hand. | His hand is already 5, so no draw. He re-summons Cartographer. Penitent holds. Hound bleeds 3 into the Warden. | 23/14 |
| 5 | Draw DO. Summon DO in attack. CH destroys Cartographer again: 2 damage, Echo again. | **Agitated.** No draw. Rule 4 (2 monsters vs my 3) sets Insurance Claim. Hound bleeds 3. | 23/9 |
| 6 | Draw Mirror. My board is full, so **set Mirror Sigil** (forced: dead-ish turn). | **Appraisal 2 fails.** Draws Leviathan. Rule 3 plays Kiln-Born Leviathan 9/4. Hound (Vain) attacks the Warden; **Mirror** makes it 3, so the bounce now costs **him 6**. | 23/3 |
| 7 | Draw Bloodlust. Bloodlust CH (9). DO (Tide) attacks Leviathan first: Brittle destroys it, and **Insurance Claim is used up** (C 6). CH (9) destroys Hound (3): 6 damage. **Win.** | — | 23/0 |

**Key takeaways.**
- **Appraisal is trivially dodged.** Staying at 6 or less face-up cost almost nothing, because the Collector's AI never attacks a Sentinel it cannot beat.
- **Sentinel plus a high Guard blocks his whole offense.** Sentinel forces every attack onto the wall, and rule 2 never attacks what it cannot beat.
- **Vain monsters bleed into the wall every turn.** Hound alone dealt **12 of the 25 damage to its own side**, 6 of it in one hit with Mirror Sigil.
- The Unpriced sat dead in his opening hand for the whole game: one fewer real card for him.
- Even base Sentinels (Coral Bastion 2/7, the 3/6 Constructs) wall most Relics. The Collector's only answer is Forfeit (Power ≤4), which cannot hit a 6/9 Bastion Warden.

---

### Duel 4: Appraisal succeeds on R3 and The Unpriced lands

The line is deliberate: the player commits to a stable 9-Power Chimera on R2 for tempo, has no Shroud in hand, and accepts the R3 risk. Afterwards they play optimally, to test whether the game can be recovered.

**Player deck (24).** Ember: KW 7/3, CH 6/2 Swift, AS 5/4, PW 4/3. Gale: GS 6/4, SC 5/3. Tide: UW 6/4, DO 4/5 Ward, Tidebound Wraith (TW 4/4 Echo). Lumen: HS 5/4, CT 4/5 Ward, Reliquary Sentinel (RS 3/6 Sentinel). Umbra: NW 7/3, GSt 6/2, GE 3/6 Sentinel. Spells: Bloodlust, Shroud, Grave Recall, Scrying Bones, Unmake. Traps: Snare, Mirror Sigil, Last Rites, Thornwall. Power ≥6 = 6 monsters, ≤5 = 9; 5 elements, 5 kinds ✓.

**Player shuffle:** 1 KW, 2 HS, 3 Scrying, 4 DO, 5 Snare, 6 NW, 7 Bloodlust, 8 CT, 9 GS, 10 Mirror, 11 UW, 12 Shroud, 13 CH, 14 TW, 15 Unmake, 16 GSt, 17 Grave Recall, 18 AS, 19 Thornwall, 20 RS, 21 SC, 22 Last Rites, 23 PW, 24 GE.
**Collector shuffle:** 1 **The Unpriced**, 2 Ashen Duchess, 3 Weeping Automaton, 4 Display Case, 5 Ossuary Seraph, 6 Forfeit, 7 Gilded Penitent, 8 Drowned Choir, 9 Insurance Claim, 10 Ledger, 11 Stormglass Hydra, 12 Reliquary Hound, 13 Restoration, 14 Counterfeit, 15 Saint of Brass, 16 Kiln-Born Leviathan, 17 Gilt Frame, 18 Velvet Moth, 19 Abyssal Curator, 20 Mourning Cartographer ✓.
**Opening hands:** Player KW, HS, Scrying, DO, Snare. Collector Unpriced, Duchess, Automaton, Display Case, Seraph.

| Rnd | Player | Collector | P / C |
|---|---|---|---|
| 1 | Summon KW in attack. | Rule 3 plays Ossuary Seraph 8/3. | 20/25 |
| 2 | Draw NW. **Graft KW (board, Ember first) + HS** gives Gorefang Drake, Ember, **9/4, stable** (the deliberate risk). | Draws Forfeit. Rule 6 plays Duchess. **Seraph (Vain) has to attack Drake 9 and dies**: 1 damage to him. | 20/24 |
| 3 | Draw Bloodlust. Drake destroys Duchess: 2 damage. Set Snare. | **Appraisal 1 succeeds: he takes the Drake.** Draws Penitent. **Rule 2 sacrifices the Drake to summon The Unpriced 10/8 Ward.** | 20/22 |
| 4 | Draw CT. **Graft CT (first, Lumen) + NW**: Lumen/Umbra is opposed, giving Dragoon Abomination, Lumen, 9/5+3 = **12/5 Ward, Unstable** (made R4, so Appraisal-safe). | Draws Choir. Rule 6 plays Drowned Choir. Unpriced (10) cannot beat the Dragoon (12), so it holds. | 20/22 |
| 5 | Draw GS, Mirror. **Bloodlust the Dragoon**: 15, +2 vs Umbra = 17, into Unpriced. **Ward is stripped**, 7 damage. The Dragoon expires and my board is empty. | Draws Insurance Claim. Every monster in hand is Slow, so Penitent goes in guard. Unpriced attacks direct; **Snare cancels**. Choir attacks direct: 6. | 14/15 |
| 6 | Draw UW. An Appraisal round, so I cannot make a 7+ Chimera (it would be stolen). I face 23 power across three attackers. Summon DO in guard (best single blocker). | **Appraisal 2 fails.** Draws Ledger. Rule 5 casts **Forfeit on DO** (Ward absorbs it). Penitent repositions to attack. Unpriced kills DO, then Choir hits direct for 6 and Penitent for 7. | 1/15 |
| 7 | Draw Shroud. One play cannot block three attackers. Summon UW in guard. | Unpriced destroys UW, and Choir's direct attack is lethal. **Loss.** | 0/15 |

**Variant (conservative R5).** Same through R4. On R5 I summon DO as a blocker instead of casting Bloodlust: C drops to 18 and Ward is still stripped. He answers with Penitent; Snare cancels Unpriced and Choir strips DO's Ward. On R6 (an Appraisal round) I again cannot graft safely. Forfeit plus three attackers leaves me at 7, with an empty board facing three Relics. Loss on R7–R8.

**Key takeaways.**
- **An R3 Appraisal plus The Unpriced was not recoverable in either line.** The steal costs your best monster *and* hands him a 10/8 Ward that needs two lethal hits.
- He then fills three slots with 7-Power Relics while you are making one play per turn.
- An empty board against 3 attackers is the usual way to lose: 20 life is about one and a half full-board swings.
- Appraisal rounds also take away your best tool, the Unstable graft, exactly when you need it.

---

### Duel 5: novice-style line

**Novice policy** (my stand-in for "random legal"):
- Play the leftmost legal card in hand, with monsters always face-up in attack.
- Never graft or reposition.
- Attack only when raw printed Power is at least the target's printed Power. Ignore elements, traps, Brittle and Appraisal.

**Player deck (24).** Ember: KW 7/3, BG 3/6 Sentinel, PW 4/3. Gale: SC 5/3 Swift, GS 6/4, Whispering Draft (WD 3/4 Echo). Tide: BL 5/3, UW 6/4, TW 4/4 Echo. Lumen: HS 5/4, GW 6/3 Pierce, VS 3/4 Echo. Umbra: GSt 6/2, NW 7/3, GE 3/6. Spells: Unmake, Bloodlust, Scrying Bones, Siphon, Grave Recall. Traps: Snare ×2, Mirror Sigil, Last Rites. 4 kinds (no Knight) and 5 elements; ≥6 Power = 6 monsters, ≤5 = 9 ✓.

**Player shuffle:** 1 GW, 2 Unmake, 3 SC, 4 KW, 5 Last Rites, 6 TW, 7 Siphon, 8 NW, 9 BG, 10 Snare, 11 HS, 12 Bloodlust, 13 UW, 14 PW, 15 Grave Recall, 16 GSt, 17 Mirror, 18 VS, 19 GS, 20 Scrying, 21 BL, 22 Snare, 23 WD, 24 GE.
**Collector shuffle:** 1 Ashen Duchess, 2 Stormglass Hydra, 3 Gilt Frame, 4 Abyssal Curator, 5 Insurance Claim, 6 Velvet Moth, 7 Display Case, 8 Reliquary Hound, 9 The Unpriced, 10 Forfeit, 11 Ossuary Seraph, 12 Saint of Brass, 13 Counterfeit, 14 Gilded Penitent, 15 Ledger, 16 Drowned Choir, 17 Kiln-Born Leviathan, 18 Restoration, 19 Weeping Automaton, 20 Mourning Cartographer ✓.
**Opening hands:** Player GW, Unmake, SC, KW, Last Rites. Collector Duchess, Hydra, Gilt, Curator, Insurance Claim.

| Rnd | Player | Collector | P / C |
|---|---|---|---|
| 1 | Summon GW (6/3) in attack. | Rule 3 plays Stormglass Hydra 8/5. | 20/25 |
| 2 | Draw TW. Unmake has no legal target (everything is ≥7), so play SC (Swift) in attack. Neither monster attacks: Hydra is bigger. | Draws Moth. Rule 3 plays Duchess (Swift). Hydra destroys GW: 2 damage. Duchess (Ember +2 vs Gale) destroys SC: 4 damage. | 14/25 |
| 3 | Draw Siphon. Summon **KW 7/3 face-up** in attack. | **Appraisal 1 succeeds (KW).** His board is full, so he sets Display Case. My board is empty: Hydra 8 + Duchess 7 + KW 7 = 22 is lethal. **Loss on R3.** Even if the appraised KW could not attack (proposal 2), 15 damage leaves me at 1 and dead on R4. | 0/25 |

**Key takeaways.** A non-grafting player cannot contest 7–9 Power Relics. Rule 3 always answers your best monster with a bigger one, and rule 2 then clears your board, so direct hits arrive from R2–R3. A base 7-Power card (Kiln Whelp, Nightglass Wyrm) played face-up before R3 is an automatic Appraisal. **A novice win rate of 20–30% looks unreachable under the current rules**: estimate under 5%.

---

## 2. Rule ambiguities

Ordered roughly by how much play changes depending on the reading.

1. **Summoning sickness vs Slow.** *Situation:* Swift says it "can attack monsters the turn it is summoned", and Graft rule 6 says a Chimera "follows normal summoning rules (cannot attack this turn unless Swift)", which implies every monster has sickness. *Readings:* (a) all monsters have sickness, which makes **Slow a no-op**; (b) there is no general sickness, which makes Swift meaningless for monsters and contradicts Graft rule 6. *Recommend:* (a), plus redefine Slow (proposal 1). I played (a); Slow then only mattered through AI rule 6 ("all Slow → guard").
2. **Draw step wording.** "Draw up to 5 cards, at most 2 per turn" could mean "draw until you hold 5, max 2" or "draw up to 2". Is there a hand cap after Ledger or Scrying? *Recommend:* draw until you hold `HAND_SIZE`, at most `MAX_DRAW_PER_TURN`; no maximum hand size; the same rules for the Collector.
3. **Collector positions and repositioning.** The priority list gives no summon position (except rule 6's all-Slow case) and never says whether he repositions. *Readings:* always attack / always guard / position by mood; never reposition / reposition when useful. *Recommend:* summon in attack, except rule-6-all-Slow summons in guard. In his reposition step, a guard monster switches to attack only if that gives it a rule 1, 2 or 4 attack; he never switches attack → guard.
4. **Moods vs the priority list.** "Composed favors guard and traps" and "Agitated trades aggressively" are not encoded in the numbered rules; only Desperate is referenced (attack rule 3). *Recommend:* Composed = list as written. Agitated = attack rule 2 also accepts even trades (ties). Desperate = also attacks face-down monsters with any Power and takes trades. State it in a table in DESIGN.md.
5. **"A monster that beats your strongest face-up monster" (play rule 3).** Which comparison (Power vs Power, or vs Guard when that monster is guarding)? Is the element bonus included? Is Tethered applied? Which monster if several qualify? Does it apply when you have no face-up monster? *Recommend:* his attacking Power (with element bonus and Tethered as they would be after the summon) > that monster's Power. Choose the highest-Power qualifier. The rule does nothing if you have no face-up monster.
6. **Tie-breaks in hand.** "Leftmost slot, then card id": hand cards have no slot. *Recommend:* in hand, card id order (the DESIGN.md table order).
7. **Collector fallback.** When no rule applies (board full, no trap rule, no spell target, Ledger in hand), what does he do? Ledger is never named in rule 5. *Recommend:* add a rule 7: cast Ledger if held, else set a trap if a slot is free, else pass.
8. **The appraised monster after the steal.** What position is it in? Can it attack that turn (it was moved, not summoned)? Do its statuses (Unstable timer, Bloodlust, Shroud) carry over? For Echo, who is the "owner"? *Readings:* keeps its position and can attack (brutal; decides D5) vs enters guard with no attack. *Recommend:* proposal 2.
9. **"His vault."** Undefined. Can a vaulted monster be sacrificed for Covetous? Can it come back to his board later? *Recommend:* the vault is out of play, but a vaulted monster *is* a legal Covetous sacrifice; it never returns.
10. **The Unpriced in the draw pile.** Drawn without a successful Appraisal it is a dead card (D1 R8, D3 opening). Does it count toward the "≥2 monsters in opening hand" guarantee? *Recommend:* proposal 4 (set it aside). Failing that, it should not count as a monster for the guarantee.
11. **Chimeras as Graft materials.** Rule 1 allows "board" materials, but a Chimera has no kind, so its family result is undefined. Re-grafting a Chimera would also dodge Appraisal. *Recommend:* a Chimera can be a material only as the base of the same-turn Ascend step.
12. **Chimera face-down.** Rule 6 says the Chimera "enters in attack or guard position". Can that be face-down guard (which makes every Chimera Appraisal-proof)? *Recommend:* always face-up.
13. **Echo (and Grave Recall) on Chimeras.** Spirits donate Echo, but a Chimera "returned to hand" is undefined. An Echo plus Unstable Chimera would loop. *Recommend:* a Chimera that would go to hand goes to the discard instead, and Grave Recall cannot target Chimeras.
14. **Ward vs damage and spells.** Does Ward also cancel the combat damage difference? Does it absorb Forfeit and Unmake? *Recommend:* Ward prevents only destruction. Damage still applies. Destroy effects consume Ward.
15. **Brittle resolution.** An advantaged attacker with lower Power hits a Brittle monster in attack position: is any damage dealt, and does the attacker die? *Recommend:* the Brittle monster is destroyed, the attacker survives, and damage is dealt only if the attacker's Power is higher (the normal difference).
16. **Sentinel.** Does a face-down Sentinel force targeting (it is hidden)? When a Sentinel blocks everything and he cannot beat it, does rule 2 "hold"? *Recommend:* a face-down Sentinel does not force targeting. AI rules 2–5 apply only to legal targets, so with an unbeatable Sentinel he holds, and only Vain monsters attack (into it).
17. **Vain "best legal target".** When every attack loses, which one? Do rule-3 face-down limits bind a Vain monster? *Recommend:* order of preference: destroy something (highest Power), then a direct attack if legal, then the attack that costs him the least life, then the attack that costs him the least board. Vain overrides the face-down limit.
18. **Gilt Frame "contested attack"** and **rule 5 "high-value target"** are undefined. *Recommend:* contested means one of his monsters that can attack this turn has a target it cannot currently beat but would beat with +2. Restoration's high-value target means any Relic in his discard. Forfeit targets your highest-Power **face-up** monster with Power ≤4.
19. **Insurance Claim vs lethal.** "Traps resolve before damage", so Insurance Claim can lift him out of lethal combat damage (it mattered in D3 R7). *Recommend:* keep it, but state it explicitly: traps triggered by an attack resolve before that attack's damage.
20. **Sacrifice vs destroy.** Do Graft/Covetous sacrifices trigger Haunt, Echo, Last Rites or Insurance Claim? *Recommend:* no; a sacrifice is not "destroyed".
21. **Life cap.** Can Siphon raise life above the starting value (D3 reached 23)? *Recommend:* no cap, but note it explicitly.
22. **Pierce vs an attack-position defender** is redundant (the difference already reaches life). *Recommend:* say "Pierce only matters against guard and face-down defenders".
23. **Unstable on a stolen Chimera.** "Destroyed at the end of *your* next turn": whose turn after it changes controller? *Recommend:* the timer belongs to the player who grafted it (and proposal 3 rewrites the timer).
24. **Tethered when checking "beats".** Tethered (−2 while his only monster) changes after the summon. *Recommend:* evaluate stats as they will be after the action (covered by item 5).

## 3. Proposals

Each is exactly one type: **[G]** global change, **[C]** card stat change, **[R]** rule clarification.

1. **[R] Summoning sickness is universal; redefine Slow.** Text: "Monsters cannot attack on the turn they are summoned (Swift: monsters only)." Slow becomes: "Cannot attack until his second turn after it is summoned."
   *Why:* Slow is currently a no-op (A1).
   *Effect:* slows his Slow Relics (Penitent, Saint, Curator, Automaton) by one turn. Novice +2–3 pts, median +0.5 round, experienced +1–2 pts.
2. **[R] An appraised monster enters his board in guard and cannot attack or reposition that turn.** Its timers stay with its original owner, and Echo returns it to the original owner's hand.
   *Why:* under the "keeps position, can attack" reading, Appraisal is a three-way swing in one turn (lose a monster, give him an attacker, take its damage). It killed the novice on R3 (D5).
   *Effect:* novice +3–5 pts. Fewer R3–R4 losses, so the median moves +0.5. Appraisal stays scary because it still feeds Covetous.
3. **[G] Unstable timing: "destroyed at the start of your turn after next"** (it gets its one attack, then must survive one Collector turn).
   *Why:* Unstable is the dominant play. It is +3 Power, and because it dies before his next turn it is **Appraisal-proof unless made on R3, R6 or R9**. That is why skilled play went 0/7 on Appraisals and why D2 cruised. With the change, Unstable Chimeras made on R2, R5 and R8 sit through an Appraisal turn and become prime Covetous fuel. The "timing around Appraisal" pillar becomes a real trade-off.
   *Effect:* Appraisal success for the experienced bot 0–10% → about 30–45%. Unpriced appearances up about 10–15 pts. Experienced win rate −5 pts. Grafts per win unchanged.
4. **[G] Set The Unpriced aside.** His draw pile is the other 19 cards; the first successful Appraisal puts The Unpriced in his hand. Update the validator: 19 + ace = 20.
   *Why:* no dead ace in hand (D1, D3). Unpriced appearances then equal "games with ≥1 successful Appraisal", which is tunable and readable. It also removes a large source of variance between seeds (a dead card in his opening hand is a big swing).
   *Effect:* together with proposal 3, Unpriced lands in about 25–35% of games, on target. Seed rejection rate down.
5. **[C] The Unpriced: 10/8 Ward → 10/8, no keyword.**
   *Why:* once it lands it is effectively unbeatable. It needs two lethal hits, and you are one play per turn (D4, both lines lost).
   *Effect:* comeback rate after it lands goes from about 0% to about 25–35% for skilled play. It is still the biggest body on the board. Experienced win rate +2–3 pts, which offsets proposal 4.
6. **[C] Unmake: "Power 5 or less" → "Power 6 or less".**
   *Why:* it currently hits only Curator and Automaton (and Tethered Relics), so it is close to dead against the Collector. At 6 it answers Saint, Cartographer, Choir and Hound. It is the most valuable non-graft tool for weaker players.
   *Effect:* novice +3–5 pts, experienced +1–2, median −0.3 rounds.
7. **[G] AI: move play rule 4 (set a trap when behind) below rule 6.** It becomes "if he has no summonable monster, fewer monsters than you, and a trap, set it".
   *Why:* when he was behind he set traps instead of developing (D2 R7, D3 R5). That emptied his board and opened direct lethal.
   *Effect:* experienced −3–5 pts, median +0.5–1 round, readability unchanged.
8. **[C] Forfeit: "Destroy one of your monsters with Power 4 or less, or with Sentinel."**
   *Why:* a Sentinel with Guard 7 or more (Coral Bastion, Bastion Warden, Colossus) shuts down his whole offense under AI rule 2, while Vain monsters bleed into it (D3: Hound did 12 of the 25 damage to its own side). He needs one answer to walls.
   *Effect:* experienced −3–5 pts (it removes the wall exploit). Median +0.5 round. Novice roughly unchanged.
9. **[R] Define Vain "best legal target".** Order: destroy the highest-Power monster it can; else a direct attack; else the attack that costs him the least life; else the least board. Vain ignores the face-down limit.
   *Why:* A17. Without a definition, the engine and players disagree about suicide attacks.
   *Effect:* no balance change, just a deterministic definition. Note for tuning: bounce damage against Mirror Sigil plus a high Guard is big (6 in one hit in D3). If the walls stay too strong after proposal 8, consider Mirror Sigil −2.
10. **[G] PLAYER_LIFE 20 → 24.**
    *Why:* most losses were empty-board swings from two or three Relics (13–23 damage), which happen at about 20 life. Four more life buys one more decision turn without changing his card quality.
    *Effect:* novice +4–6 pts, experienced +3–4 pts (offset by proposals 3, 7 and 8), median +0.5–1 round, full-length games +3–5 pts.
11. **[R] Define the "novice bot" concretely and treat 20–30% as a target for it, not for uniformly random play.** Proposed novice:
    - plays the highest-Power monster face-up in attack, otherwise a random legal non-monster;
    - grafts only when two monsters in hand would give at least 8 Power, choosing order randomly;
    - attacks whenever raw Power ≥ the target's displayed stat;
    - ignores traps and Appraisal.

    *Why:* uniformly random legal moves will almost never beat a deterministic planner that always answers your best monster (D5: dead on R3). The target is unreachable as written and would distort tuning.
    *Effect:* makes the novice metric meaningful. With proposals 1, 2, 6 and 10, a naive bot like this plausibly lands at 15–25%.
12. **[R] Chimera rules bundle (A11–A13).** Chimeras always enter face-up. They can be a material only as the Ascend base. A Chimera that would go to hand goes to the discard. Grave Recall cannot target Chimeras.
    *Why:* each open reading opens an exploit (face-down Chimeras dodge Appraisal; Echo plus Unstable recursion; undefined kinds).
    *Effect:* keeps Appraisal relevant; no metric change against the rulings I played.
13. **[R] Collector AI bundle (A3–A7, A18).**
    - Summon positions, the reposition rule, mood modifiers, the definition of "beats", hand tie-breaks by card id, a rule-7 fallback, and definitions of "contested" and "high-value", all as recommended above.
    - **Plus one change for readability:** rule 3 skips a Brittle monster if you have a face-up monster with element advantage over it.

    *Why:* the engine needs one deterministic reading. Also, the AI throwing Brittle monsters into obvious counters (D1 R1) makes him easy to exploit.
    *Effect:* the Brittle tweak gives experienced −1–2 pts; the rest is neutral.
14. **[R] Combat bundle (A14–A16, A19–A22).** Ward prevents only destruction. Brittle resolution as recommended. A face-down Sentinel does not taunt. Traps resolve before the attack's damage (Insurance Claim can save him). Sacrifice ≠ destroy. No life cap. Pierce applies only against guard and face-down defenders.
    *Effect:* neutral; needed so the engine and players agree.
15. **[C] Bastion Warden: 6/9 → 7/8** (optional; apply only if the walls are still dominant after proposal 8).
    *Why:* Bastion Warden is the only Chimera at ≤6 Power with Guard ≥8 (Colossus 5/10 is the other immune wall). That makes it both Appraisal-immune and a hard wall, and it was the core of the avoidance line. At 7/8 it is Appraisal-eligible, and his 9-Power Relics break it.
    *Effect:* Appraisal success +3–5 pts; experienced −1–2 pts.

**Expected combined direction** (proposals 1–10 with the clarifications), against the targets. Each needs confirming in `packages/sim` once the engine exists:

| Metric | Target | Combined expectation |
|---|---|---|
| Experienced win rate | 45–55% | 45–55%: proposals 3, 7, 8 pull it down; 5, 6, 10 push it up |
| Novice win rate | 20–30% | 15–25% for the defined naive bot (proposal 11) |
| Median length | 9–11 | 7 → about 9 |
| Full-length games | 15–30% | about 20% |
| Grafts per win | 1.5–3 | about 2.5 |
| Appraisal success | 30–60% | about 30–45% |
| Unpriced appears | 20–40% | about 25–35% |
| Seed rejection | <15% | improves, mainly through proposal 4 |

## 4. Feel notes

- **Dead turns.**
  - Player: D1 R3 (only a trap could be set; no profitable attack), D2 R6 (Shroud and pass), D3 R6 (board full, set a trap). About one dead turn per duel is acceptable. They cluster on Appraisal rounds, because you are holding back.
  - Collector: turns where he only sets a trap, or casts Ledger with a full board, are invisible to the player. With intents shown, the "scheme" icon at least tells you a trap was set.
- **Meaningful choices.** Strong.
  - Graft order (the first material's element) mattered every single time: Tide vs Ember Duchess for +2, Lumen vs Umbra Unpriced to strip Ward.
  - Which round to make an Unstable Chimera was the deepest decision in every game.
  - Baiting his one known trap with a cheap attacker is satisfying, because his 3 trap types are public.
  - Haunt-baiting (giving him a cheap Haunt monster to kill to shrink Penitent) felt clever.
- **Appraisal fairness.**
  - For skilled players it is fair but toothless: a visible countdown plus Unstable/Shroud/≤6 Chimeras meant 0/7 successes when I was trying to dodge.
  - For novices it feels unfair. Base Kiln Whelp and Nightglass Wyrm (7 Power) are stolen on R3 by a rule the player may not have absorbed, and the stolen card then helps kill them.
  - Suggestion for the UI (no rule change): mark "will be appraised" on any face-up monster at 7+ Power during the player turn before an Appraisal round.
  - Once The Unpriced lands early, the duel feels decided (D4). Proposals 4 and 5 make it a big threat rather than an automatic loss.
- **Collector readability.** Very readable, arguably too readable for experts.
  - Rule 3 always answers your strongest face-up monster with the highest bigger Relic. You can bait it into Brittle-to-you picks (D1 R1).
  - He never attacks a Sentinel he cannot beat.
  - Vain monsters attack predictably into walls.
  - That is good for fairness and learning, but it creates exploits (proposals 7, 8 and 13 close the worst of them).
  - To novices he feels relentless rather than random: no randomness complaints are expected.
- **Damage economy.** Getting 25 damage through a board that is rarely empty is slow. Most chip damage is 1–3 per combat, so games are won by one or two big swings: an Unstable plus element plus Bloodlust hit, or a turn where his board is emptied. This is fine for drama, but it makes the margin swingy (D1 lost by exactly 1).
