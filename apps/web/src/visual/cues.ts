// Animation cues from engine events (ARCHITECTURE.md §7, §16). Pure: events in, a list of beats out. The duel screen
// plays them with CSS and drops them on any tap. Nothing here decides game state.
import type { GameEvent, GameState, Iid, Side } from '@vault-duel/engine';

export type CueKind =
  | 'enter' | 'graft' | 'split' | 'bond' | 'lunge' | 'hit' | 'ward' | 'flash' | 'damage' | 'heal' | 'intent' | 'gavel' | 'arrive' | 'mood' | 'burn' | 'taken' | 'riposte' | 'ambush';

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
  TELEGRAPH_MS: 850,
  /** the levy's first half: the card he is about to take marked in your slot, the plaque naming it. The second half (gavel, the shadow hand, the card arriving crowned) is cues, about 4 beats plus the tail: the whole Levy runs about 2.8 s */
  LEVY_MARK_MS: 1200,
  /** a Collector action with no animation of its own (a trap set face-down) still stays this long on screen */
  SETTLE_MS: 500,
} as const;

/** Beats a cue holds the queue for, when its own animation runs longer than one beat (burn, graft, gavel, taken). */
const SPAN: Readonly<Partial<Record<CueKind, number>>> = { burn: 2, graft: 3, gavel: 3 };

/** Is `iid` a guard (face-up in guard position, or face-down) on a board of `before`? Riposte shows only against one (D-337). */
const guardIn = (before: GameState | undefined, iid: Iid): boolean =>
  before !== undefined && before.sides.some((side) => side.board.some((m) => m !== null && m.iid === iid && (m.pos === 1 || m.faceDown)));

/** `before` (the state the events started from) lets a Riposte be told from an ordinary lost attack; without it none is shown. */
export function cuesFromEvents(events: readonly GameEvent[], before?: GameState): Cue[] {
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
      case 'Split': e.parts.forEach((iid, i) => add({ kind: 'split', iid }, i === e.parts.length - 1)); break;
      case 'Bonded': add({ kind: 'bond', iid: e.host }); break;
      case 'SymbioteEmerged': add({ kind: 'enter', iid: e.iid }); break;
      case 'LaneMoved':
        if (e.swapped >= 0) add({ kind: 'flash', iid: e.swapped }, false);
        add({ kind: 'flash', iid: e.iid });
        break;
      case 'Appraised':
        // the shadow hand lifts it from your slot (beat 0) while the card arrives on his side one beat later (D-349)
        add({ kind: 'taken', iid: e.iid }, false);
        if (e.to === 'board') {
          beat += 1;
          add({ kind: 'arrive', iid: e.iid }, true, 3);
        } else beat += SPAN.gavel ?? 3;
        break;
      case 'AppraisalFailed': beat += SPAN.gavel ?? 3; break;
      case 'Destroyed': add({ kind: 'burn', iid: e.iid, side: e.side }); break;
      case 'AttackDeclared': add({ kind: 'lunge', iid: e.attacker }); break;
      case 'CombatResolved':
        // D-337: the attacker fell to a guard that held: the guard flashes a shield instead of shaking
        if (e.destroyed.includes(e.attacker) && !e.destroyed.includes(e.defender) && guardIn(before, e.defender)) add({ kind: 'riposte', iid: e.defender }, false);
        else add({ kind: 'hit', iid: e.defender }, false);
        break;
      case 'Ambushed': add({ kind: 'ambush', iid: e.iid, amount: e.p }); break;
      case 'WardBroken': add({ kind: 'ward', iid: e.iid }, false); break;
      case 'SpellCast': case 'TrapTriggered': add({ kind: 'flash', iid: e.iid }); break;
      case 'Damage': if (e.amount > 0) add({ kind: 'damage', side: e.side, amount: e.amount }, false); break;
      case 'LifeGained': add({ kind: 'heal', side: e.side, amount: e.amount }, false); break;
      case 'IntentSet': add({ kind: 'intent' }, false); break;
      case 'AppraisalAttempt': add({ kind: 'gavel' }, false); break;
      case 'MoodChanged': add({ kind: 'mood' }, false); break;
      default: break;
    }
  }
  return out;
}

/** How long a queue of cues plays: its last beat starts, runs, and the tail passes. */
export const cueDurationMs = (cues: readonly Cue[]): number =>
  cues.length === 0 ? 0 : (Math.max(...cues.map((c) => c.beat)) + 1) * TIMING.BEAT_MS + TIMING.TAIL_MS;

/** The speech trigger: a mood shift, a levy attempt (engine: Appraisal) or the start of the duel (D-237). Returns the mood to speak in. */
export function quipMood(events: readonly GameEvent[], currentMood: number): number | null {
  let mood: number | null = null;
  for (const e of events) {
    if (e.e === 'MoodChanged') mood = e.to;
    else if ((e.e === 'AppraisalAttempt' || e.e === 'GameStarted') && mood === null) mood = currentMood;
  }
  return mood;
}

/**
 * The lines the Monarch speaks after a step, or undefined when he says nothing. When the step took a monster (an
 * `Appraised` event) his `levy` list is used if it has lines (D-352); a failed levy, a mood shift and the start of the
 * duel use the lines of the mood, as does a missing or empty `levy` list. The caller picks one by `nActions`, so the
 * choice is deterministic.
 */
export function quipLines(
  events: readonly GameEvent[],
  currentMood: number,
  dialogue: Readonly<Record<string, readonly string[] | undefined>>,
  moodNames: readonly string[],
): readonly string[] | undefined {
  const levy = events.some((e) => e.e === 'Appraised') ? dialogue['levy'] : undefined;
  if (levy !== undefined && levy.length > 0) return levy;
  const mood = quipMood(events, currentMood);
  const lines = mood === null ? undefined : dialogue[moodNames[mood] ?? 'composed'];
  return lines !== undefined && lines.length > 0 ? lines : undefined;
}
