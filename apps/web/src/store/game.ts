// The game store (ARCHITECTURE.md §16): the whole non-visual app. The UI reads this store and calls its methods;
// a different visual layer can replace src/ui wholesale. Dependencies are injected so a headless test can play a full
// duel through exactly the code the browser runs.
import { createStore } from 'zustand/vanilla';
import type { DailySetup } from '@vault-duel/ai';
import type { Action, GameEvent, GameState } from '@vault-duel/engine';
import type { GameCtx, LoadResult } from '../content/load';
import { newDuel, playerStep, recordOf, replayTrail } from '../duel/runtime';
import type { Frame, Runtime } from '../duel/runtime';
import { createRuntime } from '../duel/runtime';
import { clearSession, loadSession, recordFor, resumeSession, saveSession } from '../daily/session';
import { howToSeen, markHowToSeen } from '../persistence/howto';
import { emptyBinder, emptyStats, loadBinder, loadStats, recordDaily } from '../persistence/meta';
import type { BinderRecord, StatsRecord } from '../persistence/meta';
import { objectivesMet } from '../view/objectives';
import type { CheckProgress, SetupSource } from '../daily/rating';
import type { KV } from '../persistence/storage';
import { groupLegal } from '../view/legal';
import type { LegalGroups } from '../view/legal';
import { UNDO_WHY, undoStatus } from '../view/undo';
import type { ActionRecord } from '../view/undo';

export const RESTART_NOTICE = 'content changed, duel restarted';
/** A duel saved by an older build (other rules or content) starts over, with this notice. */
export const RULES_NOTICE = 'The rules changed since this duel was saved; it starts over.';

export type Phase =
  | { readonly name: 'booting' }
  | { readonly name: 'error'; readonly lines: readonly string[] }
  | { readonly name: 'preparing'; readonly progress: CheckProgress | null }
  | { readonly name: 'home' }
  | { readonly name: 'duel' }
  | { readonly name: 'result' };

/** The daily duel's screen data while Practice is showing (D-249); leaving Practice puts it back. */
export type Snapshot = Pick<GameState_, 'phase' | 'state' | 'actions' | 'trail' | 'events' | 'legal' | 'groups'>;

export type Screen = 'binder' | 'stats';

export interface GameDeps {
  readonly storage: KV;
  readonly loadContent: () => LoadResult;
  readonly today: () => string;
  readonly resolveSetup: (
    ctx: GameCtx,
    date: string,
    onProgress: (p: CheckProgress) => void,
  ) => Promise<{ setup: DailySetup; source: SetupSource }>;
  /** engine option: freeze states (tests) */
  readonly dev?: boolean;
}

export interface GameState_ {
  readonly phase: Phase;
  readonly ctx: GameCtx | null;
  readonly rt: Runtime | null;
  readonly setup: DailySetup | null;
  readonly source: SetupSource | null;
  readonly state: GameState | null;
  /** every action applied so far, the Collector's included */
  readonly actions: readonly Action[];
  /** each action with its events, in step with `actions`: what undo and the duel log are built from (D-265) */
  readonly trail: readonly ActionRecord[];
  /** the events of the last step, for the animation layer (W2) */
  readonly events: readonly GameEvent[];
  /** the last step action by action, so the animation layer can show the Collector's turn one move at a time (D-266) */
  readonly frames: readonly Frame[];
  readonly legal: readonly Action[];
  readonly groups: LegalGroups | null;
  readonly notice: string | null;
  /** a message when the last action was rejected; the duel is left as it was */
  readonly error: string | null;
  /** 'practice' replays today's seed unrecorded (D-247); it never writes stats, Binder or the daily session */
  readonly mode: 'daily' | 'practice';
  readonly daily: Snapshot | null;
  /** the daily duel has ended (Practice unlocks) */
  readonly dailyDone: boolean;
  /** a Practice duel is saved, so the menu offers Resume */
  readonly practiceSaved: boolean;
  /** a full-page screen over Home or the Result */
  readonly screen: Screen | null;
  /** the How to play pages are open (D-257): on first open, and again from the "?" on Home */
  readonly howTo: boolean;
  readonly stats: StatsRecord;
  readonly binder: BinderRecord;
}

