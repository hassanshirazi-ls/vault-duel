// Debug overlay (FLAGS.DEBUG_OVERLAY, ARCHITECTURE.md §16): a small tab that opens a panel with the seed, the duel's step,
// the Collector's mood and intent, the actions he took last, every legal action, the `?set=` overrides in force and the
// content warnings. The panel is read-only. The Collector's chosen rule is not exposed by the ai package yet, so his
// last actions stand in for it.
import { useState } from 'react';
import type { Action } from '@vault-duel/engine';
import { MOOD_NAMES } from '@vault-duel/ai';
import { useGame } from './context';

const short = (a: Action): string => {
  const { t, ...rest } = a as Action & Record<string, unknown>;
  const bits = Object.keys(rest).map((k) => `${k}=${JSON.stringify(rest[k])}`);
  return bits.length === 0 ? t : `${t} ${bits.join(' ')}`;
};

export function DebugOverlay() {
  const ctx = useGame((s) => s.ctx);
  const state = useGame((s) => s.state);
  const legal = useGame((s) => s.legal);
  const actions = useGame((s) => s.actions);
  const setup = useGame((s) => s.setup);
  const source = useGame((s) => s.source);
  const mode = useGame((s) => s.mode);
  const [open, setOpen] = useState(false);
  if (ctx === null || !ctx.globals.FLAGS.DEBUG_OVERLAY) return null;
  return (
    <aside className="debug" data-open={open ? '' : undefined} aria-label="Debug overlay">
      <button type="button" className="debug-tab" aria-expanded={open} onClick={() => setOpen(!open)}>
        dbg
      </button>
      {open && (
        <div className="debug-panel">
          <p>
            seed {setup?.seedString}#{setup?.k} · setup {source} · {mode}
          </p>
          <p>
            turn {state?.turn} · step {state?.step} · mood {state === null ? '-' : MOOD_NAMES[state.collector.mood]} · intent {state?.collector.intent ?? '-'} · played {String(state?.played)} · bond {state?.bond}
          </p>
          <p>overrides: {ctx.overrides.length === 0 ? 'none' : ctx.overrides.join(' ')}</p>
          <p>warnings: {ctx.warnings.length === 0 ? 'none' : ctx.warnings.length}</p>
          <p>log {actions.length}, last: {actions.slice(-4).map(short).join(' | ') || '-'}</p>
          <p>legal {legal.length}:</p>
          <ul>
            {legal.slice(0, 40).map((a, i) => (
              <li key={i}>{short(a)}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
