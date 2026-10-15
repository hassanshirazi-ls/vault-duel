// The game store (ARCHITECTURE.md §16): the whole non-visual app. The UI reads this store and calls its methods;
// a different visual layer can replace src/ui wholesale. Dependencies are injected so a headless test can play a full
// duel through exactly the code the browser runs.
import { createStore } from 'zustand/vanilla';
import type { DailySetup } from '@vault-duel/ai';
import type { Action, GameEvent, GameState } from '@vault-duel/engine';
import type { GameCtx, LoadResult } from '../content/load';
import { newDuel, playerStep } from '../duel/runtime';
import type { Runtime } from '../duel/runtime';
import { createRuntime } from '../duel/runtime';
import { clearSession, loadSession, recordFor, resumeSession, saveSession } from '../daily/session';
import type { CheckProgress, SetupSource } from '../daily/rating';
import type { KV } from '../persistence/storage';
import { groupLegal } from '../view/legal';
import type { LegalGroups } from '../view/legal';

export const RESTART_NOTICE = 'content changed, duel restarted';

export type Phase =
  | { readonly name: 'booting' }
  | { readonly name: 'error'; readonly lines: readonly string[] }
  | { readonly name: 'preparing'; readonly progress: CheckProgress | null }
  | { readonly name: 'home' }
  | { readonly name: 'duel' }
  | { readonly name: 'result' };

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
  /** the events of the last step, for the animation layer (W2) */
  readonly events: readonly GameEvent[];
  readonly legal: readonly Action[];
  readonly groups: LegalGroups | null;
  readonly notice: string | null;
  /** a message when the last action was rejected; the duel is left as it was */
  readonly error: string | null;
}

export interface GameActions {
  /** load content, resolve the day, resume a saved duel if there is one. Call once, and again after a content reload. */
  boot(opts?: { readonly restartNotice?: string }): Promise<void>;
  /** begin the day's duel from a clean state */
  start(): void;
  act(action: Action): void;
  /** Graft ⇄: the same two materials in the other order, as legal actions (cancel, begin, pick, pick) */
  graftSwap(): void;
  dismissNotice(): void;
}

export type GameStore = ReturnType<typeof createGameStore>;

const IDLE: GameState_ = {
  phase: { name: 'booting' }, ctx: null, rt: null, setup: null, source: null, state: null, actions: [], events: [], legal: [],
  groups: null, notice: null, error: null,
};

export function createGameStore(deps: GameDeps) {
  const store = createStore<GameState_ & GameActions>()((set, get) => {
    const show = (state: GameState, actions: readonly Action[], events: readonly GameEvent[]): Partial<GameState_> => {
      const rt = get().rt as Runtime;
      const legal = state.result === null ? rt.engine.getLegalActions(state) : [];
      return {
        state, actions, events, legal, groups: groupLegal(legal), error: null,
        phase: state.result === null ? { name: 'duel' } : { name: 'result' },
      };
    };

    const beginDuel = (notice: string | null): void => {
      const { rt, setup, ctx } = get();
      if (rt === null || setup === null || ctx === null) return;
      const first = newDuel(rt, setup);
      saveSession(deps.storage, recordFor(setup, ctx.globals.CONTENT_VERSION, first.state.cfg, []));
      set({ ...show(first.state, [], first.events), notice });
    };

    return {
      ...IDLE,

      async boot(opts = {}) {
        set({ ...IDLE, phase: { name: 'booting' } });
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
        if (opts.restartNotice !== undefined) clearSession(deps.storage, date);
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
          if (opts.restartNotice !== undefined) beginDuel(opts.restartNotice);
          return;
        }
        const resumed = resumeSession(rt, resolved.setup, record);
        if (resumed.ok) {
          set({ ...show(resumed.state, record.actions, []), notice: opts.restartNotice ?? null });
          if (record.actions.length === 0 && opts.restartNotice === undefined) set({ phase: { name: 'home' } });
          return;
        }
        // Replay failed (cfg mismatch, illegal action, new content version): restart instead of losing it silently.
        clearSession(deps.storage, date);
        beginDuel(opts.restartNotice ?? RESTART_NOTICE);
      },

      start() {
        beginDuel(null);
      },

      act(action) {
        const { rt, state, setup, ctx, actions } = get();
        if (rt === null || state === null || setup === null || ctx === null || state.result !== null) return;
        try {
          const step = playerStep(rt, state, action);
          const next = [...actions, ...step.applied];
          saveSession(deps.storage, recordFor(setup, ctx.globals.CONTENT_VERSION, state.cfg, next));
          set(show(step.state, next, step.events));
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

      dismissNotice() {
        set({ notice: null });
      },
    };
  });
  return store;
}
