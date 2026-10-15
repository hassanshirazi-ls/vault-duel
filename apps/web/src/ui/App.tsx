// Bare functional UI (W1): unstyled semantic HTML so a duel can be clicked through. Replace this directory wholesale
// when the visual design is chosen; it only reads the game store.
import { useGame } from './context';
import { Duel } from './Duel';
import { Home } from './Home';
import { Result } from './Result';

export function App() {
  const phase = useGame((s) => s.phase);
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismissNotice);
  const body = (() => {
    switch (phase.name) {
      case 'booting':
        return <p>Loading content...</p>;
      case 'error':
        return (
          <main>
            <h1>Content error</h1>
            <ul>{phase.lines.map((l, i) => <li key={i}><code>{l}</code></li>)}</ul>
          </main>
        );
      case 'preparing':
        return (
          <main>
            <h1>Preparing today's vault</h1>
            <p>{phase.progress === null ? 'Starting...' : `Checking seed attempt ${phase.progress.k + 1}: duel ${phase.progress.run} of ${phase.progress.runs}`}</p>
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
    <>
      {notice !== null && (
        <p role="status">
          {notice} <button onClick={dismiss}>Dismiss</button>
        </p>
      )}
      {body}
    </>
  );
}
