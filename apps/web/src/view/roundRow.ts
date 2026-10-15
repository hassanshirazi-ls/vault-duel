// One emoji per round played, by the D-101 priority: appraised > monster lost > graft > attack > guard.
// TODO(W2): meta/share.ts owns the glyph constants and the full share text (ARCHITECTURE.md §16). When it lands, delete
// this file and have the result screen call it; the glyphs below are placeholders with the same priority.
import { RoundFlag } from '@vault-duel/engine';
import type { Track } from '@vault-duel/engine';

export const ROUND_EMOJI = { appraised: '🔨', lost: '💀', graft: '🧬', attack: '⚔️', guard: '🛡️' } as const;

export function roundEmoji(flags: number): string {
  if (flags & RoundFlag.Appraised) return ROUND_EMOJI.appraised;
  if (flags & RoundFlag.LostMonster) return ROUND_EMOJI.lost;
  if (flags & RoundFlag.Grafted) return ROUND_EMOJI.graft;
  if (flags & RoundFlag.Attacked) return ROUND_EMOJI.attack;
  return ROUND_EMOJI.guard;
}

export function roundRow(track: Track, roundsPlayed: number): string[] {
  return track.round.slice(0, roundsPlayed).map(roundEmoji);
}
