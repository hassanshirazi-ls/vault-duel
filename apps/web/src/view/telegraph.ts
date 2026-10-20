// The one line that announces the Monarch's next move (D-266). Names come from the cards; nothing is hardcoded.
import type { Iid } from '@vault-duel/engine';
import type { Telegraph } from '../visual/playback';

export interface TelegraphLine {
  readonly icon: string;
  readonly text: string;
}

/** `nameOf` must already hide what the player may not know (a face-down card is "A face-down card"). */
export function telegraphLine(t: Telegraph, nameOf: (iid: Iid) => string): TelegraphLine {
  const of = (iid: Iid | undefined): string => (iid === undefined ? 'a card' : nameOf(iid));
  switch (t.kind) {
    case 'attack':
      return { icon: 'sword', text: `${of(t.actor)} attacks ${t.direct === true ? 'you directly' : of(t.target)}` };
    case 'summon':
      return { icon: 'pos', text: `The Monarch plays ${of(t.card)}${t.target !== undefined ? `, sacrificing ${of(t.target)}` : ''}` };
    case 'summonDown':
      return { icon: 'facedown', text: 'The Monarch sets a card face-down' };
    case 'cast':
      return { icon: 'spell', text: `The Monarch casts ${of(t.card)}${t.target !== undefined ? ` on ${of(t.target)}` : ''}` };
    case 'trap':
      return { icon: 'trap', text: 'The Monarch sets a trap' };
    case 'reposition':
      return { icon: 'swap', text: `${of(t.actor)} changes position` };
    case 'levy':
      return { icon: 'crown', text: `Levy · ${t.done === true ? 'took' : 'takes'} ${of(t.target)}` };
    case 'levyNone':
      return { icon: 'crown', text: 'Levy · nothing to take' };
    case 'moveLane':
      return { icon: 'swap', text: `${of(t.actor)} moves to lane ${(t.slot?.index ?? 0) + 1}` };
  }
}