export interface GameActions {
  /** load content, resolve the day, resume a saved duel if there is one. Call once, and again after a content reload. */
  boot(opts?: { readonly restartNotice?: string }): Promise<void>;
  /** begin the day's duel from a clean state */
  start(): void;
  act(action: Action): void;
  /** Graft ⇄: the same two materials in the other order, as legal actions (cancel, begin, pick, pick) */
  graftSwap(): void;
  /** Tap a picked material again: the Graft goes back to the same picks without it, as one change with no animation */
  graftUnpick(iid: number): void;
  /** Undo the last action of this turn, never past a checkpoint (view/undo.ts) */
  undo(): void;
  /** the main menu over whatever is running; the daily duel and Practice stay saved */
  openMenu(): void;
  /** Daily duel entry of the menu: begin, resume, or look at today's result */
  enterDaily(): void;
  /** Practice entry of the menu: back into the saved Practice duel */
  continuePractice(): void;
  dismissNotice(): void;
  /** Practice (D-247): today's seed again, unrecorded. Needs the daily duel to be over. */
  startPractice(): void;
  /** back to the daily Result from Practice; clears the practice record */
  leavePractice(): void;
  openScreen(screen: Screen): void;
  closeScreen(): void;
  openHowTo(): void;
  /** Skip and Done: closes the pages and remembers that they were seen */
  closeHowTo(): void;
}

export type GameStore = ReturnType<typeof createGameStore>;

const IDLE: GameState_ = {
  phase: { name: 'booting' }, ctx: null, rt: null, setup: null, source: null, state: null, actions: [], trail: [], events: [], frames: [], legal: [],
  groups: null, notice: null, error: null, mode: 'daily', daily: null, dailyDone: false, practiceSaved: false, screen: null, howTo: false,
  stats: emptyStats(), binder: emptyBinder(),
};

