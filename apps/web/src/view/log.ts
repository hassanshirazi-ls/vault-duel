// Duel log lines from engine events (D-240, D-265). Presentation only: events in, short sentences out. Names come
// from compiled content, numbers from the events themselves, so no rule or value is written here.
import type { Action, GameEvent, GameState, Iid, Side } from '@vault-duel/engine';
import { MOOD_NAMES } from '@vault-duel/ai';
import type { GameCtx } from '../content/load';

export interface LogLine {
  readonly text: string;
  /** glyph id, so a line never relies on color alone */
  readonly icon: string;
  readonly side: 'me' | 'them' | null;
}

const who = (side: Side): string => (side === 0 ? 'You' : 'The Collector');
const sideOf = (side: Side): 'me' | 'them' => (side === 0 ? 'me' : 'them');

/** Lines for one step's events. `state` is the state after the step; instances persist there, so destroyed cards resolve. */
export function logLines(ctx: GameCtx, state: GameState, events: readonly GameEvent[]): LogLine[] {
  const name = (iid: Iid): string => {
    const inst = state.inst[iid];
    const id = inst === undefined ? undefined : ctx.content.ids[inst.def];
    return (id === undefined ? undefined : ctx.cards.get(id)?.name) ?? 'a card';
  };
  const out: LogLine[] = [];
  for (const e of events) {
    switch (e.e) {
      case 'TurnStarted':
        out.push({ text: e.side === 0 ? `Round ${e.round}: your turn` : `Round ${e.round}: the Collector's turn`, icon: 'scroll', side: null });
        break;
      case 'Summoned':
        out.push({ text: e.faceDown ? `${who(e.side)} set a card face-down` : `${who(e.side)} summoned ${name(e.iid)}`, icon: e.faceDown ? 'facedown' : 'pos', side: sideOf(e.side) });
        break;
      case 'Grafted':
        out.push({ text: `${who(e.side)} grafted ${name(e.iid)}${e.ascended ? ' (Ascended)' : ''}`, icon: 'swap', side: sideOf(e.side) });
        break;
      case 'SpellCast':
        out.push({ text: `${who(e.side)} cast ${name(e.iid)}`, icon: 'spell', side: sideOf(e.side) });
        break;
      case 'TrapSet':
        out.push({ text: `${who(e.side)} set a trap`, icon: 'trap', side: sideOf(e.side) });
        break;
      case 'TrapTriggered':
        out.push({ text: `${name(e.iid)} sprang`, icon: 'trap', side: sideOf(e.side) });
        break;
      case 'AttackDeclared':
        out.push({ text: e.target === -1 ? `${name(e.attacker)} attacks directly` : `${name(e.attacker)} attacks ${name(e.target)}`, icon: 'sword', side: null });
        break;
      case 'Damage':
        out.push({ text: `${who(e.side)} took ${e.amount} damage`, icon: 'heart', side: sideOf(e.side) });
        break;
      case 'LifeGained':
        out.push({ text: `${who(e.side)} gained ${e.amount} life`, icon: 'heart', side: sideOf(e.side) });
        break;
      case 'Destroyed':
        out.push({ text: `${name(e.iid)} was destroyed`, icon: 'cross', side: sideOf(e.side) });
        break;
      case 'WardBroken':
        out.push({ text: `${name(e.iid)} lost its ward`, icon: 'barrier', side: null });
        break;
      case 'AppraisalAttempt':
        out.push({ text: 'The Collector appraises', icon: 'gavel', side: 'them' });
        break;
      case 'Appraised':
        out.push({ text: `${name(e.iid)} was taken`, icon: 'gavel', side: 'them' });
        break;
      case 'AppraisalFailed':
        out.push({ text: 'The appraisal found nothing', icon: 'gavel', side: 'them' });
        break;
      case 'MoodChanged': {
        const mood = MOOD_NAMES[e.to];
        out.push({ text: mood === undefined ? 'The Collector\'s mood shifts' : `The Collector turns ${mood}`, icon: 'eye', side: 'them' });
        break;
      }
      case 'VaultSealed':
        out.push({ text: 'The vault seals', icon: 'vault', side: null });
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * The whole duel's log, oldest first, from the action trail (not capped, so a full duel fits). Built from the trail
 * instead of kept as it grows, so it is complete after a reload and an undone action leaves no line behind.
 */
export function duelLog(ctx: GameCtx, state: GameState, trail: readonly { readonly events: readonly GameEvent[] }[]): LogLine[] {
  return trail.flatMap((r) => logLines(ctx, state, r.events));
}

/** The last `n` lines of the log, oldest first (the duel menu shows five). */
export const recentLog = (log: readonly LogLine[], n: number): LogLine[] => log.slice(Math.max(0, log.length - n));

/**
 * What Undo would take back, for the menu tile ("Summon Ashguard Squire"): the first thing that happened in the actions
 * from `to` on. Names come from content; an unnamed card (set face-down) stays unnamed.
 */
export function undoLabel(ctx: GameCtx, state: GameState, records: readonly { readonly action: Action; readonly events: readonly GameEvent[] }[]): string {
  const name = (iid: Iid): string => {
    const inst = state.inst[iid];
    const id = inst === undefined ? undefined : ctx.content.ids[inst.def];
    return (id === undefined ? undefined : ctx.cards.get(id)?.name) ?? 'a card';
  };
  for (const r of records) {
    if (r.action.t === 'reposition') return `Reposition ${name(r.action.m)}`;
    for (const e of r.events) {
      if (e.e === 'Summoned') return e.faceDown ? 'Set a card face-down' : `Summon ${name(e.iid)}`;
      if (e.e === 'Grafted') return `Graft ${name(e.iid)}`;
      if (e.e === 'SpellCast') return `Cast ${name(e.iid)}`;
      if (e.e === 'TrapSet') return 'Set a trap';
      if (e.e === 'AttackDeclared') return `Attack with ${name(e.attacker)}`;
    }
    if (r.action.t.startsWith('graft')) return 'Graft in progress';
  }
  return 'Your last action';
}
