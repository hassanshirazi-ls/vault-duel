# Vault Duel — Architecture v0.1 (Phase 0)

Status: plan, before any code. Owner: game-architect. Date: 2026-10-14.
Source of truth for rules: `docs/DESIGN.md`. Interpretations of ambiguous rules: `docs/DECISIONS.md` (referenced as `D-NNN`). Source of truth for content values (stats, keywords on cards, card list, effects, text, recipes, globals) is `packages/content` from the D-166 switch onward (the content M3 commit). From then on DESIGN.md's value tables, and the value examples in this document (§9.2, §11), are launch values.

---

## 1. Principles

1. **One pure engine.** `applyAction(state, action) → { state, events }` and `getLegalActions(state)` are the only ways to advance or query a duel. The web UI, Collector AI, player bots, simulator and (later) server all call them.
2. **Determinism.** All randomness comes from sfc32 seeded by cyrb128 of a string. No `Math.random`, `Date`, timers, DOM, `for…in`, or iteration over object keys in `packages/engine`, `packages/content/keywords`, or `packages/ai` (ESLint-enforced). Same seed + same action log ⇒ identical state hash.
3. **Content is data.** Cards, elements, kinds, recipes, the Collector deck and AI priorities, objectives, twists and art briefs are JSON validated by zod. Keywords/Flaws are one TypeScript file each via `defineKeyword`. Spell/trap effects are written in the effect DSL (§9). Every number lives in `globals.ts` (§11) or in a content JSON file, and every mechanic sits behind a flag. A content change is one edit: tests never pin live values (D-168), card text takes numbers from placeholders (D-172), and a new card number is one line (D-171).
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
│  ├─ DESIGN.md  ARCHITECTURE.md  DECISIONS.md  CONTENT_GUIDE.md (Phase 1, plan §10.5)  BALANCE_LOG.md
│  │  CHANGELOG.md (owner-facing tooling changes, D-208)
│  └─ reports/                  # sim output (phase0-paper-sim.md is owned by design-simulator)
├─ packages/
│  ├─ engine/                   # rules only; zero runtime deps; no DOM, no Node APIs
│  │  └─ src/
│  │     ├─ index.ts            # createEngine(), public types
│  │     ├─ types/{state,actions,events,content,globals,hooks,effects}.ts
│  │     ├─ rng.ts              # cyrb128, sfc32, int(), shuffle()
│  │     ├─ errors.ts           # EngineError (public, D-132)
│  │     ├─ freeze.ts           # deepFreeze (public; dev-mode states, content globals; D-147)
│  │     ├─ canonical.ts        # canonicalJson: sorted-key JSON for state.cfg and the content hash (public; D-191)
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
│  │     ├─ cast.ts             # cast action: card to discard, SpellCast, play tail, effects (D-188)
│  │     ├─ mood.ts             # mood from life
│  │     ├─ effects/{run,targets,conditions,num}.ts   # effect-primitive interpreter
│  │     ├─ hooks/{registry,context,define,dispatch}.ts
│  │     ├─ traps.ts            # compiles trap DSL into hook subscribers
│  │     ├─ meta/{objectives,share-grid,track}.ts      # pure post-game summaries
│  │     ├─ replay.ts           # replay(seed, actions), hashState()
│  │     └─ view/redact.ts      # redactEvent; redactState(s, viewer) for AI look-ahead (public, D-209)
│  │  └─ test-utils/{board-dsl,globals,…}.ts  # scenario DSL parser (§17), TEST_GLOBALS; package subpath
│  │                                         # "@vault-duel/engine/test-utils/*" for content tests (D-143)
│  ├─ content/                  # data + schemas + validator; depends on engine (types, defineKeyword)
│  │  ├─ src/                   # browser-safe except load.ts and keyword-files.ts (D-176)
│  │  │  ├─ globals.ts          # every number + feature flags + CONTENT_NUMBERS (§11, D-171)
│  │  │  ├─ planned-globals.ts  # globals whose reader isn't built yet (§11, D-205)
│  │  │  ├─ schemas/{element,kind,card,effect,recipe,collector,objective,twist,art-brief,globals}.ts
│  │  │  ├─ files.ts            # CONTENT_FILES, parseFile, parseContent(raw), formatError (pure, D-176)
│  │  │  ├─ data.ts             # RAW_CONTENT: static JSON imports (Vite HMR, Node import attributes)
│  │  │  ├─ load.ts             # Node only ("./node" export): reads JSON from a root, then parseContent
│  │  │  ├─ keyword-files.ts    # Node only ("./node" export): keyword file and barrel checks
│  │  │  ├─ text.ts             # parseTemplate, renderText: {NAME} placeholders (D-172)
│  │  │  ├─ compile.ts          # → GameContent = CompiledContent + collector.ai (D-210)
│  │  │  ├─ feasibility.ts      # checkDeckgen: engine deckForSeed on 1,000 dates (pure; D-200)
│  │  │  └─ validate.ts         # cross-file rules (§10.3)
│  │  ├─ test-utils/scenario-content.ts  # live elements/kinds/recipes/KEYWORDS + declared cards (D-169)
│  │  ├─ test/{guide,globals-readers}.test.ts  # CONTENT_GUIDE examples (D-178); reader tripwire (D-205)
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
│  │     ├─ collector/{policy,view,config,rules/*,moods,intent,reposition,attacks,best-target,
│  │     │             combat-estimate,win-search}.ts
│  │     ├─ shared/{brain,cards,look-ahead}.ts   # engine + content handle; card records; redacted look-ahead (D-209)
│  │     ├─ bots/{player-view,novice,greedy,expert,noise,evaluate}.ts
│  │     ├─ bots/{greedy,expert}.weights.json     # bot tuning, not globals (D-222)
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
  readonly hash: string;                 // cyrb128 of canonicalJson(content + each KeywordDef's id, name, kind, icon,
                                         // visual, text in bit order); no globals, examples or hook code (D-197)
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
                                         // each sorted by card id, so JSON entry order never changes a deck (D-197)
  readonly collector: { readonly deck: readonly DefIdx[]; readonly ace: DefIdx; readonly canGraft: boolean };
  readonly twists: readonly CompiledTwist[];
}
```

**The AI block travels with the compiled content (D-210).** `compileContent` returns the content-owned `GameContent`, which extends `CompiledContent` with the parsed, deep-frozen `collector.json › ai`:

```ts
// packages/content/src/compile.ts
export type CollectorAiConfig = z.output<typeof CollectorAi>;   // exported from the content root
export interface GameContent extends CompiledContent {
  readonly collector: CompiledContent['collector'] & { readonly ai: CollectorAiConfig };
}
```

The engine type doesn't change and knows nothing of the AI. A `GameContent` is passed to `createEngine` as a `CompiledContent` and to `ai`'s `createCollector` as itself. `hash` already covers the block, because it hashes the whole parsed content (D-197), so an AI edit changes `state.cfg`. That is required, because replays recompute the stored intent with the policy.

**Display text is not compiled (D-172).** `CompiledContent` holds no rendered strings and stays independent of globals (D-120). Two strings do pass through it, `KeywordDef.text` (in `keywords`) and `CompiledTwist.text`, and both are **templates** that may contain `{NAME}` placeholders. Card names and card text are read from the parsed content data. The UI, and any report that prints text, calls `renderText(template, g)` from `content/src/text.ts` with the same `Globals` object the engine was created with, so `--set` and `?set=` overrides show up in the text. `hash` covers the templates, so a text edit changes `state.cfg` like any other content edit.

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
  readonly sym: Iid;               // attached symbiote (FLAGS.SYMBIOSIS, D-308); -1 none. The symbiote is in no zone array while attached
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
// D-305…D-316: Split and Symbiosis are ONE action each (`split m`, `symbiose c host`), so they add no Pending stage and the
// union does not change. Graft is the only multi-step bond. If the owner later wants a Split placement choice (D-316 Q3), add:
//   export interface PendingSplit { readonly kind: 'split'; readonly m: Iid; readonly stage: 'lane'; readonly placed: readonly number[] }
//   export type Pending = PendingGraft | PendingSplit;   // then forEachLegal gets a 'split' branch beside the graft one

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
  readonly bond: 0 | 1 | 2;        // FLAGS.BOND_ACTION only (D-306): 0 open, 1 bond action used, 2 closed by an attack. Reset to 0 in startTurn; stays 0 when the flag is off
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
| attached symbiote | `Monster.sym` (D-308) |
| bond action used / closed | `GameState.bond` (D-306) |
| trap slots | `SideState.traps` |
| vault | `SideState.vault` (Collector) |
| discard | `SideState.discard` |
| Appraisal state | `GameState.appraisal` (+ next round derived from globals) |
| mood / intent | `GameState.collector` |
| RNG state | `GameState.rng` |
| action log | `GameState.log` (+ `toActions(state)` helper) |

**Card conservation invariant** (property-tested): every `Iid` is in exactly one of deck, hand, discard, board, traps, vault — or is a Chimera material in a discard, or is a **symbiote attached** to a board monster (`Monster.sym`, D-308; `locate` returns an "attached" location). A Chimera instance **dissolved by Split** (D-307) is in no zone and its materials are on the board or in the hand; it can never return. A material is in at most one Chimera's live `materials` claim (Split requires all of them in the discard).

**Derived, never stored:** effective stats (D-031; Guard `+SYMBIOSIS_GUARD_BONUS` while `sym >= 0`, Power untouched), active keywords (`printed | chimera.kw`, plus the symbiote's keyword bits when the host has fewer than `MAX_INHERITED_KEYWORDS` (D-308), minus Ward if used, none if face-down), round, active side, next Appraisal round, Tethered, element advantage.

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
| Play one card | `step: 'main'`, `!played`; summon/cast/setTrap/graft actions; a play moves `step` to `'attack'`. With `FLAGS.BOND_ACTION` off, `graft`, `split` and `symbiose` are plays |
| Bond action (`FLAGS.BOND_ACTION` on, D-306) | `step: 'main'` or `'attack'`, `bond === 0`; `graft`, `split`, `symbiose`; sets `bond = 1`; does not touch `played`, `step` or the reposition step. Either order with the play |
| Attack | `step: 'attack'` (or first `attack` from `'main'`, which forfeits the play — D-014, and with `BOND_ACTION` on sets `bond = 2`, closing the bond action) |
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
step = 'main'; played = false; bond = 0
if side === Player && FLAGS.INTENTS: collector.intent = intentPolicy(tx.state); emit IntentSet   (D-095, D-150, D-221)
```

The intent comes last, so the policy sees a well-formed decision state. It forecasts by applying `endTurn` to `redactState(s, 1)` with its own engine (D-221).

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
  if FLAGS.BOND_ACTION && bond === 0: bond = 2            // and closes an unused bond action (D-306)
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

**Lanes (D-281…D-284; `FLAGS.LANES`, default off).** The pipeline above is unchanged; lanes only change which `(A, T)` pairs are declarable. `lanes.ts › laneTargets(state, A)` is the one function for it, used by `legal.ts`, `previewCombat` callers and the AI view. Lane = slot index, the same on both sides. With `LANES` on: `C` = `{ lane(A) + o : o ∈ attackReach(A) } ∩ [0, BOARD_SLOTS)` (`attackReach` defaults to `{0}`); `T` = monsters in `C`; a face-up enemy Sentinel within `SENTINEL_REACH` lanes of `lane(A)` replaces `T` with those Sentinels (a face-up Sentinel in `lane(A)` itself leaves `T = {it}`); a non-empty enemy board with `T` empty gives A no attack; direct (`-1`) only when the enemy board is empty. With `LANES` off it returns every enemy monster, filtered by classic Sentinel. Nothing after `declare` knows about lanes.

`engine.previewCombat(state, A, T)` runs the same `resolveCombat` without side effects. The UI, the Collector AI (public information) and the bots use it. It is a method on the `Engine` facade (§8.7, D-209). There is no reveal, no trap and no queued effect. `beforeCombat` hooks run into a sink that discards their effects, so Pierce and Brittle show in the result. For a face-down target it returns `{ known: false }`. An engine property test checks it against `CombatResolved` and `Damage` (§17).

### 5.5 Destruction batch (`destroy.ts`)

```
destroyBatch(list, cause, destroyerOf?):
  order list: active side first, then slot order
  for each m: ask beforeDestroy of m's OWN active keywords only, bit order (Ward; D-134)
              → 'prevent' ⇒ wardUsed = true (all of m's beforeDestroy bits go inactive, D-133); emit WardBroken; drop from list
  snapshot last-known info (LKI) for each remaining m (stats, keywords, controller, slot, destroyer)
  remove all remaining from boards simultaneously → owner's discard (D-047); emit Destroyed{iid, cause, by}
  symbiotes (FLAGS.SYMBIOSIS, D-308): for each removed m with LKI.sym >= 0, in the same order: release it as a fresh Monster in m's slot
        (pos = m's pos, entered = turn, no mods, wardUsed false; appraised = true if the controller is the Collector); emit SymbioteEmerged.
        Done BEFORE the onDestroyed dispatch below. A Ward-prevented host keeps its symbiote.
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
graftPick m (mat1)         → stage 'mat2'      // mat1 offered only with ≥ 1 valid partner (D-180)
graftPick m (mat2)         → stage FLAGS.ASCEND && any eligible third material ? 'ascend' : next
graftPick m (ascend) | graftSkipAscend → stage (union(kw) > MAX_INHERITED_KEYWORDS) ? 'keywords' : 'position'
     // union = keyword bits only, never Flaws (D-181). Every material, board or hand: printed keywords (D-182 B)
graftKeywords kw           → stage 'position'
graftPosition pos          → COMMIT:
     family = recipe[kind(m0), kind(m1)]; element = element(m0)
     unstable = FLAGS.UNSTABLE && any pair of material elements opposes
     sacrifice board materials and hand materials → owner's discard (emit Sacrificed; no hooks)
     inst.push({ def: family, owner, chimera: { element, kw, ascended: mats.length === 3, materials, grafted: turn } })
     place in leftmost free slot (FLAGS.LANES: the lane in graftPosition, D-284): { pos, entered: turn, unstableUntil: unstable ? unstableExpiry(turn, g) : -1, … }
          // unstableExpiry: e = turn + UNSTABLE_EXPIRY_TURNS ('endOfNextOwnTurn', DESIGN);
          //                 e + DURATION_NEXT_OWN_TURN − 1 ('startOfOwnTurnAfterNext', lever M-02; D-183)
     played = true; step = 'attack'          // FLAGS.BOND_ACTION: bondUsed() instead, i.e. bond = 1 and neither played nor step change (D-306)
     player only (D-180): track.grafts++, round[round−1] |= RoundFlag.Grafted, families ∪= family
     emit Grafted{…}; dispatch onGraft (Counterfeit; D-065). A Graft does not dispatch onSummon.
graftCancel (any stage)    → pending = null (nothing was applied)
```

`engine.previewGraft(state)` (facade method, §8.7) returns the Chimera that the current pending choices would create (family, element, stats incl. Ascend/Unstable, keyword options, expiry) — the UI's confirm screen.

Bond-rule additions to Graft (D-306, D-308): with `FLAGS.BOND_ACTION` on, `graftBegin` is legal while `bond === 0` (not `!played`), and with `BOND_ACTION` on the number of **hand** materials in a Graft is at most `BOND_GRAFT_MAX_HAND_MATERIALS` (filter in `mat1/mat2/ascend` candidates; default 3 = no limit). A board monster with `sym >= 0` is **not an eligible material** (`isBaseMonster` host check in `eligibleMaterials`).

### 5.6a Split (`bond.ts › split`) — D-307, `FLAGS.SPLIT`

```
split m                       // legal: §6.2. One action, atomic, no pending state
  c = inst[m].chimera; parts = c.materials (stored order); slot0 = slot of m; pos = m.pos
  remove m from the board; drop the Chimera instance from play (no zone; NOT the discard)       // dissolved, no hooks (D-307)
  for each part p (stored order): zoneRemove(owner, 'discard', p)
       slot = (index 0) ? slot0 : leftmost free slot          // lane = slot (D-281); no lane parameter
       slot found → setSlot(makeMonster(p, { pos, entered: turn, attacked: turn, permP: SPLIT_PART_PERM_P }))   // fresh record, sym -1
       none       → zonePush(owner, 'hand', p)                // never lost; hand may exceed HAND_SIZE
  FLAGS.BOND_ACTION ? bondUsed(run) : playUsed(run)
  emit Split{ side, iid: m, parts, slots }                    // slot −1 = went to hand
  no onSummon, no onGraft, no onDestroyed. Track unchanged. run.flush()
```

`attacked: turn` is what makes the part unable to attack in both `SICKNESS_MODE`s (Swift cannot override it); `entered: turn` blocks reposition and lane moves (D-282). Cost is O(materials).

### 5.6b Symbiosis (`bond.ts › symbiose`, `release`) — D-308, `FLAGS.SYMBIOSIS`

```
symbiose c, host              // legal: §6.2. One action, atomic
  zoneRemove(owner, 'hand', c)
  host' = { ...host, sym: c }                                  // c is now "attached" (no zone array)
  FLAGS.BOND_ACTION ? bondUsed(run) : playUsed(run)
  emit Bonded{ side, host, symbiote: c, kw: activeKeywords(host'), guard: effectiveGuard(host') }
  no onSummon; Track unchanged. run.flush()

release(run, hostLKI, slot, side, cause)    // called by destroyBatch (§5.5), by any board→hand effect, and nowhere else
  s = hostLKI.sym; if s < 0 return
  setSlot(side, slot, makeMonster(s, { pos: hostLKI.pos, entered: turn, appraised: side !== inst[s].owner }))
  emit SymbioteEmerged{ iid: s, host, side, slot, cause }
Covetous sacrifice of a host: the symbiote goes to its owner's discard with the host (Sacrificed, reason 'covetous', from 'board').
Appraisal (§5.7): the host's record keeps `sym` on his board; to the vault, the symbiote is pushed to the vault after the host.
```

Stats and keywords read `sym` in `stats.ts` only: `guard(m) += SYMBIOSIS_GUARD_BONUS`; `activeKw(m) |= keywordBits(printedKw(sym))` when `popcount(hostKw) < MAX_INHERITED_KEYWORDS`. The LKI snapshot of §8.1 gains `sym: Iid` and its `kw` already contains the granted bits (so Haunt and Echo on a symbiote keyword work).

### 5.6c Options preview (`bond-preview.ts › bondOptions`) — D-313

```ts
export type BondKind = 'graft' | 'split' | 'symbiosis';
export interface AppraisalExposure {       // for the board AFTER the option, against the next Appraisal round
  readonly nextRound: number;              // next round in APPRAISAL_ROUNDS at or after the Collector's coming turn, -1 none left
  readonly turnsAway: number;              // own turns before it fires, 0 = at the start of his next turn
  readonly target: Iid;                    // monster the §5.7 rule would take, -1 none
  readonly targetPower: number;
  readonly cardsLost: 0 | 1 | 2;           // 2 = host with a symbiote
}
export interface BondResultMonster {       // each own monster the option creates or changes
  readonly iid: Iid; readonly def: DefIdx; readonly element: ElemIdx;
  readonly power: number; readonly guard: number; readonly kw: KwMask;
  readonly slot: number;                   // -1 = in hand
  readonly pos: Pos; readonly canAttackThisTurn: boolean; readonly unstableUntil: number;
  readonly symbiote: Iid;                  // -1 none
}
export interface BondOption {
  readonly kind: BondKind;
  readonly id: string;                     // stable, e.g. "split:12", "symb:c7>h12", "graft:3,9" (ordered materials, kw mask)
  readonly steps: readonly Action[];       // applying them in order performs it; graft: up to but excluding position (positionFree)
  readonly positionFree: boolean;          // graft only: pos and lane chosen at graftPosition
  readonly usesPlay: boolean;              // BOND_ACTION off
  readonly handCardsAfter: number;
  readonly result: readonly BondResultMonster[];
  readonly boardAfter: readonly (BondResultMonster | null)[];   // whole own board
  readonly boardPowerDelta: number; readonly boardGuardDelta: number; readonly bodiesDelta: number;
  readonly exposure: AppraisalExposure;
}
export interface BondPreview {
  readonly available: boolean;             // some bond action is legal now
  readonly baseline: { readonly exposure: AppraisalExposure; readonly boardPower: number; readonly boardGuard: number; readonly bodies: number };
  readonly options: readonly BondOption[]; // fixed order: graft, split, symbiosis (the §6.2 order), then legal-action order
}
```

Pure: it applies each option on a `Tx` draft of `s` (no deep clone) and reads the result through the same stats functions, so it cannot drift from the rules. It states facts only. The "best" hint is `ai/bots/rank-bonds.ts` (D-313). A property test applies each option's `steps` through `applyAction` and compares `boardAfter`.

### 5.7 Appraisal (`appraisal.ts`) — D-075…D-079

```
appraisal.attempts++
candidates = player board monsters: !faceDown && !(turn < shroudUntil) && power(m) >= APPRAISAL_MIN_POWER
if none: emit AppraisalFailed; return
pick highest power, tie leftmost                       // power(m) excludes the symbiosis Guard bonus (D-308)
remove from player board; m' = { ...m, entered: turn, appraised: true,
                                  pos: FLAGS.APPRAISED_ENTERS_GUARD ? guard : m.pos }   // lever M-03 (D-184)
slot = leftmost free on Collector board → place m', emit Appraised{to:'board', toSlot}
else vault.push(iid), emit Appraised{to:'vault', toSlot: -1}
a host's symbiote (m.sym ≥ 0, D-308): m' keeps sym on his board; to the vault, vault.push(sym) after the host. Appraised.sym = m.sym. appraisal.taken lists the host only
appraisal.successes++, taken.push(iid); track.round[round−1] |= RoundFlag.Appraised; track.appraisedLost++
```

Lever M-04 (`FLAGS.ACE_SET_ASIDE`) is pinned to `false` until its plumbing lands (D-184). That plumbing adds a `SideState.aside` zone, which holds the ace from setup. On the duel's first success the ace moves from `aside` to the hand, with `CardDrawn{byEffect:true}`, right after `Appraised`.

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
  | { readonly t: 'moveLane'; readonly m: Iid; readonly to: number } // FLAGS.LANES only: step to lane `to`, swap if occupied (D-282)
  | { readonly t: 'summon'; readonly c: Iid; readonly mode: SummonMode; readonly lane?: number }   // lane: required with FLAGS.LANES, absent = leftmost free (D-284)
  | { readonly t: 'summonCovetous'; readonly c: Iid; readonly sac: Iid; readonly mode: 'atk' | 'grd'; readonly lane?: number }
  | { readonly t: 'cast'; readonly c: Iid; readonly target: Iid | -1 }  // -1 = untargeted
  | { readonly t: 'setTrap'; readonly c: Iid }
  | { readonly t: 'graftBegin' }
  | { readonly t: 'graftPick'; readonly m: Iid }                     // material 1, 2, or Ascend material
  | { readonly t: 'graftSkipAscend' }
  | { readonly t: 'graftKeywords'; readonly kw: KwMask }             // exactly MAX_INHERITED_KEYWORDS bits
  | { readonly t: 'graftPosition'; readonly pos: Pos; readonly lane?: number }  // commits the Graft; lane as for summon (D-284)
  | { readonly t: 'graftCancel' }
  | { readonly t: 'split'; readonly m: Iid }                          // FLAGS.SPLIT: unbind own face-up Chimera m (D-307)
  | { readonly t: 'symbiose'; readonly c: Iid; readonly host: Iid }   // FLAGS.SYMBIOSIS: attach hand monster c under face-up own host (D-308)
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
                          (face-down: only to attack; D-023). No keyword grants a reposition; the
                          *_PER_TURN globals are pinned to 1 (D-190)
   moveLane m, to         FLAGS.LANES only: for own m in slot order, to ascending, |to − lane(m)| ≤ LANE_MOVE_RANGE;
                          m.entered < turn && m.repositioned !== turn; target lane empty, or (FLAGS.LANE_SWAP) holds an own
                          monster with the same two conditions. Sets repositioned = turn on both (D-282). A switch and
                          a move share the one stamp, so a monster does either, not both
   summon c × mode (× lane) for hand monster c, free slot, summonRequirement(c) === 'normal'
                          (a Chimera card in hand too, all three modes: owner ruling D-189 A); with FLAGS.LANES one
                          action per empty lane, ascending (D-284)
   summonCovetous c, sac  for each acquired sac on board or in vault with a free slot after (D-054); × lane as above
   cast c, target         per legal target from the spell's TargetSpec (≥1 needed if targeted; D-067)
   setTrap c              if a trap slot is free
   graftBegin             if canGraft(side) && ≥2 eligible materials && some mat1 candidate (D-057, D-180)
   split m                FLAGS.SPLIT, side 0: own face-up Chimera, m.entered !== turn, no sym on it, every stored
                          material currently in own discard; slot order (D-307)
   symbiose c, host       FLAGS.SYMBIOSIS, side 0: c a base monster in hand (hand order) × host a face-up own monster
                          with sym === -1 (slot order); host-major inside each c (D-308)
   // "slot" gate for the three bond actions above: BOND_ACTION off → step 'main' && !played (they are plays);
   // BOND_ACTION on → bond === 0 && step ∈ {main, attack} (D-306). Same position in the order either way, so the
   // enumeration is identical in shape under both settings. A pending Graft blocks everything but its own stages (as today).
main or attack:
   attack a, target       for own a: pos=atk, !faceDown, a.attacked !== turn,
                          perm = attackPermission(a) ≠ 'none';
                          targets = laneTargets(a) (§5.4): every enemy monster filtered by restrictTargets (Sentinel)
                          when !FLAGS.LANES, else the lane rule of D-281/D-283;
                          direct (-1) only if enemy board empty and perm === 'any'
   endTurn                unless some own monster has mustAttack (Vain) and an untaken legal attack (D-052)
```

Graft stage actions:

| Stage | Legal actions |
| --- | --- |
| `mat1` | `graftPick m` for each eligible base monster in own hand/board that has at least one valid `mat2` partner (D-180) |
| `mat2` | `graftPick m` for each eligible m ≠ mat1 such that a slot is free after sacrificing board materials |
| `ascend` | `graftPick m` for each remaining eligible m (slot feasibility re-checked), `graftSkipAscend` |
| `keywords` | `graftKeywords kw` for each 2-subset of the available union (≤ 3 options with launch content) |
| `position` | `graftPosition 0`, `graftPosition 1` |

**Attack permission** (`stats.ts › attackPermission`) folds the lattice `none < monstersOnly < any`:

```
if side === Player && round < FIRST_ATTACK_ROUND_PLAYER: perm = none   // D-015, absolute (D-042); global form per D-142
else:
  base   = (m.entered !== turn) ? any
         : (SICKNESS_MODE === 'monstersOnly' ? monstersOnly : none)   // D-022 'classic'; D-280 'monstersOnly'
  grants = max over hooks.attackPermission(...).grant   // Swift: monstersOnly (classic) | any (monstersOnly mode) on entered turn
  restr  = min over hooks.attackPermission(...).restrict // Slow: none on entered turn (default: any)
  perm   = min(max(base, grants), restr)
```

`entered` is set by every path that creates a board record: summon, summonCovetous, Graft, Appraisal, re-summon after Echo/Grave Recall/Restoration (D-280). Lane moves and switches never touch it.

Order-independent by construction, so adding keywords cannot create ordering bugs. `engine.attackRestriction(s, iid)` returns `restr` alone. The AI uses it to find "Slow" by hook (D-212).

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
  | { e: 'Appraised'; iid: Iid; fromSlot: number; to: 'board' | 'vault'; toSlot: number; sym?: Iid }   // sym: attached symbiote that went with it (D-308)
  | { e: 'AppraisalFailed'; round: number; reason: 'noTarget' }
  | { e: 'Repositioned'; iid: Iid; pos: Pos }
  | { e: 'Revealed'; iid: Iid; side: Side }           // combat reveal, or reposition flip (then Repositioned, D-161)
  | { e: 'Summoned'; side: Side; iid: Iid; slot: number; pos: Pos; faceDown: boolean } // every summon action, 1:1 with onSummon
  | { e: 'CovetousSummoned'; iid: Iid; sacrificed: Iid; slot: number }  // marker after Summoned: Sacrificed → Summoned → this (D-154)
  | { e: 'Sacrificed'; iid: Iid; reason: 'graft' | 'covetous'; from: 'hand' | 'board' | 'vault' }
  | { e: 'GraftStarted' } | { e: 'GraftStep'; stage: GraftStage; mats: readonly Iid[] } | { e: 'GraftCancelled' }
  | { e: 'Grafted'; side: Side; iid: Iid; family: DefIdx; element: ElemIdx; materials: readonly Iid[];
      kw: KwMask; ascended: boolean; unstable: boolean; slot: number; pos: Pos }
  | { e: 'Split'; side: Side; iid: Iid; parts: readonly Iid[]; slots: readonly number[]; pos: Pos }   // slots[i] = -1: part went to the hand (D-307). No Destroyed, no WardBroken
  | { e: 'Bonded'; side: Side; host: Iid; symbiote: Iid; kw: KwMask; guard: number }                  // kw/guard = the host's after (D-308)
  | { e: 'SymbioteEmerged'; side: Side; iid: Iid; host: Iid; slot: number; cause: 'destroyed' | 'returned' }   // after Destroyed/ReturnedToHand of the host (D-308)
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

Bond events (D-305…D-316): Split is not a destruction and a symbiote is not a summon, so `Split`, `Bonded` and `SymbioteEmerged` are their own events, with no `Summoned`, `Destroyed` or `onSummon` for the parts or the symbiote. Order for a destroyed host: `Destroyed` (host) → `SymbioteEmerged` → onDestroyed effects. `redactEvent` leaves all three as they are (the attached card is public). The sim derives its bond counters from these events and `Appraised.sym` (D-314). `Sacrificed.reason: 'covetous'` also covers an attached symbiote that leaves with its host.

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
  num(name: string): number;        // a $NAME value: CONTENT_NUMBERS, then core globals; EngineError if unknown (D-171)
  power(i: Iid): number;            // effective (D-031); guard(i) likewise
  guard(i: Iid): number;
  controller(i: Iid): Side | -1;    // -1 = not on a board
  slot(i: Iid): number;
  isFaceUp(i: Iid): boolean;
  hasKw(i: Iid, id: string): boolean;   // active keywords only
  monsters(side: Side): readonly Iid[]; // board, slot order
  enteredThisTurn(i: Iid): boolean;
  ownTurnsSinceEntered(i: Iid): number; // controller's turns started after the entry turn: 0 on it, -1 off-board (D-183)
  isAttacker(i: Iid): boolean;          // TargetQueryCtx/CombatCtx helpers
}

export interface HookCtx<E> extends QueryCtx {
  readonly evt: E;                  // event payload (attacker, target, destroyed LKI, chimera…)
  effect(e: Effect): void;          // queue an effect primitive (§9) with refs bound to evt
  emit(ev: GameEvent): void;
  holds(cond: Cond, iid: Iid): boolean; // read-only DSL condition check with evt refs bound (D-186)
}
// Trap subscribers (traps.ts) get an engine-internal TrapCtx extension with spendTrap(); it isn't public (D-186).
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

A context reads the state through the `Run` (`s` is always `run.state`) and never keeps a captured reference, because a trap subscriber spends its trap mid-list (D-186). Hooks never touch the `Tx` directly: they read through `QueryCtx` and act through `effect()`, so every state change goes through the effect interpreter (one place for events, Ward, zone rules). There are two exceptions, and neither writes `GameState`. First, the `cancelAttack` op runs immediately: `traps.ts` calls `ctx.cancelAttack(trapIid)` when the trap's subscriber runs, so later subscribers see `cancelled` (§8.3 rule 4, D-071). The card's other effects are queued in order (D-122). Second, `beforeCombat` hooks set combat flags through `CombatCtx` (D-124).

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
  readonly text: string;               // one sentence (validator); a template: numbers only as {NAME} placeholders (D-172)
  readonly hooks: Hooks;
  readonly examples?: readonly string[]; // board-DSL scenarios (§17) with declared cards only (D-169); each becomes a generated test
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
    card raider P gale beast 5/3
    card stag   C lumen beast 5/4
    card wall   C ember construct 3/6 sentinel
    turn 2
    P board [raider A] [-] [-]
    C board [stag A] [wall A] [-]
    expect illegal attack P0 > C0
    expect legal attack P0 > C1`],   // declared cards only, run under TEST_GLOBALS (D-169)
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
  text: 'When destroyed, the monster that destroyed it loses {HAUNT_PENALTY} Power permanently.',  // D-172
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
| Swift | `attackPermission` | `grant` when `enteredThisTurn(self)`: `'monstersOnly'` under `SICKNESS_MODE 'classic'`, `'any'` under `'monstersOnly'` (D-041, D-042, D-280) |
| Sentinel | `restrictTargets` | `!LANES`: face-up Sentinels on the defending board are the only legal targets (D-037, D-038). `LANES`: face-up Sentinels within `SENTINEL_REACH` lanes of the attacker's lane replace the targets; one in the attacker's own lane is the only target; an empty covered lane still targets the Sentinel (D-283) |
| (reach, no keyword yet) | `attackReach` | query hook, `(self, env) → readonly number[]` lane offsets, default `[0]`, union fold; read by `laneTargets` under `LANES`. Registry slot only; reach keywords are deferred (D-284) |
| Pierce | `beforeCombat` | if self is attacker and `combat.defPos` is guard: `ctx.setPierce()` → damage `aP − dG` (D-039, D-040, D-124) |
| Ward | `beforeDestroy` | `'prevent'` once; asked only for its own monster; engine sets `wardUsed` and emits `WardBroken` (D-034, D-035, D-044, D-133, D-134) |
| Haunt | `onDestroyed` | destroyer gets `modifyStats −HAUNT_PENALTY permanent` if still on board (D-045) |
| Echo | `onDestroyed` | `returnToHand self` (from discard to owner's hand) (D-046) |
| Slow | `attackPermission` | `restrict: 'none'` while `ownTurnsSinceEntered(self) < SLOW_TURNS` (1, the entry turn only; meaningful under `SICKNESS_MODE 'monstersOnly'`; the M-01 value 2 is withdrawn, D-280) (D-053, D-183) |
| Vain | `mustAttack` | `true`; engine blocks `endTurn` while a legal attack remains; AI picks best target (D-052, D-091) |
| Brittle | `beforeCombat` | if self is defender and `combat.advantage`: `ctx.setBrittleWin()` (D-049, D-050, D-124) |
| Tethered | `staticPower` | `−TETHERED_PENALTY` when `monsters(side).length === 1` (D-051) |
| Covetous | `summonRequirement` | `{ kind:'sacrifice', appraised:true, zones:['board','vault'] }` → only `summonCovetous` is legal (D-054, D-055) |

The five legality-constraining keywords (Sentinel, Swift, Vain, Slow, Covetous) use only query hooks, which `legal.ts` calls while enumerating — so the UI, AI and bots see the constraint in `getLegalActions` with no extra code.

### 8.6 Engine-internal plumbing (not exported) — D-131

| Type | File | Role |
| --- | --- | --- |
| `Env { c, g, reg, dev }` | `hooks/registry.ts` | Everything a rule needs besides the state: compiled content, bound globals, hook registry, dev-mode switch (D-141) |
| `HookRegistry { kw, masks, trapHooks }` | `hooks/registry.ts` | Keyword bit → `Hooks`. Hook name → bit mask (same object as `c.hookMask`, checked against the hook tables by `createRegistry`). Trap `DefIdx` → hooks compiled by `traps.ts`, typed with the internal `TrapCtx` (`spendTrap()`, D-186). At most one trap per (definition, side) fires per dispatch (D-071, D-187) |
| `Refs` | `effects/run.ts` | One field per DSL `Ref` (§9.1), bound when an effect is queued; `-1` = absent |
| `QueuedEffect { effect, refs, source, side }` | `effects/run.ts` | One queued primitive. `side` = the source's controller at queue time; durations are relative to it (D-136) |
| `EffectSink { queue, emit }` | `effects/run.ts` | What hook contexts write into |
| `EffectHost { emit, destroy(iids), lifeChanged }` | `effects/run.ts` | How the interpreter reaches later pipelines. `destroy(iids)` = `destroyBatch(…, cause 'effect')`, with no destroyer and no `by` parameter (D-160). Unstable expiry and combat call `destroyBatch` (§5.5) with their own cause |
| `Dispatcher` | `hooks/dispatch.ts` | One per dispatch. Collects subscribers into a local list first (§4.1 contract 1), then calls them in §8.3 order |
| `Run` | `pipeline.ts` | One per `applyAction`, built by `reducer.ts`: the `Tx`, the event list (`null` under `{ events: false }`), the FIFO `EffectQueue`, the `EffectHost`, and `flush()`. A re-entrant `flush()` is a no-op, and the outer drain runs the new effects (D-150) |
| `Services { intent? }` | `pipeline.ts` | Injected services. `intent` comes from `createEngine` (D-096). `appraisal?` is temporary and is removed when `appraisal.ts` lands (D-150) |
| `IntentPolicy = (s: GameState) => Intent` | `pipeline.ts`, type exported from the root | Pure, read-only, keeps no references into `s`. `ai` builds `collectorView(s)` inside it, and it may look ahead on a `redactState` copy through its own engine (D-221). Called after `step = 'main'`. Required when `FLAGS.INTENTS` is on (D-150) |

### 8.7 Public engine API (D-209)

The root exports types, `createEngine` and a few pure helpers. Everything that needs the `Env` is a method on the `Engine` facade, which binds the `Env` once at `createEngine`.

| Member | Kind | Contract |
| --- | --- | --- |
| `newGame`, `applyAction`, `getLegalActions`, `forEachLegal`, `countLegal`, `isLegal`, `replay` | facade | §5, §6.2, D-191 |
| `effectivePower(s, iid)`, `effectiveGuard(s, iid)` | facade, query | D-031: no element bonus, floored at `STAT_FLOOR`. Off the board: printed (+ Ascend) |
| `printedKeywords(s, iid)`, `activeKeywords(s, iid)` | facade, query | `KwMask`. Active = printed, minus everything if face-down, minus a used Ward's `beforeDestroy` bits; 0 off the board (D-037, D-133) |
| `elementOf(s, iid)`, `kindOf(s, iid)` | facade, query | A Chimera's element is its first material's; Chimeras, spells and traps have kind −1 (D-129) |
| `attackPermission(s, iid)`, `attackRestriction(s, iid)` | facade, query | §6.2 lattice; the restriction fold alone (D-212) |
| `mustAttack(s, iid)` | facade, query | OR of active `mustAttack` hooks (Vain) |
| `previewCombat(s, attacker, target \| -1)` | facade, query | `CombatPreview` (§5.4); `{ known: false }` for a face-down target |
| `previewGraft(s)` | facade, query | `GraftPreview \| null` (§5.6) |
| `bondOptions(s)` | facade, query | `BondPreview`: every legal bond action with its predicted result and Appraisal exposure (§5.6c, D-313). Facts only; the "best" hint is `ai/bots/rank-bonds.ts` |
| `redactState(s, viewer)` | root function | Empties the opponent's hand, deck and trap slots and the viewer's own deck; `log: null`. A face-down opponent monster keeps its identity: look-ahead code must not apply an action that targets one (D-209) |
| `resolveNum`, `deckForSeed`, `hashState`, `replay`, `toActions`, `seedString`, `rerollSeed`, `canonicalJson`, `deepFreeze`, `cyrb128`, `Sfc32`, `defineKeyword`, `EngineError` | root | as in the sections that define them |
| types: state, actions, events, content, globals, hooks, effects, `CombatPreview`, `CombatOutcome`, `GraftPreview`, `IntentPolicy`, `Engine*` | root | — |

Every query is a pure function of the bound content, the bound globals and its arguments. It never writes `s`, keeps no reference into it, has no cache, and works on a `Tx` draft or a frozen state. A query is a direct call with the bound `Env`. Only the two previews allocate (their result and one dispatcher). That is what lets the AI call them inside look-aheads within the §18 budget. `ai` has no copy of any rule: `ai/shared/mirror.ts` is deleted (D-209).

---

## 9. Effect-primitive DSL

### 9.1 Types

```ts
// packages/engine/src/types/effects.ts
export type Num = number | `$${string}` | `-$${string}`;   // literal or (negated) global ref (D-074); resolved by
                                                             // resolveNum: CONTENT_NUMBERS first, then core globals (D-171)
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
- Conditions: `TargetSpec.where` filters candidates during legality. `TrapDef.when` is checked when the trap's turn in the subscriber list comes (D-071), on the triggering monster: the attacker, the destroyed monster or the grafted Chimera (D-185). `Effect.if` is checked just before the effect resolves. A condition on a destroyed monster (an `allyDestroyed` `when`, or an `if` on target `destroyed`) may use only zone-independent leaves: `type`, `relic`, `chimera`, `element`, `kind`, `graftedThisTurn` (validator, D-185).
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

These listings are a launch snapshot (D-166), and the JSON files are canonical. After the D-172 migration, each `text` holds placeholders instead of digits (e.g. Unmake: `"Destroy an enemy monster with Power {UNMAKE_MAX_POWER} or less."`) and renders to the strings shown here.

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
| `cards/player-monsters.json` | `{ id, type:"monster", name, element, kind, power, guard, keywords: string[] (≤ MAX_BASE_KEYWORDS, validator, D-173, D-201), text? }` ×25 at launch |
| `cards/player-spells.json`, `player-traps.json` | §9.2 |
| `cards/relics.json` | `{ id, type:"monster", name, element, kind, power, guard, keywords: string[] (≤ MAX_BASE_KEYWORDS), flaw: string }` ×13 at launch |
| `cards/collector-spells.json`, `collector-traps.json` | §9.2 |
| `collector.json` | `{ deck: string[20], ace (a Relic id that is in deck, D-203), canGraft:false, ai: {…} (§13), dialogue: { composed[], agitated[], desperate[] } }` |
| `objectives.json` | `{ id, text, requiresWin: true, metric, lte?|gte? (Num) }` |
| `twists.json` | `{ id, text, isoWeek?: "YYYY-Www", modifiers: [{ where: Cond, power?, guard? }] }` |
| `art-briefs.json` | `{ [cardOrFamilyId]: "mood · pose · palette" }` (D-110; missing/orphan = warning, D-174) |

Counts (×25, ×13, …) are launch values, not constraints (D-166). Ids are permanent: a rename changes `name` only (D-175). Card, objective, twist and keyword `text` may use `{NAME}` / `{NAME|word|words}` placeholders (D-172).

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
  keywords: z.array(Id).default([]),          // count ≤ MAX_BASE_KEYWORDS is a validator rule (D-173, D-201)
  text: z.exactOptional(z.string()),          // placeholders checked by the validator (D-172)
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
// utility.order[] ∈ {castDrawSpell, setTrap, pass}; tieBreak[] ∈ {leftmostSlot, cardId, instanceId}
// castHighValueSpell (D-204): a record keyed by Collector spell id (the validator checks each key is a Collector spell
// in the deck, D-145); each value has exactly one of pick ∈ {highestPower} or when ∈ {contestedAttack}:
const CastWhen = z.object({ pick: z.exactOptional(AI_PICK), when: z.exactOptional(AI_WHEN) }).strict()
  .refine((e) => (e.pick === undefined) !== (e.when === undefined),
    { message: 'needs exactly one of "pick" or "when"', params: { fix: 'keep exactly one of "pick" or "when"' } });
// AiParams.castHighValueSpell: z.record(Id, CastWhen)

// globals.ts — GlobalsSchema: a strict object for every Globals key, proof `z.ZodType<Globals>`, plus the
// "globals sanity" refinements of §10.3 (D-147). CONTENT_NUMBERS: z.record(/^[A-Z][A-Z0-9_]*$/, z.int()), no name
// shared with a core key (D-171). Globals the code supports at one value only are pinned (D-170, D-199, D-202);
// globals whose reader isn't built yet are listed in planned-globals.ts, not pinned (D-205, §11).

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

Parse errors come from zod 4 issues rendered by `files.ts › describeIssue` (D-146, D-207). Cross-file rules produce the same record shape. `files.ts › formatError` leaves out the `<field>: ` part when the problem concerns the whole entry (field `''`, D-165, D-206); nothing prints `(entry)`. A problem that belongs to a whole file uses `(file)` as its entry (`keywords/index.gen.ts › (file) › …`, `elements.json › (file) › file is missing › create elements.json`). The examples below are the real output, or the target text of the D-entry named in the row until that code lands (D-208). A message change also updates CONTENT_GUIDE, `content/test/guide.test.ts` and `docs/CHANGELOG.md` in the same commit (D-208).

| Rule | Example message |
| --- | --- |
| zod parse error | `cards/player-monsters.json › kiln-whelp › power: expected number, got "7" › write numbers without quotes` |
| missing required field (D-207) | `cards/player-monsters.json › example-beast › power: missing › add "power"` |
| unknown key (zod strict) | `cards/relics.json › r1 › unknown key(s) foo › remove foo` (whole entry, so no field part, D-206) |
| unknown AI rule id / param value (zod enum, D-145) | `collector.json › ai › play.[2]: got "summonBeeter" › use one of: winThisTurn, summonAce, summonBeater, …` |
| AI card refs (D-145, D-204) | `collector.json › ai › trapPreference.[1]: "snare" is not a Collector trap in the deck › use a trap id from collector.json › deck`; for spells: `collector.json › ai › params.castHighValueSpell.forfeit: "forfeit" is not a Collector spell in the deck › use a spell id from collector.json › deck` (mood form: `moods.agitated.params.castHighValueSpell.forfeit: …`) |
| `castHighValueSpell` entry shape (D-204, D-207) | `collector.json › ai › params.castHighValueSpell.x: needs exactly one of "pick" or "when" › keep exactly one of "pick" or "when"`; a `contestedAttack` entry on a spell with no `modifyStats` on `chosen` whose Power resolves (with the validated globals, `if` effects included) above 0: `collector.json › ai › params.castHighValueSpell.x: "contestedAttack" needs a spell that gives Power to "chosen" › use "pick": "highestPower" instead` (D-219) |
| Collector ace (D-203) | `collector.json › ace › "no-such-relic" is not a Relic › use a Relic id from cards/relics.json`; `collector.json › ace › "the-unpriced" is not in the deck › add it to the deck list in collector.json` |
| duplicate id (any file, incl. families) | `cards/relics.json › halo-stag › duplicate id (also in cards/player-monsters.json) › rename one of them` |
| unknown element/kind | `cards/player-monsters.json › stormcrow › unknown element "wind" › use one of: ember, gale, tide, lumen, umbra, or add it to elements.json` |
| unregistered keyword/Flaw | `cards/relics.json › reliquary-hound › keyword "hant" is not registered › use one of: echo, haunt, pierce, sentinel, swift, ward, or add packages/content/keywords/hant.ts`; for a Flaw: `cards/relics.json › x › Flaw "frail" is not registered › use one of: brittle, covetous, slow, tethered, vain, or add packages/content/keywords/frail.ts` (D-198). A Flaw in a `keywords` list is an error too (D-198) |
| board-state condition on a destroyed monster (D-185) | `cards/player-traps.json › x › condition "powerGte" can't be checked on a destroyed monster › use type, relic, chimera, element, kind or graftedThisTurn` |
| Flaw on a player card (D-207) / keyword used as Flaw (D-198) | `cards/player-monsters.json › halo-stag › Flaws appear only on Relics › remove "flaw"` (only `flaw` unknown; with other unknown keys the generic `unknown key(s) …` line lists them all); `cards/relics.json › x › "swift" is a keyword, not a Flaw › use one of: brittle, covetous, slow, tethered, vain` |
| Relic without its Flaw (D-207) | `cards/relics.json › stormglass-hydra › flaw: missing, a Relic needs exactly 1 Flaw › add "flaw": "<flaw id>"`. More than one Flaw can't be written (`flaw` is one id; `RELIC_FLAWS` pinned to 1, D-202) |
| base card or Relic with > `MAX_BASE_KEYWORDS` keywords (validator, not zod; D-173, D-201) | `cards/player-monsters.json › example-beast › keywords: has 2 keywords, max MAX_BASE_KEYWORDS=1 › remove 1 keyword` (same for `cards/relics.json`) |
| stat budget (D-109) — **warning** (D-167) | `warning: cards/player-monsters.json › kiln-whelp › budget 11 (P7+G3+1kw) outside 8–10 › lower Power or Guard by 1 if this is not intended` |
| missing kind-pair recipe | `recipes.json › (construct, wisp) › no Chimera recipe for this kind pair › add {"kinds":["construct","wisp"], …}` |
| duplicate kind-pair recipe | `recipes.json › packmaw-2 › pair (beast, beast) already defined by packmaw › delete one` |
| element `beats` unknown / missing color or icon | `elements.json › umbra › beats unknown element "lumin" › use an id from elements.json` |
| Collector deck ≠ 20 | `collector.json › deck › has 19 cards, needs COLLECTOR_DECK_SIZE=20 › add 1 card id` |
| unknown deck reference / wrong pool | `collector.json › deck[4] › "halo-stag" is a player card › use a card from relics.json or collector-*.json` |
| Covetous off the ace | `cards/relics.json › ashen-duchess › Covetous is ace-only › change flaw or set collector.json ace` |
| unknown global ref in effect (core globals and `CONTENT_NUMBERS`, D-171) | `cards/player-spells.json › unmake › "$UNMAKE_MAX_POWR" not in globals.ts › did you mean $UNMAKE_MAX_POWER?` |
| unknown global ref in a keyword source (`'$NAME'`, `num('NAME')` literals, D-171) | `keywords/x.ts › x › "$FOO" not in globals.ts › did you mean $FOOD?` |
| effect/target mismatch | `cards/player-spells.json › bloodlust › effect uses target "chosen" but card has no "target" › add a target spec`; the reverse: `… › has a "target" but no effect uses "chosen" › remove "target" or use "chosen" in an effect` (D-164) |
| spell ref other than `chosen` (D-163) | `cards/player-spells.json › x › ref "attacker" is not available for spells › use "chosen" with a target spec` |
| trap ref not available for trigger (§9.1 table, D-163) | `cards/player-traps.json › x › ref "grafted" is not available for trigger "enemyAttack" › use attacker or defender` |
| `cancelAttack` outside an attack-trigger trap (D-163) | `cards/player-spells.json › x › "cancelAttack" only works in a trap with trigger enemyAttack or enemyDirectAttack › remove it or change the trigger` |
| card text > one sentence (checked on the rendered text) | `cards/... › id › text has 2 sentences › shorten to one sentence` |
| malformed placeholder (cards, objectives, twists, keywords; D-172) | `cards/player-spells.json › unmake › text: malformed placeholder "{Unmake}" › write {NAME} or {NAME\|word\|words} with a global name in capitals` |
| unknown placeholder | `cards/player-spells.json › unmake › text: unknown placeholder {UNMAKE_MAX_POWR} › did you mean {UNMAKE_MAX_POWER}?` (no close match: `› use a numeric name from globals.ts`) |
| non-numeric placeholder | `cards/player-spells.json › x › text: {CONTENT_VERSION} is not a number in globals.ts › use a numeric global` |
| bare number in text of a card/objective that references a global | `cards/player-spells.json › unmake › text: bare number "5" while the card uses $UNMAKE_MAX_POWER › write {UNMAKE_MAX_POWER} instead of 5` (several refs: `› write one of {GILT_POWER}, {GILT_GUARD} instead of 2`) |
| bare number in keyword/Flaw text (any digit) | `keywords/haunt.ts › haunt › text: bare number "2" › write a {NAME} placeholder for the global the keyword uses` |
| placeholder unused by the card — **warning** | `warning: cards/player-spells.json › siphon › text: {SIPHON_GAIN} is not used by this card's effects or conditions › check the name` |
| art brief missing / orphan — **warnings** (D-174) | `warning: art-briefs.json › gale-serpent › missing art brief › add a one-line "mood · pose · palette"` / `warning: art-briefs.json › x › orphan brief, no card or Chimera family has this id › delete the entry` (D-164) |
| pool can't fill the deck (D-170) | `cards/player-spells.json › pool › 2 spells × MAX_COPIES=2 can't fill DECK_SPELLS=5 › add 1 spell, or lower DECK_SPELLS or raise MAX_COPIES in globals.ts` |
| Collector card the AI never plays — **warnings** (D-177) | `warning: collector.json › deck[n] › Collector spell "x" has no AI rule that casts it › add "x" to ai.params.castHighValueSpell with a pick, or make it draw-only` / `warning: collector.json › deck[n] › Collector trap "x" is not in ai.trapPreference › add it, or AI rule 4 never sets it` |
| objective metric unknown (zod enum) | `objectives.json › win-fast › metric: got "rounds" › use one of: grafts, playerLife, round, appraisedLost` |
| objective threshold (refinement with `params.fix`, D-207) | `objectives.json › win-fast › needs exactly one of "lte" or "gte" › keep exactly one of "lte" or "gte"` |
| keyword file problems | `keywords/haunt.ts › haunt › id "haunted" ≠ file name › rename the file or the id` / `keywords/index.gen.ts › (file) › stale, does not match keywords/*.ts › run pnpm content:gen` (and `… › (file) › missing › run pnpm content:gen`). Registry-only checks (duplicate id, kebab-case, empty display field, sentences, ≤ 32) run in `validateContent`; file checks stay in `keyword-files.ts` (D-198) |
| keyword without examples — **warning** (D-196) | `warning: keywords/x.ts › x › no examples › add one board-DSL example with declared cards (D-169)` |
| deckgen feasibility (`feasibility.ts › checkDeckgen`, run by `content:check` on engine `deckForSeed`, 1,000 dates from 2026-01-01; skipped when the pool-capacity rule fails; D-200) | `cards/player-monsters.json › pool › deck constraints unsatisfiable on 3 of 1000 test dates › relax DECK_MIN_ELEMENTS, DECK_MIN_KINDS or the CURVE_* globals, or add monsters` |
| globals sanity (`GlobalsSchema`, D-147, D-199) | `globals.ts › APPRAISAL_ROUNDS › round 13 > MAX_ROUNDS=12 › remove it`. Also: every `Range` has min ≤ max; every number and `CONTENT_NUMBERS` value is ≥ 0 (`must be 0 or more › use 0 or more`); the rates `SEED_WINRATE_*`, `BOT_NOISE_EPSILON`, `TARGET_NOVICE_POINT`, `TARGET_SEED_REJECT_MAX` and the star cuts lie in 0…1; `SEED_WINRATE_MIN ≤ SEED_WINRATE_MAX`; `globals.ts › DIFFICULTY_STAR_CUTS › cuts must descend, got [0.4, 0.6] › write the higher (1-star) cut first` |
| pinned global set to an unsupported value (D-170, D-199, D-205) | `globals.ts › RELIC_FLAWS › must be 1 until the engine supports other values › keep 1` (D-202). The same form for `WARD_CHARGES` (D-133), `PLAYS_PER_TURN`, `REPOSITIONS_PER_TURN`, `ATTACKS_PER_TURN` (D-190), `MIN_GRAFT_MATERIALS` (`2`), and the flag `globals.ts › FLAGS › ACE_SET_ASIDE: must be false until the engine supports other values › keep false` (until D-184's plumbing) |
| `--set` errors (`withOverrides`, D-199) | `OverridesError` with `ContentError` records; `globals.ts › PLAYER_LEFE › unknown key › use a key from globals.ts or a name already in CONTENT_NUMBERS`; whole-object `FLAGS=…` / `CONTENT_NUMBERS=…`: `globals.ts › FLAGS › set one entry at a time › write FLAGS.<NAME>=<value>` |
| `CONTENT_NUMBERS` name clash (D-171) | `globals.ts › CONTENT_NUMBERS › PLAYER_LIFE: PLAYER_LIFE is already a core key of Globals › rename it, or change the core PLAYER_LIFE instead` |
| unused content number — **warning** (D-205; `content:check` only, needs the keyword-source scan) | `warning: globals.ts › CONTENT_NUMBERS › QUILL_TOLL: not used by any card, objective, AI param or keyword › delete the line, or use $QUILL_TOLL in an effect` |
| delete-a-card reverse refs | `collector.json › deck[7] › "kiln-born-leviathan" no longer exists › remove the reference` |

**Warnings** never fail `content:check` or the build. They are printed first, prefixed `warning:`. The full list: stat budget (D-167), unused placeholder (D-172), art brief missing/orphan (D-174), Collector card unplayable by the AI (D-177), keyword without examples (D-196), and unused content number (D-205). The pool-size warning and the `POOL_*` globals are gone (D-170); the pool-capacity error replaces them.

**Info lines** follow the success summary and never fail the run: `not yet checked (TODO, §10.3): …` for each deferred rule (none today), and, while `planned-globals.ts` is not empty, `not yet read: 28 globals wait for ai, engine, sim, web › see packages/content/src/planned-globals.ts` (count and readers computed; D-205).

### 10.4 One change, one edit (D-166…D-177, D-201…D-205)

After the D-166 switch, the content JSON and `globals.ts` are canonical for every value. DESIGN.md keeps the rules. `TARGET_*`, the proposal levers and the `collector.json › ai` rule lists are owner-only (D-166); the AI card lists (`castHighValueSpell` ids, `trapPreference`) are not (D-204). The edits for common changes:

| Change | Edit | What reacts |
| --- | --- | --- |
| Tune a number | its value in `globals.ts` (core or `CONTENT_NUMBERS`) | `content:check` (sanity), sim; card text re-renders |
| Try a number without editing | `--set NAME=V` (sim), `?set=NAME=V` (web dev, D-176) | — |
| New number for a new card | one line in `globals.ts › CONTENT_NUMBERS` (D-171) | `content:check` (refs, placeholders) |
| Change a card's stats, keywords, effects, text | its JSON entry | `content:check` (budget is only a warning) |
| Add or remove a card | its JSON entry (+ Collector deck entry for his cards) | `content:check` (refs, pool capacity, deckgen, art-brief warning; unused content number warning after a delete, D-205) |
| Add a Collector spell or trap he plays | card entry + deck line + `ai.params.castHighValueSpell.<id>` (spell, D-204) or `ai.trapPreference` (trap); a draw-only spell needs no AI entry (D-085). The AI entry is a card list the owner edits freely (D-204) | `content:check` (D-145 refs; D-177 warning if the AI entry is missing) |
| Change the Collector's ace | `collector.json › ace` (a Relic in his deck) | `content:check` (D-203) |
| Rename a card | `name` only; the id is permanent (D-175) | — |
| Change a Chimera family | its `recipes.json` entry | `content:check` |
| Add a kind | `kinds.json` + one recipe per new pair | `content:check` lists each missing pair |
| Add an element | `elements.json` (+ `beats` in others) | `content:check` |
| Add a keyword | one `keywords/<id>.ts` + `pnpm content:gen` | `content:check`, its generated examples |

Tests never pin live values or counts (D-168). Engine tests use fixture content and `TEST_GLOBALS`. Keyword examples declare their own cards (D-169). The only live-content test is "loads, validates, compiles and plays".

### 10.5 CONTENT_GUIDE.md plan (D-178; docs-keeper)

`docs/CONTENT_GUIDE.md` is written for a non-engineer. Each section gives the exact file, a copy-paste template, one worked example, the commands to run, and the `content:check` messages it can trigger, with fixes. Every worked example is backed by `packages/content/test/guide.test.ts`, which applies it to a temp copy (`loadContent(tmpRoot)`) and asserts the stated result. Examples set up what they need on the copy and never assume live values. Sections, in order (**P** = must exist before v0.1 playtesting):

1. **P** Where things live: values in JSON/`globals.ts` vs rules in DESIGN.md (D-166), and which settings are owner-only.
2. **P** The edit loop: edit → `pnpm content:check` → `pnpm sim:quick` → play it in `pnpm dev` (hot reload, D-176) → commit. Bump `CONTENT_VERSION` only for a new playtest build (D-179).
3. **P** Reading `content:check` output: the line format `<file> › <entry> › [field:] problem › fix`, errors vs warnings vs "not yet checked", and a table of the most common messages (§10.3).
4. **P** Change a monster or Relic: stats, keywords, Flaw, element, kind. Covers the budget warning, `MAX_BASE_KEYWORDS`, and the keyword and Flaw ids.
5. **P** Add or remove a card: monster, spell, trap or Relic; for the Collector, his deck list, `COLLECTOR_DECK_SIZE` and the AI params (D-177); art briefs; what the validator lists after a delete; ids are permanent and a rename changes `name` (D-175).
6. **P** Write card text: one sentence, `{NAME}` and `{NAME|card|cards}`, the bare-number rule, and how the text renders with overrides (D-172).
7. **P** Tune a global: permanently (edit `globals.ts`) and temporarily (`--set` in the sim, `?set=` in the web dev build); add a card number to `CONTENT_NUMBERS` (D-171); flags; owner-only settings.
8. Spells and traps in the DSL: ops, triggers, refs per trigger (§9.1), conditions and durations, with a template for each launch pattern.
9. Chimera recipes: change a family's name or stats.
10. Add a kind or an element, and the recipes and briefs that follow (the validator lists every missing kind pair; `beats` for advantage; color + icon).
11. Add a keyword or Flaw: the `keywords/<id>.ts` template, `pnpm content:gen`, examples with `card` declarations (D-169), text placeholders, the one-shot replacement rule (D-133), the 32-keyword limit, and "justify it against the six" (KW-12).
12. When a new effect needs engine work: how to tell (no op, trigger, ref, condition or duration fits), and the request template (card text, desired behaviour, the missing piece, an example board) sent to game-architect, who logs a D-entry and routes it to engine-dev.
13. The Collector: deck, ace, dialogue, and why AI rule lists and moods are owner-only.
14. Objectives and weekly twists.
15. Art: briefs and dropping in paintings (`public/art/<id>.webp`).
16. Checking balance: `sim:quick` / `sim:full`, reading the report against `TARGET_*`, and `--ab`.

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
  // Decks (player deck size = DECK_MONSTERS + DECK_SPELLS + DECK_TRAPS, engine playerDeckSize(g); the pool is
  // whatever the JSON holds — PLAYER_DECK_SIZE, COLLECTOR_DECK_MONSTERS/SPELLS/TRAPS and POOL_* removed, D-170)
  COLLECTOR_DECK_SIZE: 20,
  DECK_MONSTERS: 15, DECK_SPELLS: 5, DECK_TRAPS: 4, MAX_COPIES: 2,
  // Hand, draw, turn
  OPENING_HAND: 5, HAND_SIZE: 5, MAX_DRAW_PER_TURN: 2, REDRAWS: 1, OPENING_MIN_MONSTERS: 2,
  FIRST_ATTACK_ROUND_PLAYER: 2, PLAYS_PER_TURN: 1, REPOSITIONS_PER_TURN: 1, ATTACKS_PER_TURN: 1,
  // Board
  BOARD_SLOTS: 3, TRAP_SLOTS: 2,
  // Combat
  ELEMENT_BONUS: 2, STAT_FLOOR: 0,
  // Keywords & Flaws
  MAX_BASE_KEYWORDS: 1, MAX_INHERITED_KEYWORDS: 2, WARD_CHARGES: 1,
  HAUNT_PENALTY: 2, TETHERED_PENALTY: 2, RELIC_FLAWS: 1, SLOW_TURNS: 1,   // 1 = entry turn only (M-01's 2 withdrawn, D-280)
  // Rule changes of 2026-10-16 (D-280…D-287); the shipped values are today's rules until the sim A/B
  SICKNESS_MODE: 'classic',      // 'classic' | 'monstersOnly' (D-280)
  SENTINEL_REACH: 1,             // lanes each side of a Sentinel; read only with FLAGS.LANES (D-283)
  LANE_MOVE_RANGE: 1,            // read only with FLAGS.LANES (D-282)
  // Bond actions of 2026-10-16 (D-305…D-316); today's rules are the default
  SYMBIOSIS_GUARD_BONUS: 2,      // host Guard while a symbiote is attached; read with FLAGS.SYMBIOSIS (D-308)
  BOND_GRAFT_MAX_HAND_MATERIALS: 3,   // 3 = MAX_GRAFT_MATERIALS = no limit; read only with FLAGS.BOND_ACTION (D-306)
  SPLIT_PART_PERM_P: 0,          // permP of each Split part; negative = weaker parts (D-307)
  BONDS_PER_TURN: 1, SYMBIOTES_PER_HOST: 1,   // pinned (D-205)
  // Graft
  MIN_GRAFT_MATERIALS: 2, MAX_GRAFT_MATERIALS: 3, ASCEND_POWER: 2, ASCEND_GUARD: 1,
  UNSTABLE_BONUS: 3, UNSTABLE_EXPIRY_TURNS: 2,            // destroyed at end of turn + 2 ("your next turn")
  UNSTABLE_EXPIRY: 'endOfNextOwnTurn',                    // DESIGN; 'startOfOwnTurnAfterNext' = proposal M-02
  // Stat budget & text
  STAT_BUDGET_MIN: 8, STAT_BUDGET_MAX: 10, KEYWORD_COST: 1, MAX_TEXT_SENTENCES: 1,   // budget miss = warning (D-167)
  // Durations (turn-index offsets)
  DURATION_NEXT_OWN_TURN: 2,
  // Appraisal
  APPRAISAL_ROUNDS: [3, 6, 9], APPRAISAL_MIN_POWER: 7,
  // Moods (Composed = above AGITATED_AT)
  MOOD_AGITATED_AT: 15, MOOD_DESPERATE_AT: 7,
  // Deck generation
  DECK_MIN_ELEMENTS: 3, DECK_MIN_KINDS: 4,
  CURVE_LOW_MAX_POWER: 5, CURVE_LOW_MIN_COUNT: 4, CURVE_HIGH_MIN_POWER: 6, CURVE_HIGH_MIN_COUNT: 3,
  DECKGEN_MAX_ATTEMPTS: 1000, SHUFFLE_MAX_ATTEMPTS: 1000,
  // Difficulty check
  SIM_RUNS_PER_SEED: 500, SEED_WINRATE_MIN: 0.30, SEED_WINRATE_MAX: 0.70,
  SEED_MAX_REROLLS: 20, BOT_NOISE_EPSILON: 0.10, DIFFICULTY_STAR_CUTS: [0.5667, 0.4333],
  // Daily loop
  RESET_HOUR_LOCAL: 0, OBJECTIVES_PER_DAY: 3, OBJECTIVE_STARS_MAX: 3,
  // Balance targets (sim report pass/fail) — owner-only (D-166)
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
  // Collector AI (read by ai as properties, so core globals; D-171)
  AI_SEARCH_NODE_BUDGET: 600,   // win-search safety cap; never binds with BOARD_SLOTS 3 (D-211)
  // Feature flags
  FLAGS: {
    ASCEND: true, UNSTABLE: true, APPRAISAL: true, MOODS: true, INTENTS: true,
    WEEKLY_TWIST: false, REDRAW: true, BONUS_OBJECTIVES: true, ANIMATIONS: true, DEBUG_OVERLAY: false,
    // Proposal levers (DECISIONS §M): these defaults = DESIGN as written (CHIMERA_TO_HAND: true allows Echo/Grave
    // Recall of Chimeras per D-046/D-068; false = M-12). Changed only for sim A/B until the owner adopts one.
    APPRAISED_ENTERS_GUARD: false, ACE_SET_ASIDE: false, CHIMERA_TO_HAND: true,
    LANES: false, LANE_SWAP: true,   // D-281, D-282: LANES off = free targeting, as today
    SPLIT: false, SYMBIOSIS: false, BOND_ACTION: false,   // D-305…D-310: all off = Graft is the one play, no Split, no Symbiosis
  },
  // Content numbers (D-171): referenced only as "$NAME" from data or keyword effects, and as {NAME} in text.
  // Open record: add a line here for a new card number. Names must not repeat a core key.
  CONTENT_NUMBERS: {
    // Player spells & traps
    UNMAKE_MAX_POWER: 5, BLOODLUST_POWER: 3, SCRYING_DRAW: 2, SIPHON_DRAIN: 3, SIPHON_GAIN: 3,
    MIRROR_SIGIL_PENALTY: 3, LAST_RITES_DRAW: 1,
    // Collector spells & traps
    PROVENANCE_DRAW: 2, GILT_POWER: 2, GILT_GUARD: 2, FORFEIT_MAX_POWER: 4,
    COUNTERFEIT_PENALTY: 3, INSURANCE_HEAL: 3,
    // Objectives
    OBJ_HIGH_LIFE: 15, OBJ_WIN_BY_ROUND: 8,
    // Collector AI params
    AI_FACEDOWN_ATTACK_MIN_POWER: 7,
  },
} as const satisfies Globals);

export function withOverrides(base: Globals, sets: readonly string[]): Globals; // "KEY=VALUE", "FLAGS.ASCEND=false",
// "APPRAISAL_ROUNDS=[3,6]", "UNMAKE_MAX_POWER=6" (routed to CONTENT_NUMBERS; "CONTENT_NUMBERS.UNMAKE_MAX_POWER=6" also
// works, D-171); each VALUE is JSON-parsed (a bare word is a string); unknown keys are rejected (a --set never adds a
// number); the merged object is validated with GlobalsSchema (schemas/globals.ts, incl. sanity checks) and returned
// deep-frozen (D-147). FLAGS and CONTENT_NUMBERS are set one entry at a time, never as a whole object. Problems are
// thrown as one OverridesError carrying ContentError records (D-199).
// Card stat overrides ("card.kiln-whelp.power=6") live in sim/overrides.ts and are applied to raw content before compile.
```

**Read, pinned or planned (D-205).** Every core global and every flag is in exactly one state, checked by `packages/content/test/globals-readers.test.ts`:

- **Read:** a non-test source in engine, content (incl. `keywords/`), ai, sim or web names it, or the content JSON references it as `"$NAME"`.
- **Pinned:** the code supports one value only, so `GlobalsSchema` refuses any other with the D-199 message (`pinned()` / `pinnedFlag()`): `WARD_CHARGES`, `PLAYS_PER_TURN`, `REPOSITIONS_PER_TURN`, `ATTACKS_PER_TURN`, `MIN_GRAFT_MATERIALS`, `BONDS_PER_TURN`, `SYMBIOTES_PER_HOST`, `RELIC_FLAWS` (D-202), `FLAGS.ACE_SET_ASIDE` (D-184). The change that teaches the code a pinned key removes its pin.
- **Planned:** its reader isn't built yet. Listed, not pinned, in `packages/content/src/planned-globals.ts`; any sane value is accepted and takes effect when the reader lands. `content:check` prints the `not yet read` info line (§10.3). The test fails when a planned key becomes read (delete its line), when a key is in no state, and when a key is both pinned and planned.

```ts
// packages/content/src/planned-globals.ts (browser-safe, exported from the content root)
export interface PlannedGlobal { readonly reader: 'engine' | 'ai' | 'sim' | 'web'; readonly where: string }
export const PLANNED_GLOBALS: Readonly<Record<string, PlannedGlobal>> = {
  OBJECTIVES_PER_DAY:         { reader: 'ai',     where: 'ai/difficulty.ts › prepareDay (D-102)' },
  OBJECTIVE_STARS_MAX:        { reader: 'engine', where: 'engine meta/objectives.ts (D-102)' },
  RESET_HOUR_LOCAL:           { reader: 'web',    where: 'web daily/date.ts (D-104)' },
  'FLAGS.BONUS_OBJECTIVES':   { reader: 'engine', where: 'engine meta/objectives.ts (BO-1)' },
  'FLAGS.ANIMATIONS':         { reader: 'web',    where: 'web duel store (§16)' },
  'FLAGS.DEBUG_OVERLAY':      { reader: 'web',    where: 'web debug overlay (§16)' },
  AI_SEARCH_NODE_BUDGET:      { reader: 'ai',     where: 'ai/collector/win-search.ts (D-211)' },  // until ai reads it
  // ai/sim keys formerly exempt by prefix (D-170): SIM_RUNS_PER_SEED, SEED_WINRATE_MIN/MAX, SEED_MAX_REROLLS,
  // BOT_NOISE_EPSILON, DIFFICULTY_STAR_CUTS (ai/difficulty.ts); SIM_QUICK_GAMES, SIM_FULL_GAMES,
  // SIM_SEED_CHECK_DATES, TARGET_*, PERF_DUELS_PER_SEC_PER_CORE (sim) — one line each
};
```

This listing is the launch snapshot. From the D-166 switch, `globals.ts` itself is canonical. Owner-only (a change needs an owner-approved D-entry): `TARGET_*`, the proposal levers (`FLAGS.APPRAISED_ENTERS_GUARD`, `FLAGS.ACE_SET_ASIDE`, `FLAGS.CHIMERA_TO_HAND`, `UNSTABLE_EXPIRY`, `SLOW_TURNS`, `SICKNESS_MODE`, `FLAGS.LANES`, `FLAGS.LANE_SWAP`, `SENTINEL_REACH`, `LANE_MOVE_RANGE`, `FLAGS.SPLIT`, `FLAGS.SYMBIOSIS`, `FLAGS.BOND_ACTION`, `BOND_GRAFT_MAX_HAND_MATERIALS`) and `WARD_CHARGES`. `SYMBIOSIS_GUARD_BONUS` and `SPLIT_PART_PERM_P` are tuning. Everything else is tuning (owner, or balance-analyst with a `BALANCE_LOG.md` entry).

Where things live (D-147): `deepFreeze` is in `packages/engine/src/freeze.ts` and exported from the engine root. It and `canonical.ts › canonicalJson` (sorted keys, D-191) are the engine's two order-insensitive key iterations, each with a documented lint exception. `GlobalsSchema` is in `packages/content/src/schemas/globals.ts`. `DEFAULT_GLOBALS` and `withOverrides` are in `packages/content/src/globals.ts`, exported from the content root. The engine's `packages/engine/test-utils/globals.ts › TEST_GLOBALS` is an engine-owned **fixture**, deliberately independent of `DEFAULT_GLOBALS` (`CONTENT_VERSION: '0.0.0-fixture'`, its own `CONTENT_NUMBERS`). TypeScript checks its shape, and a content test checks that it passes `GlobalsSchema`. Nothing compares its values with the real globals (D-168, superseding D-143).

`Globals` is an engine-side interface (`packages/engine/src/types/globals.ts`, widened types of the object above), so the engine is typed against it without importing content. The widening (D-126) is: numbers → `number` and strings → `string`. Min/max pairs (`TARGET_*`) → `Range = readonly [number, number]`, with the sanity check `min ≤ max`. `DIFFICULTY_STAR_CUTS` → `StarCuts = readonly [number, number]` (descending cuts, not a range). `APPRAISAL_ROUNDS` → `readonly number[]`. `UNSTABLE_EXPIRY` → `'endOfNextOwnTurn' | 'startOfOwnTurnAfterNext'`. `SICKNESS_MODE` → `'classic' | 'monstersOnly'`. `FLAGS` → `Flags`: 18 booleans, DESIGN's 10, the 3 proposal levers, `LANES`, `LANE_SWAP`, and `SPLIT`, `SYMBIOSIS`, `BOND_ACTION` (D-310). `NumericGlobal` (the keys whose type is `number`) plus the keys of `CONTENT_NUMBERS` (`Readonly<Record<string, number>>`) are the names an effect `Num` ref (`"$NAME"`) or a text placeholder (`{NAME}`) may use (D-120, D-171, D-172). A number that TypeScript reads as a property is a core global, and adding one is an engine change. A number referenced only by name is a content number, and adding one is one line. Globals and content are bound into the engine by `createEngine(compiled, globals, policies, options)`. A hash of both is stored in `state.cfg`: `c.hash + ":" + cyrb128(canonicalJson(g))`, which doesn't depend on key order (D-191). It is checked on replay: `replay(seed, actions, { cfg })` throws `EngineError` on a mismatch, and the web session stores `cfg` with its actions.

DESIGN numbers that are content rather than globals (with reason, D-074): monster/Relic Power/Guard (card JSON), Chimera family stats (recipes.json), weekly-twist values (twists.json). All are overridable from the sim. After the D-166 switch, these files are canonical too.

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
throw EngineError                                    // the engine has no ContentError (D-192)
```

`deckForSeed(c, g, seed)` (engine root) runs this on the seed's `deck` stream. `newGame`, ai's `prepareDay` and the `content:check` feasibility rule (D-200) all call it. Pools are sorted by card id (D-197).

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
  // answers from public information (D-209): engine queries on the state, or look-ahead on redactState(s, 1)
  previewAttack(attackerSlot: number, foeSlot: number | 'direct'): CombatEstimate; // engine.previewCombat
  previewSummon(card: OwnCard): SummonPreview | null;  // the summon applied to the redacted copy, then queried
  after(choice: ViewChoice): CollectorView | null;    // null for an action on a face-down foe monster
  winningAttacks(): readonly ViewChoice[];             // D-220
  winsAfter(choice: ViewChoice): boolean;              // D-220
}
```

**Bonds (D-311).** `FoeMonster` (public) gains `sym: PublicCard | null` and `OwnMonster` gains `sym` (his Appraised host), because an attached symbiote is face-up and public; `redactState` keeps `Monster.sym`. A face-down monster is never a host, so nothing hidden leaks. The view's `choices` never contain `split`, `symbiose` or a bond-slot `graftBegin` (the Collector never bonds). No rule id changes: Appraisal is not a choice, and `previewAttack` and the look-ahead use engine stats, so the host's Guard, keyword and the symbiote that comes out on a kill are already seen.

`ai/collector/view.ts` builds it from `GameState`. A unit test asserts that two states differing only in hidden information (player hand, deck order, face-down identities, player trap identities) produce identical views. That includes the answers of the look-ahead methods.

**Look-ahead (D-209).** Every look-ahead goes through one helper, `ai/shared/look-ahead.ts`:
- It applies actions with the Brain's engine (`{ events: false, log: false, trusted: true }`) to `redactState(s, viewer)`.
- The redacted copy is made once per decision and shared by that decision's look-aheads.
- The helper refuses an action that targets a face-down opponent monster, because `redactState` keeps those identities for legality.
- Stats, keyword state, attack permission and combat outcomes come from the engine facade (§8.7). `ai` keeps no copy of any rule.

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

**Lane rewording (D-286), active only with `FLAGS.LANES`.** `ai.params.summonLane` is an ordered list of closed-enum ids, `["sentinelCenter","facingBeatable","facingEmpty","leftmostFree"]`, used by `summonAce`, `summonBeater` and `summonFallback`; the first ids narrow the free lanes, the last tie-break is leftmost. `summonBeater` reads "if a lane is open and he holds a monster that beats the monster it would attack from that lane (the opposite one, or the Sentinel it is redirected to), play the card and lane whose target has the highest Power; ties leftmost lane, then card id". `killWithoutLoss`, `faceDownIfStrong`, `lethal`, `directIfEmpty` and Vain's `bestTarget` choose only among legal `(attacker, target)` pairs, so the attacker is nearly forced by lane (M-17 is then nearly moot). `reposition: "laneAware"` adds lane moves: a move or swap only if the lethal / `killWithoutLoss` / `directIfEmpty` rules take strictly more kills on the redacted copy afterwards (D-217 method), at most one per monster, slot order then lane ascending, empty lanes before swaps. `view.laneTargets(lane)` gives the targets of a hypothetical attacker in a lane. All inputs are public.

`reposition: "toAttackIfUsable"` = a guard monster switches to attack only if that gives it a rule 1, 2 or 4 attack; never attack → guard (D-089). `summonBeater.compare: "previewAttack"` = "beats" means `previewAttack` with post-summon stats and element bonus (D-083); `skipBrittleCountered` is the A/B switch for proposal M-10. Each rule id maps to a function in `ai/collector/rules/<id>.ts`: `(view, params) → ViewChoice | null`. Rule ids, reposition modes and string parameter values are closed zod enums in `content/src/schemas/collector.ts` (§10.2). A test in `packages/ai` asserts that the rule registry equals `AI_PLAY_RULES ∪ AI_ATTACK_RULES`, so a typo fails `content:check` and a missing rule file fails the tests (D-145). The policy walks the mood's list (mood overrides merge over the base) and takes the first non-null choice; if none, `endTurn` (or the forced Vain attack — `holdExceptVain` returns Vain attacks via `bestTarget`, D-091). Rule semantics: D-081…D-093.

**Where the block comes from (D-210).** `createCollector({ content, globals })` takes the `GameContent` (§3) and reads `content.collector.ai`. There is no separate `ai` option, and nothing reads `RAW_CONTENT`. So sim overrides of `collector.json` and web hot reload reach the AI without extra plumbing.

**Rule readings (D-212 to D-221), in short:**
- Rule 1 / `lethal` try every legal play on the redacted copy (D-220). The search is capped at `AI_SEARCH_NODE_BUDGET` nodes (D-211).
- Rule 2 summons the ace in attack position. For the sacrifice, a vault monster goes before a board one, and the weakest within each zone (D-213).
- Rule 4 sets only `trapPreference` traps. Step 7 also sets unlisted ones by card id (D-215).
- Rule 6's "Slow" is `attackRestriction === 'none'` on the entry turn (D-212). `guardUnlessBeater` with no face-up foe summons in attack (D-216). `allowFaceDown: true` turns guard summons face-down (D-214).
- `toAttackIfUsable` runs the mood's `lethal`, `killWithoutLoss` and `directIfEmpty` on the copy (D-217).
- `killWithoutLoss` ranks clean kills, then trades, then Ward strips. Which attacker takes a kill is an open owner item (D-218, M-17).
- `contestedAttack` applies the cast to the copy and compares `previewCombat` per target (D-219).

`castHighValueSpell` (D-087, D-204) is keyed by Collector spell id; each value has exactly one mode. `{ "pick": "highestPower" }`: the spell qualifies if it has a legal cast choice, and is cast on the target with the highest effective Power the view shows (face-down skipped, D-086; ties by `tieBreak`); an untargeted spell has its one choice. `{ "when": "contestedAttack" }`: D-087's Gilt Frame test, per target. The cast is applied to the redacted copy, and a face-up target that the monster doesn't destroy now must be destroyed after it (D-219). Candidates are the hand spells with an entry, in card-id order (D-090); the first that qualifies is cast, so JSON key order never matters. Mood params merge over base params per rule, then per key: a mood's `castHighValueSpell.<id>` replaces that id's base entry and leaves the others. Adding a spell the AI casts is a data entry; adding a mode is an enum value plus a handler.

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
- Intent: `ai/collector/intent.ts › intentPolicy: IntentPolicy` takes the `GameState` and applies `endTurn` to `redactState(s, 1)` with the Brain's engine. That runs the end of your turn and the start of his: turn hooks, Unstable expiry and Appraisal, with no draw. It builds `collectorView` of the result and simulates the rule lists on that view, so it uses no hidden information. It returns `appraise | attack | scheme | guard` with the priority in D-095:
  - appraise = that Appraisal took a monster;
  - attack = an attack rule fires after his repositions, or a forced (Vain) attack exists;
  - scheme = the first play rule that returns something returns a cast or a trap set (D-221). It is injected into the engine (D-096, D-150; required when `FLAGS.INTENTS` is on), stored in `state.collector.intent`, and shown by `IntentBadge`.

---

## 14. Player bots (`packages/ai/src/bots`)

All bots see a `PlayerView` (mirror of §13.1: own hand/board/traps, the Collector's public info, hand count, his set-trap count, the intent, mood) and choose an index from `getLegalActions`.

| Bot | Policy | Use |
| --- | --- | --- |
| novice | uniform random legal action (pending Graft steps included) (D-117) | target 20–30% |
| greedy | One-ply: apply each legal action to `redactState(s, 0)` through the look-ahead helper, score with `evaluate()`, take the best. It keeps its opening hand. A Graft is scored by its first-choice completion. A refused look-ahead (an action on a face-down Collector monster) scores as the current position (D-116, D-222) | diagnostic line |
| expert | per turn, enumerate turn plans = {reposition subsets} × {play options incl. full Graft variants} × greedy attack ordering; score end-of-turn positions with `evaluate()` (life diff, board power, Appraisal exposure next Collector turn, Unstable timers, trap count, element matchups, Collector Sentinels); hidden Collector hand treated as unknown (no peeking) | target 45–55%; difficulty-check reference with ε-noise (D-094) |

**Bond actions (D-312).** Novice: no change (uniform over the larger legal list). Greedy: `evaluate` terms `symbioteGuard`, `bondedKeyword`, `appraisalExposure`, `boardWidth` (read only when a bond switch is on) and the no-op bond penalty 1e-6. Expert: plan = reposition subsets × play × bond option, both orders, bond options pruned to `maxBondOptions` (6) by single-option greedy score. `ai/bots/rank-bonds.ts › rankBondOptions(preview, weights)` scores an engine `BondPreview` (§5.6c) for the UI's "best" hint.

Weights live in `bots/greedy.weights.json` and `bots/expert.weights.json`, tunable without code (D-222). They are bot settings, not globals, and tests never pin them. The expert's weights feed the difficulty check, which picks the date's reroll `k`, so milestone 2 ties them to the daily setup (D-222). The expert's plan enumeration is bounded (≤ ~400 plans/turn with launch content) and uses `engine.previewCombat`/`engine.previewGraft` (§8.7), not full engine clones, to stay within the performance budget.

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

**Bond matrix (D-314).** Cells: baseline, B, S, Y, BS, BY, SY, BSY, BSY+123L (`B` = `FLAGS.BOND_ACTION`, `S` = `FLAGS.SPLIT`, `Y` = `FLAGS.SYMBIOSIS`; `123L` = the D-287 package), plus the lever variants of D-314. Metrics from events: `splitsPerGame`, `symbiosesPerGame`, `bondUseShare`, bond mix, `splitAppraisalDodge`, `splitUnstableEscape`, `symbioteDoubleLoss`, `handMaterialGrafts`. Gate: with all three flags off the run equals the previous baseline exactly.

**Reports** (`report.ts`): `docs/reports/<cmd>-<date>.md` + `.json` with every DESIGN balance metric against its `TARGET_*` global (pass/fail), plus: win rate by bot, round-length histogram, share ending in round 12, grafts per winning game, Appraisal success rate, Unpriced appearance rate, seed rejection rate, intent accuracy, per-card play/win deltas, per-keyword trigger counts, duels/sec, and the exact globals/overrides/content hash used.

---

## 16. Web app (`apps/web`)

- **Store** (Zustand): the vanilla store in `store/game.ts` holds `GameState`, the `DailySetup`, the mode (`daily` or `practice`) and an animation queue fed by events; `duel/runtime.ts` runs the player's step and the Collector's turn (`playerStep`). Input is never blocked by animations: a new action is accepted immediately and pending animations fast-forward (`FLAGS.ANIMATIONS` off ⇒ instant). The Collector's turn runs synchronously through the policy; its events are animated afterwards.
- **Screens**: Home (deck list, difficulty stars, Appraisal reminder, start, "?" for How to play, feedback link), Duel (board, hand, Graft preview, intent badge, Appraisal countdown, card inspect, mood dialogue), Result (win/loss, rounds used vs par, life left, objective stars, share, feedback link), Binder, Stats, How to play (D-257..D-261). Practice reuses Duel in `practice` mode (D-105, D-249).
- **Graft UI** drives the pending-choice actions and renders `previewGraft()` before `graftPosition` commits; Cancel maps to `graftCancel`.
- **Accessibility**: element badge always renders color + icon; keyword frames from `KeywordDef.visual`; portrait, one-handed, tap-only (no drag required).
- **Placeholder art**: SVG generated from element color, kind silhouette and name; replaced automatically when `public/art/<id>.webp` exists.
- **Daily**: `daily/date.ts` (local date; `?date=` override in dev builds only, D-262), `daily/manifest.ts` and `daily/rating.ts` read the precomputed `seeds.json` (D-236), `difficulty.worker.ts` runs `prepareDay` as the fallback (D-099), `session.ts` persists `{v, date, seedString, k, twist, contentVersion, cfg, actions}` after every action and resumes by replay (D-108).
- **Persistence**: localStorage wrapped in try/catch; Binder (signature cards + families), stats, streaks (D-106).
- **Share**: `view/share.ts` builds the text-only share line (D-247, D-248) with one emoji per round (`view/roundRow.ts`) from `state.track.round` (priority D-101) plus rounds used vs par.
- **Content in the browser** (D-176): the app imports `RAW_CONTENT` from the browser-safe content root (never the `./node` export), runs `parseContent` → `validateContent` → `compileContent` at startup, and renders card and keyword text with `renderText(template, g)` (D-172). In the dev build, a content error replaces the app with the §10.3 lines. Saving a JSON, `globals.ts` or keyword file hot-reloads content and restarts the duel ("content changed, duel restarted"; the replay fails `state.cfg`, no loss, D-108). Can wait: `?set=KEY=VALUE` (repeatable) in dev builds applies `withOverrides`, and the overrides are shown in the debug overlay.
- **PWA**: a hand-rolled service worker emitted at build (D-250, not vite-plugin-pwa), offline cache, portrait manifest. `FLAGS.DEBUG_OVERLAY` (or `?debug` in dev builds, D-252) shows state, legal actions and the seed; the Collector's chosen rule waits for packages/ai to expose it (D-252).

---

## 17. Testing and the board-state DSL

**Layers**: unit tests per engine module; scenario tests written in the board DSL; auto-generated keyword tests from each `KeywordDef.examples`; fast-check properties; golden replays; content validator tests; `bench`.

**What each layer may depend on (D-168, D-169).** No test pins a live content value or count.

| Layer | Content | Globals | Lives in |
| --- | --- | --- | --- |
| Engine unit, scenario, property tests, golden replays | fixture `fx-` content (`test-utils/fixture.ts`) + DSL `card` declarations | `TEST_GLOBALS` (engine-owned fixture); properties also under `ALT_GLOBALS` | `packages/engine` |
| Keyword examples; scenarios that need the real keyword files | `scenarioContent(declared)`: live elements, kinds, recipes and `KEYWORDS` + **only** the declared cards | `TEST_GLOBALS` | `packages/content/src/keyword-examples.test.ts`, `packages/content/test/scenarios/` |
| Validator tests | synthetic inputs | as needed | `packages/content` |
| Live-content test (the only one) | live JSON | `DEFAULT_GLOBALS` with `FLAGS.INTENTS=false` | `packages/content`: loads, validates with 0 errors, compiles, and 20 fixed-seed random legal walks end without `EngineError` |
| Balance | live JSON | `DEFAULT_GLOBALS` + `--set` | `packages/sim` reports vs `TARGET_*` |

`ALT_GLOBALS = withGlobals({ … })` changes board, hand, draw, round, Appraisal-round, life and bonus values (engine-dev picks values that keep the fixture setup feasible), so a hard-coded constant fails the property suite. Engine tests derive incidental numbers from `g`. Golden replays with stored hashes use fixture content only. A live-content replay asserts only that it reproduces its own run's hash. Still pinned: the RNG known-answer vectors, the rule levers (`globals.test.ts`, D-168), and the `GlobalsSchema` refinements.

**Properties (fast-check)**: random seeds × random legal-action walks: (1) every action from `getLegalActions` applies without throwing; (2) card conservation (§4); (3) board ≤ BOARD_SLOTS, traps ≤ TRAP_SLOTS, hand/deck/discard sizes consistent with conservation; (4) `replay(seed, toActions(s))` hashes equal to `s`; (5) the game ends within 2×MAX_ROUNDS turns; (6) Collector view invariance under hidden-info changes; (7) `isLegal` agrees with `getLegalActions` membership; (8) before every legal attack on a face-up target with no trap set, `previewCombat` equals the `CombatResolved` fields and both life changes, and for a direct attack it equals the `Damage` amount, also under a fixture twist (replaces `ai/test/mirror.test.ts`, D-209); (9) two states that differ only in hidden information have equal `hashState(redactState(s, viewer))` (D-209).

**Board-state DSL** (`packages/engine/test-utils/board-dsl.ts`): a line-based text format parsed into a valid `GameState` (unspecified zones get filler cards so conservation holds). `parseScenario(text)` is pure and returns the declared cards separately from setup, actions and expectations, so each package builds the content itself: engine tests use `buildContent(FX_SPEC + declared)`, and content tests use `scenarioContent(declared)` (D-169). The card ids in the example below only illustrate the syntax: real scenarios use `fx-` or declared cards, never live card ids.

```
# cards (D-169): declared for this scenario only; a collision with a content id is a parse error
card raider P gale beast 5/3          # card <id> <P|C> <element> <kind> <power>/<guard> [kw,kw…]
card hound  C umbra beast 6/4 haunt,vain   # C = Collector pool (Relic); Flaws go in the keyword list

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

The header of `test-utils/board-dsl.ts` is the canonical syntax reference for every `do` and `expect` form (D-193). Defaults: a monster without `new` has `entered = −1`; an unspecified hand is empty; an unspecified deck or `deck *` is 2 × `OPENING_HAND` copies of the reserved inert card `dsl-filler` (player pool, first element and kind, 1/1, no keywords), which `withDeclared` (engine) and `scenarioContent` (content) always add; an `appraised` monster is owned by the player; `expect event <Name> <slot>` resolves the slot against the board at setup.

Monster token: `[<card-id> <A|G|D> flags…]` where `D` = face-down guard. Flags: `new` (entered this turn), `moved` (repositioned this turn), `done` (attacked this turn), `ward-used`, `p±N` / `g±N` (permanent), `p+N@T` (timed until end of turn T), `unstable@T`, `shroud@T`, `appraised`, `sym(<card-id>)` (attached symbiote, D-308), `chimera(<family>,<element>,<kw,kw>[,asc][,grafted@T])` (`grafted` defaults to the monster's entered turn, D-139). Slots are addressed `P0..P2`, `C0..C2`; `face` = direct.

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
8. **AI on the facade**: the Collector view reads the state through the engine's query methods (§8.7), not a deep copy and not an `ai` copy of the rules. Combat questions use `previewCombat`. Look-aheads apply actions to one `redactState` copy per decision with a trusted engine without events or log (D-209). The win search is capped by `AI_SEARCH_NODE_BUDGET` (D-211).
9. **Dev-only safety**: dev mode is the explicit engine option `createEngine(…, { dev: true })`, stored as `Env.dev`. The engine never reads `process.env` (§1.2). Tests, board-DSL fixtures and the web dev build set it; the sim and production web don't. In dev mode every committed state is `deepFreeze`d and each `CombatSnapshot` is `Object.freeze`d before `beforeCombat`, so a hook that writes throws (D-141). `isLegal` validation is skipped only with `{ trusted: true }` (§6.2).
10. **Measurement**: `pnpm bench` runs 5,000 expert-vs-Collector duels single-threaded and fails below `PERF_DUELS_PER_SEC_PER_CORE`; the sim report prints duels/sec/core. Profiling hot spots with `--cpu-prof` before optimizing further.
11. **Worker threads**: §15; linear scaling expected because workers share nothing and return aggregates.

---

## 19. Determinism and review checklist (applied to every engine PR)

- [ ] No `Math.random`, `Date`, `performance.now`, timers, DOM, Node APIs in engine/content keywords/ai (ESLint `no-restricted-globals`/`no-restricted-properties`).
- [ ] No `for…in`, `Object.keys/values/entries` or `Map`/`Set` iteration whose order affects outcomes (arrays and slot order only). The two allowed exceptions don't depend on order: `freeze.ts › deepFreeze` (D-147) and `canonical.ts › canonicalJson`, which sorts keys (D-191). Anything hashed (`state.cfg`, the content hash) goes through `canonicalJson`, never `JSON.stringify` of an object.
- [ ] Hook contexts read `run.state`, never a state captured before a write (D-186).
- [ ] Dev-only checks go through `Env.dev`, never `process.env` (D-141).
- [ ] Only integer arithmetic in rules; `Sfc32.int` is the only float operation and is exact.
- [ ] Every rule number comes from `globals`; every mechanic checks its flag.
- [ ] All state changes go through `Tx` and the effect interpreter; hooks only `effect()` (plus `cancelAttack` and the `beforeCombat` flag setters, §8.2).
- [ ] No array or record read from `tx.state` is held across a later write; targets are collected first (§4.1, D-128).
- [ ] Hook-visible combat data is read-only; `beforeCombat` only raises on-only flags (D-124).
- [ ] Legality changes only in `legal.ts`/query hooks; UI/AI/bots never re-implement legality, stats or combat. They call the facade queries (§8.7, D-209).
- [ ] A new hidden zone or hidden field in `GameState` is redacted by `redactState` in the same change (D-209).
- [ ] New keyword = one file + icon + examples; new card = JSON only; new card number = one `CONTENT_NUMBERS` line (D-171).
- [ ] Engine logic never assumes a specific global value; tests derive incidental numbers from `g` and pass under `ALT_GLOBALS` (D-168).
- [ ] No test asserts a live content value, a live count or a `DEFAULT_GLOBALS` value (except the rule levers); scenarios and keyword examples use fixture or declared cards under `TEST_GLOBALS` (D-168, D-169).
- [ ] Numbers in card, objective and keyword text are `{NAME}` placeholders (D-172); a global that the code doesn't read is pinned in `GlobalsSchema` (D-170).
- [ ] `packages/content/src` stays browser-safe outside `load.ts`/`keyword-files.ts` (D-176).
- [ ] No card, keyword or Flaw id literals in `packages/engine/src`: find mechanics by hook (Ward → `beforeDestroy`) or by compiled content (`c.collector.ace`) (D-162).
- [ ] Property tests and the bench pass.

---

## 20. Traceability: DESIGN.md → implementation

Engine paths are under `packages/engine/src/`, content under `packages/content/`, AI under `packages/ai/src/`, sim under `packages/sim/src/`, web under `apps/web/src/`. Rows that cite a DESIGN value table (PP-3, CO-2, GR-11, …) map the rule to the file that now **owns** the value. After the D-166 switch the file is canonical, and the DESIGN table is the launch baseline.

### Overview and pillars

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| OV-1 | Daily: same seeded 24-card deck, one attempt, beat the Collector within 12 rounds | `setup/*`, `turn.ts`, web `daily/session.ts` | D-001, D-017 |
| OV-2 | Duel lasts 3–5 minutes | `globals.TARGET_DUEL_MINUTES`, sim report (actions/duel proxy), web non-blocking animations | — |
| OV-3 | All content is data, changeable without engine code | `packages/content/*`, `compile.ts`, `defineKeyword` | D-074, D-111 |
| OV-4 | Original IP | not code: content review of names/art briefs in `cards/*.json`, `art-briefs.json` | — |
| P-1 | Same game for everyone (both decks from date seed; comparable/shareable) | `setup/seed.ts`, `setup/shuffle.ts`, `meta/share-grid.ts` | D-001…D-003 |
| P-2 | Simple rules, deep combos | rules modules; tutorial out of scope (v0.2) | — |
| P-3 | Boss never cheats, deterministic, telegraphs intent | `ai/collector/view.ts`, `policy.ts`, `intent.ts`, `ai/shared/look-ahead.ts`, engine `view/redact.ts › redactState`, engine facade queries (§8.7) | D-082, D-086, D-095, D-209, D-221 |
| P-4 | Fast: one card per turn, ≤ 12 rounds, no waiting on animations | `legal.ts` (`played`), `turn.ts`, web `anim/` | D-014 |
| LD-1 | Format: duel, hidden draw order, identical seed | `setup/shuffle.ts`, `view/redact.ts` | D-006 |
| LD-2 | The Collector is the only boss; weekly rule twist | `collector.json`, `twists.json`, `stats.ts` (twist modifiers) | D-103 |
| LD-3 | Placeholder art until artist delivers | web `art/placeholder.ts`, `art-briefs.json` | D-110 |
| LD-4 | Graft creates Chimeras | `graft.ts`, `recipes.json` | D-056…D-066 |
| LD-5 | The Binder (cosmetic, signature cards + Chimeras) | web `persistence/binder.ts`, `track.families` | D-010, D-066 |
| LD-6 | Web-first PWA, portrait, one-handed, tap-only | `apps/web` (service worker per D-250) | — |
| LD-7 | Working title (trademark check) | not code — open question tracked in DESIGN | — |

### Core rules

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| CR-1 | Player 20 life / 24 cards; Collector 25 life / 20 cards | `globals` (deck size = `playerDeckSize(g)`, sum of `DECK_*`), `setup/initial-state.ts`, validator (`COLLECTOR_DECK_SIZE`) | D-170 |
| CR-2 | Win by reducing him to 0 before round 12 ends | `pipeline.ts › checkWin`, `turn.ts › endTurn` | D-017, D-018, D-151 |
| SU-1 | Both decks shuffled from daily seed | `setup/shuffle.ts` | D-002 |
| SU-2 | Player sees full 24-card list and difficulty | web `screens/Home.tsx`, `components/DeckList.tsx`, `ai/difficulty.ts` | D-006, D-098 |
| SU-3 | Each side draws 5 | `setup/initial-state.ts` | D-009 |
| SU-4 | One redraw: hand to bottom, next 5 drawn | `reducer.ts` (`redraw`), `legal.ts` (mulligan) | D-008 |
| SU-5 | ≥ 2 monsters in both opening hands (and redraw) | `setup/shuffle.ts` | D-007, D-118 |
| SU-6 | Player first; cannot attack round 1 | `stats.ts › attackPermission` | D-015, D-042, D-142 |
| RD-1 | Round = player turn then Collector turn | `turn.ts` (turn index) | — |
| RD-2 | Draw up to 5, at most 2/turn; effects ignore cap | `turn.ts › drawStep`, `effects/run.ts › draw` | D-011…D-013 |
| RD-3 | Reposition once, not on summon turn; face-down flipped to attack is revealed | `legal.ts`, `reposition.ts` | D-014, D-022, D-023, D-024, D-161, D-190 |
| RD-4 | Play one card: summon (atk/grd/face-down), Graft, spell, trap | `legal.ts`, `summon.ts`, `graft.ts`, `cast.ts`, `effects/run.ts` | D-014, D-021, D-188, D-189 (Chimera from hand: all modes) |
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
| KW-2 | Base cards ≤ 1 keyword | validator (`MAX_BASE_KEYWORDS`, base monsters and Relics) | D-173, D-201 |
| KW-3 | Chimeras inherit up to 2 | `graft.ts`, `globals.MAX_INHERITED_KEYWORDS` | D-059 |
| KW-4 | Keyword shown as visual frame/effect | `KeywordDef.visual`, web `KeywordFrame.tsx` | D-195 (draft icon/visual ids, Flaws framed) |
| KW-5 | Swift | `keywords/swift.ts` (`attackPermission`) | D-041, D-042 |
| KW-6 | Sentinel | `keywords/sentinel.ts` (`restrictTargets`) | D-037, D-038 |
| KW-7 | Pierce | `keywords/pierce.ts` (`beforeCombat`), `combat.ts` | D-039, D-040, D-124 |
| KW-8 | Ward | `keywords/ward.ts` (`beforeDestroy`), `destroy.ts`, `hooks/dispatch.ts › beforeDestroy`, `stats.ts › activeKwOf` | D-034, D-035, D-043, D-044, D-133, D-134 |
| KW-9 | Haunt | `keywords/haunt.ts` (`onDestroyed`) | D-045 |
| KW-10 | Echo | `keywords/echo.ts` (`onDestroyed`), `effects/run.ts › returnToHand` | D-046, D-140 |
| FL-1 | Flaws only on Relics, exactly one each | `schemas/card.ts` (`Relic.flaw` one id; strict `PlayerMonster`), `files.ts › describeIssue` messages, validator (Flaw ids), `RELIC_FLAWS` pinned to 1 | D-114, D-198, D-202, D-207 |
| FL-2 | Slow | `keywords/slow.ts` (`attackPermission`, `ownTurnsSinceEntered`) | D-053, D-183 (M-01 lever) |
| FL-3 | Vain | `keywords/vain.ts` (`mustAttack`), `legal.ts`, `ai/collector/best-target.ts` | D-052, D-091 |
| FL-4 | Brittle | `keywords/brittle.ts` (`beforeCombat`), `combat.ts` | D-049, D-050 |
| FL-5 | Tethered | `keywords/tethered.ts` (`staticPower`) | D-051 |
| FL-6 | Covetous (ace only) | `keywords/covetous.ts` (`summonRequirement`), `summon.ts`, validator | D-054, D-055, D-114 |
| KW-11 | Card text ≤ one sentence | validator (on rendered text); numbers via `{NAME}` placeholders, `content/src/text.ts` | D-113, D-172 |
| KW-12 | New keyword must justify itself vs the six | process: `docs/CONTENT_GUIDE.md` checklist | — |

### Graft system

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| GR-1 | Combine 2 monsters; family by kinds, element by first; it is the turn's play | `graft.ts`, `legal.ts` | D-057, D-180 |
| GR-2 | Materials from hand and/or board, in order; board materials sacrificed | `graft.ts` (pending `mat1`/`mat2`) | D-056, D-058 |
| GR-3 | Family = kind pair; element = first material | `recipes.json`, `compile.ts › recipe`, `graft.ts` | — |
| GR-4 | Inherit ≤ 2 keywords; player picks if > 2 | `graft.ts` (`keywords` stage, `keywordUnion`) | D-059, D-181, D-182 (printed keywords) |
| GR-5 | Ascend: second step same turn, same family, +2/+1, may take keyword, max 3 materials | `graft.ts` (`ascend` stage), `globals`, `FLAGS.ASCEND` | D-056, D-060 |
| GR-6 | Unstable: opposing elements → +3 Power, destroyed end of your next turn | `graft.ts › unstableExpiry`, `turn.ts › endTurn`, `FLAGS.UNSTABLE` | D-061, D-062, D-152 (Ward-saved: bonus lost), D-183 (M-02 lever) |
| GR-7 | Chimera enters attack or guard; normal summoning rules | `graft.ts` (`position`), `attackPermission` | D-022, D-063 |
| GR-8 | Preview before confirming | `graft.ts › previewGraft`, web `GraftPreview.tsx` | D-064 |
| GR-9 | First-time result added to the Binder | `track.families`, web `persistence/binder.ts` | D-066 |
| GR-10 | 15 families, order-independent; one painting per family, element changes frame/glow | `recipes.json`, validator, web `art/placeholder.ts` | — |
| GR-11 | Family stat table | `recipes.json` (canonical after the switch) | D-166 |
| GR-12 | Every pair can graft | validator (missing kind-pair recipe) | — |
| GR-13 | Most Chimeras 7+ → Appraisal targets | emergent; sim report (Appraisal targets by source) | D-076 |
| GR-14 | Split: unbind your face-up Chimera into its materials (`FLAGS.SPLIT`) | `bond.ts › split` (§5.6a), `legal.ts`, `globals` (`SPLIT_PART_PERM_P`) | D-307 |
| GR-15 | Symbiosis: attach a hand monster under a face-up host; +Guard and keyword; emerges on host leaving; Appraisal takes both (`FLAGS.SYMBIOSIS`) | `bond.ts › symbiose, release` (§5.6b), `stats.ts`, `destroy.ts`, `appraisal.ts`, `globals` (`SYMBIOSIS_GUARD_BONUS`) | D-308, D-309 |
| GR-16 | One card play + one bond action per turn (`FLAGS.BOND_ACTION`); the first attack closes it | `turn.ts`, `combat.ts › declare`, `graft.ts › bondUsed`, `legal.ts`, `GameState.bond` | D-306 |
| GR-17 | Options preview of every bond action | `bond-preview.ts › bondOptions` (§5.6c), `ai/bots/rank-bonds.ts` | D-313 |
| GR-18 | Collector never bonds; symbiote is public; AI reads engine stats | `legal.ts › canBond`, `ai/collector/view.ts` | D-305, D-311 |
| GR-19 | Bots use bond actions; sim A/B cells and metrics | `ai/bots/*`, `sim` matrix | D-312, D-314 |

### Player card pool

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| PP-1 | Pool: 25 monsters, 6 spells, 4 traps | `cards/player-*.json` (the pool is whatever they hold), validator pool-capacity error | D-166, D-170 |
| PP-2 | Daily deck 15/5/4, duplicates ≤ 2 | `setup/deckgen.ts` | D-005 |
| PP-3 | Monster table (25 entries) | `cards/player-monsters.json` (canonical after the switch) | D-166 |
| PP-4 | Stats are placeholders for the sim to tune | `--set card.<id>.power` in `sim/overrides.ts`; edits in JSON are canonical | D-074, D-166 |
| PP-5 | Stat budget P+G 8–10, keyword ≈ 1 | validator **warning** | D-109, D-167 |
| PP-6 | Spells cast as the one play, resolve immediately | `legal.ts`, `effects/run.ts` | D-067 |
| PP-7 | Unmake, Bloodlust, Grave Recall, Scrying Bones, Shroud, Siphon | `cards/player-spells.json` (§9.2), `effects/run.ts`, `effects/targets.ts` | D-067…D-070, D-136, D-140 |
| PP-8 | Traps set face-down as the play; trigger automatically, then discard | `summon.ts › setTrap`, `traps.ts`, `hooks/dispatch.ts` | D-071, D-072, D-122, D-185, D-186, D-187 |
| PP-9 | Snare, Mirror Sigil, Last Rites, Thornwall | `cards/player-traps.json` (§9.2) | D-036, D-073 |
| PP-10 | One-line art brief per card | `art-briefs.json`, validator warnings | D-110, D-174 |

### The Collector

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| CO-1 | Fixed 20-card Relic deck; never grafts; each Relic has one Flaw | `collector.json`, `legal.ts` (`canGraft`), validator (deck size, pools, ace is a Relic in the deck) | D-026, D-114, D-203 |
| CO-2 | 13 Relic monsters table | `cards/relics.json` (canonical after the switch); AI coverage warnings for deck cards | D-166, D-177 |
| CO-3 | Spells: Provenance Ledger, Restoration, Gilt Frame, Forfeit | `cards/collector-spells.json` (§9.2) | D-067…D-069, D-136, D-144 |
| CO-4 | Traps: Display Case, Counterfeit, Insurance Claim | `cards/collector-traps.json` (§9.2) | D-065, D-073, D-139 |
| AP-1 | Appraisal at start of his turns in rounds 3, 6, 9 | `turn.ts › startTurn`, `appraisal.ts`, `FLAGS.APPRAISAL` | D-016, D-075 |
| AP-2 | Takes highest-Power face-up monster with Power ≥ 7; tie leftmost | `appraisal.ts` | D-076 |
| AP-3 | Goes to open slot, or vault if full | `appraisal.ts`, `SideState.vault` | D-077, D-078, D-184 (M-03/M-04 levers) |
| AP-4 | Face-down and Shrouded monsters are safe | `appraisal.ts`, `Monster.shroudUntil` | D-069 |
| AP-5 | Countdown always on screen | web `AppraisalCountdown.tsx` | — |
| AC-1 | Ace only if Appraisal succeeded | `keywords/covetous.ts`, `summon.ts` | D-054 |
| MO-1 | Moods by life: Composed 16–25, Agitated 8–15, Desperate 1–7 | `mood.ts`, `globals.MOOD_*`, `FLAGS.MOODS` | D-080 |
| MO-2 | Mood behaviors | `collector.json › ai.moods` (carried by `GameContent`), `ai/collector/moods.ts` | D-081, D-210, D-216, D-218 |
| IN-1 | Intent icon (attack/appraise/guard/scheme), never the card | `ai/collector/intent.ts`, `turn.ts › startTurn` (intent after `step = 'main'`), `state.collector.intent`, web `IntentBadge.tsx`, `FLAGS.INTENTS` | D-095, D-096, D-221 |
| IN-2 | Dialogue changes with mood | `collector.json › dialogue`, web `MoodDialogue.tsx` | D-097 |
| AI-0 | Deterministic, public info only, tie-break leftmost then card id | `ai/collector/view.ts`, `policy.ts`, `ai/shared/look-ahead.ts` | D-086, D-090, D-209 |
| AI-P1 | Win this turn if possible | `rules/winThisTurn.ts`, `collector/win-search.ts`, `globals.AI_SEARCH_NODE_BUDGET` | D-082, D-211, D-220 |
| AI-P2 | Summon The Unpriced if summonable | `rules/summonAce.ts` | D-054, D-213 |
| AI-P3 | Slot open + monster that beats your strongest face-up → play it | `rules/summonBeater.ts` | D-083 |
| AI-P4 | Fewer monsters than you + holds trap → set it | `rules/setTrapWhenBehind.ts` | D-088, D-215 |
| AI-P5 | Spell with high-value target (Forfeit, Restoration, Gilt Frame contested) | `rules/castHighValueSpell.ts`, `collector.json › ai.params.castHighValueSpell` (keyed by spell id), validator (refs, entry shape, resolved Power, D-177 warnings) | D-087, D-145, D-177, D-204, D-219 |
| AI-P6 | Else summon highest-Power non-Slow; all Slow → guard | `rules/summonFallback.ts`, `rules/utility.ts` (step 7), engine `attackRestriction` | D-084, D-085, D-212, D-214, D-215, D-216 |
| AI-R | Collector repositioning (not in DESIGN's list; D-089) | `collector/reposition.ts` | D-089, D-217 |
| AI-A1 | Take any lethal attack | `rules/lethal.ts`, `collector/win-search.ts` | D-082, D-220 |
| AI-A2 | Destroy your highest-Power monster he beats without losing attacker | `rules/killWithoutLoss.ts` | D-092, D-218 (attacker choice: owner item) |
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
| DG-1 | 15/5/4, max 2 copies | `setup/deckgen.ts` | D-005, D-197 |
| DG-2 | ≥ 3 elements, ≥ 4 kinds | `setup/deckgen.ts`, `content/src/feasibility.ts` | D-005, D-200 |
| DG-3 | Curve: ≥ 4 with Power ≤ 5, ≥ 3 with Power ≥ 6 | `setup/deckgen.ts`, `content/src/feasibility.ts` | D-005, D-200 |
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
| BT-2 | Novice ~25% (20–30%) | `sim/report.ts`, `ai/bots/novice.ts`; measured 0% in AI milestone 1, handled in Phase 3 | D-117, D-223, M-09 |
| BT-3 | Most games end rounds 8–12; median 9–11 | `sim/report.ts` | — |
| BT-4 | 15–30% go full 12 rounds | `sim/report.ts` | — |
| BT-5 | 1.5–3 grafts per winning game | `track.grafts`, `sim/report.ts` | — |
| BT-6 | 30–60% Appraisals succeed | `state.appraisal`, `sim/report.ts` | D-079 |
| BT-7 | Unpriced appears in 20–40% | `track.unpriced`, `sim/report.ts` | — |
| BT-8 | < 15% seeds rejected | `sim/difficulty-batch.ts` | — |
| GL-1 | Every number is a global in one file | `content/src/globals.ts` (core globals + `CONTENT_NUMBERS`), `content/src/schemas/globals.ts`, `engine/src/types/globals.ts`; canonical after the switch; no derived globals; every key read, pinned or planned (`planned-globals.ts`, `content/test/globals-readers.test.ts`); unused content numbers warned; AI search cap `AI_SEARCH_NODE_BUDGET` | D-074, D-126, D-147, D-166, D-168, D-170, D-171, D-205, D-211 |
| GL-2 | Feature flags (10) | `globals.FLAGS` | — |

### Technical architecture and content pipeline

| # | Rule | Implemented in | Decisions |
| --- | --- | --- | --- |
| TA-1 | Pure deterministic TS engine shared by web/AI/sim/server | `packages/engine` | — |
| TA-2 | Stack: pnpm, TS strict, Vite+React, Zustand, CSS tokens + Framer Motion, Vitest + fast-check, Capacitor later, PWA | root config, `apps/web` | — |
| TA-3 | Package layout | §2 | — |
| TA-4 | One plain serializable state; `applyAction` → state + events | `types/state.ts`, `reducer.ts`, `types/events.ts` | — |
| TA-5 | Seeded sfc32 by string hash; no Math.random/dates in engine | `rng.ts`, ESLint | D-002, D-125 |
| TA-6 | `getLegalActions` single source of truth | `legal.ts`; derived stats and combat previews likewise come only from the engine facade (§8.7) | D-064, D-209 |
| TA-7 | Hook registry (7 hooks) for keywords, Flaws, spells/traps | `types/hooks.ts`, `hooks/*`, `traps.ts` | D-112, D-122, D-124, D-127 |
| TA-8 | No deep cloning; structural sharing; small integer ids | `tx.ts` (§4.1), §18 | D-006, D-128 |
| TA-9 | Reproducible from seed + action log (leaderboards later) | `replay.ts` (`cfg` check), `canonical.ts`, `state.log` | D-108, D-191, D-194 |
| CP-1 | JSON validated by zod at build and in `content:check` | `content/src/schemas/*`, `content/src/files.ts` (`describeIssue`, `formatError`), `content/src/load.ts`, `scripts/content-check.ts`, `build` script | D-145, D-146, D-165, D-206, D-207, D-208 |
| CP-2 | Effect primitives with targets, conditions, durations | `types/effects.ts`, `effects/*` | D-074, D-120, D-129 |
| CP-3 | New keyword/Flaw = one `defineKeyword` file, auto-registered | `hooks/define.ts` (type in `types/hooks.ts`), `scripts/gen-keyword-index.ts` | D-111, D-123 |
| CP-4 | Validator fails on unknown refs, missing recipes, budget, duplicate ids, Collector deck ≠ 20 | `content/src/validate.ts` (§10.3; incl. the ace ref), `feasibility.ts`, `schemas/globals.ts`; budget is a warning by owner ruling | D-109, D-167, D-198, D-199, D-200, D-203 |
| CP-5 | Placeholder art from data until a painting with the card id exists | web `art/placeholder.ts` | D-175 (ids permanent) |
| CG-1 | Add/change/delete card → JSON → `content:check` → `sim:quick` | scripts, validator reverse refs; one edit per change (§10.4); web hot reload | D-168, D-174, D-175, D-176 |
| CG-2 | Add keyword → one file + icon → tests auto-generated from examples | `KeywordDef.examples` (declared cards), `content/src/keyword-examples.test.ts` | D-169 |
| CG-3 | Add element → elements.json + matrix row/column | `elements.json`, validator | — |
| CG-4 | Add kind → validator lists every new pair needing a recipe | validator | — |
| CG-5 | Tune a number → globals; toggle mechanic → flag | `globals.ts` (core or `CONTENT_NUMBERS`); text re-renders via placeholders | D-171, D-172 |
| CG-6 | DESIGN.md › "How to change content" summary of CONTENT_GUIDE.md | `docs/CONTENT_GUIDE.md` (plan §10.5), `content/test/guide.test.ts`, `docs/CHANGELOG.md` (message changes move together) | D-178, D-208 |

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
| SC-8 | Simulator CLI + balance report meeting targets | `packages/sim` (incl. `--ab` for DECISIONS §M proposals) | D-115, D-223, M-01…M-17 |
| SC-9 | CONTENT_GUIDE.md + validator | `docs/CONTENT_GUIDE.md` (Phase 1, plan §10.5), `validate.ts` | D-178 |
| NS-1 | Not in v0.1: accounts, leaderboards, server verification, sound, painted art, native builds, monetization, weekly twists | not implemented; seams: `replay.ts` hash (server verification), `FLAGS.WEEKLY_TWIST` off, art lookup by id | — |
| RM-1 | Roadmap v0.2–v1.0 | not in scope; engine stays server-ready (pure, replayable) | — |
| OQ-1 | Final name / trademark | not code | — |
| OQ-2 | Local midnight vs global reset | v0.1 local midnight; isolated in web `daily/date.ts` so a switch is one file | D-104 |
| OQ-3 | Second Collector deck variant? | `collector.json` is one file; a variant = another file + selector (not built) | — |
