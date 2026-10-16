// Animation cues from engine events (ARCHITECTURE.md §7, §16). Pure: events in, a list of beats out. The duel screen
// plays them with CSS and drops them on any tap. Nothing here decides game state.
import type { GameEvent, Iid, Side } from '@vault-duel/engine';

export type CueKind =
  | 'enter' | 'graft' | 'lunge' | 'hit' | 'ward' | 'flash' | 'damage' | 'heal' | 'intent' | 'gavel' | 'mood' | 'burn' | 'taken';

export interface Cue {
  readonly kind: CueKind;
  readonly iid?: Iid;
  readonly side?: Side;
  readonly amount?: number;
  /** beat index; the screen turns it into a delay */
  readonly beat: number;
}

/**
 * Every animation timing in one place (D-266). `BEAT_MS` must equal `--cue` in tokens.css (a test checks it): the CSS
 * cue animations are written in beats, and this is how long one beat is. There is no cap on the number of beats, so each
 * beat finishes before the next starts however long the step is; a tap skips the rest.
 */
export const TIMING = {
  /** one beat of cue animation */
  BEAT_MS: 420,
  /** hold after the last beat before the queue ends */
  TAIL_MS: 800,
  /** the Collector's telegraph before each of his actions: the card or attacker lit, its target marked */
  TELEGRAPH_MS: 600,
  /** a Collector action with no animation of its own (a trap set face-down) still stays this long on screen */
  SETTLE_MS: 500,
} as const;

/** Beats a cue holds the queue for, when its own animation runs longer than one beat (burn, graft, gavel, taken). */
const SPAN: Readonly<Partial<Record<CueKind, number>>> = { burn: 2, graft: 3, gavel: 3 };

export function cuesFromEvents(events: readonly GameEvent[]): Cue[] {
  const out: Cue[] = [];
  let beat = 0;
  const add = (c: Omit<Cue, 'beat'>, advance = true, span = SPAN[c.kind] ?? 1): void => {
    out.push({ ...c, beat });
    if (advance) beat += span;
  };
  for (const e of events) {
    switch (e.e) {
      case 'Summoned': add({ kind: 'enter', iid: e.iid }); break;
      case 'Grafted': add({ kind: 'graft', iid: e.iid }); break;
      case 'Appraised': add({ kind: 'taken', iid: e.iid }, false); add({ kind: 'flash', iid: e.iid }, true, 3); break;
      case 'Destroyed': add({ kind: 'burn', iid: e.iid, side: e.side }); break;
      case 'AttackDeclared': add({ kind: 'lunge', iid: e.attacker }); break;
      case 'CombatResolved': add({ kind: 'hit', iid: e.defender }, false); break;
      case 'WardBroken': add({ kind: 'ward', iid: e.iid }, false); break;
      case 'SpellCast': case 'TrapTriggered': add({ kind: 'flash', iid: e.iid }); break;
      case 'Damage': if (e.amount > 0) add({ kind: 'damage', side: e.side, amount: e.amount }, false); break;
      case 'LifeGained': add({ kind: 'heal', side: e.side, amount: e.amount }, false); break;
      case 'IntentSet': add({ kind: 'intent' }, false); break;
      case 'AppraisalAttempt': add({ kind: 'gavel' }); break;
      case 'MoodChanged': add({ kind: 'mood' }, false); break;
      default: break;
    }
  }
  return out;
}

/** How long a queue of cues plays: its last beat starts, runs, and the tail passes. */
export const cueDurationMs = (cues: readonly Cue[]): number =>
  cues.length === 0 ? 0 : (Math.max(...cues.map((c) => c.beat)) + 1) * TIMING.BEAT_MS + TIMING.TAIL_MS;

/** The quip trigger: a mood shift, an Appraisal attempt or the start of the duel (D-237). Returns the mood to speak in. */
export function quipMood(events: readonly GameEvent[], currentMood: number): number | null {
  let mood: number | null = null;
  for (const e of events) {
    if (e.e === 'MoodChanged') mood = e.to;
    else if ((e.e === 'AppraisalAttempt' || e.e === 'GameStarted') && mood === null) mood = currentMood;
  }
  return mood;
}