export function createGameStore(deps: GameDeps) {
  const store = createStore<GameState_ & GameActions>()((set, get) => {
    const show = (
      state: GameState,
      actions: readonly Action[],
      events: readonly GameEvent[],
      trail: readonly ActionRecord[],
      frames: readonly Frame[] = [],
    ): Partial<GameState_> => {
      const rt = get().rt as Runtime;
      const legal = state.result === null ? rt.engine.getLegalActions(state) : [];
      return {
        state, actions, trail, events, frames, legal, groups: groupLegal(legal), error: null,
        phase: state.result === null ? { name: 'duel' } : { name: 'result' },
      };
    };

    /** A saved practice duel comes back after a reload, on top of the finished daily one. */
    const resumePractice = (date: string): void => {
      const { rt, setup } = get();
      const rec = loadSession(deps.storage, date, 'practice');
      if (rt === null || setup === null || rec === null || rec.actions.length === 0) return;
      const r = resumeSession(rt, setup, rec);
      if (!r.ok) {
        clearSession(deps.storage, date, 'practice');
        return;
      }
      const daily = snapshot();
      set({ ...show(r.state, rec.actions, [], replayTrail(rt, setup, rec.actions).trail), mode: 'practice', daily, practiceSaved: true });
    };

    const beginDuel = (notice: string | null): void => {
      const { rt, setup, ctx } = get();
      if (rt === null || setup === null || ctx === null) return;
      const first = newDuel(rt, setup);
      saveSession(deps.storage, recordFor(setup, ctx.globals.CONTENT_VERSION, first.state.cfg, []));
      set({ ...show(first.state, [], first.events, []), notice });
    };

    /** Records the daily result in stats and the Binder (idempotent per date). Practice never gets here (D-247). */
    const settle = (state: GameState): void => {
      const { ctx, setup, mode } = get();
      if (mode !== 'daily' || state.result === null || ctx === null || setup === null) return;
      const won = state.result.winner === 0;
      const r = recordDaily(deps.storage, {
        date: setup.date,
        day: {
          won,
          rounds: state.result.round,
          par: setup.difficulty.par,
          life: Math.max(0, state.sides[0].life),
          stars: objectivesMet(ctx, setup.objectives, state),
        },
        signature: setup.signature,
        families: state.track.families.map((i) => ctx.content.ids[i] as string),
      });
      set({ stats: r.stats, binder: r.binder, dailyDone: true });
    };

    /** First open (D-257): the How to play pages show once, when the app lands on Home. */
    const firstRun = (): void => {
      if (!howToSeen(deps.storage)) set({ howTo: true });
    };

    const snapshot = (): Snapshot => {
      const { phase, state, actions, trail, events, legal, groups } = get();
      return { phase, state, actions, trail, events, legal, groups };
    };

    return {
      ...IDLE,

      async boot(opts = {}) {
        set({ ...IDLE, phase: { name: 'booting' }, stats: loadStats(deps.storage), binder: loadBinder(deps.storage) });
        const loaded = deps.loadContent();
        if (!loaded.ok) {
          set({ phase: { name: 'error', lines: loaded.lines } });
          return;
        }
        const ctx = loaded.ctx;
        for (const w of ctx.warnings) console.warn(`warning: ${w}`);
        const rt = createRuntime(ctx, deps.dev === undefined ? {} : { dev: deps.dev });
        const date = deps.today();
        // D-197: any content reload restarts the duel, even one whose replay would still pass.
        if (opts.restartNotice !== undefined) {
          clearSession(deps.storage, date);
          clearSession(deps.storage, date, 'practice');
        }
        set({ ctx, rt, phase: { name: 'preparing', progress: null } });
        let resolved;
        try {
          resolved = await deps.resolveSetup(ctx, date, (progress) => {
            if (get().ctx === ctx) set({ phase: { name: 'preparing', progress } });
          });
        } catch (e) {
          set({ phase: { name: 'error', lines: [`could not prepare today's vault: ${e instanceof Error ? e.message : String(e)}`] } });
          return;
        }
        if (get().ctx !== ctx) return; // a newer boot replaced this one while the check ran
        set({ setup: resolved.setup, source: resolved.source });
        const record = loadSession(deps.storage, date);
        if (record === null) {
          set({ phase: { name: 'home' }, notice: opts.restartNotice ?? null });
          if (opts.restartNotice === undefined) firstRun();
          else beginDuel(opts.restartNotice);
          return;
        }
        const resumed = resumeSession(rt, resolved.setup, record);
        if (resumed.ok) {
          set({ ...show(resumed.state, record.actions, [], replayTrail(rt, resolved.setup, record.actions).trail), notice: opts.restartNotice ?? null });
          if (record.actions.length === 0 && opts.restartNotice === undefined) {
            set({ phase: { name: 'home' } });
            firstRun();
          }
          settle(resumed.state);
          if (resumed.state.result !== null) resumePractice(date);
          return;
        }
        // Replay failed (cfg mismatch, illegal action, new content version): restart instead of losing it silently.
        clearSession(deps.storage, date);
        clearSession(deps.storage, date, 'practice');
        beginDuel(opts.restartNotice ?? (resumed.rules ? RULES_NOTICE : RESTART_NOTICE));
      },

      start() {
        beginDuel(null);
      },

      act(action) {
        const { rt, state, setup, ctx, actions, trail, mode } = get();
        if (rt === null || state === null || setup === null || ctx === null || state.result !== null) return;
        try {
          const step = playerStep(rt, state, action);
          const next = [...actions, ...step.applied];
          saveSession(deps.storage, recordFor(setup, ctx.globals.CONTENT_VERSION, state.cfg, next), mode);
          set(show(step.state, next, step.events, [...trail, ...step.frames.map(recordOf)], step.frames));
          settle(step.state);
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      },

      graftSwap() {
        const { state } = get();
        const mats = state?.pending?.mats;
        if (mats === undefined || mats.length !== 2) return;
        const [first, second] = mats as readonly [number, number];
        const steps: ((g: LegalGroups) => Action | null | undefined)[] = [
          (g) => g.graftCancel,
          (g) => g.graftBegin,
          (g) => g.graftPicks.get(second),
          (g) => g.graftPicks.get(first),
        ];
        for (const pick of steps) {
          const groups = get().groups;
          const action = groups === null ? null : pick(groups);
          if (action === null || action === undefined) {
            set({ error: 'Those materials cannot be swapped.' });
            return;
          }
          get().act(action);
          if (get().error !== null) return;
        }
      },

      graftUnpick(iid) {
        const { rt, state, setup, ctx, actions, mode } = get();
        const mats = state?.pending?.mats;
        if (rt === null || state === null || setup === null || ctx === null || mats === undefined || !mats.includes(iid)) return;
        let begin = actions.length - 1;
        while (begin >= 0 && (actions[begin] as Action).t !== 'graftBegin') begin--;
        if (begin < 0) return;
        try {
          // back to the start of this Graft, then the kept picks again, each one a member of the legal list
          const base = actions.slice(0, begin + 1);
          let s = replayTrail(rt, setup, base).state;
          const next = [...base];
          for (const m of mats.filter((x) => x !== iid)) {
            const pick = groupLegal(rt.engine.getLegalActions(s)).graftPicks.get(m);
            if (pick === undefined) {
              set({ error: 'That material cannot be taken out.' });
              return;
            }
            next.push(pick);
            s = rt.engine.applyAction(s, pick).state;
          }
          const rebuilt = replayTrail(rt, setup, next);
          saveSession(deps.storage, recordFor(setup, ctx.globals.CONTENT_VERSION, state.cfg, next), mode);
          set(show(rebuilt.state, next, [], rebuilt.trail));
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      },

      undo() {
        const { rt, state, setup, ctx, actions, trail, mode } = get();
        if (rt === null || state === null || setup === null || ctx === null || state.result !== null) return;
        const status = undoStatus(trail);
        if (!status.ok) {
          set({ error: UNDO_WHY[status.why] });
          return;
        }
        try {
          const next = actions.slice(0, status.to);
          const rebuilt = replayTrail(rt, setup, next);
          saveSession(deps.storage, recordFor(setup, ctx.globals.CONTENT_VERSION, state.cfg, next), mode);
          set(show(rebuilt.state, next, [], rebuilt.trail));
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      },

      openMenu() {
        set({ phase: { name: 'home' }, screen: null, error: null });
      },

      enterDaily() {
        const { mode, daily } = get();
        if (mode === 'practice' && daily !== null) set({ ...daily, mode: 'daily', daily: null, error: null });
        const { state } = get();
        if (state === null) return beginDuel(null);
        set({ phase: state.result === null ? { name: 'duel' } : { name: 'result' }, screen: null });
      },

      continuePractice() {
        const { mode, state, setup } = get();
        if (mode === 'practice' && state !== null) {
          set({ phase: state.result === null ? { name: 'duel' } : { name: 'result' }, screen: null });
        } else if (setup !== null) {
          resumePractice(setup.date);
          if (get().mode === 'practice') {
            const s = get().state;
            set({ phase: s !== null && s.result !== null ? { name: 'result' } : { name: 'duel' }, screen: null });
          }
        }
      },

      dismissNotice() {
        set({ notice: null });
      },

      startPractice() {
        const { rt, setup, ctx, dailyDone, mode, daily } = get();
        if (rt === null || setup === null || ctx === null || !dailyDone) return;
        const first = newDuel(rt, setup);
        saveSession(deps.storage, recordFor(setup, ctx.globals.CONTENT_VERSION, first.state.cfg, []), 'practice');
        const snap = mode === 'daily' ? snapshot() : daily;
        set({ ...show(first.state, [], first.events, []), mode: 'practice', daily: snap, screen: null, notice: null, practiceSaved: true });
      },

      leavePractice() {
        const { daily, setup } = get();
        if (setup !== null) clearSession(deps.storage, setup.date, 'practice');
        set({ practiceSaved: false });
        if (daily === null) return;
        set({ ...daily, mode: 'daily', daily: null, error: null });
      },

      openScreen(screen) {
        set({ screen });
      },

      closeScreen() {
        set({ screen: null });
      },

      openHowTo() {
        set({ howTo: true });
      },

      closeHowTo() {
        markHowToSeen(deps.storage);
        set({ howTo: false });
      },
    };
  });
  return store;
}
