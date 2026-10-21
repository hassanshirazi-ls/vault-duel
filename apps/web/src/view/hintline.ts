// What the line above the hand says on a phone (D-373). The Monarch's lines come to where the eyes are; the choice is made here,
// once, so the order is the same everywhere: a card's hint beats everything on your turn, then his quip, then the intent echo;
// on his turn his telegraph beats his quip, which beats the plain "acting" text.
export type HintLine = 'telegraph' | 'quip' | 'acting' | 'selection' | 'echo';

export function hintLine(o: { blocked: boolean; selecting: boolean; telegraph: boolean; quipLive: boolean }): HintLine {
  if (o.blocked) return o.telegraph ? 'telegraph' : o.quipLive ? 'quip' : 'acting';
  if (o.selecting) return 'selection';
  return o.quipLive ? 'quip' : 'echo';
}
