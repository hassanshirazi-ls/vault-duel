# Vault Duel — Game Design Doc v0.1

Oct 13, 2026 · @Hassan

## Overview

Vault Duel is a daily dark-fantasy card duel: every day, every player gets the same seeded 24-card deck and one attempt to defeat the Monarch within 12 rounds. A duel lasts 3–5 minutes. The game is original IP, built so all content (cards, keywords, elements, kinds, recipes, boss behavior) is data that can be added, changed or removed without touching engine code.

> **Names (D-350):** players see the royal-court names: the Monarch, the Levy, Courtiers, The Hollow Heir. The code, the content files and the technical sections at the end of this document keep the engine names (Collector, Appraisal, Relic, `the-unpriced`).

**Pillars**

- **Same game for everyone.** Both decks are shuffled from the date seed, so results are comparable and shareable.
- **Simple rules, deep combinations.** A new player understands the rules in 60 seconds; depth comes from Grafting, elements, timing around the Levy, and reading the Monarch.
- **Challenging but fair boss.** The Monarch never cheats, is deterministic, and telegraphs his intent.
- **Fast.** One monster, one spell or trap and one Graft per turn, at most 12 rounds, no waiting on animations.

**Locked decisions**

| Area | Decision |
| --- | --- |
| Format | Duel: hidden draw order, identical seed for everyone |
| Boss | The Monarch, the only boss; weekly rule twist |
| Art | Dark fantasy painted cards; placeholders until the artist delivers |
| Combining | **Graft** creates **Chimeras** (replaces "fusion") |
| Long-term hook | The Bestiary: cosmetic collection of daily champion cards and discovered Chimeras |
| Platforms | Web first (PWA), then iOS and Android from the same codebase; portrait, one-handed, tap-only |
| Working title | Vault Duel (check trademark before launch) |

## Core rules

You have 24 life and a 24-card deck; the Monarch has 46 life and a fixed 20-card deck. Reduce his life to 0 before round 12 ends.

**Setup**

1. Both decks are shuffled from the daily seed. The player sees their full 24-card list and the day's difficulty rating.
2. Each side draws 5. The player may redraw once: the whole hand goes to the bottom and the next 5 seeded cards are drawn. The seed guarantees at least 2 monsters in both opening hands.
3. The player always goes first and cannot attack on round 1.

**A round** = the player's turn, then the Monarch's turn.

1. **Draw** up to 5 cards, at most 2 per turn (spell effects ignore the cap).
2. **Your turn**, in any order:
   - **Monster**: summon one monster (face-up attack, face-up guard, or face-down guard) into an empty lane of your choice.
   - **Spell or trap**: cast one spell or set one trap.
   - **Graft**: one Graft (see Graft system). Split and Symbiosis are kept for daily modes (see Bond actions).
   - **Attack** with each attack-position monster once.
   - **Reposition**: each of your monsters may either switch between attack and guard or move one lane (into an empty lane, or trading places with your monster there), once, except on the turn it was summoned and after it has attacked. A face-down monster flipped to attack is revealed and **springs an Ambush**: +2 Power until the end of the turn, and it can attack right away.
3. **End the turn.** Attacking closes nothing: you can summon, cast or graft after an attack.

**Summoning sickness**: from round 2, a monster can attack the Monarch's monsters on the turn it arrives, but not his life; it can attack life from your next turn. Swift lets it hit life on its first turn too; Slow stops it attacking at all on its first turn.

**Board**: 3 lanes and 2 trap slots per side. Each of your lanes faces the Monarch's lane across from it. A full board blocks summoning; a Graft that uses a board monster frees its lane.

**Combat**

