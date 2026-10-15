// Screen switch and the shell: the animations flag becomes `data-anim` (CSS zeroes every beat when it is off), Practice
// becomes `data-mode` (the dimmed gold of D-247), the notice toast and, behind FLAGS.DEBUG_OVERLAY, the debug overlay.
import type { CSSProperties } from 'react';
import { useGame } from './context';
import { Binder } from './Binder';
import { DebugOverlay } from './Debug';
import { Duel } from './Duel';
import { Home } from './Home';
import { HowToPlay } from './HowToPlay';
import { Result } from './Result';
import { Seal } from './Seal';
import { Stats } from './Stats';

/** Idle atmosphere (D-240): two candle glows and a few drifting ash specks. CSS hides it when motion is off. */
const ASH = [
  { x: '8%', t: '17s', d: '0s', dx: '40px' },
  { x: '22%', t: '21s', d: '-6s', dx: '-30px' },
  { x: '37%', t: '19s', d: '-11s', dx: '55px' },
  { x: '55%', t: '23s', d: '-3s', dx: '-45px' },
  { x: '68%', t: '18s', d: '-14s', dx: '30px' },
  { x: '81%', t: '22s', d: '-8s', dx: '-50px' },
  { x: '93%', t: '20s', d: '-16s', dx: '25px' },
] as const;

function Atmosphere() {
  return (
    <div className="atmos" aria-hidden="true">
      <i className="candle c1" />
      <i className="candle c2" />
      {ASH.map((a) => (
        <i key={a.x} className="ash" style={{ '--x': a.x, '--t': a.t, '--d': a.d, '--dx': a.dx } as CSSProperties} />
      ))}
    </div>
  );
}

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
      <Atmosphere />
      {body}
      {howTo && <HowToPlay />}
      <DebugOverlay />
    </div>
  );
}
