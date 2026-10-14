# Vault Duel — Game Design Doc v0.1

Oct 13, 2026 · @Hassan

## Overview

Vault Duel is a daily dark-fantasy card duel: every day, every player gets the same seeded 24-card deck and one attempt to defeat the Collector within 12 rounds. A duel lasts 3–5 minutes. The game is original IP, built so all content (cards, keywords, elements, kinds, recipes, boss behavior) is data that can be added, changed or removed without touching engine code.

**Pillars**

- **Same game for everyone.** Both decks are shuffled from the date seed, so results are comparable and shareable.
- **Simple rules, deep combinations.** A new player understands the rules in 60 seconds; depth comes from Grafting, elements, timing around Appraisal, and reading the Collector.
- **Challenging but fair boss.** The Collector never cheats, is deterministic, and telegraphs his intent.
- **Fast.** One card per turn, at most 12 rounds, no waiting on animations.

**Locked decisions**

| Area | Decision |
| --- | --- |
| Format | Duel: hidden draw order, identical seed for everyone |
| Boss | The Collector, the only boss; weekly rule twist |
| Art | Dark fantasy painted cards; placeholders until the artist delivers |
| Combining | **Graft** creates **Chimeras** (replaces "fusion") |
| Long-term hook | The Binder: cosmetic collection of daily signature cards and discovered Chimeras |
| Platforms | Web first (PWA), then iOS and Android from the same codebase; portrait, one-handed, tap-only |
| Working title | Vault Duel (check trademark before launch) |

## Core rules

You have 20 life and a 24-card deck; the Collector has 25 life and a fixed 20-card deck. Reduce his life to 0 before round 12 ends.

**Setup**

1. Both decks are shuffled from the daily seed. The player sees their full 24-card list and the day's difficulty rating.
2. Each side draws 5. The player may redraw once: the whole hand goes to the bottom and the next 5 seeded cards are drawn. The seed guarantees at least 2 monsters in both opening hands.
3. The player always goes first and cannot attack on round 1.

**A round** = the player's turn, then the Collector's turn.

1. **Draw** up to 5 cards, at most 2 per turn (spell effects ignore the cap).
2. **Reposition**: each of your monsters may switch between attack and guard once, except on the turn it was summoned. A face-down monster flipped to attack is revealed.
3. **Play one card**: summon a monster (face-up attack, face-up guard, or face-down guard), Graft, cast a spell, or set a trap.
4. **Attack** with each attack-position monster once, then end the turn.

**Board**: 3 monster slots and 2 trap slots per side. A full board blocks summoning; a Graft that uses a board monster frees its slot.

**Combat**

| Defender | Result |
| --- | --- |
| Attack position | Higher Power destroys the lower; the loser's owner takes the difference. A tie destroys both, no damage. |
| Guard position | Power > Guard destroys the defender, no damage. Power < Guard: the attacker's owner takes the difference. Tie: nothing happens. |
| Face-down | Revealed, then resolved as guard. |
| Empty board | Direct attack: full Power as damage. |

Element advantage adds +2 Power when attacking only. Keywords and traps resolve before damage.

**Win and loss**: you win when the Collector hits 0. You lose at 0 life, or when the vault seals at the end of round 12. If you cannot draw, you skip the draw (no deck-out loss).

## Elements and kinds

Every monster has one element and one kind. Elements give a flat +2 Power when attacking with advantage; there is no resistance. Kinds decide Graft results and stat profiles.

| Element | Beats | Color + icon | Identity |
| --- | --- | --- | --- |
| Ember | Gale | Red, flame | Aggressive, high Power |
| Gale | Tide | Pale green, feather | Fast, Swift and Pierce |
| Tide | Ember | Deep blue, wave | Durable, Ward and Echo |
| Lumen | Umbra | Gold, halo | Defensive, Sentinel and Ward |
| Umbra | Lumen | Violet, eye | Tricky, Haunt and Pierce |

Lumen and Umbra beat each other both ways: whichever attacks gets +2. Every element always shows both its color and its icon (color-blind safe).

| Kind | Stat profile | Graft role |
| --- | --- | --- |
| Beast | High Power, low Guard | Aggression |
| Knight | Balanced | Reliable middle results |
| Wyrm | Highest Power | Biggest Chimeras |
| Construct | High Guard | Defensive Chimeras |
| Spirit | Low stats, carries keywords | Keyword donors |

Elements and kinds are data: adding a sixth element is one entry plus its row in the advantage matrix (see Technical architecture).

## Keywords and Flaws

Launch has 6 keywords and 5 Flaws. Base cards carry at most 1 keyword; Chimeras inherit up to 2. Each keyword is shown as a visual frame or effect on the card, not only as text.

