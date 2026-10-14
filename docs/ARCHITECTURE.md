# Vault Duel — Architecture v0.1 (Phase 0)

Status: plan, before any code. Owner: game-architect. Date: 2026-10-14.
Source of truth for rules: `docs/DESIGN.md`. Interpretations of ambiguous rules: `docs/DECISIONS.md` (referenced as `D-NNN`).

---

## 1. Principles

1. **One pure engine.** `applyAction(state, action) → { state, events }` and `getLegalActions(state)` are the only ways to advance or query a duel. The web UI, Collector AI, player bots, simulator and (later) server all call them.
2. **Determinism.** All randomness comes from sfc32 seeded by cyrb128 of a string. No `Math.random`, `Date`, timers, DOM, `for…in`, or iteration over object keys in `packages/engine`, `packages/content/keywords`, or `packages/ai` (ESLint-enforced). Same seed + same action log ⇒ identical state hash.
3. **Content is data.** Cards, elements, kinds, recipes, the Collector deck and AI priorities, objectives, twists and art briefs are JSON validated by zod. Keywords/Flaws are one TypeScript file each via `defineKeyword`. Spell/trap effects are written in the effect DSL (§9). Every DESIGN.md number lives in `globals.ts` (§11); every mechanic sits behind a flag.
4. **Fast.** ≥ 1,000 duels/sec/core: small integer instance ids, flat arrays, copy-on-write structural sharing, lazy stat computation, no deep clones in hot paths (§18).
5. **Strict TypeScript.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; no `any` in engine, content or ai.

---

## 2. Repository layout

```
project-daily/
├─ package.json                 # root scripts (below)
├─ pnpm-workspace.yaml          # packages/*, apps/*
├─ tsconfig.base.json           # strict settings shared by all packages
├─ vitest.config.ts           # test.projects = packages/* (D-119)
├─ eslint.config.js             # determinism bans for engine/content/ai
├─ docs/
│  ├─ DESIGN.md  ARCHITECTURE.md  DECISIONS.md  CONTENT_GUIDE.md (Phase 1)
│  └─ reports/                  # sim output (phase0-paper-sim.md is owned by design-simulator)
├─ packages/
│  ├─ engine/                   # rules only; zero runtime deps; no DOM, no Node APIs
│  │  └─ src/
│  │     ├─ index.ts            # createEngine(), public types
│  │     ├─ types/{state,actions,events,content,globals,hooks,effects}.ts
│  │     ├─ rng.ts              # cyrb128, sfc32, int(), shuffle()
│  │     ├─ errors.ts           # EngineError (public, D-132)
│  │     ├─ freeze.ts           # deepFreeze (public; dev-mode states, content globals; D-147)
│  │     ├─ setup/{seed,deckgen,shuffle,initial-state}.ts
│  │     ├─ tx.ts               # copy-on-write transaction (draft) over GameState
│  │     ├─ pipeline.ts         # Run (Tx + events + effect queue), Services, IntentPolicy;
│  │     │                      # lifeChanged, checkWin, endGame, dealDamage (D-150, D-151)
│  │     ├─ monster.ts          # Monster record factory (§18.7)
│  │     ├─ track.ts            # emptyTrack, markRound (Track writes inside the Tx)
│  │     ├─ reducer.ts          # applyAction dispatch (imports checkWin from pipeline.ts)
│  │     ├─ legal.ts            # getLegalActions / forEachLegal / isLegal
│  │     ├─ turn.ts             # start/end of turn, draw step, round-12 seal
│  │     ├─ reposition.ts       # reposition action, face-down flip reveal (D-161)
│  │     ├─ stats.ts            # effectivePower/Guard, keywords active, advantage
│  │     ├─ combat.ts           # attack pipeline + combat preview
│  │     ├─ destroy.ts          # destruction batch, Ward replacement, zone moves
│  │     ├─ graft.ts            # pending graft, recipes, inheritance, Ascend, Unstable, preview
│  │     ├─ appraisal.ts        # Appraisal step, vault
│  │     ├─ summon.ts           # summon, Covetous summon, set trap
│  │     ├─ mood.ts             # mood from life
│  │     ├─ effects/{run,targets,conditions,num}.ts   # effect-primitive interpreter
│  │     ├─ hooks/{registry,context,define,dispatch}.ts
│  │     ├─ traps.ts            # compiles trap DSL into hook subscribers
│  │     ├─ meta/{objectives,share-grid,track}.ts      # pure post-game summaries
│  │     ├─ replay.ts           # replay(seed, actions), hashState()
│  │     └─ view/redact.ts      # redacted views (Collector view, player view)
│  │  └─ test-utils/{board-dsl,globals,…}.ts  # scenario DSL parser (§17), TEST_GLOBALS; package subpath
│  │                                         # "@vault-duel/engine/test-utils/*" for content tests (D-143)
│  ├─ content/                  # data + schemas + validator; depends on engine (types, defineKeyword)
│  │  ├─ src/
│  │  │  ├─ globals.ts          # every number + feature flags (§11)
│  │  │  ├─ schemas/{element,kind,card,effect,recipe,collector,objective,twist,art-brief,globals}.ts
│  │  │  ├─ load.ts             # reads JSON, parses with zod
│  │  │  ├─ compile.ts          # → CompiledContent (dense typed arrays)
│  │  │  └─ validate.ts         # cross-file rules (§10.3)
│  │  ├─ cards/
│  │  │  ├─ player-monsters.json  player-spells.json  player-traps.json
│  │  │  └─ relics.json  collector-spells.json  collector-traps.json
│  │  ├─ keywords/              # one file per keyword/Flaw: swift.ts sentinel.ts pierce.ts ward.ts
│  │  │  │                      # haunt.ts echo.ts slow.ts vain.ts brittle.ts tethered.ts covetous.ts
│  │  │  └─ index.gen.ts        # generated barrel (D-111)
│  │  ├─ elements.json  kinds.json  recipes.json  collector.json
│  │  ├─ objectives.json  twists.json  art-briefs.json
│  │  └─ scripts/{content-check,gen-keyword-index}.ts
│  ├─ ai/                       # depends on engine (+ content types)
│  │  └─ src/
│  │     ├─ collector/{policy,view,rules/*,moods,intent,best-target,combat-estimate}.ts
│  │     ├─ bots/{player-view,novice,greedy,expert,noise,evaluate}.ts
│  │     ├─ bots/expert.weights.json
│  │     └─ difficulty.ts       # rateSeed(): pure, used by sim and the web worker
│  └─ sim/                      # Node only
│     └─ src/{cli,pool,worker,run-duel,difficulty-batch,overrides,aggregate,report}.ts
└─ apps/
   └─ web/                      # Vite + React + Zustand + Framer Motion, PWA
      └─ src/
         ├─ main.tsx  app/App.tsx  styles/tokens.css
         ├─ store/{duel,meta,settings}.ts
         ├─ screens/{Home,Duel,Result,Binder}.tsx
         ├─ components/{Board,MonsterSlot,TrapSlot,Hand,Card,KeywordFrame,ElementBadge,
         │              GraftPreview,IntentBadge,AppraisalCountdown,MoodDialogue,
         │              CardInspect,LifeBar,DeckList,DebugOverlay}.tsx
         ├─ anim/events-to-animations.ts
         ├─ art/placeholder.ts   # SVG from element color + kind silhouette + name
         ├─ daily/{date,session,difficulty.worker}.ts
         ├─ persistence/{storage,binder,stats}.ts
         └─ meta/share.ts
```

**Dependency direction** (enforced by `tsconfig` project references and an ESLint import rule):
`engine` ← `content` ← `ai` ← `sim`, and `engine`, `content`, `ai` ← `apps/web`. The engine never imports content data; content is passed in compiled form to `createEngine`. The engine never imports `ai`; the intent policy is injected (D-096).

**Root scripts** (`package.json`):

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `pnpm content:gen && pnpm --filter web dev` | Vite dev server |
| `test` | `pnpm content:gen && vitest run` | unit, scenario, keyword-example, property tests |
| `content:gen` | `tsx packages/content/scripts/gen-keyword-index.ts` | regenerate keyword barrel |
| `content:check` | `tsx packages/content/scripts/content-check.ts` | zod + cross-file validator + deckgen feasibility |
| `sim:quick` | `tsx packages/sim/src/cli.ts quick --games 2000` | 2,000 duels per bot profile (D-115) |
| `sim:full` | `tsx packages/sim/src/cli.ts full --games 50000 --seed-dates 60` | 50,000 duels + 60-date difficulty check |
| `sim:seed` | `tsx packages/sim/src/cli.ts seed` | `pnpm sim:seed 2026-10-14` → difficulty check for one date |
| `bench` | `vitest bench packages/engine` | duels/sec/core gate (§18) |
| `build` | `pnpm content:gen && pnpm content:check && tsc -b && pnpm --filter web build` | production PWA |

All sim commands accept `--set KEY=VALUE` (repeatable), `--from YYYY-MM-DD`, `--workers N`, `--out docs/reports/<name>`.

---

## 3. Content model and compiled content

`packages/content/src/load.ts` reads all JSON, parses with zod, runs the validator, and `compile.ts` produces a frozen `CompiledContent` with dense integer indices. String ids exist only at the edges (UI, logs, JSON).

```ts
// packages/engine/src/types/content.ts
import type { Cond, SpellDef, TrapDef } from './effects';
import type { HookName, KeywordDef } from './hooks';      // KeywordDef is declared in types/hooks.ts (D-123)

export type DefIdx = number;   // index into defs (base cards AND Chimera families)
export type ElemIdx = number;
export type KindIdx = number;
export type KwMask = number;   // bit i = keyword/Flaw registry index i (≤ 32)

export const DefType = { Monster: 0, Spell: 1, Trap: 2, Family: 3 } as const; // plain consts (isolatedModules-safe)
export const Pool = { Player: 0, Collector: 1 } as const;

/** Spell/trap definitions are kept as written in the DSL (§9.1); `$NAME` refs are resolved by effects/num.ts (D-120). */
export type CompiledSpell = SpellDef;
export type CompiledTrap = TrapDef;

/** One twists.json row (§10.1). Chosen by ISO week outside the engine (D-103); stats.ts reads `modifiers` (D-121). */
export interface CompiledTwist {
  readonly id: string;
  readonly text: string;
  readonly isoWeek?: string;
  readonly modifiers: readonly { readonly where: Cond; readonly power?: number; readonly guard?: number }[];
}

export interface CompiledContent {
  readonly version: string;              // CONTENT_VERSION
  readonly hash: string;                 // cyrb128 of canonical content JSON
  readonly ids: readonly string[];       // DefIdx → id
  readonly index: ReadonlyMap<string, DefIdx>; // boundary use only
  readonly type: Uint8Array;  readonly pool: Uint8Array;
  readonly power: Int8Array;  readonly guard: Int8Array;
  readonly element: Int8Array; readonly kind: Int8Array;   // -1 for spells/traps/families
  readonly kw: Uint32Array;              // printed keywords + Flaw bits
  readonly spell: readonly (CompiledSpell | null)[];
  readonly trap: readonly (CompiledTrap | null)[];
  readonly nElements: number; readonly nKinds: number;
  readonly elementIds: readonly string[];  // ElemIdx → element id, for Cond { element } (D-129)
  readonly kindIds: readonly string[];     // KindIdx → kind id, for Cond { kind } (D-129)
  readonly beats: Uint8Array;            // [a * nElements + b] = 1 if a beats b
  readonly opposes: Uint8Array;          // beats[a,b] | beats[b,a]
  readonly recipe: Int16Array;           // [k1 * nKinds + k2] = family DefIdx (symmetric)
  readonly keywords: readonly KeywordDef[]; // registry order = bit order (sorted: keywords by id, then flaws by id)
  readonly kwBit: Readonly<Record<string, number>>;
  readonly hookMask: Readonly<Record<HookName, KwMask>>; // which bits have which hook (fast skip)
  readonly playerPool: { readonly monsters: readonly DefIdx[]; readonly spells: readonly DefIdx[]; readonly traps: readonly DefIdx[] };
  readonly collector: { readonly deck: readonly DefIdx[]; readonly ace: DefIdx; readonly canGraft: boolean };
  readonly twists: readonly CompiledTwist[];
}
```

---

## 4. Game state shape

Plain, JSON-serializable, immutable by convention (frozen only in dev/test). Turn-relative flags are stored as **turn indices**, not booleans, so nothing needs resetting each turn (`summonedThisTurn ⇔ m.entered === s.turn`).

```ts
// packages/engine/src/types/state.ts
export type Side = 0 | 1;          // 0 = player, 1 = Collector
export type Iid = number;          // card instance id = index into state.inst (D-006)
export type Pos = 0 | 1;           // 0 = attack, 1 = guard
export type Mood = 0 | 1 | 2;      // composed, agitated, desperate
export type Intent = 'attack' | 'appraise' | 'guard' | 'scheme';
export type Rng = readonly [number, number, number, number]; // sfc32 state (uint32 ×4)

export interface Instance {        // created once, never mutated
  readonly def: DefIdx;            // base card def, or Chimera family def
  readonly owner: Side;            // never changes (D-047)
  readonly chimera: ChimeraInfo | null;
}
export interface ChimeraInfo {
  readonly element: ElemIdx;       // first material's element
  readonly kw: KwMask;             // inherited keywords (≤ MAX_INHERITED_KEYWORDS bits)
  readonly ascended: boolean;      // +ASCEND_POWER / +ASCEND_GUARD
  readonly materials: readonly Iid[];
  readonly grafted: number;        // turn index of the Graft that created it (Cond graftedThisTurn, D-139)
}

export interface TimedMod {        // Bloodlust, Gilt Frame
  readonly p: number; readonly g: number;
  readonly until: number;          // applies while state.turn <= until
}

export interface Monster {         // a monster on a board slot; replaced (not mutated) on change
  readonly iid: Iid;
  readonly pos: Pos;
  readonly faceDown: boolean;      // face-down ⇒ pos === 1 (guard), keywords inactive (D-037)
  readonly entered: number;        // turn index it entered this board (summon, graft, Covetous, Appraisal)
  readonly repositioned: number;   // turn index of last reposition, -1 never
  readonly attacked: number;       // turn index of last attack declaration, -1 never
  readonly wardUsed: boolean;
  readonly permP: number;          // permanent Power modifiers (Haunt, Mirror Sigil, Counterfeit)
  readonly permG: number;
  readonly timed: readonly TimedMod[];   // shared EMPTY array when none
  readonly unstableUntil: number;  // -1, or turn index at whose END it is destroyed; bonus applies while ≥ 0
  readonly shroudUntil: number;    // shrouded while state.turn < shroudUntil; -1 none
  readonly appraised: boolean;     // acquired through Appraisal (Covetous)
}

export interface TrapSlot { readonly iid: Iid; readonly set: number } // turn index set

export interface SideState {
  readonly life: number;
  readonly deck: readonly Iid[];   // [0] = top
  readonly hand: readonly Iid[];   // draw order (D-107)
  readonly discard: readonly Iid[];
  readonly board: readonly (Monster | null)[];   // length BOARD_SLOTS
  readonly traps: readonly (TrapSlot | null)[];  // length TRAP_SLOTS
  readonly vault: readonly Iid[];  // Collector only; [] for player (D-078)
}

export type Step = 'mulligan' | 'main' | 'attack' | 'over';

export type GraftStage = 'mat1' | 'mat2' | 'ascend' | 'keywords' | 'position';
export interface PendingGraft {
  readonly kind: 'graft';
  readonly stage: GraftStage;
  readonly mats: readonly Iid[];   // ordered; mats[0] sets element
  readonly kw: KwMask;             // chosen keywords (set at 'keywords' or auto)
}
export type Pending = PendingGraft;  // union reserved for future multi-step choices

export interface AppraisalState {
  readonly attempts: number;       // Appraisal steps reached (D-079)
  readonly successes: number;
  readonly taken: readonly Iid[];  // monsters acquired, in order
}

export interface Track {           // counters for objectives, share grid and sim (updated in the Tx, not from events)
  readonly round: readonly number[];   // length MAX_ROUNDS, zero-filled by newGame, index round − 1; RoundFlag bits (D-127)
  readonly grafts: number;
  readonly families: readonly DefIdx[]; // families created this duel (Binder)
  readonly unpriced: boolean;          // The Unpriced entered play
  readonly appraisedLost: number;
}
export const RoundFlag = { Attacked: 1, Grafted: 2, LostMonster: 4, Appraised: 8 } as const; // player-side events (D-127)

export interface Result {
  readonly winner: Side;
  readonly reason: 'collectorDefeated' | 'playerDefeated' | 'vaultSealed';
  readonly round: number;
}

export interface LogNode { readonly a: Action; readonly prev: LogNode | null } // persistent cons list

export interface GameState {
  readonly v: 1;
  readonly cfg: string;            // CompiledContent.hash + globals hash (replay guard)
  readonly seed: string;           // "vault-duel:2026-10-14:0.1.0#0" (D-001, D-003)
  readonly rng: Rng;               // 'engine' stream (unused by v0.1 cards, reserved)
  readonly turn: number;           // 0 … 2*MAX_ROUNDS-1; round = (turn >> 1) + 1; active side = turn & 1
  readonly step: Step;
  readonly played: boolean;        // the one play of this turn is used
  readonly redrawsLeft: number;
  readonly pending: Pending | null;
  readonly sides: readonly [SideState, SideState];
  readonly inst: readonly Instance[];      // append-only; Chimeras appended at commit
  readonly appraisal: AppraisalState;
  readonly collector: { readonly mood: Mood; readonly intent: Intent | null };
  readonly twist: number;          // twist index or -1 (FLAGS.WEEKLY_TWIST)
  readonly track: Track;
  readonly result: Result | null;
  readonly log: LogNode | null;    // null when the engine is created with { log: false } (sim)
  readonly nActions: number;
}
```

