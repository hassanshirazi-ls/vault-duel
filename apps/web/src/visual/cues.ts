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

/** Beats past this index play together, so a long Collector turn never drags (about 150-250 ms per beat). */
export const MAX_BEATS = 6;

export function cuesFromEvents(events: readonly GameEvent[]): Cue[] {
  const out: Cue[] = [];
  let beat = 0;
  const add = (c: Omit<Cue, 'beat'>, advance = true): void => {
    out.push({ ...c, beat: Math.min(beat, MAX_BEATS) });
    if (advance) beat++;
  };
  for (const e of events) {
    switch (e.e) {
      case 'Summoned': add({ kind: 'enter', iid: e.iid }); break;
      case 'Grafted': add({ kind: 'graft', iid: e.iid }); break;
      case 'Appraised': add({ kind: 'taken', iid: e.iid }, false); add({ kind: 'flash', iid: e.iid }); break;
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

/** Wait before the whole queue may be dropped; matches the last beat's CSS animation. */
export const CUE_BEAT_MS = 180;
export const CUE_TAIL_MS = 400;
export const cueDurationMs = (cues: readonly Cue[]): number =>
  cues.length === 0 ? 0 : (Math.max(...cues.map((c) => c.beat)) + 1) * CUE_BEAT_MS + CUE_TAIL_MS;

/** The quip trigger: a mood shift, an Appraisal attempt or the start of the duel (D-237). Returns the mood to speak in. */
export function quipMood(events: readonly GameEvent[], currentMood: number): number | null {
  let mood: number | null = null;
  for (const e of events) {
    if (e.e === 'MoodChanged') mood = e.to;
    else if ((e.e === 'AppraisalAttempt' || e.e === 'GameStarted') && mood === null) mood = currentMood;
  }
  return mood;
}
