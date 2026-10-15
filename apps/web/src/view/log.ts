// Duel log lines from engine events (D-240, wide screens). Presentation only: events in, short sentences out. Names come
// from compiled content, numbers from the events themselves, so no rule or value is written here.
import type { GameEvent, GameState, Iid, Side } from '@vault-duel/engine';
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