Checklist of required fields → where they live:

| Required | Field |
| --- | --- |
| turn phases/steps | `turn`, `step`, `played`, `pending` (§5) |
| summoned-this-turn | `Monster.entered === turn` |
| repositioned / attacked | `Monster.repositioned === turn`, `Monster.attacked === turn` |
| face-down | `Monster.faceDown` |
| Ward used | `Monster.wardUsed` |
| permanent modifiers | `Monster.permP/permG` |
| timed modifiers with expiry | `Monster.timed[].until` |
| Unstable expiry | `Monster.unstableUntil` |
| Shroud | `Monster.shroudUntil` |
| trap slots | `SideState.traps` |
| vault | `SideState.vault` (Collector) |
| discard | `SideState.discard` |
| Appraisal state | `GameState.appraisal` (+ next round derived from globals) |
| mood / intent | `GameState.collector` |
| RNG state | `GameState.rng` |
| action log | `GameState.log` (+ `toActions(state)` helper) |

**Card conservation invariant** (property-tested): every `Iid` is in exactly one of deck, hand, discard, board, traps, vault — or is a Chimera material in a discard.

**Derived, never stored:** effective stats (D-031), active keywords (`printed | chimera.kw`, minus Ward if used, none if face-down), round, active side, next Appraisal round, Tethered, element advantage.

### 4.1 Copy-on-write transaction (`tx.ts`) — D-128

`applyAction` opens one `Tx` over the input state. Every pipeline in §5 writes through it, and `commit()` returns the new state. The input state is never written, so an `EngineError` thrown mid-action leaves the caller's state intact (actions are atomic). `EngineError` (`errors.ts`) is exported from the package root so the sim and web can tell engine-reported failures from crashes (D-132).

```ts
// packages/engine/src/tx.ts — engine-internal (not exported from the package root)
export type IidZone = 'deck' | 'hand' | 'discard' | 'vault';
export type RootField = 'rng' | 'turn' | 'step' | 'played' | 'redrawsLeft' | 'pending' | 'appraisal'
                      | 'collector' | 'twist' | 'track' | 'result' | 'log' | 'nActions';   // not: v, cfg, seed, sides, inst

export class Tx {
  constructor(base: GameState);
  readonly base: GameState;
  get state(): GameState;                       // LIVE draft view (base until the first write)
  get dirty(): boolean;
  commit(): GameState;                          // the base itself if nothing was written; writes after commit throw
  set<K extends RootField>(key: K, value: GameState[K]): void;          // whole-value replacement
  pushInstance(inst: Instance): Iid;            // append (Chimeras, §5.6); returns the new iid
  setLife(side: Side, life: number): void;
  setZone(side: Side, zone: IidZone, iids: readonly Iid[]): void;       // adopts the array; a later edit copies it first
  zonePush(side: Side, zone: IidZone, iid: Iid): void;
  zoneUnshift(side: Side, zone: IidZone, iid: Iid): void;               // top of deck = index 0
  zoneRemove(side: Side, zone: IidZone, iid: Iid): boolean;             // first occurrence; no copy when absent
  zoneTake(side: Side, zone: IidZone, n: number): Iid[];                // remove and return the first n (draws)
  setSlot(side: Side, slot: number, m: Monster | null): void;           // m from the Monster factory (§18.7)
  patchMonster(side: Side, slot: number, patch: Partial<Omit<Monster, 'iid'>>): Monster; // replaces the record
  setTrap(side: Side, slot: number, t: TrapSlot | null): void;
}
```

**Copy rule.** The first write to a path copies only that path: root → `sides` tuple → one `SideState` → one zone array. Later writes in the same `Tx` mutate those copies in place. `Monster`, `TrapSlot`, `Track`, `AppraisalState` and `PendingGraft` records are always replaced, never mutated. Per action that is at most one 18-field root copy, two 7-field side copies, one slice of ≤ 24 entries per touched zone, and one record per patched monster.

**Caller contract.**
1. `tx.state` is live. An array read from it can change at the next write in the same `Tx`, so a zone or board reference must never be held across a write. Collect the iids/slots to act on into a local array first (destroy batches, draw loops, trap scans).
2. Only engine modules construct a `Tx`. Hooks never see it (§8.2), and UI, AI and sim advance a duel only through `applyAction`.
3. Nested records are updated by replacement, e.g. `tx.set('track', { ...t, round: withBit(t.round, round - 1, RoundFlag.Attacked) })`.
4. Randomness (none in v0.1 cards): `const r = Sfc32.restore(tx.state.rng); …; tx.set('rng', r.state())` (D-125).

---

## 5. Turn structure and engine pipelines

### 5.1 Steps

| DESIGN step | Engine representation |
| --- | --- |
| Setup: shuffle, draw 5, redraw | `newGame()` builds state in `step: 'mulligan'`; actions `redraw` / `keep` |
| Draw | automatic inside the action that starts the turn (`keep`, `endTurn`) |
| Reposition | `step: 'main'`, `!played`; `reposition` actions |
| Play one card | `step: 'main'`, `!played`; summon/cast/setTrap/graft actions; a play moves `step` to `'attack'` |
| Attack | `step: 'attack'` (or first `attack` from `'main'`, which forfeits the play — D-014) |
| End | `endTurn` → end-of-turn → opponent's start-of-turn → … until a decision is needed |

`applyAction` always returns a state where the active side (or `over`) has a decision to make; there are no "advance" actions.

### 5.2 Start of turn (`turn.ts › startTurn`) — D-016

```
emit TurnStarted{turn, round, side}
system: shroud of active side expires (lazy: shroudUntil === turn → emit ShroudExpired)
dispatch onTurnStart                                   (§8.3 order)
if side === Collector && FLAGS.APPRAISAL && APPRAISAL_ROUNDS.includes(round): appraisal()   (§5.7)
draw step: n = min(MAX_DRAW_PER_TURN, max(0, HAND_SIZE − hand.length), deck.length)  (D-011)
           wanted 0 → DrawSkipped{handFull}; deck short → CardDrawn… then DrawSkipped{deckEmpty}  (D-153)
if side === Player && FLAGS.INTENTS: collector.intent = intentPolicy(tx.state); emit IntentSet   (D-095, D-150)
step = 'main'; played = false
```

The policy receives the state, not a view: `ai`'s `intentPolicy` builds `collectorView(s)` itself, because the engine can't import `ai` (D-150). `createEngine` throws `EngineError` if `FLAGS.INTENTS` is on and no policy is given. `appraisal()` is imported directly from `appraisal.ts` once it exists. Until then it is the temporary `Services.appraisal` hook.

### 5.3 End of turn (`turn.ts › endTurn`) — D-017

```
dispatch onTurnEnd
system: destroy every monster (both boards, active side first, slot order) with unstableUntil === turn   (destroy batch, §5.5)
        emit UnstableExpired for each first; each is then followed by WardBroken or Destroyed (D-152)
        Ward-saved: the Ward replacement also sets unstableUntil = -1, so the +UNSTABLE_BONUS is lost (D-152, owner ruled A)
emit ModifierExpired once per surviving monster with a timed mod whose until === turn   (D-159)
emit TurnEnded
if turn === 2*MAX_ROUNDS − 1 and no result: result = { winner: Collector, reason: 'vaultSealed', round: MAX_ROUNDS }; emit VaultSealed, GameOver
else turn += 1; startTurn()
```

Timed modifiers and Gilt Frame need no cleanup: they stop applying when `turn > until`. `ModifierExpired` only tells the UI to refresh that card.

### 5.4 Attack pipeline (`combat.ts`) — D-032

```
declare(attacker A, target T | direct):
  A.attacked = turn; track.round[round−1] |= RoundFlag.Attacked (player)
  step = 'attack'; played = true                          // first attack closes Reposition, forfeits the play (D-014, D-155)
  emit AttackDeclared
  ctx = { cancelled: false }
  dispatch onAttackDeclared (attacker-side monsters, then defender traps in slot order)   // Snare, Mirror Sigil, Thornwall, Display Case
  if cancelled: emit AttackCancelled                      // once, after the list, before queued effects (D-157)
  run queued effects; if cancelled: return
  if A or T (not direct) left the board: return           // fizzle, no event (D-157)
  if direct: damage(defender side, power(A)); checkWin; return
  if T.faceDown: reveal T (faceDown=false, pos=guard); emit Revealed
  combat = snapshot { aP = power(A) + (advantage(A,T) ? ELEMENT_BONUS : 0), dP = power(T), dG = guard(T),
                      defPos = T.pos, advantage }          // CombatSnapshot, read-only to hooks (D-124); Object.freeze in dev mode (D-141)
  pierce = brittleWin = false                             // combat.ts locals, never visible to hooks
  dispatch beforeCombat (§8.3.1 order, so A's hooks run before T's; D-135)   // Pierce: ctx.setPierce(); Brittle: ctx.setBrittleWin() (D-049, D-124)
  run effects queued by beforeCombat                      // cannot change the snapshot (D-032); if A or T left the board → attack fizzles
  outcome = resolve(combat, pierce, brittleWin):
     brittleWin   → destroyed {T}; dmg to T.side = defPos=atk ? max(0,aP−dP) : (pierce ? max(0,aP−dG) : 0)
     defPos=atk   → aP>dP: destroyed {T}, dmg T.side aP−dP | aP<dP: destroyed {A}, dmg A.side dP−aP | tie: {A,T}, 0
     defPos=guard → aP>dG: destroyed {T}, dmg T.side = pierce ? aP−dG : 0 | aP<dG: dmg A.side dG−aP | tie: nothing
  emit CombatResolved{…outcome}                           // destroyed = intended set before Ward; dStat = dP (atk) | dG (guard) (D-156)
  destroyBatch(outcome.destroyed, cause: combat, destroyerOf: {T→A, A→T})        // §5.5 — before damage
  apply damage amounts (fixed by snapshot); checkWin                               // "keywords and traps resolve before damage"
                                                          // attacker's side first, then defender's; source = opposing combatant (D-156)
```

A direct attack emits no `CombatResolved`, just one `Damage` with `source` = the attacker.

`previewCombat(state, A, T)` runs the same `resolve` without side effects (used by the UI, the Collector AI with public info, and bots). For a face-down target, preview returns `unknown`.

### 5.5 Destruction batch (`destroy.ts`)

```
destroyBatch(list, cause, destroyerOf?):
  order list: active side first, then slot order
  for each m: ask beforeDestroy of m's OWN active keywords only, bit order (Ward; D-134)
              → 'prevent' ⇒ wardUsed = true (all of m's beforeDestroy bits go inactive, D-133); emit WardBroken; drop from list
  snapshot last-known info (LKI) for each remaining m (stats, keywords, controller, slot, destroyer)
  remove all remaining from boards simultaneously → owner's discard (D-047); emit Destroyed{iid, cause, by}
  track: player-controlled → round[round−1] |= RoundFlag.LostMonster
  for each m in order: dispatch onDestroyed: m's own hooks with LKI (Haunt, Echo), then other subscribers (traps: Last Rites, Insurance Claim)
                       // LKI = DestroyedEvt (§8.1); m's own hooks are selected by LKI.kw, not by its (gone) board record (D-122)
                       // a firing trap is spent at dispatch time (to discard + TrapTriggered), so a later m never sees it
  flush the effect queue ONCE, after the whole batch (FIFO, so m1's effects still run before m2's) (D-158)
```

Flushing once per batch means a batch resolves the same way from combat, Unstable expiry or a `destroy` effect. When the batch comes from an effect, `Run.flush()` is a no-op and the outer drain runs the queued effects.

Leaving the board resets all board state (D-043) because the `Monster` record is simply dropped.

### 5.6 Graft (`graft.ts`) — D-056…D-065

```
graftBegin                 → pending { stage:'mat1', mats:[] }
graftPick m (mat1)         → stage 'mat2'
graftPick m (mat2)         → stage FLAGS.ASCEND && any eligible third material ? 'ascend' : next
graftPick m (ascend) | graftSkipAscend → stage (union(kw) > MAX_INHERITED_KEYWORDS) ? 'keywords' : 'position'
graftKeywords kw           → stage 'position'
graftPosition pos          → COMMIT:
     family = recipe[kind(m0), kind(m1)]; element = element(m0)
     unstable = FLAGS.UNSTABLE && any pair of material elements opposes
     sacrifice board materials and hand materials → owner's discard (emit Sacrificed; no hooks)
     inst.push({ def: family, owner, chimera: { element, kw, ascended: mats.length === 3, materials, grafted: turn } })
     place in leftmost free slot: { pos, entered: turn, unstableUntil: unstable ? turn + 2 : -1, … }
     played = true; step = 'attack'; track.grafts++, round[round−1] |= RoundFlag.Grafted, families ∪= family
     emit Grafted{…}; dispatch onGraft (Counterfeit; D-065). A Graft does not dispatch onSummon.
graftCancel (any stage)    → pending = null (nothing was applied)
```

`previewGraft(state)` returns the Chimera that the current pending choices would create (family, element, stats incl. Ascend/Unstable, keyword options, expiry) — the UI's confirm screen.

### 5.7 Appraisal (`appraisal.ts`) — D-075…D-079

```
appraisal.attempts++
candidates = player board monsters: !faceDown && !(turn < shroudUntil) && power(m) >= APPRAISAL_MIN_POWER
if none: emit AppraisalFailed; return
pick highest power, tie leftmost
remove from player board; m' = { ...m, entered: turn, appraised: true }
slot = leftmost free on Collector board → place m', emit Appraised{to:'board'}
else vault.push(iid), emit Appraised{to:'vault'}
appraisal.successes++, taken.push(iid); track.round[round−1] |= RoundFlag.Appraised; track.appraisedLost++
```

### 5.8 Win check (`pipeline.ts › lifeChanged / checkWin / endGame`) — D-018, D-151

After every life change, `lifeChanged` refreshes the mood (`MoodChanged` if it changed, D-080) and then calls `checkWin`: Collector ≤ 0 → `{winner:0, reason:'collectorDefeated'}`; else player ≤ 0 → `{winner:1, reason:'playerDefeated'}`. `endGame` sets `result`, sets `step = 'over'`, emits `GameOver`, and the remaining queued effects are dropped. These live in `pipeline.ts`, not `reducer.ts`, because the effect interpreter and `combat.ts` need them and the reducer imports both. `reducer.ts` imports them and has no second check.

---

## 6. Actions and legality

### 6.1 Action types

```ts
// packages/engine/src/types/actions.ts
export type SummonMode = 'atk' | 'grd' | 'down';   // face-up attack, face-up guard, face-down guard

export type Action =
  | { readonly t: 'redraw' }                                         // mulligan only
  | { readonly t: 'keep' }                                           // ends mulligan, starts round 1
  | { readonly t: 'reposition'; readonly m: Iid }                    // atk↔grd; face-down → face-up atk
  | { readonly t: 'summon'; readonly c: Iid; readonly mode: SummonMode }
  | { readonly t: 'summonCovetous'; readonly c: Iid; readonly sac: Iid; readonly mode: 'atk' | 'grd' }
  | { readonly t: 'cast'; readonly c: Iid; readonly target: Iid | -1 }  // -1 = untargeted
  | { readonly t: 'setTrap'; readonly c: Iid }
  | { readonly t: 'graftBegin' }
  | { readonly t: 'graftPick'; readonly m: Iid }                     // material 1, 2, or Ascend material
  | { readonly t: 'graftSkipAscend' }
  | { readonly t: 'graftKeywords'; readonly kw: KwMask }             // exactly MAX_INHERITED_KEYWORDS bits
  | { readonly t: 'graftPosition'; readonly pos: Pos }               // commits the Graft
  | { readonly t: 'graftCancel' }
  | { readonly t: 'attack'; readonly a: Iid; readonly target: Iid | -1 } // -1 = direct
  | { readonly t: 'endTurn' };
```

