// Screen switch and the shell: the animations flag becomes `data-anim` (CSS zeroes every beat when it is off), the
// notice toast and, behind FLAGS.DEBUG_OVERLAY, a small state readout.
import { useGame } from './context';
import { Duel } from './Duel';
import { Home } from './Home';
import { Result } from './Result';

function DebugOverlay() {
  const ctx = useGame((s) => s.ctx);
  const state = useGame((s) => s.state);
  const legal = useGame((s) => s.legal);
  const actions = useGame((s) => s.actions);
  const setup = useGame((s) => s.setup);
  if (ctx === null || !ctx.globals.FLAGS.DEBUG_OVERLAY) return null;
  return (
    <div className="debug">
      seed {setup?.seedString}#{setup?.k} · turn {state?.turn} · step {state?.step} · legal {legal.length} · log {actions.length}
    </div>
  );
}

export function App() {
  const phase = useGame((s) => s.phase);
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismissNotice);
  const ctx = useGame((s) => s.ctx);
  const body = (() => {
    switch (phase.name) {
      case 'booting':
        return (
          <main className="center-screen">
            <div className="spinner" />
            <p>Loading the catalogue...</p>
          </main>
        );
      case 'error':
        return (
          <main className="center-screen">
            <h1>The catalogue would not open</h1>
            <p>Content failed to load. Fix these and save; in dev the page reloads by itself.</p>
            <div className="error-list">
              {phase.lines.map((l, i) => (
                <code key={i}>{l}</code>
              ))}
            </div>
          </main>
        );
      case 'preparing':
        return (
          <main className="center-screen">
            <div className="spinner" />
            <h1>Preparing today's vault</h1>
            <p className="muted">
              {phase.progress === null ? 'Starting...' : `Checking seed attempt ${phase.progress.k + 1}: duel ${phase.progress.run} of ${phase.progress.runs}`}
            </p>
          </main>
        );
      case 'home':
        return <Home />;
      case 'duel':
        return <Duel />;
      case 'result':
        return <Result />;
    }
  })();
  return (
    <div className="app" data-anim={ctx !== null && !ctx.globals.FLAGS.ANIMATIONS ? 'off' : 'on'}>
      {notice !== null && (
        <p className="toast" role="status">
          {notice}
          <button type="button" className="btn ghost" onClick={dismiss}>
            Dismiss
          </button>
        </p>
      )}
      {body}
      <DebugOverlay />
    </div>
  );
}
