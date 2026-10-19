// Screen switch and the shell: the animations flag becomes `data-anim` (CSS zeroes every beat when it is off), Practice
// becomes `data-mode` (the greyed paper of D-247), the notice toast and, behind FLAGS.DEBUG_OVERLAY, the debug overlay.
import { useGame } from './context';
import { Binder } from './Binder';
import { DebugOverlay } from './Debug';
import { Duel } from './Duel';
import { Home } from './Home';
import { HowToPlay } from './HowToPlay';
import { Result } from './Result';
import { Seal } from './Seal';
import { Stats } from './Stats';

export function App() {
  const phase = useGame((s) => s.phase);
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismissNotice);
  const ctx = useGame((s) => s.ctx);
  const mode = useGame((s) => s.mode);
  const screen = useGame((s) => s.screen);
  const howTo = useGame((s) => s.howTo);
  const body = (() => {
    if (screen !== null && (phase.name === 'home' || phase.name === 'result')) return screen === 'binder' ? <Binder /> : <Stats />;
    switch (phase.name) {
      case 'booting':
        return (
          <main className="center-screen">
            <Seal />
            <p>Summoning the court...</p>
          </main>
        );
      case 'error':
        return (
          <main className="center-screen">
            <h1>The court would not open</h1>
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
            <Seal />
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
    <div className="app" data-anim={ctx !== null && !ctx.globals.FLAGS.ANIMATIONS ? 'off' : 'on'} data-mode={mode}>
      {notice !== null && (
        <p className="toast" role="status">
          {notice}
          <button type="button" className="btn ghost" onClick={dismiss}>
            Dismiss
          </button>
        </p>
      )}
      {body}
      {howTo && <HowToPlay />}
      <DebugOverlay />
    </div>
  );
}