Actions reference instance ids, never hand indices, so they stay valid when the UI sorts the hand. The same action set is used by both sides; the Collector's actions are chosen by `ai/collector/policy.ts` and appended to the same log.

### 6.2 `getLegalActions(state)` — the single legality source

`legal.ts` exposes one generator, `forEachLegal(state, visit)`, and three wrappers: `getLegalActions(state): Action[]`, `countLegal(state)`, and `isLegal(state, action)` (generator with early exit + structural equality). `applyAction` calls `isLegal` unless the engine was created with `{ trusted: true }` (sim, where every action came from the generator). There is no second legality implementation anywhere (UI, AI and bots only ever choose from this list).

Enumeration, in this fixed order (order is part of determinism — bots index into it):

```
over                      → []
pending graft             → stage actions (below) + graftCancel
mulligan                  → keep, redraw (if FLAGS.REDRAW && redrawsLeft > 0)
main (and !played):
   reposition m           for own m with m.entered < turn and m.repositioned !== turn
                          (face-down: only to attack; D-023)
   summon c × mode        for hand monster c, free slot, summonRequirement(c) === 'normal'
   summonCovetous c, sac  for each acquired sac on board or in vault with a free slot after (D-054)
   cast c, target         per legal target from the spell's TargetSpec (≥1 needed if targeted; D-067)
   setTrap c              if a trap slot is free
   graftBegin             if canGraft(side) && ≥2 eligible materials && slot feasibility (D-057)
main or attack:
   attack a, target       for own a: pos=atk, !faceDown, a.attacked !== turn,
                          perm = attackPermission(a) ≠ 'none';
                          targets = enemy board monsters, filtered by restrictTargets (Sentinel);
                          direct (-1) only if enemy board empty and perm === 'any'
   endTurn                unless some own monster has mustAttack (Vain) and an untaken legal attack (D-052)
```

Graft stage actions:

| Stage | Legal actions |
| --- | --- |
| `mat1` | `graftPick m` for each eligible base monster in own hand/board |
| `mat2` | `graftPick m` for each eligible m ≠ mat1 such that a slot is free after sacrificing board materials |
| `ascend` | `graftPick m` for each remaining eligible m (slot feasibility re-checked), `graftSkipAscend` |
| `keywords` | `graftKeywords kw` for each 2-subset of the available union (≤ 3 options with launch content) |
| `position` | `graftPosition 0`, `graftPosition 1` |

**Attack permission** (`stats.ts › attackPermission`) folds the lattice `none < monstersOnly < any`:

```
if side === Player && round < FIRST_ATTACK_ROUND_PLAYER: perm = none   // D-015, absolute (D-042); global form per D-142
else:
  base   = (m.entered === turn) ? none : any            // universal summoning sickness (D-022)
  grants = max over hooks.attackPermission(...).grant   // Swift: monstersOnly on entered turn
  restr  = min over hooks.attackPermission(...).restrict // Slow: none on entered turn (default: any)
  perm   = min(max(base, grants), restr)
```

Order-independent by construction, so adding keywords cannot create ordering bugs.

**Multi-step choices, summary**: Graft material order (`graftPick` order = material order), Ascend (`ascend` stage), keyword picks (`keywords` stage, only when > 2 available), Chimera position (`position` stage), spell targets (one `cast` action per target), summon position (one `summon` per mode), attack targets (one `attack` per target incl. direct). Nothing outside the pending Graft spans multiple actions.

---

## 7. Events

`applyAction` returns `readonly GameEvent[]` (empty array constant when the engine is created with `{ events: false }`). Events drive animations, the share grid (via `Track`), replays and debugging. They contain full information; `view/redact.ts › redactEvent(event, viewer)` hides opponent hand draws and set-trap identities for the UI.

```ts
// packages/engine/src/types/events.ts
export type GameEvent =
  | { e: 'GameStarted'; seed: string }
  | { e: 'HandDealt'; side: Side; cards: readonly Iid[] }
  | { e: 'Redrawn'; returned: readonly Iid[]; drawn: readonly Iid[] }
  | { e: 'TurnStarted'; turn: number; round: number; side: Side }
  | { e: 'CardDrawn'; side: Side; iid: Iid; byEffect: boolean }
  | { e: 'DrawSkipped'; side: Side; reason: 'handFull' | 'deckEmpty' }   // ≤ 1 per draw step; effect draws: deckEmpty only (D-153)
  | { e: 'IntentSet'; intent: Intent }
  | { e: 'MoodChanged'; from: Mood; to: Mood }
  | { e: 'AppraisalAttempt'; round: number }
  | { e: 'Appraised'; iid: Iid; fromSlot: number; to: 'board' | 'vault'; toSlot: number }
  | { e: 'AppraisalFailed'; round: number; reason: 'noTarget' }
  | { e: 'Repositioned'; iid: Iid; pos: Pos }
  | { e: 'Revealed'; iid: Iid; side: Side }           // combat reveal, or reposition flip (then Repositioned, D-161)
  | { e: 'Summoned'; side: Side; iid: Iid; slot: number; pos: Pos; faceDown: boolean } // every summon action, 1:1 with onSummon
  | { e: 'CovetousSummoned'; iid: Iid; sacrificed: Iid; slot: number }  // marker after Summoned: Sacrificed → Summoned → this (D-154)
  | { e: 'Sacrificed'; iid: Iid; reason: 'graft' | 'covetous'; from: 'hand' | 'board' | 'vault' }
  | { e: 'GraftStarted' } | { e: 'GraftStep'; stage: GraftStage; mats: readonly Iid[] } | { e: 'GraftCancelled' }
  | { e: 'Grafted'; side: Side; iid: Iid; family: DefIdx; element: ElemIdx; materials: readonly Iid[];
      kw: KwMask; ascended: boolean; unstable: boolean; slot: number; pos: Pos }
  | { e: 'SpellCast'; side: Side; iid: Iid; target: Iid | -1 }
  | { e: 'TrapSet'; side: Side; iid: Iid; slot: number }
  | { e: 'TrapTriggered'; side: Side; iid: Iid; slot: number }
  | { e: 'AttackDeclared'; attacker: Iid; target: Iid | -1 }
  | { e: 'AttackCancelled'; attacker: Iid; by: Iid }
  | { e: 'CombatResolved'; attacker: Iid; defender: Iid; aP: number; dStat: number; advantage: boolean;
      pierce: boolean; brittle: boolean; destroyed: readonly Iid[] }  // destroyed = before Ward; dStat = dP | dG (D-156)
  | { e: 'Damage'; side: Side; amount: number; source: Iid | -1; lifeAfter: number }
  | { e: 'LifeGained'; side: Side; amount: number; source: Iid; lifeAfter: number }
  | { e: 'StatsModified'; iid: Iid; p: number; g: number; duration: Duration; source: Iid }
  | { e: 'PositionChanged'; iid: Iid; pos: Pos; source: Iid }
  | { e: 'WardBroken'; iid: Iid }
  | { e: 'Destroyed'; iid: Iid; side: Side; cause: 'combat' | 'effect' | 'unstable'; by: Iid | -1 }
  | { e: 'ReturnedToHand'; iid: Iid; side: Side; from: 'board' | 'discard'; source: Iid }
  | { e: 'ShroudApplied'; iid: Iid; until: number } | { e: 'ShroudExpired'; iid: Iid }
  | { e: 'ModifierExpired'; iid: Iid }                // once per surviving monster, not per modifier (D-159)
  | { e: 'UnstableExpired'; iid: Iid }                // timer ran out; followed by WardBroken or Destroyed (D-152)
  | { e: 'TurnEnded'; turn: number }
  | { e: 'VaultSealed' }
  | { e: 'GameOver'; result: Result };
```

There is no fizzle event. An attack whose combatant leaves the board before resolution just ends (D-157).

---

## 8. Hook registry

### 8.1 Hook names and signatures

Seven **event hooks** from DESIGN.md plus pure **query hooks** for legality/stats/replacement (D-112).

```ts
// packages/engine/src/types/hooks.ts
export const HOOK_NAMES = [                          // fixed order: code iterates this, never object keys (D-127)
  'onSummon', 'onAttackDeclared', 'beforeCombat', 'onDestroyed',
  'onTurnStart', 'onTurnEnd', 'onGraft',
  'attackPermission', 'restrictTargets', 'mustAttack',
  'summonRequirement', 'staticPower', 'staticGuard', 'beforeDestroy',
] as const;
export type HookName = (typeof HOOK_NAMES)[number];  // derived, so the two cannot drift

export type AttackPerm = 'none' | 'monstersOnly' | 'any';
export type SummonReq = { readonly kind: 'normal' } | { readonly kind: 'sacrifice'; readonly appraised: true; readonly zones: readonly ('board' | 'vault')[] };

export interface Hooks {
  // event hooks: may read state and queue effects through ctx
  onSummon?(ctx: HookCtx<SummonEvt>): void;            // after a monster enters by summon/Covetous
  onAttackDeclared?(ctx: AttackCtx): void;             // after declaration, before reveal
  beforeCombat?(ctx: CombatCtx): void;                 // after reveal, before outcome
  onDestroyed?(ctx: HookCtx<DestroyedEvt>): void;      // after removal; self hooks see LKI
  onTurnStart?(ctx: HookCtx<TurnEvt>): void;
  onTurnEnd?(ctx: HookCtx<TurnEvt>): void;
  onGraft?(ctx: HookCtx<GraftEvt>): void;              // after the Chimera entered
  // query hooks: pure functions of the state, no effects
  attackPermission?(q: QueryCtx): { readonly grant?: AttackPerm; readonly restrict?: AttackPerm };
  restrictTargets?(q: TargetQueryCtx): boolean;        // defender-side: "this monster is a mandatory target"
  mustAttack?(q: QueryCtx): boolean;
  summonRequirement?(q: QueryCtx): SummonReq;
  staticPower?(q: QueryCtx): number;
  staticGuard?(q: QueryCtx): number;
  // replacement hook
  beforeDestroy?(ctx: HookCtx<DestroyEvt>): 'prevent' | 'allow';
}

// Event payloads (ctx.evt) — D-122
export interface SummonEvt { readonly iid: Iid; readonly side: Side; readonly slot: number; readonly covetous: boolean } // summon + Covetous only
export interface AttackEvt { readonly attacker: Iid; readonly target: Iid | -1 }          // -1 = direct (never in beforeCombat)
export interface DestroyedEvt {                       // last-known information (§5.5), after Ward, before removal
  readonly iid: Iid;
  readonly side: Side;                                // controller at destruction (D-048); owner = inst[iid].owner
  readonly slot: number;
  readonly cause: 'combat' | 'effect' | 'unstable';
  readonly by: Iid | -1;                              // destroyer (D-045), the `destroyer` ref
  readonly power: number; readonly guard: number;     // effective (D-031), no element bonus
  readonly kw: KwMask;                                // active keywords at removal (0 if face-down); selects self hooks
}
export interface DestroyEvt { readonly iid: Iid; readonly cause: 'combat' | 'effect' | 'unstable'; readonly by: Iid | -1 } // beforeDestroy
export interface TurnEvt { readonly turn: number; readonly round: number; readonly side: Side }
export interface GraftEvt { readonly iid: Iid; readonly side: Side; readonly family: DefIdx; readonly materials: readonly Iid[] } // final Chimera (D-065)
```

### 8.2 Hook context API

```ts
export interface QueryCtx {
  readonly s: GameState;            // live Tx view (§4.1): read it, never keep references from it
  readonly self: Iid;               // the monster/trap whose keyword is asking
  readonly side: Side;              // its controller
  readonly g: Globals;
  readonly c: CompiledContent;
  power(i: Iid): number;            // effective (D-031); guard(i) likewise
  guard(i: Iid): number;
  controller(i: Iid): Side | -1;    // -1 = not on a board
  slot(i: Iid): number;
  isFaceUp(i: Iid): boolean;
  hasKw(i: Iid, id: string): boolean;   // active keywords only
  monsters(side: Side): readonly Iid[]; // board, slot order
  enteredThisTurn(i: Iid): boolean;
  isAttacker(i: Iid): boolean;          // TargetQueryCtx/CombatCtx helpers
}

export interface HookCtx<E> extends QueryCtx {
  readonly evt: E;                  // event payload (attacker, target, destroyed LKI, chimera…)
  effect(e: Effect): void;          // queue an effect primitive (§9) with refs bound to evt
  emit(ev: GameEvent): void;
}
export interface TargetQueryCtx extends QueryCtx { readonly attacker: Iid }   // restrictTargets; self = a face-up defender (D-122)

export interface AttackCtx extends HookCtx<AttackEvt> { readonly cancelled: boolean; cancelAttack(by: Iid): void }

export interface CombatSnapshot {   // §5.4, taken after the reveal; read-only to hooks (D-124)
  readonly aP: number;              // attacker Power incl. element bonus
  readonly dP: number; readonly dG: number;
  readonly defPos: Pos; readonly advantage: boolean;
}
export interface CombatCtx extends HookCtx<AttackEvt> {
  readonly combat: CombatSnapshot;
  setPierce(): void;                // idempotent, on-only; OR-folded after all beforeCombat subscribers ran
  setBrittleWin(): void;            // idempotent, on-only; hooks cannot read either flag
}
```

Hooks never touch the `Tx` directly: they read through `QueryCtx` and act through `effect()`, so every state change goes through the effect interpreter (one place for events, Ward, zone rules). There are two exceptions, and neither writes `GameState`. First, the `cancelAttack` op runs immediately: `traps.ts` calls `ctx.cancelAttack(trapIid)` when the trap's subscriber runs, so later subscribers see `cancelled` (§8.3 rule 4, D-071). The card's other effects are queued in order (D-122). Second, `beforeCombat` hooks set combat flags through `CombatCtx` (D-124).

### 8.3 Ordering rules

