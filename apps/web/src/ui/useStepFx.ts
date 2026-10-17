// Per-step effects for the duel screen, all derived from the frames of the last step (D-266): the stages to walk through
// (your action, then the Collector's turn one move at a time, each with a telegraph before it), the animation cues and
// ghosts of the stage on screen, and the Collector's quip. Nothing here changes game state. A tap anywhere skips to the
// end of the step; while the Collector's moves are still coming, that tap is swallowed so it cannot press a button.
import { useEffect, useMemo, useState } from 'react';
import type { GameEvent, GameState, Iid, Monster, Side } from '@vault-duel/engine';
import { MOOD_NAMES } from '@vault-duel/ai';
import type { GameCtx } from '../content/load';
import type { Frame, Runtime } from '../duel/runtime';
import { cardView } from '../view/cards';
import type { CardView } from '../view/cards';
import { quipMood } from '../visual/cues';
import type { Cue } from '../visual/cues';
import { blockedAt, stagesOf } from '../visual/playback';
import type { Stage, Telegraph } from '../visual/playback';
import { prefersReducedMotion } from './hooks';

export interface Ghost {
  readonly iid: Iid;
  readonly kind: 'burn' | 'taken';
  readonly side: Side;
  readonly slot: number;
  readonly beat: number;
  readonly view: CardView;
  readonly monster: Monster;
  /** the card attached under it, which goes with it (D-308) */
  readonly symbiote: CardView | null;
}

function ghostsFor(ctx: GameCtx, rt: Runtime, before: GameState, cues: readonly Cue[]): Ghost[] {
  const out: Ghost[] = [];
  for (const c of cues) {
    if ((c.kind !== 'burn' && c.kind !== 'taken') || c.iid === undefined) continue;
    for (const side of [0, 1] as const) {
      const slot = before.sides[side].board.findIndex((m) => m !== null && m.iid === c.iid);
      const monster = before.sides[side].board[slot];
      if (slot < 0 || monster === null || monster === undefined) continue;
      out.push({ iid: c.iid, kind: c.kind, side, slot, beat: c.beat, view: cardView(ctx, rt.engine, before, c.iid), monster, symbiote: monster.sym >= 0 ? cardView(ctx, rt.engine, before, monster.sym) : null });
    }
  }
  return out;
}

const NO_CUES: readonly Cue[] = [];
const NO_GHOSTS: readonly Ghost[] = [];

export function useStepFx(ctx: GameCtx | null, rt: Runtime | null, state: GameState | null, events: readonly GameEvent[], frames: readonly Frame[]) {
  const [seen, setSeen] = useState(frames);
  const [stages, setStages] = useState<readonly Stage[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [quip, setQuip] = useState<{ key: number; text: string } | null>(null);

  // A new step: build its stages and quip (derived in render, the React pattern for state that follows other state).
  if (seen !== frames) {
    setSeen(frames);
    if (ctx !== null && state !== null) {
      const animate = ctx.globals.FLAGS.ANIMATIONS && !prefersReducedMotion();
      const next = animate ? stagesOf(frames) : [];
      setStages(next);
      setIndex(next.length > 0 ? 0 : null);
      const mood = quipMood(events, state.collector.mood);
      const lines = mood === null ? undefined : ctx.dialogue[MOOD_NAMES[mood] ?? 'composed'];
      if (lines !== undefined && lines.length > 0) setQuip({ key: state.nActions, text: ctx.render(lines[state.nActions % lines.length] as string) });
    }
  }

  const stage = index === null ? undefined : stages[index];
  const blocked = index !== null && blockedAt(stages, index);
  const idle = index === null;

  // Each stage plays for its own time, then the next one starts.
  useEffect(() => {
    if (index === null || stage === undefined) return undefined;
    const timer = window.setTimeout(() => setIndex(index + 1 < stages.length ? index + 1 : null), stage.ms);
    return () => window.clearTimeout(timer);
  }, [index, stage, stages.length]);

  // Skip: any tap (or key) ends the show. While the Collector still has moves to play the same tap is also swallowed.
  useEffect(() => {
    if (idle) return undefined;
    const swallow = blocked;
    let eat: ((e: Event) => void) | null = null;
    let eatTimer = 0;
    const stopEating = (): void => {
      if (eat !== null) document.removeEventListener('click', eat, true);
      window.clearTimeout(eatTimer);
      eat = null;
    };
    const skip = (): void => {
      setIndex(null);
      if (!swallow) return;
      eat = (e: Event): void => {
        e.stopPropagation();
        e.preventDefault();
        stopEating();
      };
      document.addEventListener('click', eat, true);
      eatTimer = window.setTimeout(stopEating, 700);
    };
    document.addEventListener('pointerdown', skip, { capture: true, once: true });
    document.addEventListener('keydown', skip, { capture: true, once: true });
    return () => {
      document.removeEventListener('pointerdown', skip, true);
      document.removeEventListener('keydown', skip, true);
      // the tap that skipped is still on its way to a click: leave the swallower in place (it removes itself)
    };
  }, [idle, blocked]);

  const cues = stage === undefined ? NO_CUES : stage.cues;
  const ghosts = useMemo(
    () => (stage === undefined || ctx === null || rt === null ? NO_GHOSTS : ghostsFor(ctx, rt, stage.before, stage.cues)),
    [stage, ctx, rt],
  );
  const telegraph: Telegraph | null = stage === undefined ? null : stage.telegraph;
  return { shown: stage === undefined ? state : stage.state, cues, ghosts, telegraph, blocked, quip };
}