| Defender | Result |
| --- | --- |
| Attack position | Higher Power destroys the lower; the loser's owner takes the difference. A tie destroys both, no damage. |
| Guard position | Power > Guard destroys the defender, no damage. Power < Guard: **Riposte**, the attacker is destroyed and its owner takes the difference. Tie: nothing happens. |
| Face-down | Revealed, then resolved as guard (so Riposte applies, and the attacker can't see the Guard it is walking into). |
| Empty lane | No attack, unless the enemy's whole board is empty. |
| Empty board | Direct attack: full Power as damage. |

A monster can attack only the enemy monster in the lane across from it, or a Sentinel covering that lane: Sentinel cover is the only way an attack goes to the side. A direct hit on life needs the enemy's whole monster board to be empty. Element advantage adds +2 Power when attacking only. Keywords and traps resolve before damage.

**Win and loss**: you win when the Monarch hits 0. You lose at 0 life, or when the vault seals at the end of round 12. If you cannot draw, you skip the draw (no deck-out loss).

## Elements and kinds

Every monster has one element and one kind. Elements give a flat +2 Power when attacking with advantage; there is no resistance. Kinds decide Graft results and stat profiles.

| Element | Beats | Color + icon | Identity |
| --- | --- | --- | --- |
| Ember | Gale | Red, flame | Aggressive, high Power |
| Gale | Tide | Pale green, feather | Fast, Swift and Pierce |
| Tide | Lumen | Deep blue, wave | Durable, Ward and Echo |
| Lumen | Umbra | Gold, halo | Defensive, Sentinel and Ward |
| Umbra | Ember | Violet, eye | Tricky, Haunt and Pierce |

The elements form one ring: each beats exactly one and loses to exactly one (Ember → Gale → Tide → Lumen → Umbra → Ember). Every element always shows both its color and its icon (color-blind safe).

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
| Swift | Can also attack life directly the turn it is summoned | Hearthstone Rush | Motion streaks |
| Sentinel | Enemy attacks in its lane and in the lanes beside it must target it | Hearthstone Taunt | Iron shield border |
| Pierce | Power beyond the defender's Guard is dealt to its owner's life | Runeterra Overwhelm | Spear notch on frame |
| Ward | The first time it would be destroyed, it loses Ward instead | Hearthstone Divine Shield | Pale barrier |
| Haunt | When destroyed, the monster that destroyed it loses 2 Power permanently | Deathrattle family | Ghost wisps |
| Echo | When destroyed, return it to its owner's hand | — | Faded double image |

Flaws appear only on the Monarch's Courtiers. Each Courtier has exactly one.

| Flaw | Rule |
| --- | --- |
| Slow | Cannot attack the turn it is summoned |
| Vain | Must attack if able, choosing the best legal target |
| Brittle | Destroyed by any attack with element advantage, regardless of Power |
| Tethered | −2 Power while it is his only monster |
| Covetous | Can only be summoned by sacrificing a monster he took with a Levy (ace only) |

Complexity budget: no card text longer than one sentence. A new keyword must justify itself against these six.

## Graft system

Grafting combines 2 monsters into a Chimera whose family is set by their two kinds and whose element is set by the first material. It is your bond for the turn, so it does not use up your monster summon.

**Rules**

1. Choose 2 materials from your hand and/or your board, in order. Board materials are sacrificed (their slot frees).
2. Result family = the kind pair (table below). Result element = the **first** material's element, so order is a real choice.
3. Chimeras inherit up to 2 keywords from their materials (player picks if more than 2 are available).
4. **Ascend** (second step, same turn): graft the new Chimera with 1 more monster. Result: same family, Ascended, +2 Power and +1 Guard, may take that material's keyword (still max 2). Max 3 materials total.
5. **Unstable**: if the materials' elements oppose each other (one beats the other, or Lumen + Umbra), the Chimera gets +3 Power but is destroyed at the end of your next turn.
6. The Chimera enters in attack or guard position (player's choice) in an empty lane of your choice, and follows normal summoning rules (summoning sickness).
7. The UI always shows a preview of the result before confirming. A first-time result is added to the Bestiary.

**Chimera families** (15 kind pairs, order-independent). Art is one painting per family; the element changes the frame and glow, so launch needs 15 Chimera paintings, not 75.

> *Launch values (v0.1). The live values are in packages/content (see CONTENT_GUIDE.md); this table is not updated.*

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

Every pair of monsters can graft, so a random hand never has zero options; the skill is choosing which pair, which order, and when. A Chimera with 8+ Power is a Levy target (see The Monarch).

## Bond actions

**The standard game uses Graft only** (D-336): the **Graft** button beside End turn opens the Graft workbench. Split and Symbiosis below are kept, switched off, for daily game modes. When a mode turns them on, the bond slot becomes one Graft, Split or Symbiosis, and the button becomes **Bond**, which opens the **Bond options** panel listing every bond you can make this turn with its result, the strongest marked.

| Bond | Good at | Costs you |
| --- | --- | --- |
| Graft | One big body that breaks walls and wins trades | Two cards become one, and the Chimera is the biggest Levy target |
| Split | Dodging the Levy, getting lanes back, escaping Unstable, re-grafting in a new order | The Chimera's bonus stats and Ascend are lost; the parts can't attack or move that turn |
| Symbiosis | Staying power: a second monster waits under the first, even on a full board | If the host is levied, the Monarch takes both cards; the attached card isn't attacking |

**Split**: unbind one of your face-up Chimeras into the monsters it was grafted from. The first part keeps the Chimera's lane, the rest take the nearest free lanes, and any part with no room goes to your hand. Splitting is not destruction, so Echo, Haunt, Last Rites and Blood Tithe do not trigger. A Chimera that arrived this turn can't be split, and its materials must still be in your discard.

**Symbiosis**: attach a base monster from your hand under one of your face-up monsters (one per host). The host gains +2 Guard and, if it has room, the attached monster's keyword. If the host is destroyed, the attached monster comes out in its lane as if newly summoned. If the host is levied, the Monarch takes both. A host with a symbiote can't be grafted or split.

The Monarch never bonds.

## Player card pool v0.1

> *Launch values (v0.1). The live values in this section are in packages/content (see CONTENT_GUIDE.md); it is not updated.*

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

**Spells** (cast as your one spell or trap of the turn; resolve immediately)

| Spell | Effect |
| --- | --- |
| Unmake | Destroy an enemy monster with Power 5 or less |
| Bloodlust | One of your monsters gets +3 Power this turn |
| Grave Recall | Return a monster from your discard pile to your hand |
| Scrying Bones | Draw 2 cards (ignores the draw cap) |
| Shroud | One of your monsters cannot be levied until your next turn |
| Siphon | The Monarch loses 3 life; you gain 3 |

**Traps** (set face-down as your one spell or trap of the turn; trigger automatically, then discard)

| Trap | Trigger and effect |
| --- | --- |
| Snare | When an enemy monster attacks, cancel that attack |
| Mirror Sigil | When an enemy monster attacks, it loses 3 Power permanently before combat |
| Last Rites | When your monster is destroyed, draw 1 card |
| Thornwall | When you are attacked directly, take no damage and switch the attacker to guard |

Each card also gets a one-line art brief (mood, pose, palette) in its data file so the artist can work in parallel.

## The Monarch

The Monarch plays a fixed 20-card deck of Courtiers: stronger than your base cards, but he never grafts and every Courtier has one Flaw. His signature mechanic, the Levy, steals your strongest monster to fight for him, crowned, and his ace can only arrive if a Levy succeeded.

> *Launch values (v0.1). The live values in this section are in packages/content (see CONTENT_GUIDE.md); it is not updated.*

**Monsters (13)**

| Courtier | Element / kind | Power / Guard | Keyword | Flaw |
| --- | --- | --- | --- | --- |
| Gilded Penitent | Lumen Knight | 7 / 6 | Ward | Slow |
| Ossuary Seraph | Lumen Spirit | 8 / 3 | Pierce | Vain |
| Saint of Brass | Lumen Construct | 6 / 7 | Echo | Slow |
| Mourning Herald | Gale Spirit | 6 / 5 | Echo | Tethered |
| Stormglass Hydra | Gale Wyrm | 8 / 5 | — | Brittle |
| Ashen Duchess | Ember Knight | 7 / 5 | Swift | Tethered |
| Kiln-Born Leviathan | Ember Wyrm | 9 / 4 | — | Brittle |
| Drowned Choir | Tide Spirit | 6 / 6 | Haunt | Tethered |
| Abyssal Chamberlain | Tide Construct | 5 / 7 | Sentinel | Slow |
| Reliquary Hound | Umbra Beast | 6 / 4 | Haunt | Vain |
| Velvet Moth Sovereign | Umbra Beast | 7 / 3 | Pierce | Brittle |
| Weeping Automaton | Umbra Construct | 5 / 8 | Ward | Slow |
| The Hollow Heir (ace) | Umbra Wyrm | 10 / 8 | Ward | Covetous |

**Spells (4)**: Royal Ledger (draw 2), Restoration (return a destroyed Courtier to his hand), Gilded Mantle (+2 Power and +2 Guard until the end of his next turn), Execution (destroy one of your monsters with Power 4 or less).

**Traps (3)**: Bend the Knee (cancel an attack and switch the attacker to guard), Forbidden Union (a Chimera grafted this turn loses 3 Power), Blood Tithe (when his monster is destroyed, he gains 3 life).

**Levy**: at the start of his turns in rounds 3, 6 and 9, he takes your highest-Power face-up monster with Power 8 or more (tie: leftmost). It goes to his leftmost open lane, or to his vault if his board is full. Face-down monsters and Shrouded monsters are safe. A monster with a symbiote attached is taken together with it. A countdown is always on screen.

**Crowned** (D-349): a monster he took with a Levy wears his crown and has +1 Power (`CROWN_POWER`) while it is on his board.

**Moods** (by his life)

| Mood | Life | Behavior |
| --- | --- | --- |
| Composed | 16–25 | Patient: favors guard (set face-down) and traps |
| Agitated | 8–15 | Trades aggressively; prioritizes removing your monsters |
| Desperate | 1–7 | Attacks anything, including face-down monsters |

**Intents**: an icon above him shows the category of his next turn (attack, levy, guard, scheme) but never which card, so his traps stay hidden. His dialogue changes with mood.

**AI priorities** (deterministic; sees only public information; ties broken by leftmost slot, then card id)

Play phase:

1. If he can win this turn, do it.
2. If The Hollow Heir is summonable, summon it.
3. If a lane is open and he holds a monster that beats the monster it would attack from that lane, play it there (highest-Power target first).
4. If he has fewer monsters than you and holds a trap, set it.
5. If a spell has a legal high-value target (Execution, Restoration, Gilded Mantle on a contested attack), cast it.
6. Otherwise summon his highest-Power monster that is not Slow; if all are Slow, set it face-down in guard.

Attack phase:

1. Take any lethal attack.
2. Destroy your highest-Power monster he can beat without losing his attacker (a Riposte counts as a loss).
3. Attack face-down monsters only with 7+ Power (no base Guard can Riposte it), unless Desperate. He flips his own face-down monster to Ambush when the +2 wins a fight.
4. Attack directly if your board is empty.
5. Otherwise hold; Vain monsters still attack the best legal target.

Weekly twist: one global rule change per week (example: "Umbra monsters +1 Power"), defined as data.

## Daily loop

Each local calendar date produces one seed; the seed produces the player's deck, both shuffles, and the day's champion, so every player on that date plays the identical duel.

**Seeding**: seed = hash("vault-duel" + YYYY-MM-DD + content version). The reset is local midnight. A dev setting overrides the date for testing.

**Deck generation constraints** (all values are globals)

- 15 monsters, 5 spells, 4 traps; max 2 copies of any card.
- At least 3 elements and 4 kinds represented.
- Power curve: at least 4 monsters with Power 5 or less and at least 3 with Power 6 or more.
- Opening hands (both, and the redraw) contain at least 2 monsters.

**Difficulty check**: before a seed is accepted, the reference bot plays the seeded duel (with varied but deterministic decision noise) 500 times. The seed is kept if the bot's win rate is between 30% and 70%; otherwise the generator re-rolls with seed+1. The rating shown to players maps win rate to 1–3 stars.

**Daily flow**

1. Open the game: today's deck list, difficulty, Levy reminder.
2. Optional redraw, then duel (progress saves after every action; refresh resumes).
3. Result screen: win/loss, rounds used, life left, bonus objectives (0–3 stars), share button.
4. Practice mode unlocks for today's seed; the Bestiary and stats are available.

**Bonus objectives** (example pool, 3 picked per day): win without grafting; win with 15+ life; win by round 8; never lose a monster to a Levy.

**Share text**: one emoji per round (attack, graft, guard, monster lost, levied), plus rounds used versus the day's par.

**The Bestiary**: winning adds the day's champion to your Bestiary permanently. Discovering a Chimera family for the first time also adds it. Cosmetic only. v0.1 stores progress in the browser; accounts and sync come later.

## Balance targets and globals

The simulator must show an experienced-bot win rate of 45–55% and a novice-bot win rate near 25%, with most games ending in rounds 8–12.

| Metric | Target |
| --- | --- |
| Experienced bot win rate | 45–55% |
| Novice (random legal moves) win rate | 20–30% |
| Median duel length | 9–11 rounds |
| Games lasting the full 12 rounds | 15–30% |
| Grafts per winning game | 3.5–5 |
| Levies that succeed | 30–60% |
| Games where The Hollow Heir appears | 20–40% |
| Days that fall back to an unchecked seed | none |

Every number in this doc is a global in one config file, so tuning never requires engine changes:

> *Launch values (v0.1). The live values are in packages/content/src/globals.ts (see CONTENT_GUIDE.md); this block is not updated.*

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

Feature flags (on/off without code changes): Ascend, Unstable, Levy, moods, intents, weekly twist, redraw, bonus objectives, animations, debug overlay.

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
- The validator fails the build on: unknown references, missing Graft recipes for a kind pair, duplicate ids, or a Collector deck that is not 20 cards. Stats outside the budget are a warning, so off-budget cards can be playtested on purpose (D-167).
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

- [ ] Full rules engine with all keywords, Flaws, Graft, Ascend, Unstable and the Levy
- [ ] The Monarch's AI with moods and intents
- [ ] Daily seed, deck generator and difficulty check
- [ ] Portrait mobile UI: board, hand, Graft preview, intents, Levy countdown, card inspect
- [ ] Result screen, share text, local stats and streaks, Bestiary (local)
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
| v1.0 | Launch: supporter tier, card backs, Bestiary archive access, ads outside duels |

**Open questions**

- Final game name and trademark check.
- Reset at local midnight (Wordle-style) or a single global time?
- Does the Monarch get a second deck variant after launch, or only weekly twists?