| Keyword | Rule | Inspired by | Visual |
| --- | --- | --- | --- |
| Swift | Can attack monsters the turn it is summoned, but not life directly | Hearthstone Rush | Motion streaks |
| Sentinel | Enemy attacks must target Sentinels first | Hearthstone Taunt | Iron shield border |
| Pierce | Power beyond the defender's Guard is dealt to its owner's life | Runeterra Overwhelm | Spear notch on frame |
| Ward | The first time it would be destroyed, it loses Ward instead | Hearthstone Divine Shield | Pale barrier |
| Haunt | When destroyed, the monster that destroyed it loses 2 Power permanently | Deathrattle family | Ghost wisps |
| Echo | When destroyed, return it to its owner's hand | — | Faded double image |

Flaws appear only on the Collector's Relics. Each Relic has exactly one.

| Flaw | Rule |
| --- | --- |
| Slow | Cannot attack the turn it is summoned |
| Vain | Must attack if able, choosing the best legal target |
| Brittle | Destroyed by any attack with element advantage, regardless of Power |
| Tethered | −2 Power while it is his only monster |
| Covetous | Can only be summoned by sacrificing a monster he acquired through Appraisal (ace only) |

Complexity budget: no card text longer than one sentence. A new keyword must justify itself against these six.

## Graft system

Grafting combines 2 monsters into a Chimera whose family is set by their two kinds and whose element is set by the first material. It is your one play for the turn.

**Rules**