1. **Subscriber order for one event**: (a) engine system rules (fixed, documented in §5); (b) for `onDestroyed`, the destroyed monster's own hooks first, using last-known information; (c) active side's board monsters in slot order; (d) inactive side's board monsters in slot order; (e) active side's traps in slot order; (f) inactive side's traps in slot order. Within one card: keyword bits in registry order (keywords sorted by id, then Flaws sorted by id). Every event hook uses this order, `beforeCombat` included, so bystander monsters are called too and keyword hooks check whether `self` is a combatant (D-135). **Exception:** `beforeDestroy` asks only the monster being destroyed (its own active bits), never neighbours or traps (D-134).
2. **Queue, no recursion**: effects queued by hooks run after the current subscriber list finishes; events those effects raise (e.g. a destruction) are processed FIFO. Simultaneous destructions are one batch (§5.5).
3. **Traps fire once**: a trap is moved to its owner's discard *before* its effects run (emit `TrapTriggered`), so it cannot re-trigger; identical traps → only the leftmost fires (D-071). The move happens when the trap's subscriber runs, like `cancelAttack`, not in a queued effect, so the next monster's dispatch in the same destruction batch no longer sees the trap (D-158).
4. **Cancellation is visible**: after `cancelAttack`, later `onAttackDeclared` subscribers see `ctx.cancelled === true`; trap conditions on an attacking monster fail, so later traps stay set.
5. **Game over stops everything**: once `result` is set, the queue is dropped.
6. **Query hooks are order-independent**: permission is a lattice (§6.2), `restrictTargets` is an intersection, `mustAttack` is OR, `staticPower` is a sum, `summonRequirement` takes the most restrictive (any `sacrifice` beats `normal`; several `sacrifice` results intersect their `zones`, and an empty intersection means the card can't be summoned; D-137), `beforeDestroy` stops at the first `'prevent'`. The same holds for `beforeCombat` flags: hooks read only the pre-hook `CombatSnapshot`, and `setPierce`/`setBrittleWin` are OR-folded after the list (D-124).
7. **Safety**: a chain longer than `MAX_TRIGGER_CHAIN` (64) throws `EngineError` in every mode (unreachable with launch content; D-141).
8. **Fast skip**: dispatch iterates ≤ 6 monsters and ≤ 4 traps, testing `activeKw(m) & hookMask[hook]` before calling anything.

### 8.4 `defineKeyword` and auto-registration

```ts
// packages/engine/src/types/hooks.ts — declared here because CompiledContent (§3) needs it (D-123)
export interface KeywordDef {
  readonly id: string;                 // must equal file name
  readonly name: string;
  readonly kind: 'keyword' | 'flaw';
  readonly icon: string;               // icon asset id
  readonly visual: string;             // frame/effect id ("motion-streaks", "iron-shield-border", …)
  readonly text: string;               // one sentence (validator)
  readonly hooks: Hooks;
  readonly examples?: readonly string[]; // board-DSL scenarios (§17); each becomes a generated test
}

// packages/engine/src/hooks/define.ts — re-exports the type; the package root exports defineKeyword by name
export type { KeywordDef } from '../types/hooks';
export const defineKeyword = (k: KeywordDef): KeywordDef => k;
```

**Replacement keywords are one-shot (D-133).** A keyword with a `beforeDestroy` hook is a single-use destruction replacement. When one of a monster's `beforeDestroy` bits returns `'prevent'`, the engine sets `wardUsed`, and every `beforeDestroy` bit of that monster stops being active until it leaves the board. The engine finds Ward by this hook, never by its id. A future reusable or independent replacement keyword requires replacing `wardUsed` with a per-bit spent mask first.

`pnpm content:gen` scans `packages/content/keywords/*.ts` and writes `index.gen.ts` exporting `KEYWORDS: readonly KeywordDef[]` sorted (keywords by id, then flaws by id) — this order is the bit order. `content:check` fails if the barrel is stale, if `id` ≠ file name, if two files share an id, or if more than 32 keywords exist (mask width).

Example files:

```ts
// packages/content/keywords/sentinel.ts
export default defineKeyword({
  id: 'sentinel', name: 'Sentinel', kind: 'keyword', icon: 'shield', visual: 'iron-shield-border',
  text: 'Enemy attacks must target Sentinels first.',
  hooks: { restrictTargets: () => true },   // "I am a mandatory target"; engine: if any face-up defender
                                           // monster returns true, targets ∩= those monsters
  examples: [`
    turn 2
    P board [stormcrow A] [-] [-]
    C board [halo-stag A] [brazier-golem A] [-]
    expect illegal attack P0 > C0
    expect legal attack P0 > C1`],
});

// packages/content/keywords/ward.ts
export default defineKeyword({
  id: 'ward', name: 'Ward', kind: 'keyword', icon: 'barrier', visual: 'pale-barrier',
  text: 'The first time it would be destroyed, it loses Ward instead.',
  hooks: { beforeDestroy: () => 'prevent' },  // engine sets wardUsed; a used Ward is no longer an active bit
});

// packages/content/keywords/haunt.ts
export default defineKeyword({
  id: 'haunt', name: 'Haunt', kind: 'keyword', icon: 'wisp', visual: 'ghost-wisps',
  text: 'When destroyed, the monster that destroyed it loses 2 Power permanently.',
  hooks: {
    onDestroyed: (ctx) => {
      if (ctx.evt.iid !== ctx.self || ctx.evt.by < 0) return;   // only its own destruction, only with a destroyer
      ctx.effect({ op: 'modifyStats', target: 'destroyer', power: '-$HAUNT_PENALTY', duration: 'permanent',
                   if: { onBoard: true } });           // fizzles if destroyer left the board (D-045)
    },
  },
});
```

### 8.5 Keywords and Flaws → hooks

| Keyword/Flaw | Hook(s) | Behavior (decision refs) |
| --- | --- | --- |
| Swift | `attackPermission` | `grant: 'monstersOnly'` when `enteredThisTurn(self)`; direct attacks need `'any'` (D-041, D-042) |
| Sentinel | `restrictTargets` | face-up Sentinels on the defending board become the only legal targets (D-037, D-038) |
| Pierce | `beforeCombat` | if self is attacker and `combat.defPos` is guard: `ctx.setPierce()` → damage `aP − dG` (D-039, D-040, D-124) |
| Ward | `beforeDestroy` | `'prevent'` once; asked only for its own monster; engine sets `wardUsed` and emits `WardBroken` (D-034, D-035, D-044, D-133, D-134) |
| Haunt | `onDestroyed` | destroyer gets `modifyStats −HAUNT_PENALTY permanent` if still on board (D-045) |
| Echo | `onDestroyed` | `returnToHand self` (from discard to owner's hand) (D-046) |
| Slow | `attackPermission` | `restrict: 'none'` when `enteredThisTurn(self)` (D-053, PROPOSAL) |
| Vain | `mustAttack` | `true`; engine blocks `endTurn` while a legal attack remains; AI picks best target (D-052, D-091) |
| Brittle | `beforeCombat` | if self is defender and `combat.advantage`: `ctx.setBrittleWin()` (D-049, D-050, D-124) |
| Tethered | `staticPower` | `−TETHERED_PENALTY` when `monsters(side).length === 1` (D-051) |
| Covetous | `summonRequirement` | `{ kind:'sacrifice', appraised:true, zones:['board','vault'] }` → only `summonCovetous` is legal (D-054, D-055) |

The five legality-constraining keywords (Sentinel, Swift, Vain, Slow, Covetous) use only query hooks, which `legal.ts` calls while enumerating — so the UI, AI and bots see the constraint in `getLegalActions` with no extra code.

### 8.6 Engine-internal plumbing (not exported) — D-131

| Type | File | Role |
| --- | --- | --- |
| `Env { c, g, reg, dev }` | `hooks/registry.ts` | Everything a rule needs besides the state: compiled content, bound globals, hook registry, dev-mode switch (D-141) |
| `HookRegistry { kw, masks, trapHooks }` | `hooks/registry.ts` | Keyword bit → `Hooks`. Hook name → bit mask (same object as `c.hookMask`, checked against the hook tables by `createRegistry`). Trap `DefIdx` → hooks compiled by `traps.ts` |
| `Refs` | `effects/run.ts` | One field per DSL `Ref` (§9.1), bound when an effect is queued; `-1` = absent |
| `QueuedEffect { effect, refs, source, side }` | `effects/run.ts` | One queued primitive. `side` = the source's controller at queue time; durations are relative to it (D-136) |
| `EffectSink { queue, emit }` | `effects/run.ts` | What hook contexts write into |
| `EffectHost { emit, destroy(iids), lifeChanged }` | `effects/run.ts` | How the interpreter reaches later pipelines. `destroy(iids)` = `destroyBatch(…, cause 'effect')`, with no destroyer and no `by` parameter (D-160). Unstable expiry and combat call `destroyBatch` (§5.5) with their own cause |
| `Dispatcher` | `hooks/dispatch.ts` | One per dispatch. Collects subscribers into a local list first (§4.1 contract 1), then calls them in §8.3 order |
| `Run` | `pipeline.ts` | One per `applyAction`, built by `reducer.ts`: the `Tx`, the event list (`null` under `{ events: false }`), the FIFO `EffectQueue`, the `EffectHost`, and `flush()`. A re-entrant `flush()` is a no-op, and the outer drain runs the new effects (D-150) |
| `Services { intent? }` | `pipeline.ts` | Injected services. `intent` comes from `createEngine` (D-096). `appraisal?` is temporary and is removed when `appraisal.ts` lands (D-150) |
| `IntentPolicy = (s: GameState) => Intent` | `pipeline.ts`, type exported from the root | Pure, read-only, keeps no references into `s`. `ai` builds `collectorView(s)` inside it. Required when `FLAGS.INTENTS` is on (D-150) |

---

## 9. Effect-primitive DSL

### 9.1 Types

```ts
// packages/engine/src/types/effects.ts
export type Num = number | `$${string}` | `-$${string}`;   // literal or (negated) global ref (D-074)
export type Who = 'self' | 'opponent';                       // relative to the card's controller
export type Duration =
  | 'permanent'                 // while on the board (D-043)
  | 'thisTurn'                  // until end of current turn
  | 'untilEndOfYourNextTurn'    // until end of the controller's next own turn (turn + 2 when cast on own turn)
  | 'untilYourNextTurn';        // until start of the controller's next own turn (turn + 2 when cast on own turn); D-136

export type Cond =
  | { faceUp: true } | { powerLte: Num } | { powerGte: Num }
  | { type: 'monster' } | { relic: true } | { chimera: true } | { onBoard: true }
  | { directAttack: boolean } | { graftedThisTurn: true }        // graftedThisTurn: chimera.grafted === turn (D-139)
  | { element: string } | { kind: string } | { keyword: string }
  | { all: readonly Cond[] } | { any: readonly Cond[] } | { not: Cond };

export interface TargetSpec {                 // spells: the caster chooses → one legal action per candidate
  readonly side: 'ally' | 'enemy';
  readonly zone: 'board' | 'discard';
  readonly where?: Cond;
}

export type Ref = 'chosen' | 'self' | 'attacker' | 'defender' | 'destroyed' | 'destroyer' | 'grafted';

export type Effect = (
  | { op: 'draw'; who: Who; n: Num }                                   // always ignores the draw cap (D-011)
  | { op: 'damage'; who: Who; n: Num }
  | { op: 'heal'; who: Who; n: Num }                                   // no life cap (D-019)
  | { op: 'modifyStats'; target: Ref; power?: Num; guard?: Num; duration: Duration }
  | { op: 'destroy'; target: Ref }                                     // Ward may prevent
  | { op: 'returnToHand'; target: Ref }                                // board or discard → owner's hand (Chimera + CHIMERA_TO_HAND off: fizzles, D-140)
  | { op: 'changePosition'; target: Ref; to: 'attack' | 'guard' }      // not a reposition (D-024); face-down target: fizzles (D-138)
  | { op: 'preventAppraisal'; target: Ref; duration: 'untilYourNextTurn' }
  | { op: 'cancelAttack' }                                             // only inside onAttackDeclared
) & { readonly if?: Cond };                                            // per-effect guard on its target

export type TrapTrigger =
  | 'enemyAttack'          // an enemy monster declares an attack (any target)
  | 'enemyDirectAttack'    // an enemy monster declares a direct attack on you
  | 'allyDestroyed'        // a monster you control is destroyed
  | 'enemyGraft';          // the opponent completes a Graft

export interface SpellDef { readonly target?: TargetSpec; readonly effects: readonly Effect[] }
export interface TrapDef  { readonly trigger: TrapTrigger; readonly when?: Cond; readonly effects: readonly Effect[] }
```

Semantics:
- Targets: `chosen` = the action's `target`; event refs come from the triggering event (`attacker`, `defender`, `destroyed`, `destroyer`, `grafted`). A ref that no longer points to a valid object (e.g. left the board) makes that effect fizzle silently.
- Refs each card may use (validator, D-163). Spells may use only `chosen`. `self` is never available to spells or traps, because the card isn't on a board. `cancelAttack` may appear only in traps with an attack trigger.

  | Trap trigger | Hook | Refs |
  | --- | --- | --- |
  | `enemyAttack` | `onAttackDeclared` | `attacker`, `defender` (`-1` on a direct attack: fizzles) |
  | `enemyDirectAttack` | `onAttackDeclared` | `attacker` |
  | `allyDestroyed` | `onDestroyed` | `destroyed`, `destroyer` (`-1` unless destroyed in combat: fizzles) |
  | `enemyGraft` | `onGraft` | `grafted` |
- Conditions: `TargetSpec.where` filters candidates during legality; `TrapDef.when` is checked when the trap's turn in the subscriber list comes (D-071); `Effect.if` is checked just before the effect resolves.
- Durations are relative to the card's controller at cast/trigger time (`QueuedEffect.side`) and stored as absolute turn indices (`TimedMod.until`, `shroudUntil`). Let `n` be the controller's next own turn: `turn + DURATION_NEXT_OWN_TURN` if the controller is the active side, else `turn + 1` (D-136):

  | Duration | Stored as | Applies while | Launch cards (cast on own turn t) |
  | --- | --- | --- | --- |
  | `permanent` | `permP` / `permG` | on the board (D-043) | Mirror Sigil, Counterfeit, Haunt |
  | `thisTurn` | `until = turn` | `turn ≤ until` | Bloodlust: t |
  | `untilEndOfYourNextTurn` | `until = n` | `turn ≤ until` | Gilt Frame: t … t+2 |
  | `untilYourNextTurn` (`modifyStats`) | `until = n − 1` | `turn ≤ until` | — |
  | `untilYourNextTurn` (`preventAppraisal`) | `shroudUntil = max(old, n)` | `turn < shroudUntil` | Shroud: t, t+1 (covers his Appraisal) |

  Off-turn triggers (`n = turn + 1`) can't happen with launch content.
- Spell target candidates (`effects/targets.ts › targetCandidates`) leave out Chimeras when `FLAGS.CHIMERA_TO_HAND` is off and the spell has `returnToHand` on `chosen`, so Grave Recall never offers a target that is certain to fizzle (D-140).
- Effects in one card resolve top to bottom; destructions from one effect form one batch.
- Engine-internal mechanics reuse the same primitives (Haunt → `modifyStats`, Echo → `returnToHand`, Unstable expiry → `destroy`).

### 9.2 Coverage: every launch spell and trap in the DSL

`cards/player-spells.json`
```json
[
  { "id": "unmake", "type": "spell", "name": "Unmake", "text": "Destroy an enemy monster with Power 5 or less.",
    "target": { "side": "enemy", "zone": "board", "where": { "all": [ { "faceUp": true }, { "powerLte": "$UNMAKE_MAX_POWER" } ] } },
    "effects": [ { "op": "destroy", "target": "chosen" } ] },
  { "id": "bloodlust", "type": "spell", "name": "Bloodlust", "text": "One of your monsters gets +3 Power this turn.",
    "target": { "side": "ally", "zone": "board" },
    "effects": [ { "op": "modifyStats", "target": "chosen", "power": "$BLOODLUST_POWER", "duration": "thisTurn" } ] },
  { "id": "grave-recall", "type": "spell", "name": "Grave Recall", "text": "Return a monster from your discard pile to your hand.",
    "target": { "side": "ally", "zone": "discard", "where": { "type": "monster" } },
    "effects": [ { "op": "returnToHand", "target": "chosen" } ] },
  { "id": "scrying-bones", "type": "spell", "name": "Scrying Bones", "text": "Draw 2 cards (ignores the draw cap).",
    "effects": [ { "op": "draw", "who": "self", "n": "$SCRYING_DRAW" } ] },
  { "id": "shroud", "type": "spell", "name": "Shroud", "text": "One of your monsters cannot be Appraised until your next turn.",
    "target": { "side": "ally", "zone": "board" },
    "effects": [ { "op": "preventAppraisal", "target": "chosen", "duration": "untilYourNextTurn" } ] },
  { "id": "siphon", "type": "spell", "name": "Siphon", "text": "The Collector loses 3 life; you gain 3.",
    "effects": [ { "op": "damage", "who": "opponent", "n": "$SIPHON_DRAIN" }, { "op": "heal", "who": "self", "n": "$SIPHON_GAIN" } ] }
]
```

`cards/player-traps.json`
```json
[
  { "id": "snare", "type": "trap", "name": "Snare", "text": "When an enemy monster attacks, cancel that attack.",
    "trigger": "enemyAttack", "effects": [ { "op": "cancelAttack" } ] },
  { "id": "mirror-sigil", "type": "trap", "name": "Mirror Sigil", "text": "When an enemy monster attacks, it loses 3 Power permanently before combat.",
    "trigger": "enemyAttack",
    "effects": [ { "op": "modifyStats", "target": "attacker", "power": "-$MIRROR_SIGIL_PENALTY", "duration": "permanent" } ] },
  { "id": "last-rites", "type": "trap", "name": "Last Rites", "text": "When your monster is destroyed, draw 1 card.",
    "trigger": "allyDestroyed", "effects": [ { "op": "draw", "who": "self", "n": "$LAST_RITES_DRAW" } ] },
  { "id": "thornwall", "type": "trap", "name": "Thornwall", "text": "When you are attacked directly, take no damage and switch the attacker to guard.",
    "trigger": "enemyDirectAttack",
    "effects": [ { "op": "cancelAttack" }, { "op": "changePosition", "target": "attacker", "to": "guard" } ] }
]
```

`cards/collector-spells.json`
```json
[
  { "id": "provenance-ledger", "type": "spell", "name": "Provenance Ledger", "text": "Draw 2 cards.",
    "effects": [ { "op": "draw", "who": "self", "n": "$PROVENANCE_DRAW" } ] },
  { "id": "restoration", "type": "spell", "name": "Restoration", "text": "Return a destroyed Relic to his hand.",
    "target": { "side": "ally", "zone": "discard", "where": { "all": [ { "type": "monster" }, { "relic": true } ] } },
    "effects": [ { "op": "returnToHand", "target": "chosen" } ] },
  { "id": "gilt-frame", "type": "spell", "name": "Gilt Frame", "text": "+2 Power and +2 Guard until the end of his next turn.",
    "target": { "side": "ally", "zone": "board", "where": { "faceUp": true } },
    "effects": [ { "op": "modifyStats", "target": "chosen", "power": "$GILT_POWER", "guard": "$GILT_GUARD", "duration": "untilEndOfYourNextTurn" } ] },
  { "id": "forfeit", "type": "spell", "name": "Forfeit", "text": "Destroy one of your monsters with Power 4 or less.",
    "target": { "side": "enemy", "zone": "board", "where": { "all": [ { "faceUp": true }, { "powerLte": "$FORFEIT_MAX_POWER" } ] } },
    "effects": [ { "op": "destroy", "target": "chosen" } ] }
]
```

`cards/collector-traps.json`
```json
[
  { "id": "display-case", "type": "trap", "name": "Display Case", "text": "Cancel an attack and switch the attacker to guard.",
    "trigger": "enemyAttack",
    "effects": [ { "op": "cancelAttack" }, { "op": "changePosition", "target": "attacker", "to": "guard" } ] },
  { "id": "counterfeit", "type": "trap", "name": "Counterfeit", "text": "A Chimera grafted this turn loses 3 Power.",
    "trigger": "enemyGraft",
    "effects": [ { "op": "modifyStats", "target": "grafted", "power": "-$COUNTERFEIT_PENALTY", "duration": "permanent" } ] },
  { "id": "insurance-claim", "type": "trap", "name": "Insurance Claim", "text": "When his monster is destroyed, he gains 3 life.",
    "trigger": "allyDestroyed", "effects": [ { "op": "heal", "who": "self", "n": "$INSURANCE_HEAL" } ] }
]
```

Card text is DESIGN's, written to the player, so in a Collector card "your monsters" means the player's: Forfeit targets `side: "enemy"` from the caster's point of view (D-144).

All 17 launch spells/traps need zero code. Keyword-driven mechanics use the same primitives (§8.5). `traps.ts` compiles each `TrapDef` into a subscriber on the matching event hook (`enemyAttack`/`enemyDirectAttack` → `onAttackDeclared`, `allyDestroyed` → `onDestroyed`, `enemyGraft` → `onGraft`).

---

## 10. Content schemas and validator

### 10.1 Files

| File | Contents |
| --- | --- |
| `elements.json` | `{ id, name, color, icon, beats: string[], identity }` ×5 — `beats` rows form the advantage matrix (Lumen and Umbra list each other) |
| `kinds.json` | `{ id, name, profile, graftRole, silhouette }` ×5 |
| `recipes.json` | `{ id, name, kinds: [k1, k2], power, guard }` ×15 (order-independent pair) |
| `cards/player-monsters.json` | `{ id, type:"monster", name, element, kind, power, guard, keywords: string[] (≤1), text? }` ×25 |
| `cards/player-spells.json`, `player-traps.json` | §9.2 |
| `cards/relics.json` | `{ id, type:"monster", name, element, kind, power, guard, keywords: string[] (≤1), flaw: string }` ×13 |
| `cards/collector-spells.json`, `collector-traps.json` | §9.2 |
| `collector.json` | `{ deck: string[20], ace, canGraft:false, ai: {…} (§13), dialogue: { composed[], agitated[], desperate[] } }` |
| `objectives.json` | `{ id, text, requiresWin: true, metric, lte?|gte? (Num) }` |
| `twists.json` | `{ id, text, isoWeek?: "YYYY-Www", modifiers: [{ where: Cond, power?, guard? }] }` |
| `art-briefs.json` | `{ [cardOrFamilyId]: "mood · pose · palette" }` (D-110) |

### 10.2 zod schemas (excerpt)

```ts
// Zod 4 conventions (D-146): z.int(); z.exactOptional(x) for every optional field (exactOptionalPropertyTypes:
// an explicit undefined is rejected, like the engine types); .strict() objects; compile-time ZodType<…> proofs.

// packages/content/src/schemas/common.ts
export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are kebab-case');
const GlobalRef = z.custom<`$${string}` | `-$${string}`>(
  (v) => typeof v === 'string' && /^-?\$[A-Z0-9_]+$/.test(v), { message: 'expected a global reference like "$NAME" or "-$NAME"' });
export const Num: z.ZodType<EngineNum> = z.union([z.int(), GlobalRef]);
export const Stat = z.int().min(0).max(20);

// packages/content/src/schemas/card.ts
export const PlayerMonster = z.object({
  id: Id, type: z.literal('monster'), name: z.string().min(1),
  element: Id, kind: Id, power: Stat, guard: Stat,
  keywords: z.array(Id).max(1).default([]),
  text: z.exactOptional(z.string()),
}).strict();

export const Relic = PlayerMonster.extend({ flaw: Id }).strict();

export const Spell = z.object({
  id: Id, type: z.literal('spell'), name: z.string(), text: z.string(),
  target: z.exactOptional(TargetSpec), effects: z.array(Effect).min(1),
}).strict();

export const Trap = z.object({
  id: Id, type: z.literal('trap'), name: z.string(), text: z.string(),
  trigger: z.enum(['enemyAttack', 'enemyDirectAttack', 'allyDestroyed', 'enemyGraft']),
  when: z.exactOptional(Cond), effects: z.array(Effect).min(1),
}).strict();

export const SpellDefShape: z.ZodType<SpellDef> = Spell;   // compile-time proof against the engine DSL (D-120)
export const TrapDefShape: z.ZodType<TrapDef> = Trap;

// effect.ts — discriminated union on `op`, mirroring §9.1 exactly
const opt = z.exactOptional;
export const Effect = z.discriminatedUnion('op', [
  z.object({ op: z.literal('draw'), who: Who, n: Num, if: opt(Cond) }).strict(),
  z.object({ op: z.literal('damage'), who: Who, n: Num, if: opt(Cond) }).strict(),
  z.object({ op: z.literal('heal'), who: Who, n: Num, if: opt(Cond) }).strict(),
  z.object({ op: z.literal('modifyStats'), target: Ref, power: opt(Num), guard: opt(Num), duration: Duration, if: opt(Cond) }).strict(),
  z.object({ op: z.literal('destroy'), target: Ref, if: opt(Cond) }).strict(),
  z.object({ op: z.literal('returnToHand'), target: Ref, if: opt(Cond) }).strict(),
  z.object({ op: z.literal('changePosition'), target: Ref, to: z.enum(['attack', 'guard']), if: opt(Cond) }).strict(),
  z.object({ op: z.literal('preventAppraisal'), target: Ref, duration: z.literal('untilYourNextTurn'), if: opt(Cond) }).strict(),
  z.object({ op: z.literal('cancelAttack'), if: opt(Cond) }).strict(),
]);

// collector.ts — closed enums for collector.json › ai (D-145); packages/ai has a test that its rule registry
// equals AI_PLAY_RULES ∪ AI_ATTACK_RULES
export const AI_PLAY_RULES = z.enum(['winThisTurn', 'summonAce', 'summonBeater', 'setTrapWhenBehind',
  'castHighValueSpell', 'summonFallback', 'utility']);
export const AI_ATTACK_RULES = z.enum(['lethal', 'killWithoutLoss', 'faceDownIfStrong', 'directIfEmpty',
  'holdExceptVain', 'attackAnything']);
export const AI_REPOSITION = z.enum(['toAttackIfUsable', 'allAttack']);
// params: setTrapWhenBehind.compare ∈ {fewer, fewerOrEqual}; summonBeater.compare ∈ {previewAttack};
// summonFallback.position/slowPosition ∈ {attack, guard, guardUnlessBeater} / {attack, guard}; slowPick ∈ {highestGuard};
// castHighValueSpell.*.pick ∈ {highestPower}; .when ∈ {contestedAttack}; utility.order[] ∈ {castDrawSpell, setTrap, pass};
// tieBreak[] ∈ {leftmostSlot, cardId, instanceId}

// globals.ts — GlobalsSchema: a strict object for every Globals key, proof `z.ZodType<Globals>`, plus the
// "globals sanity" refinements of §10.3 (D-147)

// element.ts
export const Element = z.object({
  id: Id, name: z.string(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), icon: z.string().min(1),
  beats: z.array(Id), identity: z.string(),
}).strict();

// recipe.ts
export const Recipe = z.object({ id: Id, name: z.string(), kinds: z.tuple([Id, Id]), power: Stat, guard: Stat }).strict();
```

### 10.3 Validator rules (`validate.ts`)

Error format, one line per problem, all problems reported at once, non-zero exit:

```
<file> › <entry id or index> › [<field>: ]<problem> › <how to fix>
```

Parse errors come from zod 4 issues rendered by `load.ts › describeIssue` (D-146). Cross-file rules produce the same record shape. `load.ts › formatError` leaves out the `<field>: ` part when the problem concerns the whole entry (field `''`, D-165).

| Rule | Example message |
| --- | --- |
| zod parse error | `cards/player-monsters.json › kiln-whelp › power: expected number, got "7" › write numbers without quotes` |
| unknown AI rule id / param value (zod enum, D-145) | `collector.json › ai › play.[2]: got "summonBeeter" › use one of: winThisTurn, summonAce, summonBeater, …` |
| AI card refs (D-145) | `collector.json › ai › trapPreference.[1]: "snare" is not a Collector trap in the deck › use a trap id from collector.json › deck` (same for `castHighValueSpell` keys and Collector spells) |
| duplicate id (any file, incl. families) | `cards/relics.json › halo-stag › duplicate id (also in cards/player-monsters.json) › rename one of them` |
| unknown element/kind | `cards/player-monsters.json › stormcrow › unknown element "wind" › use one of: ember, gale, tide, lumen, umbra, or add it to elements.json` |
| unregistered keyword/Flaw | `cards/relics.json › reliquary-hound › keyword "hant" is not registered › use one of: echo, haunt, pierce, sentinel, swift, ward, or add packages/content/keywords/hant.ts` |
| Flaw on a player card / keyword used as Flaw | `cards/player-monsters.json › halo-stag › Flaws appear only on Relics › remove "flaw"` |
| Relic without exactly one Flaw | `cards/relics.json › stormglass-hydra › needs exactly 1 flaw, has 0 › add "flaw": "<id>"` |
| base card with > 1 keyword | `cards/player-monsters.json › x › 2 keywords, max MAX_BASE_KEYWORDS=1 › remove one` |
| stat budget (D-109) | `cards/player-monsters.json › kiln-whelp › budget 11 (P7+G3+1×kw) outside 8–10 › lower Power or Guard by 1` |
| missing kind-pair recipe | `recipes.json › (construct, wisp) › no Chimera recipe for this kind pair › add {"kinds":["construct","wisp"], …}` |
| duplicate kind-pair recipe | `recipes.json › packmaw-2 › pair (beast, beast) already defined by packmaw › delete one` |
| element `beats` unknown / missing color or icon | `elements.json › umbra › beats unknown element "lumin" › use an id from elements.json` |
| Collector deck ≠ 20 | `collector.json › deck › has 19 cards, needs COLLECTOR_DECK_SIZE=20 › add 1 card id` |
| unknown deck reference / wrong pool | `collector.json › deck[4] › "halo-stag" is a player card › use a card from relics.json or collector-*.json` |
| Covetous off the ace | `cards/relics.json › ashen-duchess › Covetous is ace-only › change flaw or set collector.json ace` |
| unknown global ref in effect | `cards/player-spells.json › unmake › "$UNMAKE_MAX_POWR" not in globals.ts › did you mean $UNMAKE_MAX_POWER?` |
| effect/target mismatch | `cards/player-spells.json › bloodlust › effect uses target "chosen" but card has no "target" › add a target spec`; the reverse: `… › has a "target" but no effect uses "chosen" › remove "target" or use "chosen" in an effect` (D-164) |
| spell ref other than `chosen` (D-163) | `cards/player-spells.json › x › ref "attacker" is not available for spells › use "chosen" with a target spec` |
| trap ref not available for trigger (§9.1 table, D-163) | `cards/player-traps.json › x › ref "grafted" is not available for trigger "enemyAttack" › use attacker or defender` |
| `cancelAttack` outside an attack-trigger trap (D-163) | `cards/player-spells.json › x › "cancelAttack" only works in a trap with trigger enemyAttack or enemyDirectAttack › remove it or change the trigger` |
| card text > one sentence | `cards/... › id › text has 2 sentences › shorten to one sentence` |
| art brief missing / orphan | `art-briefs.json › gale-serpent › missing art brief › add a one-line "mood · pose · palette"` / `art-briefs.json › x › orphan brief, no card or Chimera family has this id › delete the entry` (D-164) |
| objective metric unknown | `objectives.json › win-fast › unknown metric "rounds" › use one of: grafts, playerLife, round, appraisedLost` |
| keyword file problems | `keywords/haunt.ts › id "haunted" ≠ file name › rename the file or the id` / `keywords/index.gen.ts › stale › run pnpm content:gen` |
| deckgen feasibility | `cards/player-monsters.json › pool › deck constraints unsatisfiable on 3 of 1000 test dates › relax DECK_MIN_KINDS or add monsters` |
| globals sanity (`GlobalsSchema`, D-147) | `globals.ts › APPRAISAL_ROUNDS › round 13 > MAX_ROUNDS=12 › remove it`; also every `Range` has min ≤ max, and `WARD_CHARGES` must be 1 until the engine has a charge counter (D-133) |
| delete-a-card reverse refs | `collector.json › deck[7] › "kiln-born-leviathan" no longer exists › remove the reference` |

Pool-size expectations (25/6/4) are warnings, not errors, so content can grow: `cards/player-monsters.json › pool › has 24 monsters, expects POOL_MONSTERS=25 › add or remove monsters, or change POOL_MONSTERS in globals.ts` (D-164).

---

## 11. `globals.ts`

```ts
// packages/content/src/globals.ts
import { deepFreeze } from '@vault-duel/engine';        // one implementation, engine/src/freeze.ts (D-147)
import type { Globals } from '@vault-duel/engine';
import { GlobalsSchema } from './schemas/globals';     // used by withOverrides (D-147)

export const DEFAULT_GLOBALS = deepFreeze({
  // Identity & seeding
  CONTENT_VERSION: '0.1.0', SEED_PREFIX: 'vault-duel',
  // Life & length
  PLAYER_LIFE: 20, COLLECTOR_LIFE: 25, MAX_ROUNDS: 12,
  // Decks
  PLAYER_DECK_SIZE: 24, COLLECTOR_DECK_SIZE: 20,
  COLLECTOR_DECK_MONSTERS: 13, COLLECTOR_DECK_SPELLS: 4, COLLECTOR_DECK_TRAPS: 3,
  DECK_MONSTERS: 15, DECK_SPELLS: 5, DECK_TRAPS: 4, MAX_COPIES: 2,
  POOL_MONSTERS: 25, POOL_SPELLS: 6, POOL_TRAPS: 4,              // validator warnings only
  // Hand, draw, turn
  OPENING_HAND: 5, HAND_SIZE: 5, MAX_DRAW_PER_TURN: 2, REDRAWS: 1, OPENING_MIN_MONSTERS: 2,
  FIRST_ATTACK_ROUND_PLAYER: 2, PLAYS_PER_TURN: 1, REPOSITIONS_PER_TURN: 1, ATTACKS_PER_TURN: 1,
  // Board
  BOARD_SLOTS: 3, TRAP_SLOTS: 2,
  // Combat
  ELEMENT_BONUS: 2, STAT_FLOOR: 0,
  // Keywords & Flaws
  MAX_BASE_KEYWORDS: 1, MAX_INHERITED_KEYWORDS: 2, WARD_CHARGES: 1,
  HAUNT_PENALTY: 2, TETHERED_PENALTY: 2, RELIC_FLAWS: 1, SLOW_TURNS: 1,   // 1 = DESIGN as written; 2 = proposal M-01
  // Graft
  MIN_GRAFT_MATERIALS: 2, MAX_GRAFT_MATERIALS: 3, ASCEND_POWER: 2, ASCEND_GUARD: 1,
  UNSTABLE_BONUS: 3, UNSTABLE_EXPIRY_TURNS: 2,            // destroyed at end of turn + 2 ("your next turn")
  UNSTABLE_EXPIRY: 'endOfNextOwnTurn',                    // DESIGN; 'startOfOwnTurnAfterNext' = proposal M-02
  // Stat budget & text
  STAT_BUDGET_MIN: 8, STAT_BUDGET_MAX: 10, KEYWORD_COST: 1, MAX_TEXT_SENTENCES: 1,
  // Player spells & traps
  UNMAKE_MAX_POWER: 5, BLOODLUST_POWER: 3, SCRYING_DRAW: 2, SIPHON_DRAIN: 3, SIPHON_GAIN: 3,
  MIRROR_SIGIL_PENALTY: 3, LAST_RITES_DRAW: 1,
  // Collector spells & traps
  PROVENANCE_DRAW: 2, GILT_POWER: 2, GILT_GUARD: 2, FORFEIT_MAX_POWER: 4,
  COUNTERFEIT_PENALTY: 3, INSURANCE_HEAL: 3,
  // Durations (turn-index offsets)
  DURATION_NEXT_OWN_TURN: 2,
  // Appraisal
  APPRAISAL_ROUNDS: [3, 6, 9], APPRAISAL_MIN_POWER: 7,
  // Moods (Composed = above AGITATED_AT)
  MOOD_AGITATED_AT: 15, MOOD_DESPERATE_AT: 7,
  // Collector AI numbers from DESIGN
  AI_FACEDOWN_ATTACK_MIN_POWER: 7,
  // Deck generation
  DECK_MIN_ELEMENTS: 3, DECK_MIN_KINDS: 4,
  CURVE_LOW_MAX_POWER: 5, CURVE_LOW_MIN_COUNT: 4, CURVE_HIGH_MIN_POWER: 6, CURVE_HIGH_MIN_COUNT: 3,
  DECKGEN_MAX_ATTEMPTS: 1000, SHUFFLE_MAX_ATTEMPTS: 1000,
  // Difficulty check
  SIM_RUNS_PER_SEED: 500, SEED_WINRATE_MIN: 0.30, SEED_WINRATE_MAX: 0.70,
  SEED_MAX_REROLLS: 20, BOT_NOISE_EPSILON: 0.10, DIFFICULTY_STAR_CUTS: [0.5667, 0.4333],
  // Daily loop
  RESET_HOUR_LOCAL: 0, OBJECTIVES_PER_DAY: 3, OBJECTIVE_STARS_MAX: 3,
  OBJ_HIGH_LIFE: 15, OBJ_WIN_BY_ROUND: 8,
  // Balance targets (sim report pass/fail)
  TARGET_EXPERT_WINRATE: [0.45, 0.55], TARGET_NOVICE_WINRATE: [0.20, 0.30], TARGET_NOVICE_POINT: 0.25,
  TARGET_MEDIAN_ROUNDS: [9, 11], TARGET_TYPICAL_END_ROUNDS: [8, 12],
  TARGET_FULL_LENGTH_SHARE: [0.15, 0.30], TARGET_GRAFTS_PER_WIN: [1.5, 3],
  TARGET_APPRAISAL_SUCCESS: [0.30, 0.60], TARGET_UNPRICED_APPEARS: [0.20, 0.40], TARGET_SEED_REJECT_MAX: 0.15,
  TARGET_DUEL_MINUTES: [3, 5], TARGET_RULES_LEARN_SECONDS: 60,
  // Simulator
  SIM_QUICK_GAMES: 2000, SIM_FULL_GAMES: 50000, SIM_SEED_CHECK_DATES: 60,
  PERF_DUELS_PER_SEC_PER_CORE: 1000,
  // Engine safety
  MAX_TRIGGER_CHAIN: 64,
  // Feature flags
  FLAGS: {
    ASCEND: true, UNSTABLE: true, APPRAISAL: true, MOODS: true, INTENTS: true,
    WEEKLY_TWIST: false, REDRAW: true, BONUS_OBJECTIVES: true, ANIMATIONS: true, DEBUG_OVERLAY: false,
    // Proposal levers (DECISIONS §M): these defaults = DESIGN as written (CHIMERA_TO_HAND: true allows Echo/Grave
    // Recall of Chimeras per D-046/D-068; false = M-12). Changed only for sim A/B until the owner adopts one.
    APPRAISED_ENTERS_GUARD: false, ACE_SET_ASIDE: false, CHIMERA_TO_HAND: true,
  },
} as const satisfies Globals);

export function withOverrides(base: Globals, sets: readonly string[]): Globals; // "KEY=VALUE", "FLAGS.ASCEND=false",
// "APPRAISAL_ROUNDS=[3,6]"; each VALUE is JSON-parsed (a bare word is a string); unknown keys are rejected; the merged
// object is validated with GlobalsSchema (schemas/globals.ts, incl. sanity checks) and returned deep-frozen (D-147).
// Card stat overrides ("card.kiln-whelp.power=6") live in sim/overrides.ts and are applied to raw content before compile.
```

Where things live (D-147): `deepFreeze` is in `packages/engine/src/freeze.ts` and exported from the engine root. It is the engine's one order-insensitive key iteration, with a documented lint exception. `GlobalsSchema` is in `packages/content/src/schemas/globals.ts`. `DEFAULT_GLOBALS` and `withOverrides` are in `packages/content/src/globals.ts`, exported from the content root. The engine's test copy `packages/engine/test-utils/globals.ts › TEST_GLOBALS` must equal `DEFAULT_GLOBALS` except for its `CONTENT_VERSION` suffix `-fixture`, which a content test enforces (D-143).

`Globals` is an engine-side interface (`packages/engine/src/types/globals.ts`, widened types of the object above), so the engine is typed against it without importing content. The widening (D-126) is: numbers → `number` and strings → `string`. Min/max pairs (`TARGET_*`) → `Range = readonly [number, number]`, with the sanity check `min ≤ max`. `DIFFICULTY_STAR_CUTS` → `StarCuts = readonly [number, number]` (descending cuts, not a range). `APPRAISAL_ROUNDS` → `readonly number[]`. `UNSTABLE_EXPIRY` → `'endOfNextOwnTurn' | 'startOfOwnTurnAfterNext'`. `FLAGS` → `Flags`: 13 booleans, DESIGN's 10 plus the 3 proposal levers. `NumericGlobal` (the keys whose type is `number`) is the set of names an effect `Num` ref (`"$NAME"`) may use (D-120). Globals and content are bound into the engine by `createEngine(compiled, globals, policies, options)`; a hash of both is stored in `state.cfg` and checked on replay.

DESIGN numbers that are content rather than globals (with reason, D-074): monster/Relic Power/Guard (card JSON), Chimera family stats (recipes.json), weekly-twist values (twists.json). All are overridable from the sim.

---

## 12. RNG, seeding and deck generation

### 12.1 RNG

```ts
// packages/engine/src/rng.ts
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Mutable generator used inside setup and engine code; state is read back into GameState.rng.
 *  Two entry points only (D-125): from(key) starts a stream, restore(rng) resumes one. */
export class Sfc32 {
  private a: number; private b: number; private c: number; private d: number;
  private constructor(a: number, b: number, c: number, d: number) {   // raw state, never warms up
    this.a = a | 0; this.b = b | 0; this.c = c | 0; this.d = d | 0;
  }
  static from(key: string): Sfc32 {                           // cyrb128 + 15 warm-up rounds
    const [a, b, c, d] = cyrb128(key);
    const r = new Sfc32(a, b, c, d);
    for (let i = 0; i < 15; i++) r.next();
    return r;
  }
  static restore(s: Rng): Sfc32 { return new Sfc32(s[0], s[1], s[2], s[3]); }   // exact resume from state()
  next(): number {                                            // uint32
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }
  int(n: number): number { return Math.floor((this.next() * n) / 4294967296); } // exact: product < 2^53
  shuffle<T>(arr: T[]): void { for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); const x = arr[i]!; arr[i] = arr[j]!; arr[j] = x; } }
  state(): Rng { return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0]; }
}
```

### 12.2 Seed

`seedString = SEED_PREFIX + ":" + date + ":" + CONTENT_VERSION` (D-001). Reroll k: `seedString + "#" + k` (D-003). Streams: `Sfc32.from(seedString + "#" + k + "/" + purpose)` for `deck`, `shuffle-player`, `shuffle-collector`, `signature`, `objectives`, `twist`, `engine` (D-002). The date comes from the caller (web: local date or dev override; sim: CLI); the engine never reads a clock.

### 12.3 Deck generation (`setup/deckgen.ts`) — D-005

```
for attempt in 1..DECKGEN_MAX_ATTEMPTS:            // continuing the 'deck' stream
  monsters = pickWithCap(pool.monsters, DECK_MONSTERS, MAX_COPIES)
  if elements(monsters) ≥ DECK_MIN_ELEMENTS && kinds(monsters) ≥ DECK_MIN_KINDS
     && count(power ≤ CURVE_LOW_MAX_POWER) ≥ CURVE_LOW_MIN_COUNT && count(power ≥ CURVE_HIGH_MIN_POWER) ≥ CURVE_HIGH_MIN_COUNT:
       spells = pickWithCap(pool.spells, DECK_SPELLS, MAX_COPIES); traps = pickWithCap(pool.traps, DECK_TRAPS, MAX_COPIES)
       return sortDeckList([...monsters, ...spells, ...traps])     // D-006
throw ContentError
```

### 12.4 Shuffles and opening hands (`setup/shuffle.ts`) — D-007, D-008

```
player:    shuffle until windows [0,5) and [5,10) (one per REDRAWS) each have ≥ OPENING_MIN_MONSTERS monsters
collector: shuffle until window [0,5) has ≥ OPENING_MIN_MONSTERS monsters
max SHUFFLE_MAX_ATTEMPTS, then deterministic repair swap
```

`newGame()` then deals 5 to each side and sets `step: 'mulligan'`. `redraw` moves the hand to the bottom (in order) and draws the next 5 (positions 5–9 of the original order, which the guarantee covered).

### 12.5 Signature card, objectives, twist

`signature` stream picks among distinct monster ids in the deck (D-010); `objectives` stream picks `OBJECTIVES_PER_DAY` distinct objectives (D-102); twist by ISO week (D-103). These live in `DailySetup = { seedString, k, deckList, signature, objectives, twist, difficulty: { winRate, stars, par } }`, computed by `ai/difficulty.ts › prepareDay(date)`, not in `GameState`.

---

## 13. Collector AI (`packages/ai/src/collector`)

### 13.1 Redacted view (no hidden information)

The AI never receives `GameState`. It receives an accessor facade that can only answer public questions plus his own private ones; enemy cards are referenced by slot (D-086).

```ts
export interface CollectorView {
  readonly turn: number; readonly round: number; readonly mood: Mood;
  readonly myLife: number; readonly foeLife: number;
  readonly appraisalRoundsLeft: readonly number[];
  // his own side (fully known to him)
  readonly hand: readonly OwnCard[];                 // id, type, stats, keywords, flaw
  readonly board: readonly (OwnMonster | null)[];    // effective stats, pos, flags (entered, attacked, ward…)
  readonly traps: readonly (OwnCard | null)[];
  readonly vault: readonly OwnCard[];
  readonly discard: readonly OwnCard[];
  readonly deckCount: number;                        // order unknown even to him
  // the player's side (public only)
  readonly foeHandCount: number; readonly foeDeckCount: number;
  readonly foeDiscard: readonly PublicCard[];
  readonly foeBoard: readonly (FoeMonster | null)[]; // FoeMonster = PublicMonster | { faceDown: true; slot: number }
  readonly foeTrapSlots: readonly boolean[];         // occupied or not
  // decisions: engine legal actions translated 1:1 (enemy refs by slot, face-down without identity)
  readonly choices: readonly ViewChoice[];
  previewAttack(attackerSlot: number, foeSlot: number | 'direct'): CombatEstimate; // public info only
}
```

`ai/collector/view.ts` builds it from `GameState`; a unit test asserts that two states differing only in hidden information (player hand, deck order, face-down identities, player trap identities) produce identical views.

### 13.2 Data-driven priorities (`collector.json › ai`)

```json
{
  "allowFaceDown": false,
  "reposition": "toAttackIfUsable",
  "play":   ["winThisTurn", "summonAce", "summonBeater", "setTrapWhenBehind", "castHighValueSpell", "summonFallback", "utility"],
  "attack": ["lethal", "killWithoutLoss", "faceDownIfStrong", "directIfEmpty", "holdExceptVain"],
  "params": {
    "setTrapWhenBehind": { "compare": "fewer" },
    "summonFallback": { "position": "attack", "slowPosition": "guard", "slowPick": "highestGuard" },
    "faceDownIfStrong": { "minPower": "$AI_FACEDOWN_ATTACK_MIN_POWER" },
    "killWithoutLoss": { "allowTrades": false },
    "castHighValueSpell": {
      "forfeit": { "pick": "highestPower" },
      "restoration": { "pick": "highestPower" },
      "gilt-frame": { "when": "contestedAttack" }
    },
    "summonBeater": { "compare": "previewAttack", "skipBrittleCountered": false },
    "utility": { "order": ["castDrawSpell", "setTrap", "pass"] }
  },
  "moods": {
    "composed":  { "params": { "setTrapWhenBehind": { "compare": "fewerOrEqual" }, "summonFallback": { "position": "guardUnlessBeater" } },
                   "attack": ["lethal", "killWithoutLoss", "directIfEmpty", "holdExceptVain"] },
    "agitated":  { "play": ["winThisTurn", "summonAce", "castHighValueSpell", "summonBeater", "setTrapWhenBehind", "summonFallback", "utility"],
                   "params": { "killWithoutLoss": { "allowTrades": true } } },
    "desperate": { "attack": ["lethal", "attackAnything"], "params": { "faceDownIfStrong": { "minPower": 0 } }, "reposition": "allAttack" }
  },
  "trapPreference": ["display-case", "insurance-claim", "counterfeit"],
  "tieBreak": ["leftmostSlot", "cardId", "instanceId"]
}
```

`reposition: "toAttackIfUsable"` = a guard monster switches to attack only if that gives it a rule 1, 2 or 4 attack; never attack → guard (D-089). `summonBeater.compare: "previewAttack"` = "beats" means `previewAttack` with post-summon stats and element bonus (D-083); `skipBrittleCountered` is the A/B switch for proposal M-10. Each rule id maps to a function in `ai/collector/rules/<id>.ts`: `(view, params) → ViewChoice | null`. Rule ids, reposition modes and string parameter values are closed zod enums in `content/src/schemas/collector.ts` (§10.2). A test in `packages/ai` asserts that the rule registry equals `AI_PLAY_RULES ∪ AI_ATTACK_RULES`, so a typo fails `content:check` and a missing rule file fails the tests (D-145). The policy walks the mood's list (mood overrides merge over the base) and takes the first non-null choice; if none, `endTurn` (or the forced Vain attack — `holdExceptVain` returns Vain attacks via `bestTarget`, D-091). Rule semantics: D-081…D-093.

### 13.3 Turn procedure

```
1. reposition (D-089)          → zero or more reposition choices
2. play rule list              → at most one play
3. attack rule list, repeated  → attackers in descending Power (D-090) until a rule returns null
4. endTurn
```

The policy is a pure function of the view, so the Collector is deterministic. The sim and web share the same policy.

### 13.4 Moods and intents

- Mood: engine (`mood.ts`) computes from life (D-080), emits `MoodChanged`; AI reads `view.mood`. Dialogue from `collector.json › dialogue` (D-097).
- Intent: `ai/collector/intent.ts › intentPolicy: IntentPolicy` takes the `GameState`, builds `collectorView(s)` first, then simulates the rule lists on that view (no hidden info) and returns `appraise | attack | scheme | guard` with the priority in D-095. It is injected into the engine (D-096, D-150; required when `FLAGS.INTENTS` is on), stored in `state.collector.intent`, and shown by `IntentBadge`.

---

## 14. Player bots (`packages/ai/src/bots`)

All bots see a `PlayerView` (mirror of §13.1: own hand/board/traps, the Collector's public info, hand count, his set-trap count, the intent, mood) and choose an index from `getLegalActions`.

| Bot | Policy | Use |
| --- | --- | --- |
| novice | uniform random legal action (pending Graft steps included) (D-117) | target 20–30% |
| greedy | one-ply: apply each legal action on a determinized copy, score with `evaluate()`, take best (D-116) | diagnostic line |
| expert | per turn, enumerate turn plans = {reposition subsets} × {play options incl. full Graft variants} × greedy attack ordering; score end-of-turn positions with `evaluate()` (life diff, board power, Appraisal exposure next Collector turn, Unstable timers, trap count, element matchups, Collector Sentinels); hidden Collector hand treated as unknown (no peeking) | target 45–55%; difficulty-check reference with ε-noise (D-094) |

Weights live in `bots/expert.weights.json` (tunable without code). The expert's plan enumeration is bounded (≤ ~400 plans/turn with launch content) and uses `previewCombat`/`previewGraft`, not full engine clones, to stay within the performance budget.

---

## 15. Simulator (`packages/sim`)

**CLI** (`cli.ts`):

```
sim quick  [--games 2000] [--from DATE] [--bots expert,novice] [--set K=V]… [--workers N] [--out DIR]
sim full   [--games 50000] [--seed-dates 60] [--from DATE] …
sim seed   <YYYY-MM-DD>  [--set K=V]…        # prints the difficulty check, rerolls, stars, par
```

**Run model**: a job = `(seedString, k, botId, runIndex)`; each duel is fully determined by its job, so results do not depend on worker count or scheduling. Bot noise seeds per D-094.

**Worker pool** (`pool.ts`, `worker.ts`): `node:worker_threads`, `N = os.availableParallelism() − 1` (min 1). Each worker loads + compiles content once (with `--set` overrides applied), creates the engine with `{ events: false, log: false, trusted: true }`, receives job batches of ~250 duels, and returns **aggregates only** (counts, sums, fixed-bin histograms), never per-game logs. Aggregation is commutative (sums/histograms), medians/percentiles are computed from histograms, so output is byte-identical across runs.

**Difficulty check** (`difficulty-batch.ts` → `ai/difficulty.ts › rateSeed`): for k = 0..SEED_MAX_REROLLS: run `SIM_RUNS_PER_SEED` expert-with-noise duels; accept if `SEED_WINRATE_MIN ≤ wr ≤ SEED_WINRATE_MAX`; stars and par per D-098/D-100; fallback per D-004. `sim full` runs it for `SIM_SEED_CHECK_DATES` consecutive dates and reports rejection rate.

**Proposal A/B runs**: `sim full --ab <proposal-id>` runs the same dates and runs twice: baseline, then with the proposal's lever applied. The levers for DECISIONS §M (M-01…M-16) are `--set` globals/flags, card overrides, or alternate `collector.json` fields. Each lever defaults to the DESIGN-as-written value in `globals.ts` (`FLAGS.APPRAISED_ENTERS_GUARD`, `FLAGS.ACE_SET_ASIDE`, `FLAGS.CHIMERA_TO_HAND`, `UNSTABLE_EXPIRY`, `SLOW_TURNS`) and does nothing until the owner adopts it. The report prints the target metrics side by side.

**Reports** (`report.ts`): `docs/reports/<cmd>-<date>.md` + `.json` with every DESIGN balance metric against its `TARGET_*` global (pass/fail), plus: win rate by bot, round-length histogram, share ending in round 12, grafts per winning game, Appraisal success rate, Unpriced appearance rate, seed rejection rate, intent accuracy, per-card play/win deltas, per-keyword trigger counts, duels/sec, and the exact globals/overrides/content hash used.

---

## 16. Web app (`apps/web`)

- **Store** (Zustand): `duel` store holds `GameState`, the `DailySetup`, and an animation queue fed by events. Input is never blocked by animations: a new action is accepted immediately and pending animations fast-forward (`FLAGS.ANIMATIONS` off ⇒ instant). The Collector's turn runs synchronously through the policy; its events are animated afterwards.
- **Screens**: Home (deck list, difficulty stars, Appraisal reminder, start), Duel (board, hand, Graft preview, intent badge, Appraisal countdown, card inspect, mood dialogue), Result (win/loss, rounds used vs par, life left, objective stars, share), Binder. Practice reuses Duel with a `practice` flag (D-105).
- **Graft UI** drives the pending-choice actions and renders `previewGraft()` before `graftPosition` commits; Cancel maps to `graftCancel`.
- **Accessibility**: element badge always renders color + icon; keyword frames from `KeywordDef.visual`; portrait, one-handed, tap-only (no drag required).
- **Placeholder art**: SVG generated from element color, kind silhouette and name; replaced automatically when `public/art/<id>.webp` exists.
- **Daily**: `daily/date.ts` (local date, `?date=` override), `difficulty.worker.ts` runs `prepareDay` (D-099), `session.ts` persists `{seedString, k, contentVersion, actions}` after every action and resumes by replay (D-108).
- **Persistence**: localStorage wrapped in try/catch; Binder (signature cards + families), stats, streaks (D-106).
- **Share**: `meta/share.ts` builds one emoji per round from `state.track.round` (priority D-101) plus rounds used vs par.
- **PWA**: `vite-plugin-pwa`, offline cache, portrait manifest. `FLAGS.DEBUG_OVERLAY` shows state, legal actions, the Collector's chosen rule, and the seed.

---

## 17. Testing and the board-state DSL

**Layers**: unit tests per engine module; scenario tests written in the board DSL; auto-generated keyword tests from each `KeywordDef.examples`; fast-check properties; golden replays; content validator tests; `bench`.

**Properties (fast-check)**: random seeds × random legal-action walks: (1) every action from `getLegalActions` applies without throwing; (2) card conservation (§4); (3) board ≤ BOARD_SLOTS, traps ≤ TRAP_SLOTS, hand/deck/discard sizes consistent with conservation; (4) `replay(seed, toActions(s))` hashes equal to `s`; (5) the game ends within 2×MAX_ROUNDS turns; (6) Collector view invariance under hidden-info changes; (7) `isLegal` agrees with `getLegalActions` membership.

**Board-state DSL** (`packages/engine/test-utils/board-dsl.ts`): a line-based text format parsed into a valid `GameState` (unspecified zones get filler cards so conservation holds).

```
# setup
turn 6                       # turn index (round 4, player). Or: round 4 collector
step main                    # main | attack (default main)
played no
P life 14
P hand kiln-whelp unmake
P deck *                     # filler; or explicit list, top first
P board [gilded-wyrmling A] [cinderjaw-hound A new] [-]
P traps [snare] [-]
C life 25
C hand gilt-frame
C board [weeping-automaton G ward-used] [ashen-duchess A p-2] [-]
C traps [display-case] [-]
C vault [halo-stag appraised]

# actions (applied in order through applyAction; must be legal)
do attack P0 > C1
do cast unmake > C1
do graft P0 hand:kiln-whelp | ascend hand:brine-lurker | kw pierce,haunt | pos A
do end

# expectations
expect C life 22
expect C1 empty
expect P0 power 6
expect event Destroyed C1
expect legal attack P1 > C0
expect illegal attack P1 > face
```

Monster token: `[<card-id> <A|G|D> flags…]` where `D` = face-down guard. Flags: `new` (entered this turn), `moved` (repositioned this turn), `done` (attacked this turn), `ward-used`, `p±N` / `g±N` (permanent), `p+N@T` (timed until end of turn T), `unstable@T`, `shroud@T`, `appraised`, `chimera(<family>,<element>,<kw,kw>[,asc][,grafted@T])` (`grafted` defaults to the monster's entered turn, D-139). Slots are addressed `P0..P2`, `C0..C2`; `face` = direct.

---

## 18. Performance plan (≥ 1,000 duels/sec/core)

Budget: a duel ≈ 24 turns × ~6–8 actions ≈ 150–200 actions incl. AI decisions ⇒ ≤ 1 ms/duel ⇒ ~5 µs per action including legality and AI.

1. **Dense compiled content**: typed arrays for stats/elements/kinds/keyword masks; advantage and recipe lookups are single array reads; keywords are bit masks.
2. **Copy-on-write `Tx`**: `applyAction` opens a transaction over the frozen-by-convention state; the first write to a path copies only that path (root → `sides` tuple → one `SideState` → one array of ≤ 24 items → one `Monster` of 14 fields). Untouched branches are shared by reference. No `structuredClone`, JSON round-trips, or immer. API and caller contract: §4.1 (D-128).
3. **Turn indices instead of flags**: no per-turn reset loops; timed modifiers expire lazily.
4. **No per-action allocation for options**: events off (`{ events: false }` returns a shared empty array and `emit` is a no-op), log off, `{ trusted: true }` skips `isLegal`.
5. **Legal action buffer**: `forEachLegal(state, visit)` lets bots count/choose without materializing arrays; `getLegalActions` (UI) materializes.
6. **Hook fast path**: `activeKw & hookMask[hook]` before any call; ≤ 10 subscribers scanned per event.
7. **Monomorphic objects**: every `Monster`/`SideState` created by one factory with all fields in fixed order (stable hidden classes); integer-only math.
8. **AI on the facade**: the Collector view is an accessor object over the state (lazy), not a deep copy; `previewCombat` instead of engine clones for evaluations.
9. **Dev-only safety**: dev mode is the explicit engine option `createEngine(…, { dev: true })`, stored as `Env.dev`. The engine never reads `process.env` (§1.2). Tests, board-DSL fixtures and the web dev build set it; the sim and production web don't. In dev mode every committed state is `deepFreeze`d and each `CombatSnapshot` is `Object.freeze`d before `beforeCombat`, so a hook that writes throws (D-141). `isLegal` validation is skipped only with `{ trusted: true }` (§6.2).
10. **Measurement**: `pnpm bench` runs 5,000 expert-vs-Collector duels single-threaded and fails below `PERF_DUELS_PER_SEC_PER_CORE`; the sim report prints duels/sec/core. Profiling hot spots with `--cpu-prof` before optimizing further.
11. **Worker threads**: §15; linear scaling expected because workers share nothing and return aggregates.

---

## 19. Determinism and review checklist (applied to every engine PR)

- [ ] No `Math.random`, `Date`, `performance.now`, timers, DOM, Node APIs in engine/content keywords/ai (ESLint `no-restricted-globals`/`no-restricted-properties`).
- [ ] No `for…in`, `Object.keys/values/entries` or `Map`/`Set` iteration whose order affects outcomes (arrays and slot order only). The single allowed exception is `freeze.ts › deepFreeze`, which doesn't depend on order (D-147).
- [ ] Dev-only checks go through `Env.dev`, never `process.env` (D-141).
- [ ] Only integer arithmetic in rules; `Sfc32.int` is the only float operation and is exact.
- [ ] Every rule number comes from `globals`; every mechanic checks its flag.
- [ ] All state changes go through `Tx` and the effect interpreter; hooks only `effect()` (plus `cancelAttack` and the `beforeCombat` flag setters, §8.2).
- [ ] No array or record read from `tx.state` is held across a later write; targets are collected first (§4.1, D-128).
- [ ] Hook-visible combat data is read-only; `beforeCombat` only raises on-only flags (D-124).
- [ ] Legality changes only in `legal.ts`/query hooks; UI/AI/bots never re-implement legality.
- [ ] New keyword = one file + icon + examples; new card = JSON only.
- [ ] No card, keyword or Flaw id literals in `packages/engine/src`: find mechanics by hook (Ward → `beforeDestroy`) or by compiled content (`c.collector.ace`) (D-162).
- [ ] Property tests and the bench pass.

---

## 20. Traceability: DESIGN.md → implementation

Engine paths are under `packages/engine/src/`, content under `packages/content/`, AI under `packages/ai/src/`, sim under `packages/sim/src/`, web under `apps/web/src/`.

### Overview and pillars

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| OV-1 | Daily: same seeded 24-card deck, one attempt, beat the Collector within 12 rounds | `setup/*`, `turn.ts`, web `daily/session.ts` | D-001, D-017 |
| OV-2 | Duel lasts 3–5 minutes | `globals.TARGET_DUEL_MINUTES`, sim report (actions/duel proxy), web non-blocking animations | — |
| OV-3 | All content is data, changeable without engine code | `packages/content/*`, `compile.ts`, `defineKeyword` | D-074, D-111 |
| OV-4 | Original IP | not code: content review of names/art briefs in `cards/*.json`, `art-briefs.json` | — |
| P-1 | Same game for everyone (both decks from date seed; comparable/shareable) | `setup/seed.ts`, `setup/shuffle.ts`, `meta/share-grid.ts` | D-001…D-003 |
| P-2 | Simple rules, deep combos | rules modules; tutorial out of scope (v0.2) | — |
| P-3 | Boss never cheats, deterministic, telegraphs intent | `ai/collector/view.ts`, `policy.ts`, `intent.ts` | D-082, D-086, D-095 |
| P-4 | Fast: one card per turn, ≤ 12 rounds, no waiting on animations | `legal.ts` (`played`), `turn.ts`, web `anim/` | D-014 |
| LD-1 | Format: duel, hidden draw order, identical seed | `setup/shuffle.ts`, `view/redact.ts` | D-006 |
| LD-2 | The Collector is the only boss; weekly rule twist | `collector.json`, `twists.json`, `stats.ts` (twist modifiers) | D-103 |
| LD-3 | Placeholder art until artist delivers | web `art/placeholder.ts`, `art-briefs.json` | D-110 |
| LD-4 | Graft creates Chimeras | `graft.ts`, `recipes.json` | D-056…D-066 |
| LD-5 | The Binder (cosmetic, signature cards + Chimeras) | web `persistence/binder.ts`, `track.families` | D-010, D-066 |
| LD-6 | Web-first PWA, portrait, one-handed, tap-only | `apps/web` (vite-plugin-pwa) | — |
| LD-7 | Working title (trademark check) | not code — open question tracked in DESIGN | — |

### Core rules

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| CR-1 | Player 20 life / 24 cards; Collector 25 life / 20 cards | `globals`, `setup/initial-state.ts`, validator | — |
| CR-2 | Win by reducing him to 0 before round 12 ends | `pipeline.ts › checkWin`, `turn.ts › endTurn` | D-017, D-018, D-151 |
| SU-1 | Both decks shuffled from daily seed | `setup/shuffle.ts` | D-002 |
| SU-2 | Player sees full 24-card list and difficulty | web `screens/Home.tsx`, `components/DeckList.tsx`, `ai/difficulty.ts` | D-006, D-098 |
| SU-3 | Each side draws 5 | `setup/initial-state.ts` | D-009 |
| SU-4 | One redraw: hand to bottom, next 5 drawn | `reducer.ts` (`redraw`), `legal.ts` (mulligan) | D-008 |
| SU-5 | ≥ 2 monsters in both opening hands (and redraw) | `setup/shuffle.ts` | D-007, D-118 |
| SU-6 | Player first; cannot attack round 1 | `stats.ts › attackPermission` | D-015, D-042, D-142 |
| RD-1 | Round = player turn then Collector turn | `turn.ts` (turn index) | — |
| RD-2 | Draw up to 5, at most 2/turn; effects ignore cap | `turn.ts › drawStep`, `effects/run.ts › draw` | D-011…D-013 |
| RD-3 | Reposition once, not on summon turn; face-down flipped to attack is revealed | `legal.ts`, `reposition.ts` | D-014, D-022, D-023, D-024, D-161 |
| RD-4 | Play one card: summon (atk/grd/face-down), Graft, spell, trap | `legal.ts`, `summon.ts`, `graft.ts`, `effects/run.ts` | D-014, D-021 |
| RD-5 | Attack with each attack-position monster once, then end | `combat.ts`, `legal.ts` | D-033 |
| BD-1 | 3 monster slots, 2 trap slots per side | `globals`, `state.ts` | D-021 |
| BD-2 | Full board blocks summoning | `legal.ts` | — |
| BD-3 | Graft with a board material frees its slot | `graft.ts`, `legal.ts` (slot feasibility) | D-057 |
| CB-1 | Attack-position defender: higher Power destroys lower, loser's owner takes difference; tie destroys both | `combat.ts › resolve` | D-028, D-034 |
| CB-2 | Guard defender: P > G destroys, no damage; P < G attacker's owner takes difference; tie nothing | `combat.ts › resolve` | — |
| CB-3 | Face-down: revealed, then guard | `combat.ts` (reveal step) | D-029, D-037 |
| CB-4 | Empty board: direct attack for full Power | `legal.ts`, `combat.ts` | D-027 |
| CB-5 | Element advantage +2 when attacking only | `stats.ts › advantage`, `combat.ts` | D-029 |
| CB-6 | Keywords and traps resolve before damage | `combat.ts` pipeline, `hooks/dispatch.ts` | D-032 |
| WL-1 | Win when Collector hits 0 | `pipeline.ts › checkWin` | D-018, D-151 |
| WL-2 | Lose at 0 life or when vault seals end of round 12 | `pipeline.ts › checkWin`, `turn.ts › endTurn` | D-017, D-151 |
| WL-3 | Cannot draw → skip, no deck-out loss | `turn.ts › drawStep` | D-013, D-153 |

### Elements and kinds

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| EK-1 | Every monster has one element and one kind | `schemas/card.ts`, validator | — |
| EK-2 | Flat +2 when attacking with advantage; no resistance | `stats.ts`, `globals.ELEMENT_BONUS` | D-029 |
| EK-3 | Beats table (Ember>Gale>Tide>Ember) | `elements.json › beats`, `compile.ts › beats` | — |
| EK-4 | Lumen and Umbra beat each other | `elements.json` (both list each other) | — |
| EK-5 | Color + icon always shown (color-blind safe) | `schemas/element.ts` (both required), web `ElementBadge.tsx` | — |
| EK-6 | Element identities (Ember aggressive …) | `elements.json › identity` (content guidance; sim per-element report) | — |
| EK-7 | Kinds: stat profile + Graft role | `kinds.json`, `recipes.json` | — |
| EK-8 | Adding an element = one entry + matrix row | `elements.json`, validator (beats refs) | — |

### Keywords and Flaws

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| KW-1 | 6 keywords, 5 Flaws at launch | `keywords/*.ts` | D-111 |
| KW-2 | Base cards ≤ 1 keyword | validator, `schemas/card.ts` | — |
| KW-3 | Chimeras inherit up to 2 | `graft.ts`, `globals.MAX_INHERITED_KEYWORDS` | D-059 |
| KW-4 | Keyword shown as visual frame/effect | `KeywordDef.visual`, web `KeywordFrame.tsx` | — |
| KW-5 | Swift | `keywords/swift.ts` (`attackPermission`) | D-041, D-042 |
| KW-6 | Sentinel | `keywords/sentinel.ts` (`restrictTargets`) | D-037, D-038 |
| KW-7 | Pierce | `keywords/pierce.ts` (`beforeCombat`), `combat.ts` | D-039, D-040, D-124 |
| KW-8 | Ward | `keywords/ward.ts` (`beforeDestroy`), `destroy.ts`, `hooks/dispatch.ts › beforeDestroy`, `stats.ts › activeKwOf` | D-034, D-035, D-043, D-044, D-133, D-134 |
| KW-9 | Haunt | `keywords/haunt.ts` (`onDestroyed`) | D-045 |
| KW-10 | Echo | `keywords/echo.ts` (`onDestroyed`), `effects/run.ts › returnToHand` | D-046, D-140 |
| FL-1 | Flaws only on Relics, exactly one each | validator | D-114 |
| FL-2 | Slow | `keywords/slow.ts` (`attackPermission`) | D-053 |
| FL-3 | Vain | `keywords/vain.ts` (`mustAttack`), `legal.ts`, `ai/collector/best-target.ts` | D-052, D-091 |
| FL-4 | Brittle | `keywords/brittle.ts` (`beforeCombat`), `combat.ts` | D-049, D-050 |
| FL-5 | Tethered | `keywords/tethered.ts` (`staticPower`) | D-051 |
| FL-6 | Covetous (ace only) | `keywords/covetous.ts` (`summonRequirement`), `summon.ts`, validator | D-054, D-055, D-114 |
| KW-11 | Card text ≤ one sentence | validator | D-113 |
| KW-12 | New keyword must justify itself vs the six | process: `docs/CONTENT_GUIDE.md` checklist | — |

### Graft system

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| GR-1 | Combine 2 monsters; family by kinds, element by first; it is the turn's play | `graft.ts`, `legal.ts` | D-057 |
| GR-2 | Materials from hand and/or board, in order; board materials sacrificed | `graft.ts` (pending `mat1`/`mat2`) | D-056, D-058 |
| GR-3 | Family = kind pair; element = first material | `recipes.json`, `compile.ts › recipe`, `graft.ts` | — |
| GR-4 | Inherit ≤ 2 keywords; player picks if > 2 | `graft.ts` (`keywords` stage) | D-059 |
| GR-5 | Ascend: second step same turn, same family, +2/+1, may take keyword, max 3 materials | `graft.ts` (`ascend` stage), `globals`, `FLAGS.ASCEND` | D-056, D-060 |
| GR-6 | Unstable: opposing elements → +3 Power, destroyed end of your next turn | `graft.ts`, `turn.ts › endTurn`, `FLAGS.UNSTABLE` | D-061, D-062, D-152 (Ward-saved: bonus lost) |
| GR-7 | Chimera enters attack or guard; normal summoning rules | `graft.ts` (`position`), `attackPermission` | D-022, D-063 |
| GR-8 | Preview before confirming | `graft.ts › previewGraft`, web `GraftPreview.tsx` | D-064 |
| GR-9 | First-time result added to the Binder | `track.families`, web `persistence/binder.ts` | D-066 |
| GR-10 | 15 families, order-independent; one painting per family, element changes frame/glow | `recipes.json`, validator, web `art/placeholder.ts` | — |
| GR-11 | Family stat table | `recipes.json` | — |
| GR-12 | Every pair can graft | validator (missing kind-pair recipe) | — |
| GR-13 | Most Chimeras 7+ → Appraisal targets | emergent; sim report (Appraisal targets by source) | D-076 |

### Player card pool

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| PP-1 | Pool: 25 monsters, 6 spells, 4 traps | `cards/player-*.json`, validator warnings | — |
| PP-2 | Daily deck 15/5/4, duplicates ≤ 2 | `setup/deckgen.ts` | D-005 |
| PP-3 | Monster table (25 entries) | `cards/player-monsters.json` | — |
| PP-4 | Stats are placeholders for the sim to tune | `--set card.<id>.power` in `sim/overrides.ts` | D-074 |
| PP-5 | Stat budget P+G 8–10, keyword ≈ 1 | validator | D-109 |
| PP-6 | Spells cast as the one play, resolve immediately | `legal.ts`, `effects/run.ts` | D-067 |
| PP-7 | Unmake, Bloodlust, Grave Recall, Scrying Bones, Shroud, Siphon | `cards/player-spells.json` (§9.2), `effects/run.ts`, `effects/targets.ts` | D-067…D-070, D-136, D-140 |
| PP-8 | Traps set face-down as the play; trigger automatically, then discard | `summon.ts › setTrap`, `traps.ts`, `hooks/dispatch.ts` | D-071, D-072, D-122 |
| PP-9 | Snare, Mirror Sigil, Last Rites, Thornwall | `cards/player-traps.json` (§9.2) | D-036, D-073 |
| PP-10 | One-line art brief per card | `art-briefs.json`, validator | D-110 |

### The Collector

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| CO-1 | Fixed 20-card Relic deck; never grafts; each Relic has one Flaw | `collector.json`, `legal.ts` (`canGraft`), validator | D-026, D-114 |
| CO-2 | 13 Relic monsters table | `cards/relics.json` | — |
| CO-3 | Spells: Provenance Ledger, Restoration, Gilt Frame, Forfeit | `cards/collector-spells.json` (§9.2) | D-067…D-069, D-136, D-144 |
| CO-4 | Traps: Display Case, Counterfeit, Insurance Claim | `cards/collector-traps.json` (§9.2) | D-065, D-073, D-139 |
| AP-1 | Appraisal at start of his turns in rounds 3, 6, 9 | `turn.ts › startTurn`, `appraisal.ts`, `FLAGS.APPRAISAL` | D-016, D-075 |
| AP-2 | Takes highest-Power face-up monster with Power ≥ 7; tie leftmost | `appraisal.ts` | D-076 |
| AP-3 | Goes to open slot, or vault if full | `appraisal.ts`, `SideState.vault` | D-077, D-078 |
| AP-4 | Face-down and Shrouded monsters are safe | `appraisal.ts`, `Monster.shroudUntil` | D-069 |
| AP-5 | Countdown always on screen | web `AppraisalCountdown.tsx` | — |
| AC-1 | Ace only if Appraisal succeeded | `keywords/covetous.ts`, `summon.ts` | D-054 |
| MO-1 | Moods by life: Composed 16–25, Agitated 8–15, Desperate 1–7 | `mood.ts`, `globals.MOOD_*`, `FLAGS.MOODS` | D-080 |
| MO-2 | Mood behaviors | `collector.json › ai.moods`, `ai/collector/moods.ts` | D-081 |
| IN-1 | Intent icon (attack/appraise/guard/scheme), never the card | `ai/collector/intent.ts`, `state.collector.intent`, web `IntentBadge.tsx`, `FLAGS.INTENTS` | D-095, D-096 |
| IN-2 | Dialogue changes with mood | `collector.json › dialogue`, web `MoodDialogue.tsx` | D-097 |
| AI-0 | Deterministic, public info only, tie-break leftmost then card id | `ai/collector/view.ts`, `policy.ts` | D-086, D-090 |
| AI-P1 | Win this turn if possible | `rules/winThisTurn.ts` | D-082 |
| AI-P2 | Summon The Unpriced if summonable | `rules/summonAce.ts` | D-054 |
| AI-P3 | Slot open + monster that beats your strongest face-up → play it | `rules/summonBeater.ts` | D-083 |
| AI-P4 | Fewer monsters than you + holds trap → set it | `rules/setTrapWhenBehind.ts` | D-088 |
| AI-P5 | Spell with high-value target (Forfeit, Restoration, Gilt Frame contested) | `rules/castHighValueSpell.ts` | D-087 |
| AI-P6 | Else summon highest-Power non-Slow; all Slow → guard | `rules/summonFallback.ts` | D-084, D-085 |
| AI-A1 | Take any lethal attack | `rules/lethal.ts` | D-082 |
| AI-A2 | Destroy your highest-Power monster he beats without losing attacker | `rules/killWithoutLoss.ts` | D-092 |
| AI-A3 | Face-down only with 7+ Power unless Desperate | `rules/faceDownIfStrong.ts` | D-093 |
| AI-A4 | Direct attack if your board is empty | `rules/directIfEmpty.ts` | — |
| AI-A5 | Otherwise hold; Vain still attacks best target | `rules/holdExceptVain.ts`, `best-target.ts` | D-052, D-091 |
| TW-1 | Weekly twist as data | `twists.json`, `stats.ts`, `FLAGS.WEEKLY_TWIST` (off) | D-103, D-121, D-129 |

### Daily loop

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| DL-1 | Each local date → one seed → deck, both shuffles, signature card | web `daily/date.ts`, `setup/seed.ts` | D-001, D-002, D-010 |
| DL-2 | seed = hash("vault-duel" + date + content version) | `setup/seed.ts`, `rng.ts` | D-001 |
| DL-3 | Reset at local midnight; dev date override | web `daily/date.ts`, `globals.RESET_HOUR_LOCAL` | D-104 |
| DG-1 | 15/5/4, max 2 copies | `setup/deckgen.ts` | D-005 |
| DG-2 | ≥ 3 elements, ≥ 4 kinds | `setup/deckgen.ts` | D-005 |
| DG-3 | Curve: ≥ 4 with Power ≤ 5, ≥ 3 with Power ≥ 6 | `setup/deckgen.ts` | D-005 |
| DG-4 | Opening hands (both + redraw) ≥ 2 monsters | `setup/shuffle.ts` | D-007 |
| DC-1 | Reference bot plays seed 500× with deterministic noise | `ai/difficulty.ts`, `ai/bots/expert.ts`, `bots/noise.ts` | D-094 |
| DC-2 | Keep if win rate 30–70%, else re-roll seed+1 | `ai/difficulty.ts` | D-003, D-004 |
| DC-3 | Rating maps win rate to 1–3 stars | `ai/difficulty.ts` | D-098 |
| DF-1 | Open: deck list, difficulty, Appraisal reminder | web `screens/Home.tsx` | — |
| DF-2 | Optional redraw, duel, save after every action, refresh resumes | `reducer.ts`, `replay.ts`, web `daily/session.ts` | D-108 |
| DF-3 | Result: win/loss, rounds, life, objectives (0–3 stars), share | `meta/objectives.ts`, web `screens/Result.tsx` | D-102 |
| DF-4 | Practice unlocks for today's seed; Binder and stats | web `screens/Duel.tsx` (practice), `persistence/*` | D-105, D-106 |
| BO-1 | Objective pool, 3 per day | `objectives.json`, `meta/objectives.ts`, `FLAGS.BONUS_OBJECTIVES` | D-102 |
| SH-1 | Share: one emoji per round + rounds vs par | `meta/share-grid.ts`, web `meta/share.ts` | D-100, D-101 |
| BI-1 | Binder: win adds signature card; first Chimera family adds it; cosmetic; local | web `persistence/binder.ts` | D-010, D-066 |

### Balance targets and globals

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| BT-1 | Expert 45–55% | `sim/report.ts`, `globals.TARGET_EXPERT_WINRATE` | — |
| BT-2 | Novice ~25% (20–30%) | `sim/report.ts`, `ai/bots/novice.ts` | D-117 |
| BT-3 | Most games end rounds 8–12; median 9–11 | `sim/report.ts` | — |
| BT-4 | 15–30% go full 12 rounds | `sim/report.ts` | — |
| BT-5 | 1.5–3 grafts per winning game | `track.grafts`, `sim/report.ts` | — |
| BT-6 | 30–60% Appraisals succeed | `state.appraisal`, `sim/report.ts` | D-079 |
| BT-7 | Unpriced appears in 20–40% | `track.unpriced`, `sim/report.ts` | — |
| BT-8 | < 15% seeds rejected | `sim/difficulty-batch.ts` | — |
| GL-1 | Every number is a global in one file | `content/src/globals.ts`, `content/src/schemas/globals.ts`, `engine/src/types/globals.ts` | D-074, D-126, D-143, D-147 |
| GL-2 | Feature flags (10) | `globals.FLAGS` | — |

### Technical architecture and content pipeline

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| TA-1 | Pure deterministic TS engine shared by web/AI/sim/server | `packages/engine` | — |
| TA-2 | Stack: pnpm, TS strict, Vite+React, Zustand, CSS tokens + Framer Motion, Vitest + fast-check, Capacitor later, PWA | root config, `apps/web` | — |
| TA-3 | Package layout | §2 | — |
| TA-4 | One plain serializable state; `applyAction` → state + events | `types/state.ts`, `reducer.ts`, `types/events.ts` | — |
| TA-5 | Seeded sfc32 by string hash; no Math.random/dates in engine | `rng.ts`, ESLint | D-002, D-125 |
| TA-6 | `getLegalActions` single source of truth | `legal.ts` | D-064 |
| TA-7 | Hook registry (7 hooks) for keywords, Flaws, spells/traps | `types/hooks.ts`, `hooks/*`, `traps.ts` | D-112, D-122, D-124, D-127 |
| TA-8 | No deep cloning; structural sharing; small integer ids | `tx.ts` (§4.1), §18 | D-006, D-128 |
| TA-9 | Reproducible from seed + action log (leaderboards later) | `replay.ts`, `state.log` | D-108 |
| CP-1 | JSON validated by zod at build and in `content:check` | `content/src/schemas/*`, `content/src/load.ts`, `scripts/content-check.ts`, `build` script | D-145, D-146 |
| CP-2 | Effect primitives with targets, conditions, durations | `types/effects.ts`, `effects/*` | D-074, D-120, D-129 |
| CP-3 | New keyword/Flaw = one `defineKeyword` file, auto-registered | `hooks/define.ts` (type in `types/hooks.ts`), `scripts/gen-keyword-index.ts` | D-111, D-123 |
| CP-4 | Validator fails on unknown refs, missing recipes, budget, duplicate ids, Collector deck ≠ 20 | `content/src/validate.ts` (§10.3) | D-109 |
| CP-5 | Placeholder art from data until a painting with the card id exists | web `art/placeholder.ts` | — |
| CG-1 | Add/change/delete card → JSON → `content:check` → `sim:quick` | scripts, validator reverse refs | — |
| CG-2 | Add keyword → one file + icon → tests auto-generated from examples | `KeywordDef.examples`, `engine/test/keyword-examples.test.ts` | — |
| CG-3 | Add element → elements.json + matrix row/column | `elements.json`, validator | — |
| CG-4 | Add kind → validator lists every new pair needing a recipe | validator | — |
| CG-5 | Tune a number → globals; toggle mechanic → flag | `globals.ts` | — |

### v0.1 scope, roadmap and open questions

| # | Item | Implemented in | Decisions |
| --- | --- | --- | --- |
| SC-1 | Full engine incl. all keywords, Flaws, Graft, Ascend, Unstable, Appraisal | `packages/engine`, `packages/content/keywords` | — |
| SC-2 | Collector AI with moods and intents | `packages/ai/src/collector` | D-081, D-095 |
| SC-3 | Daily seed, deck generator, difficulty check | `setup/*`, `ai/difficulty.ts` | — |
| SC-4 | Portrait UI: board, hand, Graft preview, intents, countdown, inspect | `apps/web/src/components/*` | — |
| SC-5 | Result, share text, local stats/streaks, Binder | web `screens/Result.tsx`, `persistence/*`, `meta/share.ts` | D-106 |
| SC-6 | Practice mode | web | D-105 |
| SC-7 | Placeholder art from data | web `art/placeholder.ts` | — |
| SC-8 | Simulator CLI + balance report meeting targets | `packages/sim` (incl. `--ab` for DECISIONS §M proposals) | D-115, M-01…M-16 |
| SC-9 | CONTENT_GUIDE.md + validator | `docs/CONTENT_GUIDE.md` (Phase 1), `validate.ts` | — |
| NS-1 | Not in v0.1: accounts, leaderboards, server verification, sound, painted art, native builds, monetization, weekly twists | not implemented; seams: `replay.ts` hash (server verification), `FLAGS.WEEKLY_TWIST` off, art lookup by id | — |
| RM-1 | Roadmap v0.2–v1.0 | not in scope; engine stays server-ready (pure, replayable) | — |
| OQ-1 | Final name / trademark | not code | — |
| OQ-2 | Local midnight vs global reset | v0.1 local midnight; isolated in web `daily/date.ts` so a switch is one file | D-104 |
| OQ-3 | Second Collector deck variant? | `collector.json` is one file; a variant = another file + selector (not built) | — |
