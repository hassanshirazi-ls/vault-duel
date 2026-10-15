// Per-step effects for the duel screen, all derived from the engine events of the last step: animation cues, ghosts of
// cards that were destroyed or taken (so they can burn or be snatched in their old slot), the Collector's quip, and the
// short duel log for wide screens. Nothing here changes game state. Cues end by themselves, or at the next tap.
import { useEffect, useState } from 'react';
import type { GameEvent, GameState, Iid, Monster, Side } from '@vault-duel/engine';
import { MOOD_NAMES } from '@vault-duel/ai';
import type { GameCtx } from '../content/load';
import type { Runtime } from '../duel/runtime';
import { cardView } from '../view/cards';
import type { CardView } from '../view/cards';
import { logLines } from '../view/log';
import type { LogLine } from '../view/log';
import { cueDurationMs, cuesFromEvents, quipMood } from '../visual/cues';
import type { Cue } from '../visual/cues';
import { prefersReducedMotion } from './hooks';

export interface Ghost {
  readonly iid: Iid;
  readonly kind: 'burn' | 'taken';
  readonly side: Side;
  readonly slot: number;
  readonly beat: number;
  readonly view: CardView;
  readonly monster: Monster;
}

export interface LogEntry extends LogLine {
  readonly n: number;
}

export const LOG_MAX = 40;

function ghostsFor(ctx: GameCtx, rt: Runtime, before: GameState, cues: readonly Cue[]): Ghost[] {
  const out: Ghost[] = [];
  for (const c of cues) {
    if ((c.kind !== 'burn' && c.kind !== 'taken') || c.iid === undefined) continue;
    for (const side of [0, 1] as const) {
      const slot = before.sides[side].board.findIndex((m) => m !== null && m.iid === c.iid);
      const monster = before.sides[side].board[slot];
      if (slot < 0 || monster === null || monster === undefined) continue;
      out.push({ iid: c.iid, kind: c.kind, side, slot, beat: c.beat, view: cardView(ctx, rt.engine, before, c.iid), monster });
    }
  }
  return out;
}

export function useStepFx(ctx: GameCtx | null, rt: Runtime | null, state: GameState | null, events: readonly GameEvent[]) {
  const [seen, setSeen] = useState(events);
  const [before, setBefore] = useState(state);
  const [cues, setCues] = useState<readonly Cue[]>([]);
  const [ghosts, setGhosts] = useState<readonly Ghost[]>([]);
  const [quip, setQuip] = useState<{ key: number; text: string } | null>(null);
  const [log, setLog] = useState<readonly LogEntry[]>([]);

  // New engine events: build this step's cues, ghosts, quip and log lines (derived in render, the React pattern for
  // state that follows other state).
  if (seen !== events) {
    setSeen(events);
    setBefore(state);
    if (ctx !== null && rt !== null && state !== null) {
      const animate = ctx.globals.FLAGS.ANIMATIONS && !prefersReducedMotion();
      const next = animate ? cuesFromEvents(events) : [];
      setCues(next);
      setGhosts(animate && before !== null ? ghostsFor(ctx, rt, before, next) : []);
      const mood = quipMood(events, state.collector.mood);
      const lines = mood === null ? undefined : ctx.dialogue[MOOD_NAMES[mood] ?? 'composed'];
      if (lines !== undefined && lines.length > 0) setQuip({ key: state.nActions, text: ctx.render(lines[state.nActions % lines.length] as string) });
      const added = logLines(ctx, state, events);
      if (added.length > 0) {
        setLog((prev) => {
          const base = prev.length === 0 ? 0 : (prev[prev.length - 1] as LogEntry).n + 1;
          return [...prev, ...added.map((l, i) => ({ ...l, n: base + i }))].slice(-LOG_MAX);
        });
      }
    }
  }

  // Cues end by themselves, or at the next tap anywhere (skippable, and the tap still does its normal job).
  useEffect(() => {
    if (cues.length === 0) return;
    const clear = (): void => {
      setCues([]);
      setGhosts([]);
    };
    const timer = window.setTimeout(clear, cueDurationMs(cues));
    document.addEventListener('pointerdown', clear, { capture: true, once: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', clear, { capture: true });
    };
  }, [cues]);

  return { cues, ghosts, quip, log };
}