1. Choose 2 materials from your hand and/or your board, in order. Board materials are sacrificed (their slot frees).
2. Result family = the kind pair (table below). Result element = the **first** material's element, so order is a real choice.
3. Chimeras inherit up to 2 keywords from their materials (player picks if more than 2 are available).
4. **Ascend** (second step, same turn): graft the new Chimera with 1 more monster. Result: same family, Ascended, +2 Power and +1 Guard, may take that material's keyword (still max 2). Max 3 materials total.
5. **Unstable**: if the materials' elements oppose each other (one beats the other, or Lumen + Umbra), the Chimera gets +3 Power but is destroyed at the end of your next turn.
6. The Chimera enters in attack or guard position (player's choice) and follows normal summoning rules (cannot attack this turn unless Swift).
7. The UI always shows a preview of the result before confirming. A first-time result is added to the Binder.

**Chimera families** (15 kind pairs, order-independent). Art is one painting per family; the element changes the frame and glow, so launch needs 15 Chimera paintings, not 75.

| Kind pair | Chimera | Power / Guard |
| --- | --- | --- |
| Beast + Beast | Packmaw | 7 / 4 |
| Beast + Knight | Centaur Revenant | 8 / 5 |
| Beast + Wyrm | Gorefang Drake | 9 / 4 |
| Beast + Construct | Ironhide Chimera | 7 / 7 |
| Beast + Spirit | Feral Specter | 8 / 4 |
| Knight + Knight | Twinblade Paladin | 8 / 6 |
| Knight + Wyrm | Dragoon Abomination | 9 / 5 |
| Knight + Construct | Bastion Warden | 6 / 9 |
| Knight + Spirit | Revenant Lord | 8 / 5 |
| Wyrm + Wyrm | Twin-Throat Hydra | 10 / 4 |
| Wyrm + Construct | Clockwork Wyrm | 8 / 7 |
| Wyrm + Spirit | Phantom Wyrm | 9 / 5 |
| Construct + Construct | Colossus of Seams | 5 / 10 |
| Construct + Spirit | Haunted Engine | 7 / 6 |
| Spirit + Spirit | Choir of Ash | 7 / 5 |

Every pair of monsters can graft, so a random hand never has zero options; the skill is choosing which pair, which order, and when. Most Chimeras reach 7+ Power, which makes them Appraisal targets (see The Collector).

## Player card pool v0.1

The v0.1 pool is 25 monsters (one per element × kind), 6 spells and 4 traps. Each daily deck draws 15 monsters, 5 spells and 4 traps from it (duplicates allowed, max 2 copies). Stats are placeholders for the simulator to tune.

**Monsters** (Power / Guard, keyword)

| Element | Beast | Knight | Wyrm | Construct | Spirit |
| --- | --- | --- | --- | --- | --- |
| Ember | Cinderjaw Hound 6/2 Swift | Ashguard Squire 5/4 | Kiln Whelp 7/3 | Brazier Golem 3/6 Sentinel | Pyre Wisp 4/3 Haunt |
| Gale | Stormcrow 5/3 Swift | Windward Lancer 4/4 Pierce | Gale Serpent 6/4 | Weathervane Sentry 3/6 Sentinel | Whispering Draft 3/4 Echo |
| Tide | Brine Lurker 5/3 Haunt | Drowned Oathkeeper 4/5 Ward | Undertow Wyrm 6/4 | Coral Bastion 2/7 Sentinel | Tidebound Wraith 4/4 Echo |
| Lumen | Halo Stag 5/4 | Candle Templar 4/5 Ward | Gilded Wyrmling 6/3 Pierce | Reliquary Sentinel 3/6 Sentinel | Votive Spirit 3/4 Echo |
| Umbra | Gloam Stalker 6/2 Swift | Mourning Vassal 5/4 Haunt | Nightglass Wyrm 7/3 | Grave Effigy 3/6 Sentinel | Veil Shade 4/3 Pierce |

Stat budget: Power + Guard = 8–10; a keyword costs about 1 point.

**Spells** (cast as your one play; resolve immediately)

| Spell | Effect |
| --- | --- |
| Unmake | Destroy an enemy monster with Power 5 or less |
| Bloodlust | One of your monsters gets +3 Power this turn |
| Grave Recall | Return a monster from your discard pile to your hand |
| Scrying Bones | Draw 2 cards (ignores the draw cap) |
| Shroud | One of your monsters cannot be Appraised until your next turn |
| Siphon | The Collector loses 3 life; you gain 3 |

**Traps** (set face-down as your one play; trigger automatically, then discard)

| Trap | Trigger and effect |
| --- | --- |
| Snare | When an enemy monster attacks, cancel that attack |
| Mirror Sigil | When an enemy monster attacks, it loses 3 Power permanently before combat |
| Last Rites | When your monster is destroyed, draw 1 card |
| Thornwall | When you are attacked directly, take no damage and switch the attacker to guard |

Each card also gets a one-line art brief (mood, pose, palette) in its data file so the artist can work in parallel.

## The Collector

The Collector plays a fixed 20-card deck of Relics: stronger than your base cards, but he never grafts and every Relic has one Flaw. His signature mechanic, Appraisal, steals your strongest monster, and his ace can only arrive if Appraisal succeeded.

**Monsters (13)**

| Relic | Element / kind | Power / Guard | Keyword | Flaw |
| --- | --- | --- | --- | --- |
| Gilded Penitent | Lumen Knight | 7 / 6 | Ward | Slow |
| Ossuary Seraph | Lumen Spirit | 8 / 3 | Pierce | Vain |
| Saint of Brass | Lumen Construct | 6 / 7 | Echo | Slow |
| Mourning Cartographer | Gale Spirit | 6 / 5 | Echo | Tethered |
| Stormglass Hydra | Gale Wyrm | 8 / 5 | — | Brittle |
| Ashen Duchess | Ember Knight | 7 / 5 | Swift | Tethered |
| Kiln-Born Leviathan | Ember Wyrm | 9 / 4 | — | Brittle |
| Drowned Choir | Tide Spirit | 6 / 6 | Haunt | Tethered |
| Abyssal Curator | Tide Construct | 5 / 7 | Sentinel | Slow |
| Reliquary Hound | Umbra Beast | 6 / 4 | Haunt | Vain |
| Velvet Moth Sovereign | Umbra Beast | 7 / 3 | Pierce | Brittle |
| Weeping Automaton | Umbra Construct | 5 / 8 | Ward | Slow |
| The Unpriced (ace) | Umbra Wyrm | 10 / 8 | Ward | Covetous |

**Spells (4)**: Provenance Ledger (draw 2), Restoration (return a destroyed Relic to his hand), Gilt Frame (+2 Power and +2 Guard until the end of his next turn), Forfeit (destroy one of your monsters with Power 4 or less).

**Traps (3)**: Display Case (cancel an attack and switch the attacker to guard), Counterfeit (a Chimera grafted this turn loses 3 Power), Insurance Claim (when his monster is destroyed, he gains 3 life).

**Appraisal**: at the start of his turns in rounds 3, 6 and 9, he takes your highest-Power face-up monster with Power 7 or more (tie: leftmost). It goes to an open slot on his board, or to his vault if his board is full. Face-down monsters and Shrouded monsters are safe. A countdown is always on screen.

**Moods** (by his life)

| Mood | Life | Behavior |
| --- | --- | --- |
| Composed | 16–25 | Patient: favors guard and traps |
| Agitated | 8–15 | Trades aggressively; prioritizes removing your monsters |
| Desperate | 1–7 | Attacks anything, including face-down monsters |

**Intents**: an icon above him shows the category of his next turn (attack, appraise, guard, scheme) but never which card, so his traps stay hidden. His dialogue changes with mood.

**AI priorities** (deterministic; sees only public information; ties broken by leftmost slot, then card id)

Play phase:

1. If he can win this turn, do it.
2. If The Unpriced is summonable, summon it.
3. If a slot is open and he holds a monster that beats your strongest face-up monster, play it.
4. If he has fewer monsters than you and holds a trap, set it.
5. If a spell has a legal high-value target (Forfeit, Restoration, Gilt Frame on a contested attack), cast it.
6. Otherwise summon his highest-Power monster that is not Slow; if all are Slow, summon in guard.

Attack phase:

1. Take any lethal attack.
2. Destroy your highest-Power monster he can beat without losing his attacker.
3. Attack face-down monsters only with 7+ Power, unless Desperate.
4. Attack directly if your board is empty.
5. Otherwise hold; Vain monsters still attack the best legal target.

Weekly twist: one global rule change per week (example: "Umbra monsters +1 Power"), defined as data.

## Daily loop

Each local calendar date produces one seed; the seed produces the player's deck, both shuffles, and the day's signature card, so every player on that date plays the identical duel.

**Seeding**: seed = hash("vault-duel" + YYYY-MM-DD + content version). The reset is local midnight. A dev setting overrides the date for testing.

**Deck generation constraints** (all values are globals)

- 15 monsters, 5 spells, 4 traps; max 2 copies of any card.
- At least 3 elements and 4 kinds represented.
- Power curve: at least 4 monsters with Power 5 or less and at least 3 with Power 6 or more.
- Opening hands (both, and the redraw) contain at least 2 monsters.

**Difficulty check**: before a seed is accepted, the reference bot plays the seeded duel (with varied but deterministic decision noise) 500 times. The seed is kept if the bot's win rate is between 30% and 70%; otherwise the generator re-rolls with seed+1. The rating shown to players maps win rate to 1–3 stars.

**Daily flow**

1. Open the game: today's deck list, difficulty, Appraisal reminder.
2. Optional redraw, then duel (progress saves after every action; refresh resumes).
3. Result screen: win/loss, rounds used, life left, bonus objectives (0–3 stars), share button.
4. Practice mode unlocks for today's seed; the Binder and stats are available.

**Bonus objectives** (example pool, 3 picked per day): win without grafting; win with 15+ life; win by round 8; never lose a monster to Appraisal.

**Share text**: one emoji per round (attack, graft, guard, monster lost, appraised), plus rounds used versus the day's par.

**The Binder**: winning adds the day's signature card to your Binder permanently. Discovering a Chimera family for the first time also adds it. Cosmetic only. v0.1 stores progress in the browser; accounts and sync come later.

## Balance targets and globals

The simulator must show an experienced-bot win rate of 45–55% and a novice-bot win rate near 25%, with most games ending in rounds 8–12.

| Metric | Target |
| --- | --- |
| Experienced bot win rate | 45–55% |
| Novice (random legal moves) win rate | 20–30% |
| Median duel length | 9–11 rounds |
| Games lasting the full 12 rounds | 15–30% |
| Grafts per winning game | 1.5–3 |
| Appraisals that succeed | 30–60% |
| Games where The Unpriced appears | 20–40% |
| Seeds rejected by the difficulty check | under 15% |

Every number in this doc is a global in one config file, so tuning never requires engine changes:

```
PLAYER_LIFE=20  COLLECTOR_LIFE=25  MAX_ROUNDS=12
HAND_SIZE=5  MAX_DRAW_PER_TURN=2  REDRAWS=1
BOARD_SLOTS=3  TRAP_SLOTS=2
DECK_MONSTERS=15  DECK_SPELLS=5  DECK_TRAPS=4  MAX_COPIES=2
ELEMENT_BONUS=2  UNSTABLE_BONUS=3  ASCEND_POWER=2  ASCEND_GUARD=1
MAX_GRAFT_MATERIALS=3  MAX_INHERITED_KEYWORDS=2
APPRAISAL_ROUNDS=[3,6,9]  APPRAISAL_MIN_POWER=7
MOOD_AGITATED_AT=15  MOOD_DESPERATE_AT=7
HAUNT_PENALTY=2  TETHERED_PENALTY=2
SIM_RUNS_PER_SEED=500  SEED_WINRATE_MIN=0.30  SEED_WINRATE_MAX=0.70
```

Feature flags (on/off without code changes): Ascend, Unstable, Appraisal, moods, intents, weekly twist, redraw, bonus objectives, animations, debug overlay.

## Technical architecture

A pure, deterministic TypeScript rules engine is shared by the web app, the AI, the simulator and (later) the server, and all game content lives in validated data files.

**Stack**: pnpm monorepo, TypeScript strict, Vite + React for the client (a client-only game builds and reloads fastest this way), Zustand for UI state, CSS with tokens plus Framer Motion for animation, Vitest and fast-check for tests, Capacitor for iOS and Android later, PWA for web.

```
packages/
  engine/    rules: state, actions, reducer, combat, graft, RNG (no DOM)
  content/   cards, keywords, elements, kinds, recipes, Collector deck, globals (data + schemas)
  ai/        Collector AI + player bots (novice, greedy, expert)
  sim/       headless simulator CLI, worker threads, balance reports
apps/
  web/       React UI, PWA, placeholder art generator
docs/
  DESIGN.md         this document
  CONTENT_GUIDE.md  how to add, change and delete content
```

**Engine rules**

- State is one plain serializable object; `applyAction(state, action)` returns a new state plus an event list (events drive animations, the share grid and replays).
- All randomness comes from a seeded generator (sfc32 seeded by a string hash). No `Math.random`, no dates inside the engine.
- `getLegalActions(state)` is the single source of truth for the UI, the AI and the bots.
- Keywords, Flaws and spell/trap effects run through a hook registry: `onSummon`, `onAttackDeclared`, `beforeCombat`, `onDestroyed`, `onTurnStart`, `onTurnEnd`, `onGraft`.
- Hot paths (simulation) avoid deep cloning: structural sharing and small integer ids for cards.
- A game is fully reproducible from seed + action log, which later enables leaderboard verification.

**Content pipeline**

- Cards, elements, kinds, recipes, the Collector deck, objectives and weekly twists are JSON files validated by zod schemas at build time and in a `content:check` script.
- Simple spell and trap effects are written as data using effect primitives (`draw`, `damage`, `heal`, `modifyStats`, `destroy`, `returnToHand`, `changePosition`, `preventAppraisal`, `cancelAttack`) with targets, conditions and durations, so most new cards need no code.
- A new keyword or Flaw is one file exporting `defineKeyword({ id, name, icon, text, hooks })`; files are auto-registered.
- The validator fails the build on: unknown references, missing Graft recipes for a kind pair, stats outside the budget, duplicate ids, or a Collector deck that is not 20 cards.
- Placeholder art is generated from data (element color, kind silhouette, name) until a painting file with the card's id exists.

**How to change content (summary of CONTENT\_GUIDE.md)**

| Task | Steps |
| --- | --- |
| Add a card | Add an entry to the right JSON file → run `content:check` → run `sim:quick` |
| Change a card | Edit its entry → `content:check` → `sim:quick` to see the balance change |
| Delete a card | Remove the entry; the validator lists anything still referencing it |
| Add a keyword or Flaw | Add one file using `defineKeyword`, add its icon → tests auto-generated from its examples |
| Add an element | Add to elements.json and its row/column in the advantage matrix |
| Add a kind | Add to kinds.json; the validator lists every new kind pair that needs a Chimera recipe |
| Tune a number | Edit the globals file; no code changes |
| Toggle a mechanic | Flip its feature flag |

## v0.1 scope and roadmap

v0.1 is a playable daily duel in the browser with every rule in this doc, placeholder art, and a simulator that proves the balance targets.

**In v0.1**

- [ ] Full rules engine with all keywords, Flaws, Graft, Ascend, Unstable and Appraisal
- [ ] Collector AI with moods and intents
- [ ] Daily seed, deck generator and difficulty check
- [ ] Portrait mobile UI: board, hand, Graft preview, intents, Appraisal countdown, card inspect
- [ ] Result screen, share text, local stats and streaks, Binder (local)
- [ ] Practice mode after the daily attempt
- [ ] Placeholder art generated from data
- [ ] Simulator CLI and balance report meeting the targets above
- [ ] CONTENT\_GUIDE.md and the content validator

**Not in v0.1**: accounts, leaderboards, server verification, sound, painted art, native app builds, monetization, weekly twists (flag exists, off).

**Roadmap**

| Version | Focus |
| --- | --- |
| v0.1 | Playable daily duel, balance sim, content pipeline |
| v0.2 | Painted art integration, sound, animation polish, tutorial duel |
| v0.3 | Accounts and sync, leaderboards with server replay verification, weekly twists |
| v0.4 | Capacitor iOS and Android builds, push reminder for the daily duel |
| v1.0 | Launch: supporter tier, card backs, Binder archive access, ads outside duels |

**Open questions**

- Final game name and trademark check.
- Reset at local midnight (Wordle-style) or a single global time?
- Does the Collector get a second deck variant after launch, or only weekly twists?
